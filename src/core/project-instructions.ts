import fs from "node:fs";
import path from "node:path";
import type { ValidationResult } from "./resource.js";

export const PROJECT_INSTRUCTIONS_DIR = "instructions";
export const PROJECT_INSTRUCTIONS_FILE = "PROJECT.md";
export const PROJECT_INSTRUCTIONS_START_MARKER = "<!-- aisyncer:project-instructions:start -->";
export const PROJECT_INSTRUCTIONS_END_MARKER = "<!-- aisyncer:project-instructions:end -->";

const MANAGED_NOTICE = "<!-- Managed by aisyncer. Edit .my-ai/instructions/PROJECT.md instead. -->";

export interface ProjectInstructions {
  content: string;
}

export interface ProjectInstructionsTarget {
  key: string;
  label: string;
  targetPath: string;
  mode?: "inline" | "import";
  importPath?: string;
}

export interface ProjectInstructionsSyncAction {
  action: "add" | "skip" | "overwrite" | "delete";
  target: ProjectInstructionsTarget;
}

export function canonicalProjectInstructionsPath(baseDir = path.resolve(".my-ai")): string {
  return path.join(baseDir, PROJECT_INSTRUCTIONS_DIR, PROJECT_INSTRUCTIONS_FILE);
}

export function parseProjectInstructions(raw: string): ProjectInstructions {
  return {
    content: raw.trim(),
  };
}

export function emitProjectInstructions(instructions: ProjectInstructions): string {
  return `${instructions.content.trim()}\n`;
}

export function loadProjectInstructions(filePath: string): ProjectInstructions | null {
  if (!fs.existsSync(filePath)) return null;
  if (!fs.statSync(filePath).isFile()) return null;

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = parseProjectInstructions(raw);
    return parsed.content.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function validateProjectInstructionsFile(filePath: string): ValidationResult[] {
  if (!fs.existsSync(filePath)) {
    return [{
      file: filePath,
      id: "project-instructions",
      errors: [`Project instructions file not found: ${filePath}`],
    }];
  }

  if (!fs.statSync(filePath).isFile()) {
    return [{
      file: filePath,
      id: "project-instructions",
      errors: [`Path is not a file: ${filePath}`],
    }];
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = parseProjectInstructions(raw);
  if (parsed.content.length === 0) {
    return [{
      file: filePath,
      id: "project-instructions",
      errors: ["content: project instructions content is required"],
    }];
  }

  return [];
}

export function planCanonicalProjectInstructionsSync(
  instructions: ProjectInstructions | null,
  target: ProjectInstructionsTarget,
  options: { prune?: boolean } = {},
): ProjectInstructionsSyncAction | null {
  const existing = readTextFile(target.targetPath);

  if (!instructions) {
    if (!options.prune || existing === null) return null;
    return {
      action: "delete",
      target,
    };
  }

  const nextContent = emitProjectInstructions(instructions);
  if (existing === null) {
    return {
      action: "add",
      target,
    };
  }

  return {
    action: existing === nextContent ? "skip" : "overwrite",
    target,
  };
}

export function executeCanonicalProjectInstructionsSync(
  instructions: ProjectInstructions | null,
  action: ProjectInstructionsSyncAction,
): void {
  if (action.action === "delete") {
    fs.rmSync(action.target.targetPath, { force: true });
    return;
  }

  if (!instructions) return;

  fs.mkdirSync(path.dirname(action.target.targetPath), { recursive: true });
  fs.writeFileSync(action.target.targetPath, emitProjectInstructions(instructions), "utf-8");
}

export function planManagedProjectInstructionsSync(
  instructions: ProjectInstructions | null,
  target: ProjectInstructionsTarget,
  options: { prune?: boolean } = {},
): ProjectInstructionsSyncAction | null {
  const existing = readTextFile(target.targetPath);

  if (!instructions) {
    if (!options.prune || existing === null || !containsManagedProjectInstructions(existing)) {
      return null;
    }
    return {
      action: "delete",
      target,
    };
  }

  const nextContent = renderTargetProjectInstructionsDocument(existing, instructions, target);
  if (existing === null) {
    return {
      action: "add",
      target,
    };
  }

  return {
    action: existing === nextContent ? "skip" : "overwrite",
    target,
  };
}

export function executeManagedProjectInstructionsSync(
  instructions: ProjectInstructions | null,
  action: ProjectInstructionsSyncAction,
): void {
  const existing = readTextFile(action.target.targetPath);

  if (action.action === "delete") {
    if (existing === null) return;

    const nextContent = removeManagedProjectInstructions(existing);
    if (nextContent === null) {
      fs.rmSync(action.target.targetPath, { force: true });
      return;
    }

    fs.writeFileSync(action.target.targetPath, nextContent, "utf-8");
    return;
  }

  if (!instructions) return;

  const nextContent = renderTargetProjectInstructionsDocument(
    existing,
    instructions,
    action.target,
  );
  fs.mkdirSync(path.dirname(action.target.targetPath), { recursive: true });
  fs.writeFileSync(action.target.targetPath, nextContent, "utf-8");
}

export function renderManagedProjectInstructionsDocument(
  existing: string | null,
  instructions: ProjectInstructions,
): string {
  return renderTargetProjectInstructionsDocument(existing, instructions, {
    key: "inline",
    label: "inline",
    targetPath: "",
    mode: "inline",
  });
}

export function renderTargetProjectInstructionsDocument(
  existing: string | null,
  instructions: ProjectInstructions,
  target: ProjectInstructionsTarget,
): string {
  const block = renderManagedProjectInstructionsBlock(instructions, target);
  if (existing === null || existing.trim().length === 0) {
    return `${block}\n`;
  }

  const range = findManagedProjectInstructionsRange(existing);
  if (range) {
    return joinMarkdownSections([
      existing.slice(0, range.start),
      block,
      existing.slice(range.end),
    ]);
  }

  return joinMarkdownSections([existing, block]);
}

export function removeManagedProjectInstructions(existing: string): string | null {
  const range = findManagedProjectInstructionsRange(existing);
  if (!range) {
    return existing.trim().length === 0 ? null : ensureTrailingNewline(existing);
  }

  const nextContent = joinMarkdownSections([
    existing.slice(0, range.start),
    existing.slice(range.end),
  ]);

  return nextContent.length === 0 ? null : nextContent;
}

export function containsManagedProjectInstructions(content: string): boolean {
  return findManagedProjectInstructionsRange(content) !== null;
}

function renderManagedProjectInstructionsBlock(
  instructions: ProjectInstructions,
  target: ProjectInstructionsTarget,
): string {
  const mode = target.mode ?? "inline";
  const body = mode === "import"
    ? renderProjectInstructionsImport(target)
    : instructions.content.trim();

  return [
    PROJECT_INSTRUCTIONS_START_MARKER,
    MANAGED_NOTICE,
    "",
    body,
    PROJECT_INSTRUCTIONS_END_MARKER,
  ].join("\n");
}

function renderProjectInstructionsImport(target: ProjectInstructionsTarget): string {
  if (!target.importPath) {
    throw new Error(`Missing importPath for project instructions target "${target.key}"`);
  }

  return `@${target.importPath}`;
}

function findManagedProjectInstructionsRange(
  content: string,
): { start: number; end: number } | null {
  const start = content.indexOf(PROJECT_INSTRUCTIONS_START_MARKER);
  if (start === -1) return null;

  const endMarkerIndex = content.indexOf(
    PROJECT_INSTRUCTIONS_END_MARKER,
    start + PROJECT_INSTRUCTIONS_START_MARKER.length,
  );
  if (endMarkerIndex === -1) return null;

  return {
    start,
    end: endMarkerIndex + PROJECT_INSTRUCTIONS_END_MARKER.length,
  };
}

function joinMarkdownSections(sections: string[]): string {
  const cleaned = sections
    .map((section) => section.trim())
    .filter((section) => section.length > 0);

  return cleaned.length === 0 ? "" : `${cleaned.join("\n\n")}\n`;
}

function ensureTrailingNewline(content: string): string {
  return content.endsWith("\n") ? content : `${content}\n`;
}

function readTextFile(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  if (!fs.statSync(filePath).isFile()) return null;

  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}
