- `spec-queue.js list` performs only `stripAutoPlaced` + `dedupeItems` on the read path, never
  the third `reconcileMissingBriefs` append step, even though Behavior says "list runs the
  same three read-only steps." AC-20260903-03-8's own literal fixture (an unqueued, unplanned
  on-disk brief absent from a non-empty queue) requires `list` to NOT show it as pending —
  only a write subcommand (`next`/`add`/`move`/`done`) makes a newly-landed brief a real,
  persisted item; `list` always reflects exactly what the last write persisted, cosmetically
  normalized. Kept the write-path's three-step reconcile exactly as specced.
    spec/scripts/spec-queue.js: `reconciledItems(rawItems, statusJson, { append })` — `list`
    calls it with `append: false`, every write subcommand with `append: true`.
- spec-status.js's `--next` overlay demotes a spec's OWN entry to the bottom of the unblocked
  tier (new internal-only `__gateTargetPending` flag, stripped from `--json`) whenever that
  spec is the still-unmet target of another item's `after: {spec: …}` gate — not stated in
  any Decision, but required by AC-20260903-03-2's literal fixture: a `implementing`-status
  gate target naturally outranks an unrelated `hardened` spec under the existing
  closest-to-done rank, yet the AC's own wording ("the unblocked spec must be next[0]") and
  assertion name the unrelated hardened spec, not the gate target, as `next[0]`. The gate
  target's `blockers` stays `[]` (it is not itself blocked) — only its sort position moves,
  one tier below plain rank/queuePos ordering and above the true blocked tier.
    spec/scripts/spec-status.js: `queueGateTargetSpecs` Set + the `__gateTargetPending` sort
    clause in `deriveNext()`.
