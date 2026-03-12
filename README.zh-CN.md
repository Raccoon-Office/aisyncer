# aisyncer

[English](./README.md) | [中文](./README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/aisyncer.svg)](https://www.npmjs.com/package/aisyncer)
[npm package](https://www.npmjs.com/package/aisyncer)

用于在 Claude、Codex、Cursor 和 Windsurf 之间同步 AI skills 与规则（rules）的 CLI 工具。

## 这个工具解决什么问题

你可能同时在用 Claude Code、Codex、Cursor 和 Windsurf。它们各自有自己的目录结构与约定，手工复制很容易漏文件或版本不一致。

`aisyncer` 的做法是：

- 只维护一个规范源目录：`.my-ai/`
- 单向同步到目标平台目录
- 默认 dry-run，先看变更再写入

```text
.my-ai/skills/  ──→  .claude/skills/
                 ──→  .agents/skills/
                 ──→  .cursor/skills/
                 ──→  .windsurf/skills/

.my-ai/rules/   ──→  .windsurf/rules/<id>.md
                 ──→  (Claude 使用 CLAUDE.md，不写 .claude/rules)
                 ──→  (Cursor 使用 .cursor/rules/*.mdc，当前不参与同步)
```

## 安装

```bash
npm install -g aisyncer
```

或不安装直接运行：

```bash
npx aisyncer <command>
```

需要 Node.js 20.12+。

## 快速开始

```bash
# 1) 初始化（创建 .my-ai，附带示例 skill，可选示例 rule）
aisyncer init
aisyncer init --with-rules

# 2) 校验
aisyncer validate
aisyncer validate --with-rules

# 3) 交互式同步 — 引导提示，无需记忆参数
aisyncer sync

# 4) 预览同步（默认 dry-run）
aisyncer sync --to claude,codex,cursor,windsurf
aisyncer sync --to claude,codex,cursor,windsurf --sync-rules

# 5) 实际写入
aisyncer sync --to claude,codex,cursor,windsurf --sync-rules --write

# 6) 对比本地 .my-ai 与 GitHub 仓库
aisyncer diff --from github:my-org/ai-config

# 7) 从 GitHub 仓库更新本地 .my-ai
aisyncer pull --from github:my-org/ai-config --write
```

> `--sync-rules` 只会同步到 Windsurf。Claude、Codex 和 Cursor 目标会显示 skip 提示。

## 命令说明

### `aisyncer init`

初始化 `.my-ai/`，写入示例 skill（可选示例 rule）：

```bash
aisyncer init
aisyncer init --with-rules
```

也可以从 GitHub 导入 skills/rules：

```bash
aisyncer init --from github:owner/repo
aisyncer init --from github:owner/repo#branch
aisyncer init --from https://github.com/owner/repo
aisyncer init --from https://github.com/owner/repo.git
```

远程仓库结构（`rules/` 可选）：

```text
skills/                 # 必需
  my-skill/
    SKILL.md
    references/
      checklist.md
rules/                  # 可选，自动识别
  my-rule/
    RULE.md
```

私有仓库请设置 `GITHUB_TOKEN`：

```bash
export GITHUB_TOKEN=ghp_xxx
aisyncer init --from github:owner/private-repo
```

> 不会 `git clone`。工具会通过 GitHub REST API 拉取完整的 `skills/<id>/` 目录（其中 `SKILL.md` 是入口文件）以及 `rules/<id>/RULE.md`。

### `aisyncer validate`

校验 `.my-ai/skills/`（可选 `.my-ai/rules/`）：

```bash
aisyncer validate
aisyncer validate --with-rules
```

校验项包括：

- `schemaVersion` 必须为 `1`
- `id` 必须匹配 `/^[a-z0-9-]+$/`
- `name` / `description` / `content` 不可为空
- 目录名必须与资源 `id` 一致
- 不允许重复 `id`

失败时返回非 0 退出码，可用于 CI。

### `aisyncer sync`

从 `.my-ai/` 同步到平台目录。

#### 交互式模式（无需参数）

不带 `--to` 运行 `aisyncer sync`，进入交互式引导流程：

```bash
aisyncer sync
```

交互流程会依次：

1. 检查 `.my-ai/` 是否存在
2. 扫描可用的 skills 和 rules
3. 让你选择目标平台（claude、codex、cursor、windsurf）
4. 让你选择资源类型（skills、rules — 根据平台支持情况过滤）
5. 询问是否清理已不存在于 `.my-ai` 的派生资源
6. 可选：自定义 Claude、Codex 或 Cursor 输出目录
7. 预览所有变更（ADD / SKIP / OVERWRITE / DELETE）
8. 确认后写入

这是最简单的同步方式 — 不需要记任何参数。

#### 参数模式

```bash
# dry-run
aisyncer sync --to claude
aisyncer sync --to codex
aisyncer sync --to cursor
aisyncer sync --to windsurf
aisyncer sync --to claude,codex,cursor,windsurf

# 带 rules（仅 Windsurf）
aisyncer sync --to claude,codex,cursor,windsurf --sync-rules

# 实际写入
aisyncer sync --to claude,codex,cursor,windsurf --sync-rules --write

# 同步时顺便删除目标端已经陈旧的派生资源
aisyncer sync --to claude,codex,cursor,windsurf --sync-rules --prune --write

# 自定义 Claude 输出目录
aisyncer sync --to claude --claude-dir ./custom-path --write

# 自定义 Codex 输出目录
aisyncer sync --to codex --codex-dir ./custom-codex --write

# 自定义 Cursor 输出目录
aisyncer sync --to cursor --cursor-dir ./custom-cursor --write
```

rules 同步行为：

- Windsurf：写入 `.windsurf/rules/<id>.md`
- Claude：跳过（Claude 使用 `CLAUDE.md`）
- Codex：跳过（Codex 没有 rules 目录，项目指令请使用 `AGENTS.md`）
- Cursor：跳过（Cursor 项目规则使用 `.cursor/rules/*.mdc`，当前还不支持同步）

skill 同步行为：

- `SKILL.md` 是 skill 入口文件
- `aisyncer` 会镜像整个 `skills/<id>/` 目录，而不是只写 `SKILL.md`
- 如果目标目录里有陈旧的派生文件，覆盖时会一并清理
- 如果启用 `--prune`，已经不在规范源里的整个派生资源也会被删除

输出目录：

- Claude：`.claude/skills/<id>/SKILL.md`
- Codex：默认写入 `.agents/skills/<id>/SKILL.md`；如需用户级或管理员级位置，可用 `--codex-dir ~/.agents` 或 `--codex-dir /etc/codex`
- Cursor：默认写入 `.cursor/skills/<id>/SKILL.md`；可通过 `--cursor-dir` 覆盖根目录
- Windsurf：`.windsurf/skills/<id>/SKILL.md` 与 `.windsurf/rules/<id>.md`

### `aisyncer pull`

从 GitHub 仓库拉取资源，并更新本地 `.my-ai/`。

```bash
# 只预览，不写入
aisyncer pull --from github:my-org/ai-config

# 拉取 skills 和 rules
aisyncer pull --from github:my-org/ai-config --with-rules --write

# 同时删除远端已不存在的本地资源
aisyncer pull --from github:my-org/ai-config --with-rules --prune --write
```

`pull` 与 `sync` 使用同一套规划语义：`ADD`、`SKIP`、`OVERWRITE`，以及启用 `--prune` 时的 `DELETE`。

### `aisyncer diff`

对比本地 `.my-ai/` 与 GitHub 仓库之间的差异，但不写入任何文件。

```bash
aisyncer diff --from github:my-org/ai-config
aisyncer diff --from github:my-org/ai-config --with-rules
aisyncer diff --from github:my-org/ai-config --with-rules --prune
```

`diff` 可以理解为 `pull` 的 dry-run，用来在真正更新前先看清楚会发生什么。

## Skill / Rule 文件格式

每个 skill 都是一个目录。`SKILL.md` 是必需入口文件；同目录下的 `references/`、`scripts/`、模板等附属文件会一起同步。

`SKILL.md` 和 Rule 的 `RULE.md` 都采用：

- YAML frontmatter
- Markdown 正文

Skill 额外支持 `allowedTools`；Rule 不包含该字段。

## 目录结构示例

```text
your-project/
  .my-ai/                # 你维护的唯一规范源
    skills/
      code-review/
        SKILL.md
        references/
          checklist.md
    rules/
      code-style/
        RULE.md

  .claude/               # aisyncer 生成
    skills/
      code-review/
        SKILL.md
  CLAUDE.md              # Claude 指令入口（不使用 .claude/rules）

  .cursor/               # aisyncer 生成 / 使用
    skills/
      code-review/
        SKILL.md
    rules/
      my-rule.mdc        # Cursor 原生项目规则，当前不会由 aisyncer 生成

  .windsurf/             # aisyncer 生成
    skills/
      code-review/
        SKILL.md
    rules/
      code-style.md
```

Codex 会从当前工作目录一路向上扫描到仓库根目录的 `.agents/skills`。`aisyncer` 默认写入当前仓库的 `.agents/skills/<id>/SKILL.md`；如果你想写到用户级或管理员级位置，可以传 `--codex-dir ~/.agents` 或 `--codex-dir /etc/codex`。

Cursor 的项目级 skills 位于 `.cursor/skills/<id>/SKILL.md`。项目级 rules 位于 `.cursor/rules/*.mdc`，当前 `aisyncer` 还不会生成这些文件。

## 设计原则

### 单一事实来源

只编辑 `.my-ai/`。平台目录都是派生结果。对于 skill 来说，派生结果是整个 `skills/<id>/` 目录，而不只是 `SKILL.md`。

### 单向同步

仅支持 `.my-ai/ → 平台目录`，skill 目录会被完整镜像到各平台，不支持反向回写或双向合并。

### 默认安全

`sync` 默认 dry-run，只有加 `--write` 才会落盘。

### 无锁定

文件本质是 Markdown + YAML，不绑定数据库或私有格式。

## 团队共享（GitHub）

可维护一个公共 skills/rules 仓库，然后成员执行：

```bash
aisyncer init --from github:my-org/ai-config
```

工具会通过 GitHub API 拉取内容到 `.my-ai/`，再由 `sync` 分发到 Claude、Codex、Cursor、Windsurf，对 rules 仅分发到 Windsurf。

可直接参考的示例仓库：

- https://github.com/goWrongWay/skills-repo

可以直接导入体验：

```bash
aisyncer init --from github:goWrongWay/skills-repo
```

## Roadmap

- v0.2：Rules（已完成）
- v0.3：Memory
- v0.4：Workflows

## License

MIT
