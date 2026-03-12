# AGENTS.md

This file defines mandatory collaboration rules for all AI coding tools used in this repository
(Codex, Claude Code, Windsurf, Cursor, and others).

Read order:
1. `CLAUDE.md`
2. `docs/ai-architecture-guardrails.md`

## Non-Negotiable Workflow

1. Never commit directly to `main`. Use a feature/fix branch.
2. Before commit, run:
   - `npm run typecheck`
   - `npm run lint`
   - `npm test`
3. If `package.json` changes in a lockfile-affecting way (for example `name`, `version`, dependencies, overrides, or workspaces), `package-lock.json` must be updated in the same PR.
4. If either `README.md` or `README.zh-CN.md` changes, both must be updated in the same PR.
5. Respect platform-native path rules:
   - Claude: sync skills only (`.claude/skills/...`), do not create `.claude/rules`.
   - Codex: sync skills only (`.agents/skills/...`), do not create a rules directory; use `AGENTS.md` for project instructions.
   - Cursor: sync skills to `.cursor/skills/...` and workflows to `.cursor/commands/<id>.md`; Cursor project rules live in `.cursor/rules/*.mdc` and are not synced yet.
   - Windsurf: sync skills, flat rule files (`.windsurf/rules/<id>.md`), and workflows (`.windsurf/workflows/<id>.md`).
6. PR title must follow conventional format:
   - `<type>(<scope>): <Summary>`
   - Example: `fix(core): Align rules sync with platform paths`

## Required PR Notes

Every PR must include:
- What changed
- Why it changed
- Risk/rollback notes
- Commands run for validation
