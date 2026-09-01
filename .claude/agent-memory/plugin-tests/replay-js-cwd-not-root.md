---
name: replay-js-cwd-not-root
description: OUTDATED PREMISE, corrected — spec/scripts/replay.js DOES accept `--root <dir>` today (added 2026-08-27); cwd is only the fallback default. Never assume a Decisions-table flag list stays exhaustive across later specs.
metadata:
  type: project
  reviewed: 2026-08-31
---

**Corrected 2026-08-30 (review close, specs/20260830/02).** The headline claim of this note is
now false and was actively misleading guidance. `spec/scripts/replay.js` parses `--root <dir>`
(argv loop; validated to an existing directory or exit 2) and falls back to `process.cwd()` only
when the flag is absent. The script's own header records why it was added: at review of
specs/20260827/01, `--record` ran with an inherited CWD inside the replay's own scratch worktree
and the ledger row died with the worktree — so root is now **named, never inferred**, and every
step invoked from a scratch worktree passes `--root` explicitly.

**How to apply (current):** pass `--root <dir>` when invoking replay.js from anywhere whose CWD
is not the repo you mean to write the ledger into — which is every scratch-worktree phase. `{cwd:
dir}` still works for synthetic-host tests of the ledger-reading modes and is what
`tests/replay/replay.test.js` uses today, but it is the convenience path, not the contract. The
worktree modes' `--dir`/`--spec` shape is unchanged: `--setup` takes `--spec <path>` and derives
the scratch worktree itself (`<root>/.claude/worktrees/spec-<stem>-<6hex>`), refusing a caller
`--dir` whose basename opens with `replay` (exit 3); `--dir` remains the manual out-of-repo
fallback and wins verbatim when passed.

**The durable lesson (why this note is kept rather than deleted).** The original entry was
correct when written and reasoned honestly: a spec's Decisions table read as an exhaustive flag
list, so the worker declined to add an unlisted `--root` — the right call under the worker
contract, since inventing a flag is an unauthorized override. What made it rot is that it then
encoded a *transient script shape* as standing guidance ("must resolve root via `process.cwd()`
… not via a `--root` flag, or every test breaks"). A later spec legitimately added the flag and
the note kept teaching the pre-image. Record the reasoning that binds — apply the Decisions table
verbatim; don't invent flags — and treat any concrete flag-shape claim as a fact to re-derive
from the script at use time, never as a rule. See [[dispatch-prompt-overgeneralizes-refusal-trigger]]
for the same discipline applied to a refusal's trigger condition.
