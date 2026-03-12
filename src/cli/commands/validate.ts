import path from "node:path";
import { validateSkillsDir, validateRulesDir } from "../../core/validator.js";
import {
  canonicalProjectInstructionsPath,
  validateProjectInstructionsFile,
} from "../../core/project-instructions.js";
import type { ValidationResult } from "../../core/resource.js";

export async function validateCommand(options: { withRules?: boolean; withInstructions?: boolean }): Promise<void> {
  const skillsDir = path.resolve(".my-ai", "skills");
  const allResults: ValidationResult[] = [];

  console.log(`Validating skills in ${skillsDir}...\n`);

  const skillResults = validateSkillsDir(skillsDir);
  allResults.push(...skillResults);

  if (skillResults.length === 0) {
    console.log("All skills are valid.\n");
  } else {
    for (const result of skillResults) {
      console.error(`[ERROR] ${result.file}`);
      for (const error of result.errors) {
        console.error(`  - ${error}`);
      }
      console.error();
    }
  }

  if (options.withRules) {
    const rulesDir = path.resolve(".my-ai", "rules");
    console.log(`Validating rules in ${rulesDir}...\n`);

    const ruleResults = validateRulesDir(rulesDir);
    allResults.push(...ruleResults);

    if (ruleResults.length === 0) {
      console.log("All rules are valid.\n");
    } else {
      for (const result of ruleResults) {
        console.error(`[ERROR] ${result.file}`);
        for (const error of result.errors) {
          console.error(`  - ${error}`);
        }
        console.error();
      }
    }
  }

  if (options.withInstructions) {
    const instructionsFile = canonicalProjectInstructionsPath(path.resolve(".my-ai"));
    console.log(`Validating project instructions in ${instructionsFile}...\n`);

    const instructionResults = validateProjectInstructionsFile(instructionsFile);
    allResults.push(...instructionResults);

    if (instructionResults.length === 0) {
      console.log("Project instructions are valid.\n");
    } else {
      for (const result of instructionResults) {
        console.error(`[ERROR] ${result.file}`);
        for (const error of result.errors) {
          console.error(`  - ${error}`);
        }
        console.error();
      }
    }
  }

  if (allResults.length > 0) {
    console.error(`Validation failed with ${allResults.length} error(s).`);
    process.exit(1);
  }
}
