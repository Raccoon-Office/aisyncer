import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createAdapter } from "../../adapters/base.js";
import {
  canonicalProjectInstructionsPath,
  executeCanonicalProjectInstructionsSync,
  loadProjectInstructions,
  planCanonicalProjectInstructionsSync,
  type ProjectInstructionsSyncAction,
} from "../../core/project-instructions.js";
import {
  loadCanonicalRules,
  loadCanonicalSkills,
  loadCanonicalWorkflows,
  planRuleSync,
  planSync,
  planWorkflowSync,
  executeRuleSync,
  executeSync,
  executeWorkflowSync,
} from "../../core/sync.js";
import type { ResourceSyncAction } from "../../core/resource.js";
import { fetchFromGitHub } from "../../github/fetch.js";
import { materializeFetchedResources } from "../../github/materialize.js";

export interface RemoteSyncOptions {
  from: string;
  withRules?: boolean;
  withInstructions?: boolean;
  withWorkflows?: boolean;
  write?: boolean;
  prune?: boolean;
}

type RemoteSyncMode = "pull" | "diff";

export async function runRemoteSync(mode: RemoteSyncMode, options: RemoteSyncOptions): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  const includeRules = options.withRules ?? false;
  const includeInstructions = options.withInstructions ?? false;
  const includeWorkflows = options.withWorkflows ?? false;
  const dryRun = mode === "diff" || !options.write;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aisyncer-remote-"));

  try {
    console.log(`Fetching resources from ${options.from}...`);
    if (token) {
      console.log("Using GITHUB_TOKEN for authentication.");
    }

    let result;
    try {
      result = await fetchFromGitHub(options.from, token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${msg}`);
      process.exit(1);
    }

    for (const warning of result.errors) {
      console.warn(`Warning: ${warning}`);
    }

    const filteredResult = {
      skills: result.skills,
      rules: includeRules ? result.rules : [],
      workflows: includeWorkflows ? result.workflows : [],
      projectInstructions: includeInstructions ? result.projectInstructions : null,
      errors: result.errors,
    };

    const materialized = materializeFetchedResources(filteredResult, tempDir);
    if (materialized.validationErrors.length > 0) {
      console.warn(`\nSkipped ${materialized.validationErrors.length} invalid resource(s):`);
      for (const err of materialized.validationErrors) {
        console.warn(`  - ${err}`);
      }
    }

    const skills = loadCanonicalSkills(path.join(tempDir, "skills"));
    const rules = includeRules
      ? loadCanonicalRules(path.join(tempDir, "rules"))
      : [];
    const workflows = includeWorkflows
      ? loadCanonicalWorkflows(path.join(tempDir, "workflows"))
      : [];
    const projectInstructions = includeInstructions
      ? loadProjectInstructions(path.join(tempDir, "instructions", "PROJECT.md"))
      : null;

    if (skills.length === 0
      && rules.length === 0
      && workflows.length === 0
      && !projectInstructions
      && !(includeInstructions && options.prune)) {
      console.error("No valid remote resources were found.");
      process.exit(1);
    }

    if (dryRun) {
      console.log("[dry-run] No files will be written. Use --write to apply changes.\n");
    }

    const adapter = createAdapter("canonical", path.resolve(".my-ai"));
    let hasChanges = false;

    if (skills.length > 0) {
      console.log("Comparing skills...");
      const actions = planSync(skills, adapter, { prune: options.prune });
      hasChanges = printActions(actions) || hasChanges;
      if (!dryRun) {
        executeSync(skills, actions, adapter);
      }
      console.log();
    }

    if (rules.length > 0) {
      console.log("Comparing rules...");
      const actions = planRuleSync(rules, adapter, { prune: options.prune });
      hasChanges = printActions(actions) || hasChanges;
      if (!dryRun) {
        executeRuleSync(rules, actions, adapter);
      }
      console.log();
    }

    if (workflows.length > 0) {
      console.log("Comparing workflows...");
      const actions = planWorkflowSync(workflows, adapter, { prune: options.prune });
      hasChanges = printActions(actions) || hasChanges;
      if (!dryRun) {
        executeWorkflowSync(workflows, actions, adapter);
      }
      console.log();
    }

    if (includeInstructions) {
      const action = planCanonicalProjectInstructionsSync(
        projectInstructions,
        {
          key: "canonical",
          label: "project instructions",
          targetPath: canonicalProjectInstructionsPath(path.resolve(".my-ai")),
        },
        { prune: options.prune },
      );

      if (action) {
        console.log("Comparing project instructions...");
        hasChanges = printProjectInstructionsAction(action) || hasChanges;
        if (!dryRun) {
          executeCanonicalProjectInstructionsSync(projectInstructions, action);
        }
        console.log();
      }
    }

    if (!hasChanges) {
      console.log("Everything is up to date.");
      return;
    }

    if (dryRun) {
      if (mode === "pull") {
        console.log("Run with --write to apply these changes.");
      } else {
        console.log(`Run 'aisyncer pull --from ${options.from}${includeRules ? " --with-rules" : ""}${includeWorkflows ? " --with-workflows" : ""}${includeInstructions ? " --with-instructions" : ""}${options.prune ? " --prune" : ""} --write' to apply these changes.`);
      }
      return;
    }

    console.log("Pull complete.");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function printProjectInstructionsAction(action: ProjectInstructionsSyncAction): boolean {
  const label = actionLabel(action.action);
  console.log(`  ${label} ${action.target.label} → ${action.target.targetPath}`);
  return action.action !== "skip";
}

function printActions(actions: ResourceSyncAction[]): boolean {
  let hasChanges = false;

  for (const action of actions) {
    const label = actionLabel(action.action);
    console.log(`  ${label} ${action.id} → ${action.targetPath}`);
    if (action.action !== "skip") {
      hasChanges = true;
    }
  }

  return hasChanges;
}

function actionLabel(action: ResourceSyncAction["action"]): string {
  switch (action) {
    case "add":
      return "[ADD]      ";
    case "skip":
      return "[SKIP]     ";
    case "overwrite":
      return "[OVERWRITE]";
    case "delete":
      return "[DELETE]   ";
  }
}
