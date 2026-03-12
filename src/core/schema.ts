import { z } from "zod";
import type { ResourceConfig } from "./resource.js";

// -- Shared field patterns --

const idField = z.string().regex(/^[a-z0-9-]+$/, "id must be lowercase alphanumeric with hyphens");
const nameField = z.string().transform((s) => s.trim()).pipe(z.string().min(1, "name is required"));
const descriptionField = z.string().transform((s) => s.trim()).pipe(z.string().min(1, "description is required"));
const contentField = z.string().min(1, "content is required");
const metadataField = z
  .object({
    source: z.string().optional(),
    version: z.string().optional(),
    tags: z.array(z.string()).optional(),
  })
  .optional();

// -- SkillSpec --

export const SkillSpecSchema = z.object({
  schemaVersion: z.literal(1),
  id: idField,
  name: nameField,
  description: descriptionField,
  allowedTools: z.array(z.string()).optional(),
  content: contentField,
  metadata: metadataField,
});

export type SkillSpec = z.infer<typeof SkillSpecSchema>;

export function validateSkill(data: unknown): {
  success: true;
  data: SkillSpec;
} | {
  success: false;
  errors: string[];
} {
  const result = SkillSpecSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errors = result.error.issues.map(
    (issue) => `${issue.path.join(".")}: ${issue.message}`,
  );
  return { success: false, errors };
}

export const skillConfig: ResourceConfig<SkillSpec> = {
  name: "skill",
  fileName: "SKILL.md",
  dirName: "skills",
  schema: SkillSpecSchema,
  hashFields: (skill) => ({
    name: skill.name,
    description: skill.description,
    allowedTools: skill.allowedTools ?? null,
    metadata: skill.metadata ?? null,
    content: skill.content,
  }),
};

// -- RuleSpec --

export const RuleSpecSchema = z.object({
  schemaVersion: z.literal(1),
  id: idField,
  name: nameField,
  description: descriptionField,
  content: contentField,
  metadata: metadataField,
});

export type RuleSpec = z.infer<typeof RuleSpecSchema>;

export function validateRule(data: unknown): {
  success: true;
  data: RuleSpec;
} | {
  success: false;
  errors: string[];
} {
  const result = RuleSpecSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errors = result.error.issues.map(
    (issue) => `${issue.path.join(".")}: ${issue.message}`,
  );
  return { success: false, errors };
}

export const ruleConfig: ResourceConfig<RuleSpec> = {
  name: "rule",
  fileName: "RULE.md",
  dirName: "rules",
  schema: RuleSpecSchema,
  hashFields: (rule) => ({
    name: rule.name,
    description: rule.description,
    metadata: rule.metadata ?? null,
    content: rule.content,
  }),
};

// -- WorkflowSpec --

export const WorkflowSpecSchema = z.object({
  schemaVersion: z.literal(1),
  id: idField,
  name: nameField,
  description: descriptionField,
  content: contentField,
  metadata: metadataField,
});

export type WorkflowSpec = z.infer<typeof WorkflowSpecSchema>;

export function validateWorkflow(data: unknown): {
  success: true;
  data: WorkflowSpec;
} | {
  success: false;
  errors: string[];
} {
  const result = WorkflowSpecSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errors = result.error.issues.map(
    (issue) => `${issue.path.join(".")}: ${issue.message}`,
  );
  return { success: false, errors };
}

export const workflowConfig: ResourceConfig<WorkflowSpec> = {
  name: "workflow",
  fileName: "WORKFLOW.md",
  dirName: "workflows",
  schema: WorkflowSpecSchema,
  hashFields: (workflow) => ({
    name: workflow.name,
    description: workflow.description,
    metadata: workflow.metadata ?? null,
    content: workflow.content,
  }),
};
