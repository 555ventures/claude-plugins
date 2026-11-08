---
date: 2026-11-03
status: done
tier: critical           # spec/scripts/spec-status.js — `--lanes --json` grows a key and `fixes[]` grows six (§ Risk Tiers: the sole "what's next" derivation and a machine surface the fan-out consumes); fanout-driver.js dispatches a fix lane onto a red main (D16)
area: pipeline
breaking: false
depends_on: [specs/20261103/06-the-fan-out-drains-the-queue.md]
brief: n/a
open_markers: 0
diff_base: 85be4cbe550ba0292aec67a76e866a3259bd40ae
text: 65cf01e680e0a84e91d07533361f39bf26494e02
acs: [AC-20261103-08-1, AC-20261103-08-2, AC-20261103-08-3, AC-20261103-08-4, AC-20261103-08-5, AC-20261103-08-6, AC-20261103-08-7, AC-20261103-08-8, AC-20261103-08-9, AC-20261103-08-10, AC-20261103-08-11, AC-20261103-08-12, AC-20261103-08-13, AC-20261103-08-14, AC-20261103-08-15, AC-20261103-08-16, AC-20261103-08-17, AC-20261103-08-18, AC-20261103-08-19, AC-20261103-08-20, AC-20261103-08-21, AC-20261103-08-22, AC-20261103-08-23, AC-20261103-08-24, AC-20261103-08-25, AC-20261103-08-26, AC-20261103-08-27]
---

# Queue items remember their origin

## Goal

A queue item born by the pipeline carries who made it, why, and in which fan-out run: `origin`
(the spec and the stage that queued it), `trigger` (the constant the queuing step passes) and
`batch` (the fan-out's `startedAt` when a run is live). Every field is written by `spec-queue add`
from flags the driver prints or from the lane's own disk — a model never types a value. The
fan-out's rolling admission then admits a born fix by its origin: one generation per run (the
item's `batch` is this run, its `origin.spec` is a landed run lane), so a fix born of a fix waits
for the next batch; a `/spec:plan` birth never joins and heads the REPORT. `spec-status` and
`spec-queue show` render `↳ from <spec> (<trigger>)` under each item so the orchestrator and the
user see why it exists. Old items carry none of the fields and read as origin unknown — no
migration.

Three rules ride the same surfaces (amended at re-lock, before any build). **Queue items never
hold specs back**: the batch walk admits every startable spec before it meets a queue prompt, so a
`/spec:plan` item still ends the batch (no plan lanes; planning stays attended) and is reported with
its `↳ from` line, but no spec behind it in `--next` is held; a fix item whose text names files runs
beside the run lanes whose File Plans it does not overlap and is serialized only against the ones it
does, and a fix whose text names no file runs after the run lanes as today. **Gated fixes are
honoured**: a fix whose `after` gate is unmet is tabled `waiting` and never dispatched; rolling
admission promotes it once the gate is met. **Plan and fix work never touches the main checkout**: a
fix lane runs in its own worktree on `fix/<queue_id>` and lands only through MERGE with the gate
after — the main-gate repair included, as a lane dispatched onto the red main — and the MERGE step
refuses a dirty main root naming the stray files, because merge-back refuses it by design.

Prior art: Buildkite dynamic pipeline upload (runtime-born steps join the same build), Zuul
`Depends-On` (order declared on the item itself — the `after` gate honoured here), GitHub merge
queue / bors (a failed candidate is requeued once, never recursively; the pool is re-formed per
landing, and a red main is repaired by a candidate, never by hand on the trunk). Rejected: Jira
sub-task parent-blocks-on-children — a batch that waits for every descendant lives forever.
