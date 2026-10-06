---
description: Wire this project to the review service — one script run creates (or joins) the project on the service through walkthrough-cli (npx walkthrough-cli, signed in with login), stores the minted token in the git-ignored .claude/settings.local.json, proves the link with one call that needs the token, and writes the walkthrough config block; prints the script's output verbatim and names the next step — the command on the script's `next:` line when it printed one, else /spec:mocks
argument-hint: "[--project <id>] [--name <text>] [--base-url <url>] — usually none"
allowed-tools: Bash(spec-paths:*), Bash(node:*)
---

# Connect: Wire a Project to the Review Service

**Intended model: any.** No judgment happens here — the script validates and writes, you
print its line.

Run once:

```bash
node "$(spec-paths walkthrough-connect)" --root . $ARGUMENTS
```

Print the script's output verbatim. On exit 0, name the next step — the command on the
script's `next:` line when it printed one, else `/spec:mocks`. On a non-zero exit, print
the output and stop — it names what to fix (`not-signed-in`: the user runs
`npx walkthrough-cli login` in a terminal first; `not-team`: someone on the project's team
invites them).
