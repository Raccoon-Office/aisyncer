import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadCanonicalSkills, planSync, executeSync } from "../src/core/sync.js";
import { createAdapter } from "../src/adapters/base.js";
import { emitSkill } from "../src/core/parser.js";
import type { SkillSpec } from "../src/core/schema.js";
import { skillConfig } from "../src/core/schema.js";

const SKILL_A: SkillSpec = {
  schemaVersion: 1,
  id: "skill-a",
  name: "Skill A",
  description: "First skill",
  content: "# Skill A\n\nContent A.",
};

const SKILL_B: SkillSpec = {
  schemaVersion: 1,
  id: "skill-b",
  name: "Skill B",
  description: "Second skill",
  content: "# Skill B\n\nContent B.",
};

function writeCanonicalSkill(
  baseDir: string,
  skill: SkillSpec,
  extraFiles: Record<string, string> = {},
): void {
  const dir = path.join(baseDir, skill.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), emitSkill(skill), "utf-8");

  for (const [relativePath, content] of Object.entries(extraFiles)) {
    const filePath = path.join(dir, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, "utf-8");
  }
}

function loadCanonicalSkill(baseDir: string, id: string): SkillSpec {
  const skill = loadCanonicalSkills(baseDir).find((entry) => entry.id === id);
  if (!skill) {
    throw new Error(`Expected canonical skill ${id} to exist`);
  }
  return skill;
}

describe("loadCanonicalSkills", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty array for non-existent directory", () => {
    const skills = loadCanonicalSkills(path.join(tmpDir, "nope"));
    expect(skills).toEqual([]);
  });

  it("loads valid skills from directory", () => {
    writeCanonicalSkill(tmpDir, SKILL_A);
    writeCanonicalSkill(tmpDir, SKILL_B);
    const skills = loadCanonicalSkills(tmpDir);
    expect(skills).toHaveLength(2);
    const ids = skills.map((s) => s.id).sort();
    expect(ids).toEqual(["skill-a", "skill-b"]);
  });

  it("skips invalid skills", () => {
    writeCanonicalSkill(tmpDir, SKILL_A);
    const badDir = path.join(tmpDir, "bad-skill");
    fs.mkdirSync(badDir, { recursive: true });
    fs.writeFileSync(
      path.join(badDir, "SKILL.md"),
      "---\nschemaVersion: 1\nid: bad-skill\ndescription: no name\n---\n\nContent",
      "utf-8",
    );
    const skills = loadCanonicalSkills(tmpDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].id).toBe("skill-a");
  });

  it("does not crash on corrupted frontmatter", () => {
    writeCanonicalSkill(tmpDir, SKILL_A);
    const badDir = path.join(tmpDir, "corrupt");
    fs.mkdirSync(badDir, { recursive: true });
    fs.writeFileSync(
      path.join(badDir, "SKILL.md"),
      "---\n: invalid: yaml: {{{\n---\n\nstuff",
      "utf-8",
    );
    const skills = loadCanonicalSkills(tmpDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].id).toBe("skill-a");
  });
});

describe("planSync", () => {
  let targetDir: string;
  let canonicalDir: string;

  beforeEach(() => {
    targetDir = fs.mkdtempSync(path.join(os.tmpdir(), "plan-sync-"));
    canonicalDir = fs.mkdtempSync(path.join(os.tmpdir(), "plan-canonical-"));
  });

  afterEach(() => {
    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.rmSync(canonicalDir, { recursive: true, force: true });
  });

  it("plans ADD when target does not exist", () => {
    const adapter = createAdapter("test", targetDir);
    const actions = planSync([SKILL_A], adapter);
    expect(actions).toHaveLength(1);
    expect(actions[0].action).toBe("add");
    expect(actions[0].id).toBe("skill-a");
    expect(actions[0].skillId).toBe("skill-a");
  });

  it("plans SKIP when full skill hash matches", () => {
    const adapter = createAdapter("test", targetDir);
    adapter.writeResource(SKILL_A, skillConfig);

    const actions = planSync([SKILL_A], adapter);
    expect(actions).toHaveLength(1);
    expect(actions[0].action).toBe("skip");
  });

  it("plans OVERWRITE when content differs", () => {
    const adapter = createAdapter("test", targetDir);
    adapter.writeResource(SKILL_A, skillConfig);

    const modifiedA: SkillSpec = { ...SKILL_A, content: "# Modified content" };
    const actions = planSync([modifiedA], adapter);
    expect(actions).toHaveLength(1);
    expect(actions[0].action).toBe("overwrite");
  });

  it("plans OVERWRITE when name differs but content is same", () => {
    const adapter = createAdapter("test", targetDir);
    adapter.writeResource(SKILL_A, skillConfig);

    const renamedA: SkillSpec = { ...SKILL_A, name: "Renamed Skill A" };
    const actions = planSync([renamedA], adapter);
    expect(actions).toHaveLength(1);
    expect(actions[0].action).toBe("overwrite");
  });

  it("plans OVERWRITE when description differs but content is same", () => {
    const adapter = createAdapter("test", targetDir);
    adapter.writeResource(SKILL_A, skillConfig);

    const modified: SkillSpec = { ...SKILL_A, description: "New description" };
    const actions = planSync([modified], adapter);
    expect(actions).toHaveLength(1);
    expect(actions[0].action).toBe("overwrite");
  });

  it("plans OVERWRITE when allowedTools differs", () => {
    const adapter = createAdapter("test", targetDir);
    adapter.writeResource(SKILL_A, skillConfig);

    const modified: SkillSpec = { ...SKILL_A, allowedTools: ["Bash"] };
    const actions = planSync([modified], adapter);
    expect(actions).toHaveLength(1);
    expect(actions[0].action).toBe("overwrite");
  });

  it("plans OVERWRITE when metadata differs", () => {
    const adapter = createAdapter("test", targetDir);
    adapter.writeResource(SKILL_A, skillConfig);

    const modified: SkillSpec = { ...SKILL_A, metadata: { version: "9.9.9" } };
    const actions = planSync([modified], adapter);
    expect(actions).toHaveLength(1);
    expect(actions[0].action).toBe("overwrite");
  });

  it("plans OVERWRITE when canonical skill has companion files missing from target", () => {
    writeCanonicalSkill(canonicalDir, SKILL_A, {
      "references/checklist.md": "Review checklist",
    });
    const canonicalSkill = loadCanonicalSkill(canonicalDir, SKILL_A.id);

    const adapter = createAdapter("test", targetDir);
    adapter.writeResource(SKILL_A, skillConfig);

    const actions = planSync([canonicalSkill], adapter);
    expect(actions).toHaveLength(1);
    expect(actions[0].action).toBe("overwrite");
  });

  it("plans OVERWRITE when target has stale companion files", () => {
    writeCanonicalSkill(canonicalDir, SKILL_A);
    const canonicalSkill = loadCanonicalSkill(canonicalDir, SKILL_A.id);

    const adapter = createAdapter("test", targetDir);
    adapter.writeResource(SKILL_A, skillConfig);

    const stalePath = path.join(targetDir, "skills", SKILL_A.id, "references", "stale.md");
    fs.mkdirSync(path.dirname(stalePath), { recursive: true });
    fs.writeFileSync(stalePath, "stale content", "utf-8");

    const actions = planSync([canonicalSkill], adapter);
    expect(actions).toHaveLength(1);
    expect(actions[0].action).toBe("overwrite");
  });

  it("plans DELETE for stale target skills when prune is enabled", () => {
    writeCanonicalSkill(canonicalDir, SKILL_A);
    const canonicalSkill = loadCanonicalSkill(canonicalDir, SKILL_A.id);

    const adapter = createAdapter("test", targetDir);
    adapter.writeResource(SKILL_A, skillConfig);
    adapter.writeResource(SKILL_B, skillConfig);

    const actions = planSync([canonicalSkill], adapter, { prune: true });
    const deleteAction = actions.find((action) => action.id === SKILL_B.id);
    expect(deleteAction?.action).toBe("delete");
  });

  it("handles multiple skills with mixed actions", () => {
    const adapter = createAdapter("test", targetDir);
    adapter.writeResource(SKILL_A, skillConfig);

    const actions = planSync([SKILL_A, SKILL_B], adapter);

    expect(actions).toHaveLength(2);
    const aAction = actions.find((a) => a.id === "skill-a");
    const bAction = actions.find((a) => a.id === "skill-b");
    expect(aAction?.action).toBe("skip");
    expect(bAction?.action).toBe("add");
    expect(aAction?.skillId).toBe("skill-a");
    expect(bAction?.skillId).toBe("skill-b");
  });

  it("plans ADD when target has corrupted frontmatter", () => {
    const adapter = createAdapter("test", targetDir);
    const corruptDir = path.join(targetDir, "skills", SKILL_A.id);
    fs.mkdirSync(corruptDir, { recursive: true });
    fs.writeFileSync(
      path.join(corruptDir, "SKILL.md"),
      "not even close to valid yaml frontmatter {{{",
      "utf-8",
    );

    const actions = planSync([SKILL_A], adapter);
    expect(actions).toHaveLength(1);
    expect(actions[0].action).toBe("add");
  });
});

describe("executeSync", () => {
  let targetDir: string;
  let canonicalDir: string;

  beforeEach(() => {
    targetDir = fs.mkdtempSync(path.join(os.tmpdir(), "exec-sync-"));
    canonicalDir = fs.mkdtempSync(path.join(os.tmpdir(), "exec-canonical-"));
  });

  afterEach(() => {
    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.rmSync(canonicalDir, { recursive: true, force: true });
  });

  it("writes skills for add actions", () => {
    const adapter = createAdapter("test", targetDir);
    const actions = planSync([SKILL_A, SKILL_B], adapter);

    executeSync([SKILL_A, SKILL_B], actions, adapter);

    expect(adapter.readResource("skill-a", skillConfig)).not.toBeNull();
    expect(adapter.readResource("skill-b", skillConfig)).not.toBeNull();
  });

  it("does not write for skip actions", () => {
    const adapter = createAdapter("test", targetDir);
    adapter.writeResource(SKILL_A, skillConfig);

    const filePath = adapter.resourcePath(SKILL_A.id, skillConfig);
    const mtimeBefore = fs.statSync(filePath).mtimeMs;

    const actions = planSync([SKILL_A], adapter);
    expect(actions[0].action).toBe("skip");

    executeSync([SKILL_A], actions, adapter);

    const mtimeAfter = fs.statSync(filePath).mtimeMs;
    expect(mtimeAfter).toBe(mtimeBefore);
  });

  it("overwrites when content differs", () => {
    const adapter = createAdapter("test", targetDir);
    adapter.writeResource(SKILL_A, skillConfig);

    const modifiedA: SkillSpec = { ...SKILL_A, content: "# Updated content\n\nNew text." };
    const actions = planSync([modifiedA], adapter);
    expect(actions[0].action).toBe("overwrite");

    executeSync([modifiedA], actions, adapter);

    const read = adapter.readResource("skill-a", skillConfig);
    expect(read?.content).toBe("# Updated content\n\nNew text.");
  });

  it("mirrors companion files and removes stale files for canonical skills", () => {
    writeCanonicalSkill(canonicalDir, SKILL_A, {
      "references/checklist.md": "Review checklist",
      "scripts/review.sh": "#!/bin/sh\necho review\n",
    });
    const canonicalSkill = loadCanonicalSkill(canonicalDir, SKILL_A.id);

    const adapter = createAdapter("test", targetDir);
    adapter.writeResource(SKILL_A, skillConfig);

    const stalePath = path.join(targetDir, "skills", SKILL_A.id, "references", "old.md");
    fs.mkdirSync(path.dirname(stalePath), { recursive: true });
    fs.writeFileSync(stalePath, "old", "utf-8");

    const actions = planSync([canonicalSkill], adapter);
    executeSync([canonicalSkill], actions, adapter);

    const copiedReference = path.join(targetDir, "skills", SKILL_A.id, "references", "checklist.md");
    const copiedScript = path.join(targetDir, "skills", SKILL_A.id, "scripts", "review.sh");
    expect(fs.existsSync(copiedReference)).toBe(true);
    expect(fs.existsSync(copiedScript)).toBe(true);
    expect(fs.readFileSync(copiedReference, "utf-8")).toBe("Review checklist");
    expect(fs.existsSync(stalePath)).toBe(false);
  });

  it("deletes stale target skills when prune is enabled", () => {
    writeCanonicalSkill(canonicalDir, SKILL_A);
    const canonicalSkill = loadCanonicalSkill(canonicalDir, SKILL_A.id);

    const adapter = createAdapter("test", targetDir);
    adapter.writeResource(SKILL_A, skillConfig);
    adapter.writeResource(SKILL_B, skillConfig);

    const actions = planSync([canonicalSkill], adapter, { prune: true });
    executeSync([canonicalSkill], actions, adapter);

    expect(fs.existsSync(path.join(targetDir, "skills", SKILL_A.id))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, "skills", SKILL_B.id))).toBe(false);
  });
});
