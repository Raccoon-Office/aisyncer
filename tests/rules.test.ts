import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { RuleSpecSchema, validateRule, ruleConfig } from "../src/core/schema.js";
import type { RuleSpec } from "../src/core/schema.js";
import { parseRule, emitRule } from "../src/core/parser.js";
import { hashRule } from "../src/core/hash.js";
import { loadCanonicalRules, planRuleSync, executeRuleSync } from "../src/core/sync.js";
import { validateRulesDir } from "../src/core/validator.js";
import { createAdapter } from "../src/adapters/base.js";

const RULE_A: RuleSpec = {
  schemaVersion: 1,
  id: "rule-a",
  name: "Rule A",
  description: "First rule",
  content: "# Rule A\n\nContent A.",
};

const RULE_B: RuleSpec = {
  schemaVersion: 1,
  id: "rule-b",
  name: "Rule B",
  description: "Second rule",
  content: "# Rule B\n\nContent B.",
};

function writeCanonicalRule(baseDir: string, rule: RuleSpec): void {
  const dir = path.join(baseDir, rule.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "RULE.md"), emitRule(rule), "utf-8");
}

// -- Schema --

describe("RuleSpecSchema", () => {
  it("accepts a valid minimal rule", () => {
    const data = {
      schemaVersion: 1,
      id: "my-rule",
      name: "My Rule",
      description: "A test rule",
      content: "Some content",
    };
    const result = RuleSpecSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("accepts a valid full rule", () => {
    const data = {
      schemaVersion: 1,
      id: "full-rule",
      name: "Full Rule",
      description: "A fully populated rule",
      content: "# Content\n\nBody text.",
      metadata: {
        source: "github:test/repo",
        version: "1.0.0",
        tags: ["test", "demo"],
      },
    };
    const result = RuleSpecSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("rejects schemaVersion !== 1", () => {
    const data = {
      schemaVersion: 2,
      id: "bad-version",
      name: "Bad Version",
      description: "Wrong version",
      content: "Content",
    };
    const result = RuleSpecSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects invalid id format (uppercase)", () => {
    const data = {
      schemaVersion: 1,
      id: "Invalid_ID",
      name: "Bad ID",
      description: "Invalid id",
      content: "Content",
    };
    const result = RuleSpecSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = RuleSpecSchema.safeParse({
      schemaVersion: 1,
      id: "no-name",
      name: "",
      description: "No name",
      content: "Content",
    });
    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only name", () => {
    const result = RuleSpecSchema.safeParse({
      schemaVersion: 1,
      id: "ws-name",
      name: "   ",
      description: "Whitespace name",
      content: "Content",
    });
    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only description", () => {
    const result = RuleSpecSchema.safeParse({
      schemaVersion: 1,
      id: "ws-desc",
      name: "Valid",
      description: "  \t\n  ",
      content: "Content",
    });
    expect(result.success).toBe(false);
  });

  it("trims name and description in output", () => {
    const result = RuleSpecSchema.safeParse({
      schemaVersion: 1,
      id: "trimmed",
      name: "  Trimmed Name  ",
      description: "  Trimmed Desc  ",
      content: "Content",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Trimmed Name");
      expect(result.data.description).toBe("Trimmed Desc");
    }
  });

  it("rejects empty content", () => {
    const result = RuleSpecSchema.safeParse({
      schemaVersion: 1,
      id: "no-content",
      name: "No Content",
      description: "No content",
      content: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing required fields", () => {
    const result = RuleSpecSchema.safeParse({ schemaVersion: 1, id: "missing-fields" });
    expect(result.success).toBe(false);
  });
});

describe("validateRule", () => {
  it("returns success with data for valid input", () => {
    const result = validateRule({
      schemaVersion: 1,
      id: "valid",
      name: "Valid",
      description: "Valid rule",
      content: "Content",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("valid");
    }
  });

  it("returns errors array for invalid input", () => {
    const result = validateRule({ schemaVersion: 2 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes("schemaVersion"))).toBe(true);
    }
  });
});

// -- Parser --

describe("parseRule", () => {
  it("parses frontmatter and content correctly", () => {
    const raw = `---
schemaVersion: 1
id: test-rule
name: Test Rule
description: A test rule
---

This is the rule content.

More content here.`;
    const result = parseRule(raw);
    expect(result.schemaVersion).toBe(1);
    expect(result.id).toBe("test-rule");
    expect(result.name).toBe("Test Rule");
    expect(result.description).toBe("A test rule");
    expect(result.content).toBe("This is the rule content.\n\nMore content here.");
  });
});

describe("emitRule", () => {
  it("emits valid RULE.md format", () => {
    const emitted = emitRule(RULE_A);
    expect(emitted).toContain("---");
    expect(emitted).toContain("schemaVersion: 1");
    expect(emitted).toContain("id: rule-a");
    expect(emitted).toContain("name: Rule A");
    expect(emitted).toContain("Content A.");
  });

  it("round-trips correctly through parse/emit", () => {
    const original: RuleSpec = {
      schemaVersion: 1,
      id: "round-trip",
      name: "Round Trip",
      description: "Testing round trip",
      content: "Original content here.",
      metadata: { version: "1.0.0", tags: ["test"] },
    };
    const emitted = emitRule(original);
    const reparsed = parseRule(emitted);
    expect(reparsed.id).toBe(original.id);
    expect(reparsed.name).toBe(original.name);
    expect(reparsed.description).toBe(original.description);
    expect(reparsed.content).toBe(original.content);
  });
});

// -- Hash --

describe("hashRule", () => {
  it("produces consistent hashes for identical rules", () => {
    const hash1 = hashRule(RULE_A);
    const hash2 = hashRule(RULE_A);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it("produces different hashes for different content", () => {
    expect(hashRule(RULE_A)).not.toBe(hashRule(RULE_B));
  });

  it("produces same hash regardless of id", () => {
    const rule1 = { ...RULE_A, id: "id-a" };
    const rule2 = { ...RULE_A, id: "id-b" };
    expect(hashRule(rule1)).toBe(hashRule(rule2));
  });
});

// -- Sync integration --

describe("loadCanonicalRules", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rules-load-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty array for non-existent directory", () => {
    expect(loadCanonicalRules(path.join(tmpDir, "nope"))).toEqual([]);
  });

  it("loads valid rules from directory", () => {
    writeCanonicalRule(tmpDir, RULE_A);
    writeCanonicalRule(tmpDir, RULE_B);
    const rules = loadCanonicalRules(tmpDir);
    expect(rules).toHaveLength(2);
    expect(rules.map((r) => r.id).sort()).toEqual(["rule-a", "rule-b"]);
  });

  it("skips invalid rules", () => {
    writeCanonicalRule(tmpDir, RULE_A);
    const badDir = path.join(tmpDir, "bad-rule");
    fs.mkdirSync(badDir, { recursive: true });
    fs.writeFileSync(
      path.join(badDir, "RULE.md"),
      "---\nschemaVersion: 1\nid: bad-rule\ndescription: no name\n---\n\nContent",
      "utf-8",
    );
    const rules = loadCanonicalRules(tmpDir);
    expect(rules).toHaveLength(1);
    expect(rules[0].id).toBe("rule-a");
  });
});

describe("planRuleSync", () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = fs.mkdtempSync(path.join(os.tmpdir(), "rules-plan-"));
  });

  afterEach(() => {
    fs.rmSync(targetDir, { recursive: true, force: true });
  });

  it("plans ADD when target does not exist", () => {
    const adapter = createAdapter("test", targetDir);
    const actions = planRuleSync([RULE_A], adapter);
    expect(actions).toHaveLength(1);
    expect(actions[0].action).toBe("add");
    expect(actions[0].id).toBe("rule-a");
  });

  it("plans SKIP when hash matches", () => {
    const adapter = createAdapter("test", targetDir);
    adapter.writeResource(RULE_A, ruleConfig);
    const actions = planRuleSync([RULE_A], adapter);
    expect(actions).toHaveLength(1);
    expect(actions[0].action).toBe("skip");
  });

  it("plans OVERWRITE when content differs", () => {
    const adapter = createAdapter("test", targetDir);
    adapter.writeResource(RULE_A, ruleConfig);
    const modified = { ...RULE_A, content: "# Modified" };
    const actions = planRuleSync([modified], adapter);
    expect(actions).toHaveLength(1);
    expect(actions[0].action).toBe("overwrite");
  });

  it("plans ADD when target has corrupted frontmatter", () => {
    const adapter = createAdapter("test", targetDir);
    const corruptDir = path.join(targetDir, "rules", RULE_A.id);
    fs.mkdirSync(corruptDir, { recursive: true });
    fs.writeFileSync(
      path.join(corruptDir, "RULE.md"),
      "not valid {{{",
      "utf-8",
    );
    const actions = planRuleSync([RULE_A], adapter);
    expect(actions).toHaveLength(1);
    expect(actions[0].action).toBe("add");
  });

  it("plans DELETE for stale target rules when prune is enabled", () => {
    const adapter = createAdapter("test", targetDir);
    adapter.writeResource(RULE_A, ruleConfig);
    adapter.writeResource(RULE_B, ruleConfig);

    const actions = planRuleSync([RULE_A], adapter, { prune: true });
    const deleteAction = actions.find((action) => action.id === RULE_B.id);
    expect(deleteAction?.action).toBe("delete");
  });
});

describe("executeRuleSync", () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = fs.mkdtempSync(path.join(os.tmpdir(), "rules-exec-"));
  });

  afterEach(() => {
    fs.rmSync(targetDir, { recursive: true, force: true });
  });

  it("writes rules for add actions", () => {
    const adapter = createAdapter("test", targetDir);
    const actions = planRuleSync([RULE_A, RULE_B], adapter);
    executeRuleSync([RULE_A, RULE_B], actions, adapter);
    expect(adapter.readResource("rule-a", ruleConfig)).not.toBeNull();
    expect(adapter.readResource("rule-b", ruleConfig)).not.toBeNull();
  });

  it("does not write for skip actions", () => {
    const adapter = createAdapter("test", targetDir);
    adapter.writeResource(RULE_A, ruleConfig);

    const filePath = adapter.resourcePath(RULE_A.id, ruleConfig);
    const mtimeBefore = fs.statSync(filePath).mtimeMs;

    const actions = planRuleSync([RULE_A], adapter);
    expect(actions[0].action).toBe("skip");

    executeRuleSync([RULE_A], actions, adapter);
    const mtimeAfter = fs.statSync(filePath).mtimeMs;
    expect(mtimeAfter).toBe(mtimeBefore);
  });

  it("deletes stale target rules when prune is enabled", () => {
    const adapter = createAdapter("test", targetDir);
    adapter.writeResource(RULE_A, ruleConfig);
    adapter.writeResource(RULE_B, ruleConfig);

    const actions = planRuleSync([RULE_A], adapter, { prune: true });
    executeRuleSync([RULE_A], actions, adapter);

    expect(fs.existsSync(path.join(targetDir, "rules", RULE_A.id))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, "rules", RULE_B.id))).toBe(false);
  });
});

// -- Validator integration --

describe("validateRulesDir", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rules-validate-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns no errors for valid rules", () => {
    writeCanonicalRule(tmpDir, RULE_A);
    writeCanonicalRule(tmpDir, RULE_B);
    const results = validateRulesDir(tmpDir);
    expect(results).toHaveLength(0);
  });

  it("detects missing rules directory", () => {
    const results = validateRulesDir(path.join(tmpDir, "nonexistent"));
    expect(results).toHaveLength(1);
    expect(results[0].errors[0]).toContain("not found");
  });

  it("detects missing RULE.md in a subdirectory", () => {
    fs.mkdirSync(path.join(tmpDir, "empty-dir"), { recursive: true });
    const results = validateRulesDir(tmpDir);
    expect(results).toHaveLength(1);
    expect(results[0].errors[0]).toContain("RULE.md not found");
  });

  it("detects directory name / id mismatch", () => {
    const ruleDir = path.join(tmpDir, "wrong-dir-name");
    fs.mkdirSync(ruleDir, { recursive: true });
    fs.writeFileSync(
      path.join(ruleDir, "RULE.md"),
      emitRule({
        schemaVersion: 1,
        id: "correct-id",
        name: "Mismatch Test",
        description: "Dir name != id",
        content: "# Content",
      }),
      "utf-8",
    );
    const results = validateRulesDir(tmpDir);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].errors[0]).toContain("does not match");
  });

  it("detects duplicate rule ids", () => {
    writeCanonicalRule(tmpDir, RULE_A);
    const dupeDir = path.join(tmpDir, "rule-a-copy");
    fs.mkdirSync(dupeDir, { recursive: true });
    fs.writeFileSync(
      path.join(dupeDir, "RULE.md"),
      emitRule({ ...RULE_A }),
      "utf-8",
    );
    const results = validateRulesDir(tmpDir);
    const dupeErrors = results.filter((r) =>
      r.errors.some((e) => e.includes("Duplicate")),
    );
    expect(dupeErrors.length).toBeGreaterThan(0);
  });
});
