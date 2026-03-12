import fs from "node:fs";

const FALLBACK_VERSION = "0.0.0";

export function readCliVersion(): string {
  try {
    const raw = fs.readFileSync(new URL("../../package.json", import.meta.url), "utf-8");
    const parsed = JSON.parse(raw) as { version?: unknown };

    if (typeof parsed.version === "string" && parsed.version.trim().length > 0) {
      return parsed.version;
    }
  } catch {
    // Fall back to a sentinel version so the CLI still works if package metadata is unavailable.
  }

  return FALLBACK_VERSION;
}
