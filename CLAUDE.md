# CLAUDE.md

This file provides canonical guidance for AI coding tools working with this repository.

## Required Reading

- Before proposing architecture or writing code, read `docs/ai-architecture-guardrails.md`.
- Treat that document as the default guardrail for extensibility and AI collaboration patterns in this repo.

## Collaboration Policy

- Never commit directly to `main`; use a topic branch and open a PR.
- Before commit, run `npm run typecheck && npm run lint && npm test`.
- If `package.json` changes in a lockfile-affecting way (for example `name`, `version`, dependencies, overrides, or workspaces), update `package-lock.json` in the same PR.
- Keep `README.md` and `README.zh-CN.md` synchronized when either changes.
- Do not write rules to `.claude/rules`; Claude project instructions belong in `CLAUDE.md`.

## Commands

```bash
npm run build          # Compile TypeScript to dist/
npm run typecheck      # Type check without emitting
npm run lint           # ESLint (flat config, ESLint 9)
npm run lint -- --fix  # Auto-fix lint issues
npm test               # Run all tests (vitest run)
npm run test:watch     # Watch mode

# Run a single test file
npx vitest run tests/parser.test.ts

# Run tests matching a pattern
npx vitest run --grep "plans ADD"
```

## Architecture

One-way sync tool:
- Skills: `.my-ai/skills/<id>/` (with `SKILL.md` as the entry point) → mirrored into `.claude/skills/<id>/`, `.agents/skills/<id>/` (Codex repo scope by default), `.cursor/skills/<id>/`, and `.windsurf/skills/<id>/`
- Rules: `.my-ai/rules/<id>/RULE.md` → `.windsurf/rules/<id>.md` (Claude rules are managed via `CLAUDE.md`)

Supports multiple resource types (skills, rules) via a generic `ResourceConfig<T>` system. Adding a new resource type does NOT require changing `resource.ts`, `PlatformAdapter`, or any generic infrastructure — only a new schema + config + CLI wiring.

### Data flow (same for all resource types)

```
Skill directory / RULE.md file
  → parseResource() [gray-matter: frontmatter + markdown]
  → validateResource() [zod schema via ResourceConfig]
  → hashResource() / skill directory snapshot [SHA-256]
  → planResourceSync() / planSync() [compare target → ADD/SKIP/OVERWRITE]
  → executeResourceSync() / executeSync() [write via PlatformAdapter]
```

Convenience wrappers exist per type: `parseSkill()`, `hashRule()`, `planSync()`, etc.

### Module relationships

- **`core/resource.ts`** — Generic infrastructure: `ResourceConfig<T>`, `parseResource()`, `emitResource()`, `hashResource()`, `validateResource()`, `loadCanonicalResources()`, `planResourceSync()`, `executeResourceSync()`, `validateResourceDir()`. All resource-type-agnostic.
- **`core/schema.ts`** — `SkillSpecSchema` + `RuleSpecSchema` (zod), `validateSkill()` / `validateRule()`, `skillConfig` / `ruleConfig` (ResourceConfig instances). Shared field patterns extracted (idField, nameField, etc.).
- **`core/parser.ts`** — Thin wrappers: `parseSkill()` / `parseRule()` → `parseResource()`, `emitSkill()` / `emitRule()` → `emitResource()`.
- **`core/hash.ts`** — Thin wrappers: `hashSkill()` / `hashRule()` → `hashResource()` with respective configs.
- **`core/validator.ts`** — `validateSkillsDir()` / `validateRulesDir()` → `validateResourceDir()` with respective configs.
- **`core/sync.ts`** — `loadCanonicalSkills()` / `loadCanonicalRules()`, `planSync()` / `planRuleSync()`, `executeSync()` / `executeRuleSync()`. All delegate to generic resource functions.
- **`adapters/base.ts`** — `PlatformAdapter` interface with 3 generic methods: `resourcePath()`, `readResource()`, `writeResource()`. `createAdapter()` factory implements all via `ResourceConfig.dirName` + `ResourceConfig.fileName`. No resource-type-specific code.
- **`adapters/claude.ts`** / **`codex.ts`** / **`cursor.ts`** / **`windsurf.ts`** — Platform adapters; Codex skills default to repo-scoped `.agents/skills`, Cursor skills default to `.cursor/skills`, both can be redirected with `--codex-dir` / `--cursor-dir`, and Windsurf rules use flat `.windsurf/rules/<id>.md` paths.
- **`github/fetch.ts`** — `parseGitHubSource()` handles `github:owner/repo`, `github:owner/repo.git`, full URLs. `fetchFromGitHub()` uses tree API + blob API, no git clone. Falls back from `main` to `master`.
- **`cli/commands/`** — `init` (`--with-rules`), `validate` (`--with-rules`), `sync` (`--sync-rules` for Windsurf rules, `--claude-dir` / `--codex-dir` / `--cursor-dir` overrides, dry-run default, `--write` to apply).

### Adding a new resource type

1. Define `XxxSpecSchema` + `xxxConfig: ResourceConfig<XxxSpec>` in `schema.ts`
2. Add thin wrappers in `parser.ts`, `hash.ts`, `validator.ts`, `sync.ts`
3. Wire up CLI options in `cli/commands/` and `cli/index.ts`
4. Export from `src/index.ts`

No changes needed to `resource.ts` or `adapters/base.ts`.

### Adding a new platform

1. Create `adapters/xxx.ts` (3-5 lines calling `createAdapter("xxx", basePath)`)
2. Add to `SUPPORTED_PLATFORMS` and `resolveAdapter()` in `cli/commands/sync.ts`

## Key conventions

- ESM throughout: `"type": "module"`, all imports use `.js` extensions
- Zod for runtime validation with `.transform(trim).pipe(min(1))` pattern for name/description
- Generic `ResourceConfig<T>` pattern — never duplicate logic per resource type
- Tests use `fs.mkdtempSync()` + cleanup in `afterEach()`, fixtures in `tests/fixtures/`
- Corrupt files in target → `readResource()` returns `null` → treated as ADD (self-healing)
- `emitResource()` uses `yaml.stringify(..., { lineWidth: 0 })` to avoid line wrapping
- Claude has no `.claude/rules` target; keep project instructions in `CLAUDE.md`
- Codex has no rules target; keep project instructions in `AGENTS.md`
- Cursor skills live in `.cursor/skills`; project rules use `.cursor/rules/*.mdc` and are not synced yet
