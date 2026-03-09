#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { validateCommand } from "./commands/validate.js";
import { syncCommand } from "./commands/sync.js";

const program = new Command();

program
  .name("aisyncer")
  .description("CLI tool for syncing AI skills, rules, and configs across Claude, Codex, Cursor, and Windsurf")
  .version("0.3.1");

program
  .command("init")
  .description("Initialize a .my-ai directory with an example skill")
  .option("--from <source>", "Import skills and rules from a GitHub repo (github:owner/repo)")
  .option("--with-rules", "Also initialize the rules directory with an example rule")
  .action(initCommand);

program
  .command("validate")
  .description("Validate all skills (and optionally rules) in .my-ai/")
  .option("--with-rules", "Also validate rules in .my-ai/rules")
  .action(validateCommand);

program
  .command("sync")
  .description("Sync skills to platform directories and rules to Windsurf")
  .option("--to <platforms>", "Target platforms: claude, codex, cursor, windsurf, or a comma-separated combination (if omitted, enters interactive mode)")
  .option("--write", "Actually write files (default is dry-run)")
  .option("--claude-dir <dir>", "Override Claude output directory (default: .claude)")
  .option("--codex-dir <dir>", "Override Codex output directory (default: .agents)")
  .option("--cursor-dir <dir>", "Override Cursor output directory (default: .cursor)")
  .option("--sync-rules", "Also sync rules from .my-ai/rules to Windsurf (.windsurf/rules/*.md)")
  .action(syncCommand);

program.parse();
