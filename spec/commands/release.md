---
description: Deploy to staging, run checks against it, and promote to production on the user's yes
argument-hint: "[milestone note or version tag]"
disable-model-invocation: true
allowed-tools: Bash(node *), AskUserQuestion
---

Read `${CLAUDE_PLUGIN_ROOT}/doctrine.md` once, then drive
`node ${CLAUDE_PLUGIN_ROOT}/scripts/release.js -- $ARGUMENTS`. Everything after `--` is the
milestone note, never a flag; you add `--promote` yourself, only after a yes. If it refuses for a
missing `release` config key, ask for the value and save it.

Staging runs deploy, then a ready check on `stagingUrl` + `healthPath`, then `migrationsCheck`
when the host set one, then e2e with `BASE_URL`. A green run on this commit is the only way to
promote: `node ${CLAUDE_PLUGIN_ROOT}/scripts/release.js --promote -- $ARGUMENTS` refuses
(exit 2) after a red run, after a new commit, and a second time. Promotion is irreversible:
show what staging showed and ask once (AskUserQuestion) before you run it. A dismissed
question promotes nothing, and you never invent the answer. After the promote the driver
checks that production answers at `productionUrl` + `healthPath` and prints its response body
and the staged sha before `✅ released`: read them side by side. A promote that cannot be
verified serving stops at `production`, with no `✅ released`.
