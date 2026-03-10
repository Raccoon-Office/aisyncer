import fs from "node:fs";
import path from "node:path";
import { emitSkill, emitRule, parseSkill, parseRule } from "../../core/parser.js";
import { validateSkill, validateRule } from "../../core/schema.js";
import type { SkillSpec, RuleSpec } from "../../core/schema.js";
import { fetchFromGitHub } from "../../github/fetch.js";

const EXAMPLE_SKILL: SkillSpec = {
  schemaVersion: 1,
  id: "example-skill",
  name: "Example Skill",
  description: "An example skill to get you started",
  allowedTools: ["Edit", "Read"],
  content: `# Example Skill

You are a helpful assistant. Follow the user's instructions carefully.

## Guidelines

- Be concise and clear
- Ask for clarification when needed`,
  metadata: {
    version: "1.0.0",
    tags: ["example"],
  },
};

const EXAMPLE_RULE: RuleSpec = {
  schemaVersion: 1,
  id: "example-rule",
  name: "Example Rule",
  description: "An example rule to get you started",
  content: `# Example Rule

This is an example rule that demonstrates how to write rules for AI assistants.

## When to Apply

- Use this rule as a template for creating new rules
- Follow the structure shown here

## Guidelines

- Keep rules concise and focused
- Use clear examples where appropriate`,
  metadata: {
    version: "1.0.0",
    tags: ["example"],
  },
};

export async function initCommand(options: { from?: string; withRules?: boolean }): Promise<void> {
  const baseDir = path.resolve(".my-ai");
  const skillsDir = path.join(baseDir, "skills");

  if (fs.existsSync(baseDir)) {
    console.log(".my-ai directory already exists. Skipping init.");
    return;
  }

  if (options.from) {
    await initFromGitHub(options.from, skillsDir);
  } else {
    initLocal(skillsDir, options.withRules ?? false);
  }
}

function initLocal(skillsDir: string, withRules: boolean): void {
  const exampleDir = path.join(skillsDir, EXAMPLE_SKILL.id);
  const skillFile = path.join(exampleDir, "SKILL.md");

  fs.mkdirSync(exampleDir, { recursive: true });
  fs.writeFileSync(skillFile, emitSkill(EXAMPLE_SKILL), "utf-8");

  console.log("Initialized .my-ai with example skill:");
  console.log(`  ${skillFile}`);

  if (withRules) {
    const rulesDir = path.join(path.dirname(skillsDir), "rules");
    const exampleRuleDir = path.join(rulesDir, EXAMPLE_RULE.id);
    const ruleFile = path.join(exampleRuleDir, "RULE.md");

    fs.mkdirSync(exampleRuleDir, { recursive: true });
    fs.writeFileSync(ruleFile, emitRule(EXAMPLE_RULE), "utf-8");

    console.log("\nInitialized rules with example rule:");
    console.log(`  ${ruleFile}`);
  }
}

async function initFromGitHub(source: string, skillsDir: string): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  const rulesDir = path.join(path.dirname(skillsDir), "rules");

  console.log(`Fetching resources from ${source}...`);
  if (token) {
    console.log("Using GITHUB_TOKEN for authentication.");
  }

  let result;
  try {
    result = await fetchFromGitHub(source, token);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${msg}`);
    process.exit(1);
  }

  for (const warning of result.errors) {
    console.warn(`Warning: ${warning}`);
  }

  if (result.skills.length === 0 && result.rules.length === 0) {
    console.error("No skills or rules were fetched. Aborting init.");
    process.exit(1);
  }

  let skillsWritten = 0;
  let rulesWritten = 0;
  const validationErrors: string[] = [];

  // Write skills
  for (const remote of result.skills) {
    const entryFile = remote.files.find((file) => file.path === "SKILL.md");
    if (!entryFile) {
      validationErrors.push(`skill ${remote.id}: SKILL.md not found`);
      continue;
    }

    let skill: SkillSpec;
    try {
      skill = parseSkill(entryFile.content);
    } catch {
      validationErrors.push(`skill ${remote.id}: Failed to parse frontmatter`);
      continue;
    }

    const validation = validateSkill(skill);
    if (!validation.success) {
      validationErrors.push(
        `skill ${remote.id}: ${validation.errors.join("; ")}`,
      );
      continue;
    }

    const dir = path.join(skillsDir, validation.data.id);
    const targetFiles: Array<{ path: string; content: string }> = [];

    let hasInvalidPath = false;
    for (const file of remote.files) {
      const targetPath = resolveResourcePath(dir, file.path);
      if (!targetPath) {
        validationErrors.push(`skill ${remote.id}: Invalid file path "${file.path}"`);
        hasInvalidPath = true;
        break;
      }

      targetFiles.push({ path: targetPath, content: file.content });
    }

    if (hasInvalidPath) {
      continue;
    }

    for (const file of targetFiles) {
      fs.mkdirSync(path.dirname(file.path), { recursive: true });
      fs.writeFileSync(file.path, file.content, "utf-8");
    }

    skillsWritten++;
    console.log(`  + skill: ${validation.data.id}`);
  }

  // Write rules
  for (const remote of result.rules) {
    let rule: RuleSpec;
    try {
      rule = parseRule(remote.content);
    } catch {
      validationErrors.push(`rule ${remote.id}: Failed to parse frontmatter`);
      continue;
    }

    const validation = validateRule(rule);
    if (!validation.success) {
      validationErrors.push(
        `rule ${remote.id}: ${validation.errors.join("; ")}`,
      );
      continue;
    }

    const dir = path.join(rulesDir, validation.data.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "RULE.md"), remote.content, "utf-8");
    rulesWritten++;
    console.log(`  + rule: ${validation.data.id}`);
  }

  if (validationErrors.length > 0) {
    console.warn(`\nSkipped ${validationErrors.length} invalid resource(s):`);
    for (const err of validationErrors) {
      console.warn(`  - ${err}`);
    }
  }

  const total = skillsWritten + rulesWritten;
  console.log(`\nInitialized .my-ai with ${skillsWritten} skill(s) and ${rulesWritten} rule(s) from ${source}.`);

  if (total === 0) {
    console.error("No valid resources were imported. Removing .my-ai directory.");
    fs.rmSync(path.resolve(".my-ai"), { recursive: true, force: true });
    process.exit(1);
  }
}

function resolveResourcePath(baseDir: string, relativePath: string): string | null {
  if (relativePath.length === 0 || path.isAbsolute(relativePath)) {
    return null;
  }

  const segments = relativePath.split(/[\\/]+/);
  if (segments.includes("..")) {
    return null;
  }

  const resolvedBase = path.resolve(baseDir);
  const resolvedPath = path.resolve(resolvedBase, relativePath);
  if (resolvedPath.startsWith(`${resolvedBase}${path.sep}`)) {
    return resolvedPath;
  }

  return null;
}
