---
name: llp-release
description: Use when the user asks to publish, release, push, deploy, or uses Chinese trigger words like “发布”, “推送”, “来人”, “来人啊”, or “来啊” for the LLP project. Defaults to a two-step guarded LLP release workflow in /home/titie/projects/LLP: Codex runs local build/test/commit only, then the user runs finish in their WSL terminal to push main and tag.
---

已迁移到全局 `~/.agents/skills/project-release`。保留此文件仅作为 LLP 旧发布流程备份；新发布请求优先使用全局 `project-release` Skill，并读取仓库根目录 `.release.yaml`。

# LLP Release

Use this skill only for the LLP repository at `/home/titie/projects/LLP`.

## Triggers

Use this skill when the user asks:
- “发布”
- “推送”
- “来人”
- “来人啊”
- “来啊”
- “验收合格，发布”
- “打包打标推送”
- “release”
- “publish”
- “push”

## Workflow

Default to two-step release.

### Step 1: Codex local release

```bash
/home/titie/projects/LLP/scripts/release.sh --local
```

Codex should run `--local` by default. It performs:
1. Checks `git remote -v`
2. Builds frontend with `pnpm build`
3. Runs backend tests with `pytest`
4. Shows `git status --short`
5. Stages relevant repository changes
6. Creates a generated commit if there are staged changes
7. Does not push
8. Does not create or push tags

After `--local` completes, tell the user to finish from their WSL terminal:

```bash
cd /home/titie/projects/LLP
scripts/release.sh --finish
```

### Step 2: User finish release

`--finish` performs:
1. Requires a clean working tree
2. Pushes `main`
3. Computes the next patch version tag
4. Creates an annotated tag
5. Pushes the tag
6. Prints recent log, tags, and status

### Full release

Only if the user explicitly says “我确认让 Codex 直接 push/tag”, Codex may attempt:

```bash
/home/titie/projects/LLP/scripts/release.sh --full
```

Do not run `--finish` or `--full` by default.

## Safety

- Do not ask the user to paste GitHub passwords, tokens, API keys, or SSH private keys into Codex.
- Do not read, print, copy, or commit `.env`, API keys, GitHub tokens, or SSH private keys.
- Do not write tokens into git remotes, scripts, config files, or commits.
- If `git push` prompts for credentials, let the user enter them in their own terminal. Do not capture or echo credentials.
- If credentials cannot be entered through the Codex execution environment, ask the user to run `scripts/release.sh --finish` in a normal WSL terminal.
