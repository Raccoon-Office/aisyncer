import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { syncCommand } from "../src/cli/commands/sync.js";
import { emitSkill, emitRule } from "../src/core/parser.js";
import type { SkillSpec, RuleSpec } from "../src/core/schema.js";

const SAMPLE_SKILL: SkillSpec = {
  schemaVersion: 1,
  id: "codex-skill",
  name: "Codex Skill",
  description: "Skill for Codex sync tests",
  content: "# Codex Skill\n\nContent here.",
};

const SAMPLE_RULE: RuleSpec = {
  schemaVersion: 1,
  id: "codex-rule",
  name: "Codex Rule",
  description: "Rule for Codex sync tests",
  content: "# Codex Rule\n\nContent here.",
};

function writeCanonicalSkill(
  baseDir: string,
  skill: SkillSpec,
  extraFiles: Record<string, string> = {},
): void {
  const dir = path.join(baseDir, ".my-ai", "skills", skill.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), emitSkill(skill), "utf-8");

  for (const [relativePath, content] of Object.entries(extraFiles)) {
    const filePath = path.join(dir, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, "utf-8");
  }
}

function writeCanonicalRule(baseDir: string, rule: RuleSpec): void {
  const dir = path.join(baseDir, ".my-ai", "rules", rule.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "RULE.md"), emitRule(rule), "utf-8");
}

describe("syncCommand", () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-command-test-"));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes skills to the codex skills directory", async () => {
    const codexDir = path.join(tmpDir, ".codex-output");
    writeCanonicalSkill(tmpDir, SAMPLE_SKILL);

    await syncCommand({ to: "codex", write: true, codexDir });

    expect(fs.existsSync(path.join(codexDir, "skills", SAMPLE_SKILL.id, "SKILL.md"))).toBe(true);
  });

  it("writes skills to the cursor skills directory", async () => {
    const cursorDir = path.join(tmpDir, ".cursor-output");
    writeCanonicalSkill(tmpDir, SAMPLE_SKILL);

    await syncCommand({ to: "cursor", write: true, cursorDir });

    expect(fs.existsSync(path.join(cursorDir, "skills", SAMPLE_SKILL.id, "SKILL.md"))).toBe(true);
  });

  it("mirrors companion skill files into the target platform directory", async () => {
    const codexDir = path.join(tmpDir, ".codex-output");
    writeCanonicalSkill(tmpDir, SAMPLE_SKILL, {
      "references/checklist.md": "Checklist",
    });

    await syncCommand({ to: "codex", write: true, codexDir });

    expect(fs.existsSync(path.join(codexDir, "skills", SAMPLE_SKILL.id, "references", "checklist.md"))).toBe(true);
  });

  it("prints the codex rules skip note when no rules target is selected", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    writeCanonicalRule(tmpDir, SAMPLE_RULE);

    await syncCommand({ to: "codex", syncRules: true });

    expect(logSpy).toHaveBeenCalledWith("No supported rules target selected. Rules sync currently targets windsurf (.windsurf/rules/*.md) only.");
    expect(logSpy).toHaveBeenCalledWith("Codex has no rules sync target. Use AGENTS.md for project instructions.");
  });

  it("prints the cursor rules skip note when no rules target is selected", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    writeCanonicalRule(tmpDir, SAMPLE_RULE);

    await syncCommand({ to: "cursor", syncRules: true });

    expect(logSpy).toHaveBeenCalledWith("No supported rules target selected. Rules sync currently targets windsurf (.windsurf/rules/*.md) only.");
    expect(logSpy).toHaveBeenCalledWith("Cursor rules sync is not supported yet. Manage project rules in .cursor/rules/*.mdc.");
  });
});
