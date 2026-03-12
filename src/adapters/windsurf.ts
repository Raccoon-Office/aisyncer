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

  function windsurfWorkflowPath(id: string): string {
    return path.join(baseDir, "workflows", `${id}.md`);
  }

  return {
    name: base.name,

    resourceDirPath<T extends { id: string; content: string }>(id: string, config: ResourceConfig<T>): string {
      if (config.name === "workflow") {
        return path.join(baseDir, "workflows");
      }
      return base.resourceDirPath(id, config);
    },

    resourcePath<T extends { id: string; content: string }>(id: string, config: ResourceConfig<T>): string {
      if (config.name === "rule") {
        return windsurfRulePath(id);
      }
      if (config.name === "workflow") {
        return windsurfWorkflowPath(id);
      }
      return base.resourcePath(id, config);
    },

    listResourceIds<T extends { id: string; content: string }>(config: ResourceConfig<T>): string[] {
      if (config.name !== "rule" && config.name !== "workflow") {
        return base.listResourceIds(config);
      }

      const targetDir = config.name === "rule"
        ? path.join(baseDir, "rules")
        : path.join(baseDir, "workflows");
      if (!fs.existsSync(targetDir)) return [];

      return fs.readdirSync(targetDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .map((entry) => entry.name.slice(0, -3))
        .sort();
    },

    readResource<T extends { id: string; content: string }>(id: string, config: ResourceConfig<T>): T | null {
      if (config.name !== "rule" && config.name !== "workflow") {
        return base.readResource(id, config);
      }

      const filePath = config.name === "rule"
        ? windsurfRulePath(id)
        : windsurfWorkflowPath(id);
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
      if (config.name !== "rule" && config.name !== "workflow") {
        base.writeResource(item, config);
        return;
      }

      const filePath = config.name === "rule"
        ? windsurfRulePath(item.id)
        : windsurfWorkflowPath(item.id);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, emitResource(item), "utf-8");
    },

    deleteResource<T extends { id: string; content: string }>(id: string, config: ResourceConfig<T>): void {
      if (config.name !== "rule" && config.name !== "workflow") {
        base.deleteResource(id, config);
        return;
      }

      fs.rmSync(
        config.name === "rule" ? windsurfRulePath(id) : windsurfWorkflowPath(id),
        { force: true },
      );
    },
  };
}
