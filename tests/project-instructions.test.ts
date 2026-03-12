import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  canonicalProjectInstructionsPath,
  containsManagedProjectInstructions,
  emitProjectInstructions,
  executeCanonicalProjectInstructionsSync,
  executeManagedProjectInstructionsSync,
  loadProjectInstructions,
  planCanonicalProjectInstructionsSync,
  planManagedProjectInstructionsSync,
  removeManagedProjectInstructions,
  renderManagedProjectInstructionsDocument,
  renderTargetProjectInstructionsDocument,
  validateProjectInstructionsFile,
  type ProjectInstructions,
  type ProjectInstructionsTarget,
} from "../src/core/project-instructions.js";

const SAMPLE_INSTRUCTIONS: ProjectInstructions = {
  content: "# Project Instructions\n\n- Keep responses concise.\n- Prefer tests when changing behavior.",
};

function createTarget(label: string, targetPath: string): ProjectInstructionsTarget {
  return {
    key: label,
    label,
    targetPath,
  };
}

describe("project instructions", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-instructions-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loads canonical project instructions from PROJECT.md", () => {
    const filePath = canonicalProjectInstructionsPath(path.join(tmpDir, ".my-ai"));
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, emitProjectInstructions(SAMPLE_INSTRUCTIONS), "utf-8");

    expect(loadProjectInstructions(filePath)).toEqual(SAMPLE_INSTRUCTIONS);
  });

  it("validates missing project instructions file", () => {
    const results = validateProjectInstructionsFile(
      path.join(tmpDir, ".my-ai", "instructions", "PROJECT.md"),
    );

    expect(results).toHaveLength(1);
    expect(results[0].errors[0]).toContain("not found");
  });

  it("plans canonical add, skip, overwrite, and delete actions", () => {
    const filePath = path.join(tmpDir, ".my-ai", "instructions", "PROJECT.md");
    const target = createTarget("canonical", filePath);

    expect(planCanonicalProjectInstructionsSync(SAMPLE_INSTRUCTIONS, target)?.action).toBe("add");

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, emitProjectInstructions(SAMPLE_INSTRUCTIONS), "utf-8");
    expect(planCanonicalProjectInstructionsSync(SAMPLE_INSTRUCTIONS, target)?.action).toBe("skip");

    fs.writeFileSync(filePath, "# Different\n", "utf-8");
    expect(planCanonicalProjectInstructionsSync(SAMPLE_INSTRUCTIONS, target)?.action).toBe("overwrite");

    expect(
      planCanonicalProjectInstructionsSync(null, target, { prune: true })?.action,
    ).toBe("delete");
  });

  it("writes canonical project instructions to disk", () => {
    const filePath = path.join(tmpDir, ".my-ai", "instructions", "PROJECT.md");
    const target = createTarget("canonical", filePath);
    const action = planCanonicalProjectInstructionsSync(SAMPLE_INSTRUCTIONS, target);

    expect(action?.action).toBe("add");
    executeCanonicalProjectInstructionsSync(SAMPLE_INSTRUCTIONS, action!);

    expect(fs.readFileSync(filePath, "utf-8")).toBe(emitProjectInstructions(SAMPLE_INSTRUCTIONS));
  });

  it("renders managed project instructions into a new document", () => {
    const rendered = renderManagedProjectInstructionsDocument(null, SAMPLE_INSTRUCTIONS);

    expect(rendered).toContain("aisyncer:project-instructions:start");
    expect(rendered).toContain(SAMPLE_INSTRUCTIONS.content);
    expect(containsManagedProjectInstructions(rendered)).toBe(true);
  });

  it("renders an import wrapper when the target uses import mode", () => {
    const rendered = renderTargetProjectInstructionsDocument(null, SAMPLE_INSTRUCTIONS, {
      key: "claude",
      label: "claude",
      targetPath: path.join(tmpDir, "CLAUDE.md"),
      mode: "import",
      importPath: "AGENTS.md",
    });

    expect(rendered).toContain("@AGENTS.md");
    expect(rendered).not.toContain(SAMPLE_INSTRUCTIONS.content);
  });

  it("preserves user-authored content around the managed block", () => {
    const targetPath = path.join(tmpDir, "AGENTS.md");
    const target = createTarget("agents", targetPath);

    fs.writeFileSync(
      targetPath,
      "# Existing Instructions\n\nThis file has manual guidance.\n",
      "utf-8",
    );

    const action = planManagedProjectInstructionsSync(SAMPLE_INSTRUCTIONS, target);
    expect(action?.action).toBe("overwrite");

    executeManagedProjectInstructionsSync(SAMPLE_INSTRUCTIONS, action!);

    const output = fs.readFileSync(targetPath, "utf-8");
    expect(output).toContain("# Existing Instructions");
    expect(output).toContain(SAMPLE_INSTRUCTIONS.content);
    expect(containsManagedProjectInstructions(output)).toBe(true);
  });

  it("replaces an existing managed block without touching surrounding content", () => {
    const targetPath = path.join(tmpDir, "CLAUDE.md");
    const target = createTarget("claude", targetPath);

    const original = [
      "# Claude Instructions",
      "",
      "Manual preface.",
      "",
      renderManagedProjectInstructionsDocument(null, {
        content: "# Project Instructions\n\n- Old content.",
      }).trim(),
      "",
      "Manual footer.",
      "",
    ].join("\n");

    fs.writeFileSync(targetPath, original, "utf-8");

    const action = planManagedProjectInstructionsSync(SAMPLE_INSTRUCTIONS, target);
    expect(action?.action).toBe("overwrite");

    executeManagedProjectInstructionsSync(SAMPLE_INSTRUCTIONS, action!);

    const output = fs.readFileSync(targetPath, "utf-8");
    expect(output).toContain("Manual preface.");
    expect(output).toContain("Manual footer.");
    expect(output).not.toContain("Old content.");
    expect(output).toContain(SAMPLE_INSTRUCTIONS.content);
  });

  it("writes an import wrapper for CLAUDE.md without inlining the project instructions body", () => {
    const targetPath = path.join(tmpDir, "CLAUDE.md");
    const target = createTarget("claude", targetPath);
    target.mode = "import";
    target.importPath = "AGENTS.md";

    const action = planManagedProjectInstructionsSync(SAMPLE_INSTRUCTIONS, target);
    expect(action?.action).toBe("add");

    executeManagedProjectInstructionsSync(SAMPLE_INSTRUCTIONS, action!);

    const output = fs.readFileSync(targetPath, "utf-8");
    expect(output).toContain("@AGENTS.md");
    expect(output).not.toContain(SAMPLE_INSTRUCTIONS.content);
  });

  it("deletes only the managed block when pruning platform instructions", () => {
    const targetPath = path.join(tmpDir, "AGENTS.md");
    const target = createTarget("agents", targetPath);

    fs.writeFileSync(
      targetPath,
      [
        "# Existing Instructions",
        "",
        "Manual guidance.",
        "",
        renderManagedProjectInstructionsDocument(null, SAMPLE_INSTRUCTIONS).trim(),
        "",
      ].join("\n"),
      "utf-8",
    );

    const action = planManagedProjectInstructionsSync(null, target, { prune: true });
    expect(action?.action).toBe("delete");

    executeManagedProjectInstructionsSync(null, action!);

    const output = fs.readFileSync(targetPath, "utf-8");
    expect(output).toContain("# Existing Instructions");
    expect(output).toContain("Manual guidance.");
    expect(output).not.toContain("aisyncer:project-instructions:start");
  });

  it("removes a fully managed file entirely when pruning", () => {
    const targetPath = path.join(tmpDir, "CLAUDE.md");
    const target = createTarget("claude", targetPath);

    fs.writeFileSync(
      targetPath,
      renderManagedProjectInstructionsDocument(null, SAMPLE_INSTRUCTIONS),
      "utf-8",
    );

    const action = planManagedProjectInstructionsSync(null, target, { prune: true });
    executeManagedProjectInstructionsSync(null, action!);

    expect(fs.existsSync(targetPath)).toBe(false);
  });

  it("removes only the managed block from a mixed document", () => {
    const content = [
      "# Manual Header",
      "",
      renderManagedProjectInstructionsDocument(null, SAMPLE_INSTRUCTIONS).trim(),
      "",
      "Manual footer.",
    ].join("\n");

    const stripped = removeManagedProjectInstructions(content);

    expect(stripped).toContain("# Manual Header");
    expect(stripped).toContain("Manual footer.");
    expect(stripped).not.toContain("aisyncer:project-instructions:start");
  });
});
