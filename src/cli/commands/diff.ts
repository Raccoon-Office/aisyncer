import { runRemoteSync } from "./remote-sync.js";

export async function diffCommand(options: {
  from: string;
  withRules?: boolean;
  prune?: boolean;
}): Promise<void> {
  await runRemoteSync("diff", options);
}
