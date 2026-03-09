import path from "node:path";
import { createClaudeAdapter } from "../../adapters/claude.js";
import { createCodexAdapter } from "../../adapters/codex.js";
import { createWindsurfAdapter } from "../../adapters/windsurf.js";
import type { PlatformAdapter } from "../../adapters/base.js";
import { loadCanonicalSkills, planSync, executeSync } from "../../core/sync.js";
import { loadCanonicalRules, planRuleSync, executeRuleSync } from "../../core/sync.js";
import { interactiveSyncFlow } from "./interactive-sync.js";


interface SyncOptions {
  to?: string;
  write?: boolean;
  claudeDir?: string;
  codexDir?: string;
  syncRules?: boolean;
}

type PlatformName = "claude" | "codex" | "windsurf";
type RuleUnsupportedPlatform = Exclude<PlatformName, "windsurf">;

const PLATFORM_ADAPTERS = {
  claude: (options: SyncOptions) => createClaudeAdapter(options.claudeDir),
  codex: (options: SyncOptions) => createCodexAdapter(options.codexDir),
  windsurf: () => createWindsurfAdapter(),
} satisfies Record<PlatformName, (options: SyncOptions) => PlatformAdapter>;

export const SUPPORTED_PLATFORMS = Object.keys(PLATFORM_ADAPTERS) as PlatformName[];
export const RULE_SYNC_PLATFORMS = new Set<string>(["windsurf"]);
const RULE_SKIP_NOTES = {
  claude: "Claude uses CLAUDE.md for project instructions.",
  codex: "Codex has no rules sync target. Use AGENTS.md for project instructions.",
} satisfies Record<RuleUnsupportedPlatform, string>;

export async function syncCommand(options: SyncOptions): Promise<void> {
  if (!options.to) {
    // Enter interactive mode if --to is not provided
    await interactiveSyncFlow();
    return;
  }

  const platforms = parsePlatforms(options.to);

  const skillsDir = path.resolve(".my-ai", "skills");
  const skills = loadCanonicalSkills(skillsDir);

  const rules = options.syncRules
    ? loadCanonicalRules(path.resolve(".my-ai", "rules"))
    : [];

  const hasRuleTarget = platforms.some((p) => RULE_SYNC_PLATFORMS.has(p));

  if (skills.length === 0 && rules.length === 0) {
    if (options.syncRules) {
      console.log("No valid skills or rules found in .my-ai. Run 'aisyncer init' first.");
    } else {
      console.log("No valid skills found in .my-ai/skills. Run 'aisyncer init' first.");
    }
    return;
  }

  if (options.syncRules && rules.length > 0 && skills.length === 0 && !hasRuleTarget) {
    console.log("No supported rules target selected. Rules sync currently targets windsurf (.windsurf/rules/*.md) only.");
    for (const platform of platforms) {
      if (isRuleUnsupportedPlatform(platform)) {
        console.log(ruleSkipNote(platform));
      }
    }
    return;
  }

  const dryRun = !options.write;
  if (dryRun) {
    console.log("[dry-run] No files will be written. Use --write to apply changes.\n");
  }

  let hasChanges = false;

  for (const platform of platforms) {
    const adapter = resolveAdapter(platform, options);

    // Sync skills
    if (skills.length > 0) {
      console.log(`Syncing skills to ${adapter.name}...`);
      const actions = planSync(skills, adapter);
      for (const action of actions) {
        const label = actionLabel(action.action);
        console.log(`  ${label} ${action.id} → ${action.targetPath}`);
        if (action.action !== "skip") hasChanges = true;
      }
      if (!dryRun) {
        executeSync(skills, actions, adapter);
      }
      console.log();
    }

    // Sync rules
    if (rules.length > 0) {
      if (isRuleUnsupportedPlatform(platform)) {
        console.log(`Skipping rules for ${adapter.name}: ${ruleSkipNote(platform)}`);
        console.log();
        continue;
      }

      console.log(`Syncing rules to ${adapter.name}...`);
      const actions = planRuleSync(rules, adapter);
      for (const action of actions) {
        const label = actionLabel(action.action);
        console.log(`  ${label} ${action.id} → ${action.targetPath}`);
        if (action.action !== "skip") hasChanges = true;
      }
      if (!dryRun) {
        executeRuleSync(rules, actions, adapter);
      }
      console.log();
    }
  }

  if (dryRun && hasChanges) {
    console.log("Run with --write to apply these changes.");
  } else if (!hasChanges) {
    console.log("Everything is up to date.");
  } else {
    console.log("Sync complete.");
  }
}

function isPlatformName(platform: string): platform is PlatformName {
  return platform in PLATFORM_ADAPTERS;
}

function isRuleUnsupportedPlatform(platform: PlatformName): platform is RuleUnsupportedPlatform {
  return !RULE_SYNC_PLATFORMS.has(platform);
}

function parsePlatforms(value: string): PlatformName[] {
  return value
    .split(",")
    .map((platform) => platform.trim())
    .filter((platform) => platform.length > 0)
    .map((platform) => {
      if (!isPlatformName(platform)) {
        console.error(`Error: Unknown platform "${platform}". Supported: ${SUPPORTED_PLATFORMS.join(", ")}`);
        process.exit(1);
      }

      return platform;
    });
}

function resolveAdapter(platform: PlatformName, options: SyncOptions): PlatformAdapter {
  return PLATFORM_ADAPTERS[platform](options);
}

function ruleSkipNote(platform: RuleUnsupportedPlatform): string {
  return RULE_SKIP_NOTES[platform];
}

function actionLabel(action: string): string {
  switch (action) {
    case "add":
      return "[ADD]      ";
    case "skip":
      return "[SKIP]     ";
    case "overwrite":
      return "[OVERWRITE]";
    default:
      return `[${action.toUpperCase()}]`;
  }
}
