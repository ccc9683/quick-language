# LLP Agent Instructions

## Release Workflow

- When the user says “发布”, “推送”, “来人”, “来人啊”, “来啊”, “提交推送”, “打包推送”, or “打标推送”, prefer the global Codex skill at `~/.agents/skills/project-release/SKILL.md`.
- LLP release settings live in `.release.yaml`.
- Keep `.agents/skills/llp-release/SKILL.md` only as a backup of the old LLP-specific workflow.
- Before commit, inspect `git status`, run the configured tests/builds, update `CHANGELOG.md`, and summarize the included/excluded changes.
- Before push or tag, show the exact commands that will run.
- Do not ask the user to paste GitHub passwords, tokens, API keys, or SSH private keys into Codex.
- Do not read, print, copy, or commit `.env`, API keys, GitHub tokens, or SSH private keys.
- Do not read SSH private keys.
- Do not print tokens.
- Do not write tokens into git remote URLs, scripts, config files, or commit messages.
- If `git push` prompts for credentials, let the user enter them in their own CLI terminal.
