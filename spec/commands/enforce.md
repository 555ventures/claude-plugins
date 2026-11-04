---
description: Retired. /spec:init now puts lint and typecheck into the gate
---

There is nothing to run. `/spec:init` now folds lint and typecheck into `testCommand`, so
anything a linter or type checker enforces is already part of the gate. To add a check,
append it to `testCommand` in `.claude/spec.config.json`.
