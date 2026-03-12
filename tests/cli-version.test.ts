import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { readCliVersion } from "../src/cli/version.js";

describe("readCliVersion", () => {
  it("matches the package.json version", () => {
    const packageJson = JSON.parse(fs.readFileSync("package.json", "utf-8")) as {
      version: string;
    };

    expect(readCliVersion()).toBe(packageJson.version);
  });
});
