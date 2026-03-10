import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { SkillSpec, RuleSpec } from "./schema.js";
import { skillConfig, ruleConfig } from "./schema.js";
import type { PlatformAdapter } from "../adapters/base.js";
import type { ResourceSyncAction } from "./resource.js";
import {
  executeResourceSync,
  hashResource,
  loadCanonicalResources,
  parseResource,
  planResourceSync,
  validateResource,
} from "./resource.js";

// Legacy skill action shape retained for backward compatibility.
export type SyncAction = ResourceSyncAction & { skillId: string };
export interface CanonicalSkill extends SkillSpec {
  sourceDir: string;
  syncHash: string;
}

// -- Skills --

export function loadCanonicalSkills(skillsDir: string): CanonicalSkill[] {
  if (!fs.existsSync(skillsDir)) return [];

  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  const skills: CanonicalSkill[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const sourceDir = path.join(skillsDir, entry.name);
    const skillFile = path.join(sourceDir, skillConfig.fileName);
    if (!fs.existsSync(skillFile)) continue;

    try {
      const raw = fs.readFileSync(skillFile, "utf-8");
      const parsed = parseResource<SkillSpec>(raw);
      const validation = validateResource(parsed, skillConfig);
      if (!validation.success) continue;

      const syncHash = hashDirectory(sourceDir);
      if (!syncHash) continue;

      skills.push({
        ...validation.data,
        sourceDir,
        syncHash,
      });
    } catch {
      continue;
    }
  }

  return skills;
}

export function planSync(
  skills: SkillSpec[],
  adapter: PlatformAdapter,
): SyncAction[] {
  const actions: ResourceSyncAction[] = skills.map((skill): ResourceSyncAction => {
    const targetPath = hasDirectorySource(skill)
      ? adapter.resourceDirPath(skill.id, skillConfig)
      : adapter.resourcePath(skill.id, skillConfig);
    const existing = adapter.readResource(skill.id, skillConfig);

    if (!existing) {
      return { id: skill.id, action: "add" as const, targetPath };
    }

    if (!hasDirectorySource(skill)) {
      const action: ResourceSyncAction["action"] =
        hashResource(existing, skillConfig) === hashResource(skill, skillConfig)
        ? "skip"
        : "overwrite";
      return { id: skill.id, action, targetPath };
    }

    const targetHash = hashDirectory(adapter.resourceDirPath(skill.id, skillConfig));
    if (!targetHash) {
      return { id: skill.id, action: "add" as const, targetPath };
    }

    const action: ResourceSyncAction["action"] = targetHash === skill.syncHash
      ? "skip"
      : "overwrite";

    return {
      id: skill.id,
      action,
      targetPath,
    };
  });

  return actions.map((action) => ({ ...action, skillId: action.id }));
}

export function executeSync(
  skills: SkillSpec[],
  actions: ResourceSyncAction[],
  adapter: PlatformAdapter,
): void {
  const skillMap = new Map(skills.map((skill) => [skill.id, skill]));

  for (const action of actions) {
    if (action.action === "skip") continue;

    const skill = skillMap.get(action.id);
    if (!skill) continue;

    if (hasDirectorySource(skill)) {
      mirrorDirectory(skill.sourceDir, adapter.resourceDirPath(skill.id, skillConfig));
      continue;
    }

    adapter.writeResource(skill, skillConfig);
  }
}

// -- Rules --

export function loadCanonicalRules(rulesDir: string): RuleSpec[] {
  return loadCanonicalResources(rulesDir, ruleConfig);
}

export function planRuleSync(
  rules: RuleSpec[],
  adapter: PlatformAdapter,
): ResourceSyncAction[] {
  return planResourceSync(
    rules,
    (id) => adapter.readResource(id, ruleConfig),
    (id) => adapter.resourcePath(id, ruleConfig),
    ruleConfig,
  );
}

export function executeRuleSync(
  rules: RuleSpec[],
  actions: ResourceSyncAction[],
  adapter: PlatformAdapter,
): void {
  executeResourceSync(rules, actions, (rule) => adapter.writeResource(rule, ruleConfig));
}

function hasDirectorySource(skill: SkillSpec): skill is CanonicalSkill {
  return "sourceDir" in skill
    && typeof skill.sourceDir === "string"
    && "syncHash" in skill
    && typeof skill.syncHash === "string";
}

function hashDirectory(dir: string): string | null {
  if (!fs.existsSync(dir)) return null;

  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(dir);
  } catch {
    return null;
  }

  if (!stat.isDirectory()) return null;

  const hasher = createHash("sha256");
  walkDirectory(dir, "", hasher);
  return hasher.digest("hex");
}

function walkDirectory(dir: string, relativeDir: string, hasher: ReturnType<typeof createHash>): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const relativePath = relativeDir === ""
      ? entry.name
      : path.posix.join(relativeDir, entry.name);
    const absolutePath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      hasher.update(`dir:${relativePath}\n`);
      walkDirectory(absolutePath, relativePath, hasher);
      continue;
    }

    if (entry.isFile()) {
      hasher.update(`file:${relativePath}\n`);
      hasher.update(fs.readFileSync(absolutePath));
      hasher.update("\n");
      continue;
    }

    if (entry.isSymbolicLink()) {
      hasher.update(`symlink:${relativePath}\n`);
      hasher.update(fs.readlinkSync(absolutePath));
      hasher.update("\n");
      continue;
    }

    hasher.update(`other:${relativePath}\n`);
  }
}

function mirrorDirectory(sourceDir: string, targetDir: string): void {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  fs.cpSync(sourceDir, targetDir, { recursive: true });
}
