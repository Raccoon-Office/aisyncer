// Skills
export { SkillSpecSchema, validateSkill } from "./core/schema.js";
export type { SkillSpec } from "./core/schema.js";
export { parseSkill, emitSkill } from "./core/parser.js";
export { hashSkill } from "./core/hash.js";
export { loadCanonicalSkills, planSync, executeSync } from "./core/sync.js";
export type { SyncAction, CanonicalSkill } from "./core/sync.js";
export { validateSkillsDir } from "./core/validator.js";

// Rules
export { RuleSpecSchema, validateRule } from "./core/schema.js";
export type { RuleSpec } from "./core/schema.js";
export { parseRule, emitRule } from "./core/parser.js";
export { hashRule } from "./core/hash.js";
export { loadCanonicalRules, planRuleSync, executeRuleSync } from "./core/sync.js";
export { validateRulesDir } from "./core/validator.js";

// Shared
export type { ValidationResult } from "./core/validator.js";
export type { ResourceSyncAction } from "./core/resource.js";
export { createAdapter } from "./adapters/base.js";
export type { PlatformAdapter } from "./adapters/base.js";
export { createClaudeAdapter } from "./adapters/claude.js";
export { createCodexAdapter } from "./adapters/codex.js";
export { createCursorAdapter } from "./adapters/cursor.js";
export { createWindsurfAdapter } from "./adapters/windsurf.js";
export { fetchFromGitHub, fetchSkillsFromGitHub, parseGitHubSource } from "./github/fetch.js";
export type { GitHubResourceFile, GitHubSkillDirectory, GitHubSkillEntry, GitHubSkillFile, FetchResult } from "./github/fetch.js";
