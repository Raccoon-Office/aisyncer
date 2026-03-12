import type { SkillSpec, RuleSpec, WorkflowSpec } from "./schema.js";
import { skillConfig, ruleConfig, workflowConfig } from "./schema.js";
import { hashResource } from "./resource.js";

export function hashSkill(skill: SkillSpec): string {
  return hashResource(skill, skillConfig);
}

export function hashRule(rule: RuleSpec): string {
  return hashResource(rule, ruleConfig);
}

export function hashWorkflow(workflow: WorkflowSpec): string {
  return hashResource(workflow, workflowConfig);
}
