import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { stringify as yamlStringify } from "yaml";
import { createHash } from "node:crypto";
import type { ZodType } from "zod";

export interface ResourceConfig<T> {
  /** Resource type name, e.g. "skill" or "rule" */
  name: string;
  /** File name inside each resource directory, e.g. "SKILL.md" or "RULE.md" */
  fileName: string;
  /** Subdirectory name, e.g. "skills" or "rules" */
  dirName: string;
  /** Zod schema for validation */
  schema: ZodType<T>;
  /** Extract the fields used for semantic hashing (excludes id, schemaVersion) */
  hashFields: (item: T) => Record<string, unknown>;
}

export interface ValidationResult {
  file: string;
  id: string | undefined;
  errors: string[];
}

export interface ResourceSyncAction {
  id: string;
  action: "add" | "skip" | "overwrite" | "delete";
  targetPath: string;
}

interface ResourceWithId {
  id: string;
  content: string;
}

// -- Parse / Emit --

export function parseResource<T>(raw: string): T {
  const { data, content } = matter(raw);
  return {
    ...data,
    content: content.trim(),
  } as T;
}

export function emitResource<T extends ResourceWithId>(item: T): string {
  const { content, ...frontmatter } = item;
  const yaml = yamlStringify(frontmatter, { lineWidth: 0 }).trim();
  return `---\n${yaml}\n---\n\n${content}\n`;
}

// -- Hash --

export function hashResource<T>(item: T, config: ResourceConfig<T>): string {
  const payload = JSON.stringify(config.hashFields(item));
  return createHash("sha256").update(payload).digest("hex");
}

// -- Validate --

export function validateResource<T>(data: unknown, config: ResourceConfig<T>): {
  success: true;
  data: T;
} | {
  success: false;
  errors: string[];
} {
  const result = config.schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data as T };
  }
  const errors = result.error.issues.map(
    (issue) => `${issue.path.join(".")}: ${issue.message}`,
  );
  return { success: false, errors };
}

// -- Load canonical resources from directory --

export function loadCanonicalResources<T extends ResourceWithId>(
  dir: string,
  config: ResourceConfig<T>,
): T[] {
  if (!fs.existsSync(dir)) return [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const items: T[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const filePath = path.join(dir, entry.name, config.fileName);
    if (!fs.existsSync(filePath)) continue;

    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = parseResource<T>(raw);
      const result = validateResource(parsed, config);
      if (result.success) {
        items.push(result.data);
      }
    } catch {
      continue;
    }
  }

  return items;
}

// -- Plan sync --

export function planResourceSync<T extends ResourceWithId>(
  items: T[],
  readFn: (id: string) => T | null,
  pathFn: (id: string) => string,
  config: ResourceConfig<T>,
): ResourceSyncAction[] {
  const actions: ResourceSyncAction[] = [];

  for (const item of items) {
    const existing = readFn(item.id);
    const targetPath = pathFn(item.id);

    if (!existing) {
      actions.push({ id: item.id, action: "add", targetPath });
    } else if (hashResource(existing, config) === hashResource(item, config)) {
      actions.push({ id: item.id, action: "skip", targetPath });
    } else {
      actions.push({ id: item.id, action: "overwrite", targetPath });
    }
  }

  return actions;
}

// -- Execute sync --

export function executeResourceSync<T extends ResourceWithId>(
  items: T[],
  actions: ResourceSyncAction[],
  writeFn: (item: T) => void,
  deleteFn?: (id: string) => void,
): void {
  const itemMap = new Map(items.map((i) => [i.id, i]));

  for (const action of actions) {
    if (action.action === "skip") continue;
    if (action.action === "delete") {
      deleteFn?.(action.id);
      continue;
    }
    const item = itemMap.get(action.id);
    if (item) {
      writeFn(item);
    }
  }
}

export function planResourcePrune(
  canonicalIds: string[],
  existingIds: string[],
  pathFn: (id: string) => string,
): ResourceSyncAction[] {
  const canonicalIdSet = new Set(canonicalIds);

  return existingIds
    .filter((id) => !canonicalIdSet.has(id))
    .sort()
    .map((id) => ({
      id,
      action: "delete" as const,
      targetPath: pathFn(id),
    }));
}

// -- Validate directory --

export function validateResourceDir<T extends ResourceWithId>(
  dir: string,
  config: ResourceConfig<T>,
): ValidationResult[] {
  const results: ValidationResult[] = [];

  if (!fs.existsSync(dir)) {
    results.push({
      file: dir,
      id: undefined,
      errors: [`${config.name[0].toUpperCase() + config.name.slice(1)}s directory not found: ${dir}`],
    });
    return results;
  }

  if (!fs.statSync(dir).isDirectory()) {
    results.push({
      file: dir,
      id: undefined,
      errors: [`Path is not a directory: ${dir}`],
    });
    return results;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const seenIds = new Map<string, string>();

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const filePath = path.join(dir, entry.name, config.fileName);
    if (!fs.existsSync(filePath)) {
      results.push({
        file: filePath,
        id: undefined,
        errors: [`${config.fileName} not found`],
      });
      continue;
    }

    const raw = fs.readFileSync(filePath, "utf-8");

    let parsed: T;
    try {
      parsed = parseResource<T>(raw);
    } catch {
      results.push({
        file: filePath,
        id: undefined,
        errors: ["Failed to parse frontmatter"],
      });
      continue;
    }

    const validation = validateResource(parsed, config);
    if (!validation.success) {
      results.push({
        file: filePath,
        id: (parsed as Record<string, unknown>).id as string | undefined,
        errors: validation.errors,
      });
      continue;
    }

    const item = validation.data;

    if (entry.name !== item.id) {
      results.push({
        file: filePath,
        id: item.id,
        errors: [
          `Directory name "${entry.name}" does not match ${config.name} id "${item.id}"`,
        ],
      });
    }

    const existingFile = seenIds.get(item.id);
    if (existingFile) {
      results.push({
        file: filePath,
        id: item.id,
        errors: [`Duplicate ${config.name} id "${item.id}" (first seen in ${existingFile})`],
      });
    } else {
      seenIds.set(item.id, filePath);
    }
  }

  return results;
}
