# Canonical: pipeline

## Liveness is executed, not asserted

Surface liveness is a path property (producer → carrier → consumer → render condition) while
the File Plan deliberately shreds paths into file rows so batches can parallelize — so a
promise's terminal is the hop nobody owns. The pipeline closes this with an authoring rule
rather than a document: a Decision promising a user-observable surface owes a
**terminal-observable AC** — asserting on the observable itself, reached through the real
in-repo route, fed by a fixture **produced** by the spec's own producer chain rather than
hand-authored. The anti-pattern is named **invented-fixture liveness**: a terminal fed
hand-typed props proves the component works, not that the product reaches it. The pure-UI TDD
exemption therefore covers appearance only — reachability is never exempt.

Enforcement rides mechanisms that already exist: `/spec:plan`'s lock audit (widened from Goal
promises to Decision-level observable promises), the Phase 3 refuters (a mocked in-repo hop
between producer and terminal is top-severity), `/spec:build`'s `blocked` ruling duty (a
mid-build ruling adds its AC in the same edit), and `/spec:review`'s AC↔test matrix,
skipped-test reconciliation and semantic backstop. No new script, section, or review leg
exists for this — deliberately (ruled 2026-08-10, superseding the discarded `## Surface
Paths` design; specs/20260810/02-terminal-observable-acs.md).

## The build gate is scoped; review runs the whole suite

Every build gate resolves `{testDirs}` from the spec's own File Plan tests rows, so a build
iteration runs only the test globs of the directories the spec names — the inner repair loops
stay fast, and that is the whole reason the scoping survives. Its earlier justification, that
scoping "makes a red-pin baseline livable", described the sanctioned-red apparatus v7 retired:
gates are plainly green now, so at review time nothing is protected by not looking. The cost of
a scoped gate is directory-shaped and precise: a test outside every named directory — a shared
script's pinned return, a repo-wide scanner (narration sweep, tracked-text purity, an exhaustive
live-file pin) — can go red because of the diff while neither the build gate nor the review
panel ever runs it (escape `wf_e1da0ea6-94c`: five pins, two files, zero signal; class
`scoped-gate-blind-spot`: three merges in two days went red on main only after merge-back).

Two compensations, one per question. `scope-reconcile.js` derives the **at-risk** set — outside
test files whose content names a changed file's path stem — and review runs that set as a
required, non-blocking leg whose failures are ordinary findings: it answers *which* outside
tests this diff endangers. The **`suite`** leg answers whether the tree is green at all: review
runs the host's bare `testCommand` once per legs iteration in its own wave (never concurrent
with another leg that runs host tests), in both scopes, and it is blocking — a red suite
derives `GATE_RED` before any reviewer spend, and the driver's close-time re-run runs the same
command over the committed close tree so the files CLOSE itself writes are covered. Build never
runs unscoped; review never closes on a scoped observation alone.
(specs/20260815/02-at-risk-pins.md, done 2026-08-16; specs/20260903/02-whole-suite-review-leg.md)

## Runtime verification covers stopping, not just starting

A verification stack of static legs passes a program that cannot start — the founding
observation behind the boot smoke leg. The same argument applies unchanged to shutdown: static
legs also all pass a program that boots but cannot cleanly stop, which is where a long-running
service's state-corrupting defects live (a stranded pidfile lock that blocked the daemon's own
restart rode two CLEAN reviews). The runtime leg therefore sends the host's declared
`runtime.stopSignal` after readiness and requires a bounded, clean exit —
`runtime.stopTimeout` and `runtime.stopExitCodes`, both optional and additive with sanctioned
defaults (30 seconds, `[0]`). A hung or unclean shutdown fails the leg exactly as a boot
failure does. Declared-inert hosts stay exempt: the shutdown check never runs when there is
nothing to boot. (specs/20260815/04-runtime-shutdown-leg.md, 2026-08-16)

## Frontmatter has one reader, and it strips comments at the source

Spec frontmatter is read through `spec/scripts/lib/frontmatter.js` — the sole derivation, used
by `spec-review-driver.js`, `spec-status.js`, and `replay.js` alike (`spec-design-driver.js`
was a fourth reader until it was retired 2026-08-24, specs/20260824/02).
Inline `#` comments on key lines are stripped per YAML unquoted-scalar semantics (cut at the
first whitespace-preceded `#`; quoted values unwrap and never strip), so a trailing note on
`tier:` or `build_base:` is cosmetic, not corrupting. Four independent copies of the same
`^key:\s*(.+)$` regex is how the class recurred, and the naive `.replace(/\s*#.*$/, '')`
variant was worse than none — stripping at ANY `#` corrupts an unspaced value such as a URL
fragment. Strip-not-reject was the conservative reading: tolerance is additive and reversible,
refusing a habit the format itself permits breaks existing hosts loudly. The corruption is
healed at its one source rather than validated downstream — a tier-enum check inside
`verdict.js`, the highest-blast-radius file in the repo, would widen that contract for a route
already closed. (specs/20260823/04-review-close-hardening.md, done 2026-08-23)

## One command per feature

After `/spec:plan`, `/spec:run <spec>` derives the stage from disk and runs design (when
due), the build driver, and the review driver in sequence, each with `--via loop`;
`/spec:design`, `/spec:build`, and `/spec:review` are the three stages' direct entries
(`--via direct`). Status
transitions are owned by driver states, not commands: plan's lock → `hardened`, the build
driver's preflight → `implementing`, the review driver's close → `done`; the state gate
admits `/spec:run` on all three (`/spec:build` on `hardened|implementing`, `/spec:review` on
`implementing|done`) and stays a prompt-boundary check. There is no stop
between the reviewer's return and dispositions. Independence is a fresh-context
`spec:disposer` agent (read-only, paths only, the session's model) dispatched at
DISPOSITIONS on both review entries; it returns one grounded recommendation per survivor
and leg finding, and the review driver refuses `--mark dispositions` on non-empty pools
without a return that covers every finding exactly once with a non-blank reason. Fix
recommendations dispatch without a question; waive and reject recommendations go to the
user, and the user's answer is recorded as `final` with `overriddenBy: "user"`. Every
review row records `checkpoint: {outcome, overrides}` — `disposer` (with the count of
recommendations the user overrode), `empty` (nothing to disposition), or `not-reached`
(the run stopped before dispositions) — so how often the user overrules the independent
disposer is a ledger query. The session-id checkpoint, its restart remedy, and
`--skip-independence-check-because` are retired (specs/20260901/09-disposer-gate.md,
ADR-0005). The pre-merge stop is the worktree step-out, never a forced clear.
`spec-status --next` names `/spec:run` for every spec past `hardened`; its `--json` action
set is `/spec:plan | /spec:run | /spec:escape` (specs/20260901/10-spec-run-command.md,
ADR-0005). The loop
is scored by the fleet reader's `cleanByVia` (escapes-per-CLEAN by `via`); a `loop` rate
above the `direct` rate over 30 fleet reviews reverts the loop.
(specs/20260901/03-unified-build-loop.md, done 2026-09-01)

The fleet reader's `owed` question (`--owed` for the human render) lists every
plugin-blaming row across this machine's checkouts: escape rows whose `preventedBy` is
`review-check` or `runtime-leg`, missed replay rows, and unstamped `docs/spec-feedback/`
findings, grouped by effective class with the joined recurrence count and a pointer to core
§ Incident Policy. Fixed-status is derived, never stored: an item's key
(`escape:<repo>:<ts>:<file>`, a replay run id, or a feedback finding id) cited in a landed
test, a doctrine file, or a `done` spec marks it fixed; a citation in an unfinished spec marks
it in-flight. Host reports end with the row key and nothing else — no handoff prompt is
composed; the owed query is the consumer. Replay rows carry `via` (`driver` when the review
driver's REPLAY step handed the target, `manual` otherwise), so `replay.js --stats`'s `by-via`
line counts the manual path. (specs/20260903/01-owed-query-and-row-handoff.md, done 2026-09-03)

## The question gate asks product facts, never derives them (2026-09-02, specs/20260902/06)

`question-style-gate.js`'s tier-2 judge verdict `derive` is suppressed — treated as pass —
while a product stage is live in the repo: `design/mocks/status.json` exists with `state` not
`APPROVED`, or `.claude/genesis/status.json` exists with `handoff` null. Root resolution is
`CLAUDE_PROJECT_DIR`, else the hook input's `cwd`, else the process cwd; any read error or
unparsable status file fails open toward the existing behavior, never toward blocking.
`rewrite` verdicts and every tier-1 check are unchanged. The judge prompt states that a
document citing, discussing, or recommending a subject is never the user deciding it, and that
a product fact (who, what, platform, payer, tenancy, what a screen does) is never `derive`.
