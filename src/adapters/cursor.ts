import path from "node:path";
import { createAdapter, type PlatformAdapter } from "./base.js";

const DEFAULT_CURSOR_DIR = ".cursor";

export function createCursorAdapter(cursorDir?: string): PlatformAdapter {
  const baseDir = path.resolve(cursorDir ?? DEFAULT_CURSOR_DIR);
  return createAdapter("cursor", baseDir);
}
