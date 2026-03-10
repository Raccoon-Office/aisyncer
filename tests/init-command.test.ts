import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { emitSkill } from "../src/core/parser.js";
import type { SkillSpec } from "../src/core/schema.js";

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

  it("writes nested skill files fetched from GitHub", async () => {
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
      errors: [],
    });

    await initCommand({ from: "github:owner/repo" });

    expect(fs.existsSync(path.join(tmpDir, ".my-ai", "skills", SAMPLE_SKILL.id, "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".my-ai", "skills", SAMPLE_SKILL.id, "references", "checklist.md"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".my-ai", "skills", SAMPLE_SKILL.id, "scripts", "review.sh"))).toBe(true);
  });
});
