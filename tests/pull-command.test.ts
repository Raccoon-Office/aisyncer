import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { emitRule, emitSkill, emitWorkflow } from "../src/core/parser.js";
import type { RuleSpec, SkillSpec, WorkflowSpec } from "../src/core/schema.js";

const fetchFromGitHubMock = vi.fn();

vi.mock("../src/github/fetch.js", () => ({
  fetchFromGitHub: fetchFromGitHubMock,
}));

const SAMPLE_SKILL: SkillSpec = {
  schemaVersion: 1,
  id: "remote-skill",
  name: "Remote Skill",
  description: "Skill fetched from GitHub",
  content: "# Remote Skill\n\nContent here.",
};

const SAMPLE_RULE: RuleSpec = {
  schemaVersion: 1,
  id: "remote-rule",
  name: "Remote Rule",
  description: "Rule fetched from GitHub",
  content: "# Remote Rule\n\nRule content.",
};

const SAMPLE_WORKFLOW: WorkflowSpec = {
  schemaVersion: 1,
  id: "remote-workflow",
  name: "Remote Workflow",
  description: "Workflow fetched from GitHub",
  content: "# Remote Workflow\n\n1. Gather context.\n2. Execute steps.\n",
};

describe("pullCommand / diffCommand", () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pull-command-test-"));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
    fetchFromGitHubMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("pull writes remote resources into .my-ai", async () => {
    const { pullCommand } = await import("../src/cli/commands/pull.js");

    fetchFromGitHubMock.mockResolvedValue({
      skills: [
        {
          id: SAMPLE_SKILL.id,
          files: [
            { path: "SKILL.md", content: emitSkill(SAMPLE_SKILL) },
            { path: "references/checklist.md", content: "Checklist" },
          ],
        },
      ],
      rules: [
        { id: SAMPLE_RULE.id, content: emitRule(SAMPLE_RULE) },
      ],
      workflows: [
        { id: SAMPLE_WORKFLOW.id, content: emitWorkflow(SAMPLE_WORKFLOW) },
      ],
      projectInstructions: {
        path: "instructions/PROJECT.md",
        content: "# Project Instructions\n\n- Remote instruction.\n",
      },
      errors: [],
    });

    await pullCommand({
      from: "github:owner/repo",
      withRules: true,
      withInstructions: true,
      withWorkflows: true,
      write: true,
    });

    expect(fs.existsSync(path.join(tmpDir, ".my-ai", "skills", SAMPLE_SKILL.id, "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".my-ai", "skills", SAMPLE_SKILL.id, "references", "checklist.md"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".my-ai", "rules", SAMPLE_RULE.id, "RULE.md"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".my-ai", "workflows", SAMPLE_WORKFLOW.id, "WORKFLOW.md"))).toBe(true);
    expect(fs.readFileSync(path.join(tmpDir, ".my-ai", "instructions", "PROJECT.md"), "utf-8")).toBe(
      "# Project Instructions\n\n- Remote instruction.\n",
    );
  });

  it("pull with prune deletes stale local resources", async () => {
    const { pullCommand } = await import("../src/cli/commands/pull.js");

    const staleSkillDir = path.join(tmpDir, ".my-ai", "skills", "stale-skill");
    fs.mkdirSync(staleSkillDir, { recursive: true });
    fs.writeFileSync(path.join(staleSkillDir, "SKILL.md"), emitSkill({
      ...SAMPLE_SKILL,
      id: "stale-skill",
      name: "Stale Skill",
    }), "utf-8");

    fetchFromGitHubMock.mockResolvedValue({
      skills: [
        {
          id: SAMPLE_SKILL.id,
          files: [
            { path: "SKILL.md", content: emitSkill(SAMPLE_SKILL) },
          ],
        },
      ],
      rules: [],
      workflows: [],
      projectInstructions: null,
      errors: [],
    });

    await pullCommand({ from: "github:owner/repo", write: true, prune: true });

    expect(fs.existsSync(staleSkillDir)).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".my-ai", "skills", SAMPLE_SKILL.id, "SKILL.md"))).toBe(true);
  });

  it("diff previews changes without writing files", async () => {
    const { diffCommand } = await import("../src/cli/commands/diff.js");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    fetchFromGitHubMock.mockResolvedValue({
      skills: [
        {
          id: SAMPLE_SKILL.id,
          files: [
            { path: "SKILL.md", content: emitSkill(SAMPLE_SKILL) },
          ],
        },
      ],
      rules: [],
      workflows: [],
      projectInstructions: null,
      errors: [],
    });

    await diffCommand({ from: "github:owner/repo" });

    expect(fs.existsSync(path.join(tmpDir, ".my-ai"))).toBe(false);
    expect(logSpy).toHaveBeenCalledWith("[dry-run] No files will be written. Use --write to apply changes.\n");
    expect(logSpy).toHaveBeenCalledWith("Run 'aisyncer pull --from github:owner/repo --write' to apply these changes.");
  });

  it("diff includes project instructions when requested", async () => {
    const { diffCommand } = await import("../src/cli/commands/diff.js");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    fetchFromGitHubMock.mockResolvedValue({
      skills: [],
      rules: [],
      workflows: [],
      projectInstructions: {
        path: "instructions/PROJECT.md",
        content: "# Project Instructions\n\n- Remote instruction.\n",
      },
      errors: [],
    });

    await diffCommand({ from: "github:owner/repo", withInstructions: true });

    expect(logSpy).toHaveBeenCalledWith("Comparing project instructions...");
    expect(logSpy).toHaveBeenCalledWith(
      "Run 'aisyncer pull --from github:owner/repo --with-instructions --write' to apply these changes.",
    );
  });

  it("diff includes workflows when requested", async () => {
    const { diffCommand } = await import("../src/cli/commands/diff.js");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    fetchFromGitHubMock.mockResolvedValue({
      skills: [],
      rules: [],
      workflows: [
        { id: SAMPLE_WORKFLOW.id, content: emitWorkflow(SAMPLE_WORKFLOW) },
      ],
      projectInstructions: null,
      errors: [],
    });

    await diffCommand({ from: "github:owner/repo", withWorkflows: true });

    expect(logSpy).toHaveBeenCalledWith("Comparing workflows...");
    expect(logSpy).toHaveBeenCalledWith(
      "Run 'aisyncer pull --from github:owner/repo --with-workflows --write' to apply these changes.",
    );
  });
});
