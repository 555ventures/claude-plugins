---
description: Where the work stands and what to run next
argument-hint: "[NN] [--all]"
allowed-tools: Bash(node *)
---

Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/status.js $ARGUMENTS`. `--all` adds what is not startable yet, every decide line and the hygiene list; a brief number `NN` reports whether that brief's dependencies are built (exit 1 when not).

Show the output verbatim inside a fenced block, so the alignment and the `├─ └─` connectors survive. Never re-derive, reorder or restyle it.

Then narrate in one or two sentences what the screen means: what is running or next, whether the lanes can start together, what waits on what.

- Read each `⚠️` pair back in plain language: what was skipped, and the paste line that plans it.
- Read the footer glyph back as the verdict: `🟢` go, `🟠` the next pick is blocked (name the blocker), `⬜` nothing waits.
- On a `[hand-tracked-status]` hygiene line, quote the cells it names and offer to strip that column from `docs/roadmap/00-overview.md`. That is the one edit this command may make, and it needs a yes.
- Never offer to edit `status:` frontmatter: statuses are derived, not stored.

If the run errors, print the error and stop.
