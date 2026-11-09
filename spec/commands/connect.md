---
description: Link this project to the hosted walkthrough review service used by /spec:mocks
argument-hint: "[--project <id>] [--name <text>] [--base-url <url>] [--allow-temp-root]"
allowed-tools: Bash(node *), Bash(npx walkthrough-cli *)
---

Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/connect.js $ARGUMENTS` and show its output. It keeps
the token in the git-ignored `.claude/settings.local.json`, so never print it. It refuses (exit 2),
storing no token, in three cases: `not-ignored` when git tracks `.claude/settings.local.json` (run
`git rm --cached .claude/settings.local.json`, then connect again) or still does not ignore it after
the line is appended; `bad-config` when `.claude/spec.config.json` exists and is not a JSON object;
`bad-settings` when `.claude/settings.local.json` exists and is not a JSON object with an object
`env`. Repair or delete the named file, then run it again. It also refuses (exit 2) a project folder under the OS
temp dir, which is a scratch folder; `--allow-temp-root` overrides that. Next is the
script's `next:` line, or `/spec:mocks` if it printed none.
