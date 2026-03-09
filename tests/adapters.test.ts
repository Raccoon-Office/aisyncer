import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createAdapter } from "../src/adapters/base.js";
import { createClaudeAdapter } from "../src/adapters/claude.js";
import { createCodexAdapter } from "../src/adapters/codex.js";
import { createCursorAdapter } from "../src/adapters/cursor.js";
import { createWindsurfAdapter } from "../src/adapters/windsurf.js";
import type { SkillSpec } from "../src/core/schema.js";
import { skillConfig, ruleConfig } from "../src/core/schema.js";
import type { RuleSpec } from "../src/core/schema.js";

const SAMPLE_SKILL: SkillSpec = {
  schemaVersion: 1,
  id: "test-skill",
  name: "Test Skill",
  description: "A test skill",
  content: "# Test\n\nContent here.",
};

const SAMPLE_RULE: RuleSpec = {
  schemaVersion: 1,
  id: "test-rule",
  name: "Test Rule",
  description: "A test rule",
  content: "# Test Rule\n\nRule content.",
};

describe("createAdapter", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adapter-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null for non-existent skill", () => {
    const adapter = createAdapter("test", tmpDir);
    expect(adapter.readResource("nonexistent", skillConfig)).toBeNull();
  });

  it("writes and reads back a skill", () => {
    const adapter = createAdapter("test", tmpDir);
    adapter.writeResource(SAMPLE_SKILL, skillConfig);

    const read = adapter.readResource(SAMPLE_SKILL.id, skillConfig);
    expect(read).not.toBeNull();
    expect(read!.id).toBe(SAMPLE_SKILL.id);
    expect(read!.name).toBe(SAMPLE_SKILL.name);
    expect(read!.content).toBe(SAMPLE_SKILL.content);
  });

  it("creates the correct file path", () => {
    const adapter = createAdapter("test", tmpDir);
    adapter.writeResource(SAMPLE_SKILL, skillConfig);

    const expectedPath = path.join(tmpDir, "skills", SAMPLE_SKILL.id, "SKILL.md");
    expect(fs.existsSync(expectedPath)).toBe(true);
  });

  it("resourcePath returns expected path", () => {
    const adapter = createAdapter("test", tmpDir);
    const p = adapter.resourcePath("my-id", skillConfig);
    expect(p).toBe(path.join(tmpDir, "skills", "my-id", "SKILL.md"));
  });

  it("returns null for corrupted frontmatter instead of throwing", () => {
    const adapter = createAdapter("test", tmpDir);
    const corruptDir = path.join(tmpDir, "skills", "corrupt-skill");
    fs.mkdirSync(corruptDir, { recursive: true });
    fs.writeFileSync(
      path.join(corruptDir, "SKILL.md"),
      "this is not yaml frontmatter at all {{{",
      "utf-8",
    );
    expect(adapter.readResource("corrupt-skill", skillConfig)).toBeNull();
  });

  it("writes and reads back a rule", () => {
    const adapter = createAdapter("test", tmpDir);
    adapter.writeResource(SAMPLE_RULE, ruleConfig);

    const read = adapter.readResource(SAMPLE_RULE.id, ruleConfig);
    expect(read).not.toBeNull();
    expect(read!.id).toBe(SAMPLE_RULE.id);
    expect(read!.content).toBe(SAMPLE_RULE.content);
  });

  it("resourcePath works for rules", () => {
    const adapter = createAdapter("test", tmpDir);
    const p = adapter.resourcePath("my-rule", ruleConfig);
    expect(p).toBe(path.join(tmpDir, "rules", "my-rule", "RULE.md"));
  });
});

describe("createClaudeAdapter", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("uses custom directory when provided", () => {
    const adapter = createClaudeAdapter(tmpDir);
    expect(adapter.name).toBe("claude");
    adapter.writeResource(SAMPLE_SKILL, skillConfig);
    expect(fs.existsSync(path.join(tmpDir, "skills", SAMPLE_SKILL.id, "SKILL.md"))).toBe(true);
  });
});

describe("createCodexAdapter", () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-test-"));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("uses custom directory when provided", () => {
    const adapter = createCodexAdapter(tmpDir);
    expect(adapter.name).toBe("codex");
    adapter.writeResource(SAMPLE_SKILL, skillConfig);
    expect(fs.existsSync(path.join(tmpDir, "skills", SAMPLE_SKILL.id, "SKILL.md"))).toBe(true);
  });

  it("defaults to the repository .agents directory", () => {
    const adapter = createCodexAdapter();

    adapter.writeResource(SAMPLE_SKILL, skillConfig);

    expect(fs.existsSync(path.join(tmpDir, ".agents", "skills", SAMPLE_SKILL.id, "SKILL.md"))).toBe(true);
  });
});

describe("createWindsurfAdapter", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "windsurf-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("uses custom directory when provided", () => {
    const adapter = createWindsurfAdapter(tmpDir);
    expect(adapter.name).toBe("windsurf");
    adapter.writeResource(SAMPLE_SKILL, skillConfig);
    expect(fs.existsSync(path.join(tmpDir, "skills", SAMPLE_SKILL.id, "SKILL.md"))).toBe(true);
  });

  it("stores rules as flat markdown files under .windsurf/rules", () => {
    const adapter = createWindsurfAdapter(tmpDir);
    adapter.writeResource(SAMPLE_RULE, ruleConfig);

    const expectedPath = path.join(tmpDir, "rules", `${SAMPLE_RULE.id}.md`);
    expect(fs.existsSync(expectedPath)).toBe(true);

    const read = adapter.readResource(SAMPLE_RULE.id, ruleConfig);
    expect(read).not.toBeNull();
    expect(read!.id).toBe(SAMPLE_RULE.id);
  });

  it("resourcePath returns flat rules path for windsurf", () => {
    const adapter = createWindsurfAdapter(tmpDir);
    const p = adapter.resourcePath("my-rule", ruleConfig);
    expect(p).toBe(path.join(tmpDir, "rules", "my-rule.md"));
  });
});

describe("createCursorAdapter", () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-test-"));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("uses custom directory when provided", () => {
    const adapter = createCursorAdapter(tmpDir);
    expect(adapter.name).toBe("cursor");
    adapter.writeResource(SAMPLE_SKILL, skillConfig);
    expect(fs.existsSync(path.join(tmpDir, "skills", SAMPLE_SKILL.id, "SKILL.md"))).toBe(true);
  });

  it("defaults to the repository .cursor directory", () => {
    const adapter = createCursorAdapter();

    adapter.writeResource(SAMPLE_SKILL, skillConfig);

    expect(fs.existsSync(path.join(tmpDir, ".cursor", "skills", SAMPLE_SKILL.id, "SKILL.md"))).toBe(true);
  });
});
