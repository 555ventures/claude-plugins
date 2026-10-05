---
description: Wire this project to the review service — one script run validates the service address, project id and token, stores the token in the ignored settings.local.json, and writes the walkthrough config block; prints one line and names /spec:mocks as the next step
argument-hint: "<baseUrl> <project> [token] — the service address, the project id on the service, and optionally the token (else read from the environment)"
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
