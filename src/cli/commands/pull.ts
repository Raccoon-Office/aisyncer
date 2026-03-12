import { runRemoteSync } from "./remote-sync.js";

export async function pullCommand(options: {
  from: string;
  withRules?: boolean;
  withInstructions?: boolean;
  write?: boolean;
  prune?: boolean;
}): Promise<void> {
  await runRemoteSync("pull", options);
}
