import fs from "node:fs";
import path from "node:path";
import { emitSkill, emitRule } from "../../core/parser.js";
import { emitProjectInstructions } from "../../core/project-instructions.js";
import type { SkillSpec, RuleSpec } from "../../core/schema.js";
import { fetchFromGitHub } from "../../github/fetch.js";
import { materializeFetchedResources } from "../../github/materialize.js";

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

const EXAMPLE_PROJECT_INSTRUCTIONS = {
  content: `# Project Instructions

These instructions apply across assistants for this repository.

## Defaults

- Prefer minimal, focused changes
- Update tests and docs when behavior changes
- Keep generated platform files derived from .my-ai`,
};

export async function initCommand(options: { from?: string; withRules?: boolean; withInstructions?: boolean }): Promise<void> {
  const baseDir = path.resolve(".my-ai");
  const skillsDir = path.join(baseDir, "skills");

  if (fs.existsSync(baseDir)) {
    console.log(".my-ai directory already exists. Skipping init.");
    return;
  }

  if (options.from) {
    await initFromGitHub(options.from, skillsDir);
  } else {
    initLocal(skillsDir, options.withRules ?? false, options.withInstructions ?? false);
  }
}

function initLocal(skillsDir: string, withRules: boolean, withInstructions: boolean): void {
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

  if (withInstructions) {
    const instructionsFile = path.join(path.dirname(skillsDir), "instructions", "PROJECT.md");
    fs.mkdirSync(path.dirname(instructionsFile), { recursive: true });
    fs.writeFileSync(
      instructionsFile,
      emitProjectInstructions(EXAMPLE_PROJECT_INSTRUCTIONS),
      "utf-8",
    );

    console.log("\nInitialized project instructions:");
    console.log(`  ${instructionsFile}`);
  }
}

async function initFromGitHub(source: string, skillsDir: string): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  const baseDir = path.dirname(skillsDir);

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

  const {
    skillsWritten,
    rulesWritten,
    projectInstructionsWritten,
    writtenSkillIds,
    writtenRuleIds,
    validationErrors,
  } = materializeFetchedResources(result, baseDir);

  for (const id of writtenSkillIds) {
    console.log(`  + skill: ${id}`);
  }

  for (const id of writtenRuleIds) {
    console.log(`  + rule: ${id}`);
  }

  if (projectInstructionsWritten) {
    console.log("  + project instructions");
  }

  if (validationErrors.length > 0) {
    console.warn(`\nSkipped ${validationErrors.length} invalid resource(s):`);
    for (const err of validationErrors) {
      console.warn(`  - ${err}`);
    }
  }

  const total = skillsWritten + rulesWritten + (projectInstructionsWritten ? 1 : 0);
  const summary = [`${skillsWritten} skill(s)`, `${rulesWritten} rule(s)`];
  if (projectInstructionsWritten) {
    summary.push("project instructions");
  }

  console.log(`\nInitialized .my-ai with ${summary.join(", ")} from ${source}.`);

  if (total === 0) {
    console.error("No valid resources were imported. Removing .my-ai directory.");
    fs.rmSync(path.resolve(".my-ai"), { recursive: true, force: true });
    process.exit(1);
  }
}
