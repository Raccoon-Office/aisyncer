#!/usr/bin/env node

import { Command } from "commander";
import { diffCommand } from "./commands/diff.js";
import { initCommand } from "./commands/init.js";
import { pullCommand } from "./commands/pull.js";
import { validateCommand } from "./commands/validate.js";
import { syncCommand } from "./commands/sync.js";
import { readCliVersion } from "./version.js";

const program = new Command();

program
  .name("aisyncer")
  .description("CLI tool for syncing AI skills, rules, and configs across Claude, Codex, Cursor, and Windsurf")
  .version(readCliVersion());

program
  .command("init")
  .description("Initialize a .my-ai directory with an example skill")
  .option("--from <source>", "Import skills and rules from a GitHub repo (github:owner/repo)")
  .option("--with-rules", "Also initialize the rules directory with an example rule")
  .option("--with-instructions", "Also initialize .my-ai/instructions/PROJECT.md with example project instructions")
  .action(initCommand);

program
  .command("validate")
  .description("Validate all skills (and optionally rules) in .my-ai/")
  .option("--with-rules", "Also validate rules in .my-ai/rules")
  .option("--with-instructions", "Also validate .my-ai/instructions/PROJECT.md")
  .action(validateCommand);

program
  .command("sync")
  .description("Sync skills to platform directories and rules to Windsurf")
  .option("--to <platforms>", "Target platforms: claude, codex, cursor, windsurf, or a comma-separated combination (if omitted, enters interactive mode)")
  .option("--write", "Actually write files (default is dry-run)")
  .option("--prune", "Delete generated resources that no longer exist in .my-ai")
  .option("--claude-dir <dir>", "Override Claude output directory (default: .claude)")
  .option("--codex-dir <dir>", "Override Codex output directory (default: .agents)")
  .option("--cursor-dir <dir>", "Override Cursor output directory (default: .cursor)")
  .option("--sync-rules", "Also sync rules from .my-ai/rules to Windsurf (.windsurf/rules/*.md)")
  .option("--sync-instructions", "Also sync .my-ai/instructions/PROJECT.md into CLAUDE.md and AGENTS.md")
  .action(syncCommand);

program
  .command("pull")
  .description("Fetch resources from a GitHub repo and update .my-ai/")
  .requiredOption("--from <source>", "Import resources from a GitHub repo (github:owner/repo)")
  .option("--with-rules", "Also pull rules into .my-ai/rules")
  .option("--with-instructions", "Also pull project instructions into .my-ai/instructions/PROJECT.md")
  .option("--write", "Actually write files (default is dry-run)")
  .option("--prune", "Delete local resources that no longer exist in the remote source")
  .action(pullCommand);

program
  .command("diff")
  .description("Show what would change in .my-ai/ compared with a GitHub repo")
  .requiredOption("--from <source>", "Compare against a GitHub repo (github:owner/repo)")
  .option("--with-rules", "Also compare rules")
  .option("--with-instructions", "Also compare project instructions")
  .option("--prune", "Also show local resources that would be deleted")
  .action(diffCommand);

program.parse();
