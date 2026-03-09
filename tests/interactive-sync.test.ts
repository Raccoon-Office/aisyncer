import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  detectAvailableResources,
  getAvailableResourceTypes,
  type ResourceDetectionResult,
} from "../src/cli/commands/interactive-sync.js";
import type { SkillSpec, RuleSpec } from "../src/core/schema.js";
import { emitSkill } from "../src/core/parser.js";
import { emitRule } from "../src/core/parser.js";

const SKILL_A: SkillSpec = {
  schemaVersion: 1,
  id: "skill-a",
  name: "Skill A",
  description: "First skill",
  content: "# Skill A\n\nContent A.",
};

const RULE_A: RuleSpec = {
  schemaVersion: 1,
  id: "rule-a",
  name: "Rule A",
  description: "First rule",
  content: "# Rule A\n\nRule content.",
};

function writeCanonicalSkill(baseDir: string, skill: SkillSpec): void {
  const dir = path.join(baseDir, skill.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), emitSkill(skill), "utf-8");
}

function writeCanonicalRule(baseDir: string, rule: RuleSpec): void {
  const dir = path.join(baseDir, rule.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "RULE.md"), emitRule(rule), "utf-8");
}

describe("detectAvailableResources", () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "interactive-test-"));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns false for both when .my-ai does not exist", () => {
    const result = detectAvailableResources();
    expect(result.hasSkills).toBe(false);
    expect(result.hasRules).toBe(false);
    expect(result.skillsCount).toBe(0);
    expect(result.rulesCount).toBe(0);
  });

  it("detects skills when .my-ai/skills has valid skills", () => {
    const skillsDir = path.join(tmpDir, ".my-ai", "skills");
    fs.mkdirSync(skillsDir, { recursive: true });
    writeCanonicalSkill(skillsDir, SKILL_A);

    const result = detectAvailableResources();
    expect(result.hasSkills).toBe(true);
    expect(result.skillsCount).toBe(1);
    expect(result.hasRules).toBe(false);
  });

  it("detects rules when .my-ai/rules has valid rules", () => {
    const rulesDir = path.join(tmpDir, ".my-ai", "rules");
    fs.mkdirSync(rulesDir, { recursive: true });
    writeCanonicalRule(rulesDir, RULE_A);

    const result = detectAvailableResources();
    expect(result.hasSkills).toBe(false);
    expect(result.hasRules).toBe(true);
    expect(result.rulesCount).toBe(1);
  });

  it("detects both skills and rules", () => {
    const skillsDir = path.join(tmpDir, ".my-ai", "skills");
    const rulesDir = path.join(tmpDir, ".my-ai", "rules");
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.mkdirSync(rulesDir, { recursive: true });
    writeCanonicalSkill(skillsDir, SKILL_A);
    writeCanonicalRule(rulesDir, RULE_A);

    const result = detectAvailableResources();
    expect(result.hasSkills).toBe(true);
    expect(result.skillsCount).toBe(1);
    expect(result.hasRules).toBe(true);
    expect(result.rulesCount).toBe(1);
  });

  it("returns false when skills directory exists but has no valid skills", () => {
    const skillsDir = path.join(tmpDir, ".my-ai", "skills");
    fs.mkdirSync(skillsDir, { recursive: true });
    // Create an invalid skill
    const badDir = path.join(skillsDir, "bad-skill");
    fs.mkdirSync(badDir, { recursive: true });
    fs.writeFileSync(
      path.join(badDir, "SKILL.md"),
      "---\nschemaVersion: 1\nid: bad\ndescription: no name\n---\n\nContent",
      "utf-8",
    );

    const result = detectAvailableResources();
    expect(result.hasSkills).toBe(false);
    expect(result.skillsCount).toBe(0);
  });
});

describe("getAvailableResourceTypes", () => {
  it("returns only skills when only skills exist", () => {
    const detection: ResourceDetectionResult = {
      hasSkills: true,
      hasRules: false,
      skillsCount: 3,
      rulesCount: 0,
    };

    const types = getAvailableResourceTypes(["claude", "windsurf"], detection);
    expect(types).toHaveLength(1);
    expect(types[0].value).toBe("skills");
    expect(types[0].name).toContain("3 found");
  });

  it("returns skills and rules when both exist and windsurf is selected", () => {
    const detection: ResourceDetectionResult = {
      hasSkills: true,
      hasRules: true,
      skillsCount: 2,
      rulesCount: 1,
    };

    const types = getAvailableResourceTypes(["windsurf"], detection);
    expect(types).toHaveLength(2);
    expect(types[0].value).toBe("skills");
    expect(types[1].value).toBe("rules");
  });

  it("returns only skills when rules exist but only claude is selected", () => {
    const detection: ResourceDetectionResult = {
      hasSkills: true,
      hasRules: true,
      skillsCount: 2,
      rulesCount: 1,
    };

    const types = getAvailableResourceTypes(["claude"], detection);
    expect(types).toHaveLength(1);
    expect(types[0].value).toBe("skills");
  });

  it("returns both when rules exist and both platforms selected", () => {
    const detection: ResourceDetectionResult = {
      hasSkills: true,
      hasRules: true,
      skillsCount: 2,
      rulesCount: 1,
    };

    const types = getAvailableResourceTypes(["claude", "windsurf"], detection);
    expect(types).toHaveLength(2);
    expect(types[0].value).toBe("skills");
    expect(types[1].value).toBe("rules");
  });

  it("returns empty array when no resources exist", () => {
    const detection: ResourceDetectionResult = {
      hasSkills: false,
      hasRules: false,
      skillsCount: 0,
      rulesCount: 0,
    };

    const types = getAvailableResourceTypes(["claude", "windsurf"], detection);
    expect(types).toHaveLength(0);
  });

  it("returns only rules when only rules exist and windsurf is selected", () => {
    const detection: ResourceDetectionResult = {
      hasSkills: false,
      hasRules: true,
      skillsCount: 0,
      rulesCount: 2,
    };

    const types = getAvailableResourceTypes(["windsurf"], detection);
    expect(types).toHaveLength(1);
    expect(types[0].value).toBe("rules");
  });
});
