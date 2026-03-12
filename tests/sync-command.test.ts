import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { syncCommand } from "../src/cli/commands/sync.js";
import { emitSkill, emitRule } from "../src/core/parser.js";
import { emitProjectInstructions } from "../src/core/project-instructions.js";
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

function writeCanonicalProjectInstructions(baseDir: string, content = "# Project Instructions\n\n- Keep changes focused.\n"): void {
  const filePath = path.join(baseDir, ".my-ai", "instructions", "PROJECT.md");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, emitProjectInstructions({ content }), "utf-8");
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

  it("deletes stale target skills when prune is enabled", async () => {
    const codexDir = path.join(tmpDir, ".codex-output");
    writeCanonicalSkill(tmpDir, SAMPLE_SKILL);

    const staleDir = path.join(codexDir, "skills", "stale-skill");
    fs.mkdirSync(staleDir, { recursive: true });
    fs.writeFileSync(path.join(staleDir, "SKILL.md"), emitSkill({
      ...SAMPLE_SKILL,
      id: "stale-skill",
      name: "Stale Skill",
    }), "utf-8");

    await syncCommand({ to: "codex", write: true, prune: true, codexDir });

    expect(fs.existsSync(staleDir)).toBe(false);
    expect(fs.existsSync(path.join(codexDir, "skills", SAMPLE_SKILL.id, "SKILL.md"))).toBe(true);
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

  it("writes shared project instructions to AGENTS.md and a wrapper import to CLAUDE.md", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    writeCanonicalProjectInstructions(tmpDir);

    await syncCommand({ to: "claude,codex,cursor,windsurf", write: true, syncInstructions: true });

    const claudeContent = fs.readFileSync(path.join(tmpDir, "CLAUDE.md"), "utf-8");
    const agentsContent = fs.readFileSync(path.join(tmpDir, "AGENTS.md"), "utf-8");

    expect(claudeContent).toContain("aisyncer:project-instructions:start");
    expect(claudeContent).toContain("@AGENTS.md");
    expect(claudeContent).not.toContain("Keep changes focused.");
    expect(agentsContent).toContain("aisyncer:project-instructions:start");
    expect(agentsContent).toContain("Keep changes focused.");
    expect((agentsContent.match(/aisyncer:project-instructions:start/g) ?? [])).toHaveLength(1);
    expect(logSpy).toHaveBeenCalledWith("Syncing project instructions...");
  });

  it("generates AGENTS.md first when syncing project instructions to claude only", async () => {
    writeCanonicalProjectInstructions(tmpDir);

    await syncCommand({ to: "claude", write: true, syncInstructions: true });

    const claudeContent = fs.readFileSync(path.join(tmpDir, "CLAUDE.md"), "utf-8");
    const agentsContent = fs.readFileSync(path.join(tmpDir, "AGENTS.md"), "utf-8");

    expect(agentsContent).toContain("Keep changes focused.");
    expect(claudeContent).toContain("@AGENTS.md");
    expect(claudeContent).not.toContain("Keep changes focused.");
  });

  it("prunes the managed project instructions block when the canonical file is missing", async () => {
    const managedAgents = [
      "# Existing Instructions",
      "",
      "<!-- aisyncer:project-instructions:start -->",
      "<!-- Managed by aisyncer. Edit .my-ai/instructions/PROJECT.md instead. -->",
      "",
      "# Project Instructions",
      "",
      "- Old content.",
      "<!-- aisyncer:project-instructions:end -->",
      "",
      "Manual footer.",
      "",
    ].join("\n");

    fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), managedAgents, "utf-8");

    await syncCommand({ to: "codex", write: true, syncInstructions: true, prune: true });

    const agentsContent = fs.readFileSync(path.join(tmpDir, "AGENTS.md"), "utf-8");
    expect(agentsContent).toContain("# Existing Instructions");
    expect(agentsContent).toContain("Manual footer.");
    expect(agentsContent).not.toContain("aisyncer:project-instructions:start");
  });

  it("syncs project instructions when only windsurf is selected", async () => {
    writeCanonicalProjectInstructions(tmpDir);

    await syncCommand({ to: "windsurf", write: true, syncInstructions: true });

    const agentsContent = fs.readFileSync(path.join(tmpDir, "AGENTS.md"), "utf-8");
    expect(agentsContent).toContain("Keep changes focused.");
  });
});
