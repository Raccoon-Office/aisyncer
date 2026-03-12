import fs from "node:fs";
import path from "node:path";
import { checkbox, confirm, input } from "@inquirer/prompts";
import { createClaudeAdapter } from "../../adapters/claude.js";
import { createCodexAdapter } from "../../adapters/codex.js";
import { createCursorAdapter } from "../../adapters/cursor.js";
import { createWindsurfAdapter } from "../../adapters/windsurf.js";
import type { PlatformAdapter } from "../../adapters/base.js";
import {
  canonicalProjectInstructionsPath,
  executeManagedProjectInstructionsSync,
  loadProjectInstructions,
  planManagedProjectInstructionsSync,
  type ProjectInstructions,
} from "../../core/project-instructions.js";
import type { SkillSpec, RuleSpec } from "../../core/schema.js";
import {
  loadCanonicalSkills,
  planSync,
  executeSync,
  loadCanonicalRules,
  planRuleSync,
  executeRuleSync,
} from "../../core/sync.js";
import type { ResourceSyncAction } from "../../core/resource.js";
import {
  INSTRUCTION_SYNC_PLATFORMS,
  SUPPORTED_PLATFORMS,
  RULE_SYNC_PLATFORMS,
  resolveInstructionTargets,
} from "./sync.js";

export interface ResourceDetectionResult {
  hasSkills: boolean;
  hasRules: boolean;
  hasInstructions: boolean;
  skillsCount: number;
  rulesCount: number;
}

type InteractivePlatform = "claude" | "codex" | "cursor" | "windsurf";

/**
 * Detects available resources in .my-ai directory.
 */
export function detectAvailableResources(): ResourceDetectionResult {
  const skillsDir = path.resolve(".my-ai", "skills");
  const rulesDir = path.resolve(".my-ai", "rules");

  let hasSkills = false;
  let skillsCount = 0;
  if (fs.existsSync(skillsDir)) {
    try {
      const skills = loadCanonicalSkills(skillsDir);
      hasSkills = skills.length > 0;
      skillsCount = skills.length;
    } catch {
      hasSkills = false;
    }
  }

  let hasRules = false;
  let rulesCount = 0;
  if (fs.existsSync(rulesDir)) {
    try {
      const rules = loadCanonicalRules(rulesDir);
      hasRules = rules.length > 0;
      rulesCount = rules.length;
    } catch {
      hasRules = false;
    }
  }

  const instructions = loadProjectInstructions(canonicalProjectInstructionsPath(path.resolve(".my-ai")));
  const hasInstructions = instructions !== null;

  return { hasSkills, hasRules, hasInstructions, skillsCount, rulesCount };
}

/**
 * Determines which resource types should be offered based on platform selection.
 */
export function getAvailableResourceTypes(
  platforms: string[],
  detection: ResourceDetectionResult,
): Array<{ name: string; value: "skills" | "rules" | "instructions" }> {
  const types: Array<{ name: string; value: "skills" | "rules" | "instructions" }> = [];

  if (detection.hasSkills) {
    types.push({
      name: `skills (${detection.skillsCount} found)`,
      value: "skills",
    });
  }

  if (detection.hasRules) {
    const hasRuleTarget = platforms.some((p) => RULE_SYNC_PLATFORMS.has(p));
    if (hasRuleTarget) {
      types.push({
        name: `rules (${detection.rulesCount} found)`,
        value: "rules",
      });
    }
  }

  if (detection.hasInstructions) {
    const hasInstructionTarget = platforms.some((p) => INSTRUCTION_SYNC_PLATFORMS.has(p));
    if (hasInstructionTarget) {
      types.push({
        name: "project instructions (1 found)",
        value: "instructions",
      });
    }
  }

  return types;
}

function actionLabel(action: string): string {
  switch (action) {
    case "add":
      return "[ADD]      ";
    case "skip":
      return "[SKIP]     ";
    case "overwrite":
      return "[OVERWRITE]";
    case "delete":
      return "[DELETE]   ";
    default:
      return `[${action.toUpperCase()}]`;
  }
}

/**
 * Creates a platform adapter by name.
 */
function resolveAdapter(
  platform: string,
  claudeDir?: string,
  codexDir?: string,
  cursorDir?: string,
): PlatformAdapter {
  switch (platform) {
    case "claude":
      return createClaudeAdapter(claudeDir);
    case "codex":
      return createCodexAdapter(codexDir);
    case "cursor":
      return createCursorAdapter(cursorDir);
    case "windsurf":
      return createWindsurfAdapter();
    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}

/**
 * Shows a preview of the sync plan for a given platform.
 */
function previewPlatformSync(
  adapter: PlatformAdapter,
  skills: SkillSpec[],
  rules: RuleSpec[],
  syncSkills: boolean,
  syncRules: boolean,
  prune: boolean,
): { actions: ResourceSyncAction[]; hasChanges: boolean } {
  const allActions: ResourceSyncAction[] = [];
  let hasChanges = false;

  console.log(`\n${adapter.name}:`);

  if (syncSkills && skills.length > 0) {
    const actions = planSync(skills, adapter, { prune });
    for (const action of actions) {
      const label = actionLabel(action.action);
      console.log(`  ${label} ${action.id} → ${action.targetPath}`);
      if (action.action !== "skip") hasChanges = true;
      allActions.push(action);
    }
  }

  if (syncRules && RULE_SYNC_PLATFORMS.has(adapter.name)) {
    if (rules.length > 0) {
      const actions = planRuleSync(rules, adapter, { prune });
      for (const action of actions) {
        const label = actionLabel(action.action);
        console.log(`  ${label} ${action.id} → ${action.targetPath}`);
        if (action.action !== "skip") hasChanges = true;
        allActions.push(action);
      }
    }
  } else if (syncRules && !RULE_SYNC_PLATFORMS.has(adapter.name)) {
    console.log(`  (rules not supported for ${adapter.name})`);
  }

  return { actions: allActions, hasChanges };
}

function previewProjectInstructionsSync(
  platforms: string[],
  instructions: ProjectInstructions | null,
  prune: boolean,
): boolean {
  const targets = resolveInstructionTargets(toInteractivePlatforms(platforms));

  const actions = targets.flatMap((target) => {
    const action = planManagedProjectInstructionsSync(instructions, target, { prune });
    return action ? [action] : [];
  });

  if (actions.length === 0) {
    return false;
  }

  let hasChanges = false;
  console.log("\nproject instructions:");
  for (const action of actions) {
    const label = actionLabel(action.action);
    console.log(`  ${label} ${action.target.label} → ${action.target.targetPath}`);
    if (action.action !== "skip") hasChanges = true;
  }

  return hasChanges;
}

/**
 * Executes the sync for a given platform.
 */
function executePlatformSync(
  adapter: PlatformAdapter,
  skills: SkillSpec[],
  rules: RuleSpec[],
  syncSkills: boolean,
  syncRules: boolean,
  prune: boolean,
): void {
  if (syncSkills && skills.length > 0) {
    const actions = planSync(skills, adapter, { prune });
    executeSync(skills, actions, adapter);
  }

  if (syncRules && RULE_SYNC_PLATFORMS.has(adapter.name) && rules.length > 0) {
    const actions = planRuleSync(rules, adapter, { prune });
    executeRuleSync(rules, actions, adapter);
  }
}

function executeProjectInstructionsSync(
  platforms: string[],
  instructions: ProjectInstructions | null,
  prune: boolean,
): void {
  const targets = resolveInstructionTargets(toInteractivePlatforms(platforms));

  for (const target of targets) {
    const action = planManagedProjectInstructionsSync(instructions, target, { prune });
    if (!action) continue;
    executeManagedProjectInstructionsSync(instructions, action);
  }
}

/**
 * Main interactive sync flow.
 */
export async function interactiveSyncFlow(): Promise<void> {
  // Guard: interactive prompts require a TTY
  if (!process.stdin.isTTY) {
    console.error("Error: interactive mode requires a TTY. Use --to <platforms> to specify platforms directly.");
    process.exit(1);
  }

  // Step 1: Check .my-ai exists
  const myAiDir = path.resolve(".my-ai");
  if (!fs.existsSync(myAiDir)) {
    console.error("No .my-ai directory found. Run 'aisyncer init' first.");
    process.exit(1);
  }

  // Step 2: Scan available resources
  const detection = detectAvailableResources();
  if (!detection.hasSkills && !detection.hasRules && !detection.hasInstructions) {
    console.error("No valid skills, rules, or project instructions found in .my-ai. Run 'aisyncer init' first.");
    process.exit(1);
  }

  // Step 3: Select platforms
  const platforms = await checkbox({
    message: "Select target platforms:",
    choices: SUPPORTED_PLATFORMS.map((p) => ({ name: p, value: p })),
    required: true,
  });

  if (platforms.length === 0) {
    console.log("No platforms selected. Exiting.");
    return;
  }

  // Step 4: Select resource types
  const availableTypes = getAvailableResourceTypes(platforms, detection);
  if (availableTypes.length === 0) {
    console.error("No resource types available for the selected platforms.");
    process.exit(1);
  }

  const resourceTypes = await checkbox({
    message: "Select resource types to sync:",
    choices: availableTypes,
    required: true,
  });

  if (resourceTypes.length === 0) {
    console.log("No resource types selected. Exiting.");
    return;
  }

  const syncSkills = resourceTypes.includes("skills");
  const syncRules = resourceTypes.includes("rules");
  const syncInstructions = resourceTypes.includes("instructions");

  const prune = await confirm({
    message: "Prune stale generated resources that no longer exist in .my-ai?",
    default: false,
  });

  // Step 5: If selected, ask for custom output directories
  let claudeDir: string | undefined;
  if (syncSkills && platforms.includes("claude")) {
    const useCustomDir = await confirm({
      message: "Use custom Claude output directory?",
      default: false,
    });

    if (useCustomDir) {
      claudeDir = await input({
        message: "Enter Claude output directory path:",
        default: ".claude",
        validate: (value: string) => {
          const trimmed = value.trim();
          if (!trimmed) return "Directory path cannot be empty.";
          return true;
        },
      });
      claudeDir = claudeDir.trim();
    }
  }

  let codexDir: string | undefined;
  if (syncSkills && platforms.includes("codex")) {
    const useCustomDir = await confirm({
      message: "Use custom Codex output directory?",
      default: false,
    });

    if (useCustomDir) {
      codexDir = await input({
        message: "Enter Codex output directory path:",
        default: ".agents",
        validate: (value: string) => {
          const trimmed = value.trim();
          if (!trimmed) return "Directory path cannot be empty.";
          return true;
        },
      });
      codexDir = codexDir.trim();
    }
  }

  let cursorDir: string | undefined;
  if (syncSkills && platforms.includes("cursor")) {
    const useCustomDir = await confirm({
      message: "Use custom Cursor output directory?",
      default: false,
    });

    if (useCustomDir) {
      cursorDir = await input({
        message: "Enter Cursor output directory path:",
        default: ".cursor",
        validate: (value: string) => {
          const trimmed = value.trim();
          if (!trimmed) return "Directory path cannot be empty.";
          return true;
        },
      });
      cursorDir = cursorDir.trim();
    }
  }

  // Load resources once
  const skills = syncSkills
    ? loadCanonicalSkills(path.resolve(".my-ai", "skills"))
    : [];
  const rules = syncRules
    ? loadCanonicalRules(path.resolve(".my-ai", "rules"))
    : [];
  const projectInstructions = syncInstructions
    ? loadProjectInstructions(canonicalProjectInstructionsPath(path.resolve(".my-ai")))
    : null;

  // Build adapters once
  const adapters = platforms.map((p) => resolveAdapter(p, claudeDir, codexDir, cursorDir));

  // Step 6: Preview changes
  console.log("\n=== Preview Changes ===");

  let hasAnyChanges = false;
  if (syncSkills || syncRules) {
    for (const adapter of adapters) {
      const { hasChanges } = previewPlatformSync(adapter, skills, rules, syncSkills, syncRules, prune);
      if (hasChanges) hasAnyChanges = true;
    }
  }

  if (syncInstructions) {
    const hasChanges = previewProjectInstructionsSync(platforms, projectInstructions, prune);
    if (hasChanges) hasAnyChanges = true;
  }

  if (!hasAnyChanges) {
    console.log("\nEverything is up to date.");
    return;
  }

  // Step 7: Confirm write
  const shouldApply = await confirm({
    message: "Apply these changes?",
    default: true,
  });

  if (!shouldApply) {
    console.log("No changes made.");
    return;
  }

  // Execute sync — reuse same adapters and loaded resources
  console.log("\n=== Applying Changes ===");
  if (syncSkills || syncRules) {
    for (const adapter of adapters) {
      console.log(`\nSyncing to ${adapter.name}...`);
      executePlatformSync(adapter, skills, rules, syncSkills, syncRules, prune);
    }
  }

  if (syncInstructions) {
    console.log("\nSyncing project instructions...");
    executeProjectInstructionsSync(platforms, projectInstructions, prune);
  }

  console.log("\nSync complete.");
}

function toInteractivePlatforms(platforms: string[]): InteractivePlatform[] {
  return platforms.filter((platform): platform is InteractivePlatform =>
    SUPPORTED_PLATFORMS.includes(platform as InteractivePlatform),
  );
}
