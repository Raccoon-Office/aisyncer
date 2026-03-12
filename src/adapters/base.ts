import fs from "node:fs";
import path from "node:path";
import type { ResourceConfig } from "../core/resource.js";
import { parseResource, validateResource, emitResource } from "../core/resource.js";

export interface PlatformAdapter {
  name: string;
  /** Resolve the output directory for a given resource id */
  resourceDirPath<T extends { id: string; content: string }>(id: string, config: ResourceConfig<T>): string;
  /** Resolve the output path for a given resource id */
  resourcePath<T extends { id: string; content: string }>(id: string, config: ResourceConfig<T>): string;
  /** List resource ids currently present in the target */
  listResourceIds<T extends { id: string; content: string }>(config: ResourceConfig<T>): string[];
  /** Read an existing resource, or null if not found / corrupt */
  readResource<T extends { id: string; content: string }>(id: string, config: ResourceConfig<T>): T | null;
  /** Write a resource to the platform directory */
  writeResource<T extends { id: string; content: string }>(item: T, config: ResourceConfig<T>): void;
  /** Delete a resource from the platform directory */
  deleteResource<T extends { id: string; content: string }>(id: string, config: ResourceConfig<T>): void;
}

export function createAdapter(name: string, baseDir: string): PlatformAdapter {
  return {
    name,

    resourceDirPath<T extends { id: string; content: string }>(id: string, config: ResourceConfig<T>): string {
      return path.join(baseDir, config.dirName, id);
    },

    resourcePath<T extends { id: string; content: string }>(id: string, config: ResourceConfig<T>): string {
      return path.join(baseDir, config.dirName, id, config.fileName);
    },

    listResourceIds<T extends { id: string; content: string }>(config: ResourceConfig<T>): string[] {
      const resourceRoot = path.join(baseDir, config.dirName);
      if (!fs.existsSync(resourceRoot)) return [];

      return fs.readdirSync(resourceRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .filter((entry) => fs.existsSync(path.join(resourceRoot, entry.name, config.fileName)))
        .map((entry) => entry.name)
        .sort();
    },

    readResource<T extends { id: string; content: string }>(id: string, config: ResourceConfig<T>): T | null {
      const filePath = path.join(baseDir, config.dirName, id, config.fileName);
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
      const dir = path.join(baseDir, config.dirName, item.id);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, config.fileName), emitResource(item), "utf-8");
    },

    deleteResource<T extends { id: string; content: string }>(id: string, config: ResourceConfig<T>): void {
      fs.rmSync(path.join(baseDir, config.dirName, id), { recursive: true, force: true });
    },
  };
}
