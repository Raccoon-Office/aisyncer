import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  detectAvailableResources,
  getAvailableResourceTypes,
  interactiveSyncFlow,
  type ResourceDetectionResult,
} from "../src/cli/commands/interactive-sync.js";
import type { SkillSpec, RuleSpec, WorkflowSpec } from "../src/core/schema.js";
import { emitSkill, emitRule, emitWorkflow } from "../src/core/parser.js";
import { emitProjectInstructions } from "../src/core/project-instructions.js";

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

const WORKFLOW_A: WorkflowSpec = {
  schemaVersion: 1,
  id: "workflow-a",
  name: "Workflow A",
  description: "First workflow",
  content: "# Workflow A\n\n1. Step one.\n2. Step two.\n",
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

function writeCanonicalProjectInstructions(baseDir: string, content = "# Project Instructions\n\n- Keep changes focused.\n"): void {
  const filePath = path.join(baseDir, "PROJECT.md");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, emitProjectInstructions({ content }), "utf-8");
}

function writeCanonicalWorkflow(baseDir: string, workflow: WorkflowSpec): void {
  const dir = path.join(baseDir, workflow.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "WORKFLOW.md"), emitWorkflow(workflow), "utf-8");
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
    expect(result.hasInstructions).toBe(false);
    expect(result.hasWorkflows).toBe(false);
    expect(result.skillsCount).toBe(0);
    expect(result.rulesCount).toBe(0);
    expect(result.workflowsCount).toBe(0);
  });

  it("detects skills when .my-ai/skills has valid skills", () => {
    const skillsDir = path.join(tmpDir, ".my-ai", "skills");
    fs.mkdirSync(skillsDir, { recursive: true });
    writeCanonicalSkill(skillsDir, SKILL_A);

    const result = detectAvailableResources();
    expect(result.hasSkills).toBe(true);
    expect(result.skillsCount).toBe(1);
    expect(result.hasRules).toBe(false);
    expect(result.hasInstructions).toBe(false);
    expect(result.hasWorkflows).toBe(false);
  });

  it("detects rules when .my-ai/rules has valid rules", () => {
    const rulesDir = path.join(tmpDir, ".my-ai", "rules");
    fs.mkdirSync(rulesDir, { recursive: true });
    writeCanonicalRule(rulesDir, RULE_A);

    const result = detectAvailableResources();
    expect(result.hasSkills).toBe(false);
    expect(result.hasRules).toBe(true);
    expect(result.hasInstructions).toBe(false);
    expect(result.rulesCount).toBe(1);
    expect(result.hasWorkflows).toBe(false);
  });

  it("detects skills, rules, project instructions, and workflows", () => {
    const skillsDir = path.join(tmpDir, ".my-ai", "skills");
    const rulesDir = path.join(tmpDir, ".my-ai", "rules");
    const instructionsDir = path.join(tmpDir, ".my-ai", "instructions");
    const workflowsDir = path.join(tmpDir, ".my-ai", "workflows");
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.mkdirSync(rulesDir, { recursive: true });
    fs.mkdirSync(instructionsDir, { recursive: true });
    fs.mkdirSync(workflowsDir, { recursive: true });
    writeCanonicalSkill(skillsDir, SKILL_A);
    writeCanonicalRule(rulesDir, RULE_A);
    writeCanonicalProjectInstructions(instructionsDir);
    writeCanonicalWorkflow(workflowsDir, WORKFLOW_A);

    const result = detectAvailableResources();
    expect(result.hasSkills).toBe(true);
    expect(result.skillsCount).toBe(1);
    expect(result.hasRules).toBe(true);
    expect(result.rulesCount).toBe(1);
    expect(result.hasInstructions).toBe(true);
    expect(result.hasWorkflows).toBe(true);
    expect(result.workflowsCount).toBe(1);
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
    expect(result.hasInstructions).toBe(false);
    expect(result.hasWorkflows).toBe(false);
  });
});

describe("getAvailableResourceTypes", () => {
  it("returns only skills when only skills exist", () => {
    const detection: ResourceDetectionResult = {
      hasSkills: true,
      hasRules: false,
      hasInstructions: false,
      hasWorkflows: false,
      skillsCount: 3,
      rulesCount: 0,
      workflowsCount: 0,
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
      hasInstructions: false,
      hasWorkflows: false,
      skillsCount: 2,
      rulesCount: 1,
      workflowsCount: 0,
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
      hasInstructions: false,
      hasWorkflows: false,
      skillsCount: 2,
      rulesCount: 1,
      workflowsCount: 0,
    };

    const types = getAvailableResourceTypes(["claude"], detection);
    expect(types).toHaveLength(1);
    expect(types[0].value).toBe("skills");
  });

  it("returns only skills when rules exist but only cursor is selected", () => {
    const detection: ResourceDetectionResult = {
      hasSkills: true,
      hasRules: true,
      hasInstructions: false,
      hasWorkflows: false,
      skillsCount: 2,
      rulesCount: 1,
      workflowsCount: 0,
    };

    const types = getAvailableResourceTypes(["cursor"], detection);
    expect(types).toHaveLength(1);
    expect(types[0].value).toBe("skills");
  });

  it("returns both when rules exist and both platforms selected", () => {
    const detection: ResourceDetectionResult = {
      hasSkills: true,
      hasRules: true,
      hasInstructions: false,
      hasWorkflows: false,
      skillsCount: 2,
      rulesCount: 1,
      workflowsCount: 0,
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
      hasInstructions: false,
      hasWorkflows: false,
      skillsCount: 0,
      rulesCount: 0,
      workflowsCount: 0,
    };

    const types = getAvailableResourceTypes(["claude", "windsurf"], detection);
    expect(types).toHaveLength(0);
  });

  it("returns only rules when only rules exist and windsurf is selected", () => {
    const detection: ResourceDetectionResult = {
      hasSkills: false,
      hasRules: true,
      hasInstructions: false,
      hasWorkflows: false,
      skillsCount: 0,
      rulesCount: 2,
      workflowsCount: 0,
    };

    const types = getAvailableResourceTypes(["windsurf"], detection);
    expect(types).toHaveLength(1);
    expect(types[0].value).toBe("rules");
  });

  it("returns project instructions when a supported platform is selected", () => {
    const detection: ResourceDetectionResult = {
      hasSkills: false,
      hasRules: false,
      hasInstructions: true,
      hasWorkflows: false,
      skillsCount: 0,
      rulesCount: 0,
      workflowsCount: 0,
    };

    const types = getAvailableResourceTypes(["claude"], detection);
    expect(types).toHaveLength(1);
    expect(types[0].value).toBe("instructions");
  });

  it("returns project instructions when only windsurf is selected", () => {
    const detection: ResourceDetectionResult = {
      hasSkills: false,
      hasRules: false,
      hasInstructions: true,
      hasWorkflows: false,
      skillsCount: 0,
      rulesCount: 0,
      workflowsCount: 0,
    };

    const types = getAvailableResourceTypes(["windsurf"], detection);
    expect(types).toHaveLength(1);
    expect(types[0].value).toBe("instructions");
  });

  it("returns workflows when cursor is selected", () => {
    const detection: ResourceDetectionResult = {
      hasSkills: false,
      hasRules: false,
      hasInstructions: false,
      hasWorkflows: true,
      skillsCount: 0,
      rulesCount: 0,
      workflowsCount: 2,
    };

    const types = getAvailableResourceTypes(["cursor"], detection);
    expect(types).toHaveLength(1);
    expect(types[0].value).toBe("workflows");
    expect(types[0].name).toContain("2 found");
  });

  it("does not return workflows when only claude is selected", () => {
    const detection: ResourceDetectionResult = {
      hasSkills: false,
      hasRules: false,
      hasInstructions: false,
      hasWorkflows: true,
      skillsCount: 0,
      rulesCount: 0,
      workflowsCount: 1,
    };

    const types = getAvailableResourceTypes(["claude"], detection);
    expect(types).toHaveLength(0);
  });
});

describe("interactiveSyncFlow — non-TTY", () => {
  let tmpDir: string;
  let originalCwd: string;
  let originalIsTTY: boolean | undefined;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "interactive-test-nontty-"));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
    originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    exitSpy = vi.spyOn(process, "exit").mockImplementation((_code?: number | string) => {
      throw new Error("process.exit called");
    });
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });
    exitSpy.mockRestore();
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("exits with error message when stdin is not a TTY", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(interactiveSyncFlow()).rejects.toThrow("process.exit called");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("interactive mode requires a TTY"),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
    errorSpy.mockRestore();
  });
});
