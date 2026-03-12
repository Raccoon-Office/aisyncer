import type { SkillSpec, RuleSpec, WorkflowSpec } from "./schema.js";
import { skillConfig, ruleConfig, workflowConfig } from "./schema.js";
import { validateResourceDir } from "./resource.js";
export type { ValidationResult } from "./resource.js";

export function validateSkillsDir(skillsDir: string): import("./resource.js").ValidationResult[] {
  return validateResourceDir<SkillSpec>(skillsDir, skillConfig);
}

export function validateRulesDir(rulesDir: string): import("./resource.js").ValidationResult[] {
  return validateResourceDir<RuleSpec>(rulesDir, ruleConfig);
}

export function validateWorkflowsDir(workflowsDir: string): import("./resource.js").ValidationResult[] {
  return validateResourceDir<WorkflowSpec>(workflowsDir, workflowConfig);
}
