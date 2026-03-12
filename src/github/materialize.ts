import fs from "node:fs";
import path from "node:path";
import { parseSkill, parseRule, parseWorkflow } from "../core/parser.js";
import {
  emitProjectInstructions,
  parseProjectInstructions,
} from "../core/project-instructions.js";
import { validateSkill, validateRule, validateWorkflow } from "../core/schema.js";
import type { SkillSpec, RuleSpec, WorkflowSpec } from "../core/schema.js";
import type { FetchResult } from "./fetch.js";

export interface MaterializeResult {
  skillsWritten: number;
  rulesWritten: number;
  workflowsWritten: number;
  projectInstructionsWritten: boolean;
  writtenSkillIds: string[];
  writtenRuleIds: string[];
  writtenWorkflowIds: string[];
  validationErrors: string[];
}

export function materializeFetchedResources(
  result: FetchResult,
  baseDir: string,
): MaterializeResult {
  const skillsDir = path.join(baseDir, "skills");
  const rulesDir = path.join(baseDir, "rules");
  const workflowsDir = path.join(baseDir, "workflows");
  const instructionsDir = path.join(baseDir, "instructions");
  let skillsWritten = 0;
  let rulesWritten = 0;
  let workflowsWritten = 0;
  let projectInstructionsWritten = false;
  const writtenSkillIds: string[] = [];
  const writtenRuleIds: string[] = [];
  const writtenWorkflowIds: string[] = [];
  const validationErrors: string[] = [];

  for (const remote of result.skills) {
    const entryFile = remote.files.find((file) => file.path === "SKILL.md");
    if (!entryFile) {
      validationErrors.push(`skill ${remote.id}: SKILL.md not found`);
      continue;
    }

    let skill: SkillSpec;
    try {
      skill = parseSkill(entryFile.content);
    } catch {
      validationErrors.push(`skill ${remote.id}: Failed to parse frontmatter`);
      continue;
    }

    const validation = validateSkill(skill);
    if (!validation.success) {
      validationErrors.push(`skill ${remote.id}: ${validation.errors.join("; ")}`);
      continue;
    }

    const dir = path.join(skillsDir, validation.data.id);
    const targetFiles: Array<{ path: string; content: string }> = [];
    let hasInvalidPath = false;

    for (const file of remote.files) {
      const targetPath = resolveResourcePath(dir, file.path);
      if (!targetPath) {
        validationErrors.push(`skill ${remote.id}: Invalid file path "${file.path}"`);
        hasInvalidPath = true;
        break;
      }

      targetFiles.push({ path: targetPath, content: file.content });
    }

    if (hasInvalidPath) continue;

    for (const file of targetFiles) {
      fs.mkdirSync(path.dirname(file.path), { recursive: true });
      fs.writeFileSync(file.path, file.content, "utf-8");
    }

    skillsWritten++;
    writtenSkillIds.push(validation.data.id);
  }

  for (const remote of result.rules) {
    let rule: RuleSpec;
    try {
      rule = parseRule(remote.content);
    } catch {
      validationErrors.push(`rule ${remote.id}: Failed to parse frontmatter`);
      continue;
    }

    const validation = validateRule(rule);
    if (!validation.success) {
      validationErrors.push(`rule ${remote.id}: ${validation.errors.join("; ")}`);
      continue;
    }

    const dir = path.join(rulesDir, validation.data.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "RULE.md"), remote.content, "utf-8");
    rulesWritten++;
    writtenRuleIds.push(validation.data.id);
  }

  for (const remote of result.workflows) {
    let workflow: WorkflowSpec;
    try {
      workflow = parseWorkflow(remote.content);
    } catch {
      validationErrors.push(`workflow ${remote.id}: Failed to parse frontmatter`);
      continue;
    }

    const validation = validateWorkflow(workflow);
    if (!validation.success) {
      validationErrors.push(`workflow ${remote.id}: ${validation.errors.join("; ")}`);
      continue;
    }

    const dir = path.join(workflowsDir, validation.data.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "WORKFLOW.md"), remote.content, "utf-8");
    workflowsWritten++;
    writtenWorkflowIds.push(validation.data.id);
  }

  if (result.projectInstructions) {
    const parsed = parseProjectInstructions(result.projectInstructions.content);
    if (parsed.content.length === 0) {
      validationErrors.push("project instructions: content is required");
    } else {
      fs.mkdirSync(instructionsDir, { recursive: true });
      fs.writeFileSync(
        path.join(instructionsDir, "PROJECT.md"),
        emitProjectInstructions(parsed),
        "utf-8",
      );
      projectInstructionsWritten = true;
    }
  }

  return {
    skillsWritten,
    rulesWritten,
    workflowsWritten,
    projectInstructionsWritten,
    writtenSkillIds,
    writtenRuleIds,
    writtenWorkflowIds,
    validationErrors,
  };
}

export function resolveResourcePath(baseDir: string, relativePath: string): string | null {
  if (relativePath.length === 0 || path.isAbsolute(relativePath)) {
    return null;
  }

  const segments = relativePath.split(/[\\/]+/);
  if (segments.includes("..")) {
    return null;
  }

  const resolvedBase = path.resolve(baseDir);
  const resolvedPath = path.resolve(resolvedBase, relativePath);
  if (resolvedPath.startsWith(`${resolvedBase}${path.sep}`)) {
    return resolvedPath;
  }

  return null;
}
