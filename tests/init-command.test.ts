import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { emitSkill, emitWorkflow } from "../src/core/parser.js";
import type { SkillSpec, WorkflowSpec } from "../src/core/schema.js";

const fetchFromGitHubMock = vi.fn();

vi.mock("../src/github/fetch.js", () => ({
  fetchFromGitHub: fetchFromGitHubMock,
}));

const SAMPLE_SKILL: SkillSpec = {
  schemaVersion: 1,
  id: "github-skill",
  name: "GitHub Skill",
  description: "Skill imported from GitHub",
  content: "# GitHub Skill\n\nContent here.",
};

const SAMPLE_WORKFLOW: WorkflowSpec = {
  schemaVersion: 1,
  id: "release-check",
  name: "Release Check",
  description: "Workflow imported from GitHub",
  content: "# Release Check\n\n1. Verify changelog.\n2. Run tests.\n",
};

describe("initCommand", () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "init-command-test-"));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
    fetchFromGitHubMock.mockReset();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes nested skill files and workflows fetched from GitHub", async () => {
    const { initCommand } = await import("../src/cli/commands/init.js");

    fetchFromGitHubMock.mockResolvedValue({
      skills: [
        {
          id: SAMPLE_SKILL.id,
          files: [
            { path: "SKILL.md", content: emitSkill(SAMPLE_SKILL) },
            { path: "references/checklist.md", content: "Checklist" },
            { path: "scripts/review.sh", content: "#!/bin/sh\necho review\n" },
          ],
        },
      ],
      rules: [],
      workflows: [
        { id: SAMPLE_WORKFLOW.id, content: emitWorkflow(SAMPLE_WORKFLOW) },
      ],
      projectInstructions: {
        path: "instructions/PROJECT.md",
        content: "# Project Instructions\n\n- Keep tests updated.\n",
      },
      errors: [],
    });

    await initCommand({ from: "github:owner/repo" });

    expect(fs.existsSync(path.join(tmpDir, ".my-ai", "skills", SAMPLE_SKILL.id, "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".my-ai", "skills", SAMPLE_SKILL.id, "references", "checklist.md"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".my-ai", "skills", SAMPLE_SKILL.id, "scripts", "review.sh"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".my-ai", "workflows", SAMPLE_WORKFLOW.id, "WORKFLOW.md"))).toBe(true);
    expect(fs.readFileSync(path.join(tmpDir, ".my-ai", "instructions", "PROJECT.md"), "utf-8")).toBe(
      "# Project Instructions\n\n- Keep tests updated.\n",
    );
  });

  it("initializes a local example workflow when requested", async () => {
    const { initCommand } = await import("../src/cli/commands/init.js");

    await initCommand({ withWorkflows: true });

    expect(fs.existsSync(path.join(tmpDir, ".my-ai", "skills", "example-skill", "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".my-ai", "workflows", "review-release", "WORKFLOW.md"))).toBe(true);
  });
});
