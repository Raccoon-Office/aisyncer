import { afterEach, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { emitRule, emitSkill, emitWorkflow } from "../src/core/parser.js";
import { emitProjectInstructions } from "../src/core/project-instructions.js";
import type { RuleSpec, SkillSpec, WorkflowSpec } from "../src/core/schema.js";

const TEST_SKILL: SkillSpec = {
  schemaVersion: 1,
  id: "code-review",
  name: "Code Review",
  description: "Review code changes",
  content: "# Code Review\n\nReview the requested changes carefully.\n",
};

const TEST_RULE: RuleSpec = {
  schemaVersion: 1,
  id: "code-style",
  name: "Code Style",
  description: "Keep code style consistent",
  content: "# Code Style\n\n- Keep code style consistent.\n",
};

const TEST_WORKFLOW: WorkflowSpec = {
  schemaVersion: 1,
  id: "release-check",
  name: "Release Check",
  description: "Review release readiness",
  content: "# Release Check\n\n1. Review scope.\n2. Run validations.\n",
};

const TEST_INSTRUCTIONS = {
  content: "# Project Instructions\n\n- Keep generated files derived from .my-ai.\n",
};

const testFileDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testFileDir, "..");
const distCliPath = path.join(repoRoot, "dist", "cli", "index.js");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const tmpDirs: string[] = [];

interface CliRunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

beforeAll(() => {
  const result = spawnSync(npmCommand, ["run", "build"], {
    cwd: repoRoot,
    encoding: "utf-8",
  });

  if (result.status !== 0) {
    throw new Error([
      "Failed to build CLI for E2E tests.",
      result.stdout,
      result.stderr,
    ].filter((chunk) => chunk && chunk.trim().length > 0).join("\n"));
  }

  if (!fs.existsSync(distCliPath)) {
    throw new Error(`Expected built CLI at ${distCliPath}`);
  }
});

afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("CLI E2E", () => {
  it("initializes .my-ai and validates the generated resources", () => {
    const cwd = createTempWorkspace();

    const initResult = runCli(["init", "--with-rules", "--with-instructions", "--with-workflows"], cwd);
    expect(initResult.status).toBe(0);
    expect(fs.existsSync(path.join(cwd, ".my-ai", "skills", "example-skill", "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(cwd, ".my-ai", "rules", "example-rule", "RULE.md"))).toBe(true);
    expect(fs.existsSync(path.join(cwd, ".my-ai", "instructions", "PROJECT.md"))).toBe(true);
    expect(fs.existsSync(path.join(cwd, ".my-ai", "workflows", "review-release", "WORKFLOW.md"))).toBe(true);

    const validateResult = runCli(
      ["validate", "--with-rules", "--with-instructions", "--with-workflows"],
      cwd,
    );

    expect(validateResult.status).toBe(0);
    expect(validateResult.stdout).toContain("All skills are valid.");
    expect(validateResult.stdout).toContain("All rules are valid.");
    expect(validateResult.stdout).toContain("Project instructions are valid.");
    expect(validateResult.stdout).toContain("All workflows are valid.");
  });

  it("keeps sync dry-run side-effect free", () => {
    const cwd = createTempWorkspace();
    writeCanonicalResources(cwd);

    const result = runCli(
      [
        "sync",
        "--to",
        "claude,codex,cursor,windsurf",
        "--sync-rules",
        "--sync-workflows",
        "--sync-instructions",
      ],
      cwd,
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("[dry-run] No files will be written.");
    expect(result.stdout).toContain("Run with --write to apply these changes.");

    expect(fs.existsSync(path.join(cwd, ".claude"))).toBe(false);
    expect(fs.existsSync(path.join(cwd, ".agents"))).toBe(false);
    expect(fs.existsSync(path.join(cwd, ".cursor"))).toBe(false);
    expect(fs.existsSync(path.join(cwd, ".windsurf"))).toBe(false);
    expect(fs.existsSync(path.join(cwd, "AGENTS.md"))).toBe(false);
    expect(fs.existsSync(path.join(cwd, "CLAUDE.md"))).toBe(false);
  });

  it("writes generated files for sync targets", () => {
    const cwd = createTempWorkspace();
    writeCanonicalResources(cwd, {
      skillExtras: {
        "references/checklist.md": "Checklist",
      },
    });

    const result = runCli(
      [
        "sync",
        "--to",
        "claude,codex,cursor,windsurf",
        "--sync-rules",
        "--sync-workflows",
        "--sync-instructions",
        "--write",
      ],
      cwd,
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Sync complete.");

    expect(fs.existsSync(path.join(cwd, ".claude", "skills", TEST_SKILL.id, "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(cwd, ".agents", "skills", TEST_SKILL.id, "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(cwd, ".cursor", "skills", TEST_SKILL.id, "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(cwd, ".windsurf", "skills", TEST_SKILL.id, "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(cwd, ".agents", "skills", TEST_SKILL.id, "references", "checklist.md"))).toBe(true);
    expect(fs.existsSync(path.join(cwd, ".windsurf", "rules", `${TEST_RULE.id}.md`))).toBe(true);
    expect(fs.existsSync(path.join(cwd, ".cursor", "commands", `${TEST_WORKFLOW.id}.md`))).toBe(true);
    expect(fs.existsSync(path.join(cwd, ".windsurf", "workflows", `${TEST_WORKFLOW.id}.md`))).toBe(true);

    const agentsContent = fs.readFileSync(path.join(cwd, "AGENTS.md"), "utf-8");
    const claudeContent = fs.readFileSync(path.join(cwd, "CLAUDE.md"), "utf-8");
    expect(agentsContent).toContain("Keep generated files derived from .my-ai.");
    expect(claudeContent).toContain("@AGENTS.md");
  });

  it("returns a non-zero exit code for invalid canonical resources", () => {
    const cwd = createTempWorkspace();
    const skillDir = path.join(cwd, ".my-ai", "skills", "broken-skill");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      "---\nschemaVersion: 1\nid: broken-skill\ndescription: Missing name\n---\n\n# Broken\n",
      "utf-8",
    );

    const result = runCli(["validate"], cwd);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Validation failed");
    expect(result.stderr).toContain("name");
  });
});

function createTempWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aisyncer-e2e-"));
  tmpDirs.push(dir);
  return dir;
}

function runCli(args: string[], cwd: string): CliRunResult {
  const result = spawnSync(process.execPath, [distCliPath, ...args], {
    cwd,
    encoding: "utf-8",
    env: process.env,
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function writeCanonicalResources(
  cwd: string,
  options: {
    skillExtras?: Record<string, string>;
  } = {},
): void {
  const skillDir = path.join(cwd, ".my-ai", "skills", TEST_SKILL.id);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), emitSkill(TEST_SKILL), "utf-8");

  for (const [relativePath, content] of Object.entries(options.skillExtras ?? {})) {
    const targetPath = path.join(skillDir, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content, "utf-8");
  }

  const ruleDir = path.join(cwd, ".my-ai", "rules", TEST_RULE.id);
  fs.mkdirSync(ruleDir, { recursive: true });
  fs.writeFileSync(path.join(ruleDir, "RULE.md"), emitRule(TEST_RULE), "utf-8");

  const workflowDir = path.join(cwd, ".my-ai", "workflows", TEST_WORKFLOW.id);
  fs.mkdirSync(workflowDir, { recursive: true });
  fs.writeFileSync(path.join(workflowDir, "WORKFLOW.md"), emitWorkflow(TEST_WORKFLOW), "utf-8");

  const instructionsFile = path.join(cwd, ".my-ai", "instructions", "PROJECT.md");
  fs.mkdirSync(path.dirname(instructionsFile), { recursive: true });
  fs.writeFileSync(instructionsFile, emitProjectInstructions(TEST_INSTRUCTIONS), "utf-8");
}
