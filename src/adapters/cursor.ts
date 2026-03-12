import fs from "node:fs";
import path from "node:path";
import { createAdapter, type PlatformAdapter } from "./base.js";
import type { ResourceConfig } from "../core/resource.js";
import { parseResource, validateResource, emitResource } from "../core/resource.js";

const DEFAULT_CURSOR_DIR = ".cursor";

export function createCursorAdapter(cursorDir?: string): PlatformAdapter {
  const baseDir = path.resolve(cursorDir ?? DEFAULT_CURSOR_DIR);
  const base = createAdapter("cursor", baseDir);

  function cursorWorkflowPath(id: string): string {
    return path.join(baseDir, "commands", `${id}.md`);
  }

  return {
    name: base.name,

    resourceDirPath<T extends { id: string; content: string }>(id: string, config: ResourceConfig<T>): string {
      if (config.name === "workflow") {
        return path.join(baseDir, "commands");
      }
      return base.resourceDirPath(id, config);
    },

    resourcePath<T extends { id: string; content: string }>(id: string, config: ResourceConfig<T>): string {
      if (config.name === "workflow") {
        return cursorWorkflowPath(id);
      }
      return base.resourcePath(id, config);
    },

    listResourceIds<T extends { id: string; content: string }>(config: ResourceConfig<T>): string[] {
      if (config.name !== "workflow") {
        return base.listResourceIds(config);
      }

      const workflowsDir = path.join(baseDir, "commands");
      if (!fs.existsSync(workflowsDir)) return [];

      return fs.readdirSync(workflowsDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .map((entry) => entry.name.slice(0, -3))
        .sort();
    },

    readResource<T extends { id: string; content: string }>(id: string, config: ResourceConfig<T>): T | null {
      if (config.name !== "workflow") {
        return base.readResource(id, config);
      }

      const filePath = cursorWorkflowPath(id);
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
      if (config.name !== "workflow") {
        base.writeResource(item, config);
        return;
      }

      const filePath = cursorWorkflowPath(item.id);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, emitResource(item), "utf-8");
    },

    deleteResource<T extends { id: string; content: string }>(id: string, config: ResourceConfig<T>): void {
      if (config.name !== "workflow") {
        base.deleteResource(id, config);
        return;
      }

      fs.rmSync(cursorWorkflowPath(id), { force: true });
    },
  };
}
