---
description: Wire this project to the review service — one script run creates (or joins) the project on the service through the Railway CLI, stores the minted token in the git-ignored .claude/settings.local.json, proves the link with one call that needs the token, and writes the walkthrough config block; prints one line and names /spec:mocks as the next step
argument-hint: "[--project <id>] [--name <text>] [--environment <name>] [--base-url <url>] — usually none"
allowed-tools: Bash(spec-paths:*), Bash(node:*)
---

# Connect: Wire a Project to the Review Service

**Intended model: any.** No judgment happens here — the script validates and writes, you
print its line.

Run once:

```bash
node "$(spec-paths walkthrough-connect)" --root . $ARGUMENTS
```

Print the script's line verbatim. On exit 0, name `/spec:mocks` as the next step. On a
non-zero exit, print the line and stop — the line names what to fix.
