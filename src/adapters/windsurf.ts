import fs from "node:fs";
import path from "node:path";
import { createAdapter, type PlatformAdapter } from "./base.js";
import type { ResourceConfig } from "../core/resource.js";
import { parseResource, validateResource, emitResource } from "../core/resource.js";

const DEFAULT_WINDSURF_DIR = ".windsurf";

export function createWindsurfAdapter(windsurfDir?: string): PlatformAdapter {
  const baseDir = path.resolve(windsurfDir ?? DEFAULT_WINDSURF_DIR);
  const base = createAdapter("windsurf", baseDir);

  function windsurfRulePath(id: string): string {
    // Windsurf rules are markdown files directly under .windsurf/rules/
    return path.join(baseDir, "rules", `${id}.md`);
  }

  return {
    name: base.name,

    resourceDirPath<T extends { id: string; content: string }>(id: string, config: ResourceConfig<T>): string {
      return base.resourceDirPath(id, config);
    },

    resourcePath<T extends { id: string; content: string }>(id: string, config: ResourceConfig<T>): string {
      if (config.name === "rule") {
        return windsurfRulePath(id);
      }
      return base.resourcePath(id, config);
    },

    readResource<T extends { id: string; content: string }>(id: string, config: ResourceConfig<T>): T | null {
      if (config.name !== "rule") {
        return base.readResource(id, config);
      }

      const filePath = windsurfRulePath(id);
      if (!fs.existsSync(filePath)) return null;

      try {
        const raw = fs.readFileSync(filePath, "utf-8");
        const parsed = parseResource<T>(raw);
        const result = validateResource(parsed, config);
        return result.success ? result.data : null;
      } catch {
        return null;
      }
    },

    writeResource<T extends { id: string; content: string }>(item: T, config: ResourceConfig<T>): void {
      if (config.name !== "rule") {
        base.writeResource(item, config);
        return;
      }

      const filePath = windsurfRulePath(item.id);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, emitResource(item), "utf-8");
    },
  };
}
