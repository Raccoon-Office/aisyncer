import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFromGitHub, parseGitHubSource } from "../src/github/fetch.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseGitHubSource", () => {
  it("parses github:owner/repo", () => {
    const result = parseGitHubSource("github:my-org/my-repo");
    expect(result.owner).toBe("my-org");
    expect(result.repo).toBe("my-repo");
    expect(result.ref).toBeUndefined();
  });

  it("parses github:owner/repo#branch", () => {
    const result = parseGitHubSource("github:my-org/my-repo#develop");
    expect(result.owner).toBe("my-org");
    expect(result.repo).toBe("my-repo");
    expect(result.ref).toBe("develop");
  });

  it("parses github:owner/repo#refs/tags/v1", () => {
    const result = parseGitHubSource("github:my-org/my-repo#v1.0.0");
    expect(result.owner).toBe("my-org");
    expect(result.repo).toBe("my-repo");
    expect(result.ref).toBe("v1.0.0");
  });

  it("strips .git suffix from repo name", () => {
    const result = parseGitHubSource("github:my-org/my-repo.git");
    expect(result.owner).toBe("my-org");
    expect(result.repo).toBe("my-repo");
    expect(result.ref).toBeUndefined();
  });

  it("strips .git suffix with branch", () => {
    const result = parseGitHubSource("github:my-org/my-repo.git#main");
    expect(result.owner).toBe("my-org");
    expect(result.repo).toBe("my-repo");
    expect(result.ref).toBe("main");
  });

  // Full URL format
  it("parses https://github.com/owner/repo", () => {
    const result = parseGitHubSource("https://github.com/my-org/my-repo");
    expect(result.owner).toBe("my-org");
    expect(result.repo).toBe("my-repo");
    expect(result.ref).toBeUndefined();
  });

  it("parses https://github.com/owner/repo.git", () => {
    const result = parseGitHubSource("https://github.com/owner/repo.git");
    expect(result.owner).toBe("owner");
    expect(result.repo).toBe("repo");
    expect(result.ref).toBeUndefined();
  });

  it("parses https://github.com/owner/repo/tree/branch", () => {
    const result = parseGitHubSource("https://github.com/my-org/my-repo/tree/develop");
    expect(result.owner).toBe("my-org");
    expect(result.repo).toBe("my-repo");
    expect(result.ref).toBe("develop");
  });

  it("parses URL with trailing slash", () => {
    const result = parseGitHubSource("https://github.com/my-org/my-repo/");
    expect(result.owner).toBe("my-org");
    expect(result.repo).toBe("my-repo");
    expect(result.ref).toBeUndefined();
  });

  it("throws on invalid format (no prefix)", () => {
    expect(() => parseGitHubSource("my-org/my-repo")).toThrow("Invalid GitHub source");
  });

  it("throws on invalid format (no repo)", () => {
    expect(() => parseGitHubSource("github:my-org")).toThrow("Invalid GitHub source");
  });

  it("throws on empty string", () => {
    expect(() => parseGitHubSource("")).toThrow("Invalid GitHub source");
  });

  it("throws on wrong prefix", () => {
    expect(() => parseGitHubSource("gitlab:my-org/my-repo")).toThrow("Invalid GitHub source");
  });
});

describe("fetchFromGitHub", () => {
  it("fetches skills, rules, workflows, and project instructions", async () => {
    const responses = new Map<string, Response>([
      [
        "https://api.github.com/repos/my-org/my-repo/branches/main",
        jsonResponse({ commit: { sha: "main-sha" } }),
      ],
      [
        "https://api.github.com/repos/my-org/my-repo/git/trees/main-sha?recursive=1",
        jsonResponse({
          truncated: false,
          tree: [
            { path: "skills/code-review/SKILL.md", type: "blob", url: "https://api.github.com/blob/skill" },
            { path: "skills/code-review/references/checklist.md", type: "blob", url: "https://api.github.com/blob/reference" },
            { path: "skills/code-review/scripts/review.sh", type: "blob", url: "https://api.github.com/blob/script" },
            { path: "rules/default/RULE.md", type: "blob", url: "https://api.github.com/blob/rule" },
            { path: "workflows/release-check/WORKFLOW.md", type: "blob", url: "https://api.github.com/blob/workflow" },
            { path: "instructions/PROJECT.md", type: "blob", url: "https://api.github.com/blob/instructions" },
          ],
        }),
      ],
      [
        "https://api.github.com/blob/skill",
        jsonResponse(encodedBlob("---\nschemaVersion: 1\nid: code-review\nname: Code Review\ndescription: Review code\n---\n\n# Code Review\n")),
      ],
      [
        "https://api.github.com/blob/reference",
        jsonResponse(encodedBlob("Checklist content")),
      ],
      [
        "https://api.github.com/blob/script",
        jsonResponse(encodedBlob("#!/bin/sh\necho review\n")),
      ],
      [
        "https://api.github.com/blob/rule",
        jsonResponse(encodedBlob("---\nschemaVersion: 1\nid: default\nname: Default Rule\ndescription: Rule\n---\n\n# Rule\n")),
      ],
      [
        "https://api.github.com/blob/workflow",
        jsonResponse(encodedBlob("---\nschemaVersion: 1\nid: release-check\nname: Release Check\ndescription: Review the release\n---\n\n# Release Check\n")),
      ],
      [
        "https://api.github.com/blob/instructions",
        jsonResponse(encodedBlob("# Project Instructions\n\n- Keep it concise.\n")),
      ],
    ]);

    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      const response = responses.get(String(url));
      if (!response) {
        throw new Error(`Unexpected URL: ${String(url)}`);
      }
      return response;
    }));

    const result = await fetchFromGitHub("github:my-org/my-repo");

    expect(result.errors).toEqual([]);
    expect(result.skills).toEqual([
      {
        id: "code-review",
        files: [
          { path: "references/checklist.md", content: "Checklist content" },
          { path: "scripts/review.sh", content: "#!/bin/sh\necho review\n" },
          { path: "SKILL.md", content: "---\nschemaVersion: 1\nid: code-review\nname: Code Review\ndescription: Review code\n---\n\n# Code Review\n" },
        ],
      },
    ]);
    expect(result.rules).toEqual([
      {
        id: "default",
        content: "---\nschemaVersion: 1\nid: default\nname: Default Rule\ndescription: Rule\n---\n\n# Rule\n",
      },
    ]);
    expect(result.workflows).toEqual([
      {
        id: "release-check",
        content: "---\nschemaVersion: 1\nid: release-check\nname: Release Check\ndescription: Review the release\n---\n\n# Release Check\n",
      },
    ]);
    expect(result.projectInstructions).toEqual({
      path: "instructions/PROJECT.md",
      content: "# Project Instructions\n\n- Keep it concise.\n",
    });
  });
});

function encodedBlob(content: string): { content: string; encoding: string } {
  return {
    content: Buffer.from(content, "utf-8").toString("base64"),
    encoding: "base64",
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
