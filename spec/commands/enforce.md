---
description: Retired. /spec:init now puts lint and typecheck into the gate
---

Retired. Nothing to run: lint and typecheck are part of `testCommand`, which `/spec:init` builds from
the real commands it finds in package.json, a Makefile or pyproject, and chains in front of the test
command. To add another check, append it to `testCommand` in `.claude/spec.config.json`.
