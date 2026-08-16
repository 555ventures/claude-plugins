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

## The gate is scoped, and the scoping is compensated

Every gate in the pipeline resolves `{testDirs}` from the spec's own File Plan tests rows, so
a run never executes the whole suite. That scoping is deliberate and load-bearing — it is what
makes a red-pin baseline livable — and it is never widened. Its cost is precise: a Decision
that changes what a shared script *returns* reddens suites that pinned the old behavior, and
because those suites sit outside the File Plan, neither the build gate nor the review panel
ever runs them (escape `wf_e1da0ea6-94c`: five pins, two files, zero signal, found by hand
twelve minutes after a CLEAN verdict).

The compensation is a derivation, not a wider gate: `scope-reconcile.js` — already the sole
owner of the changed-set-vs-File-Plan comparison — also derives the **at-risk** set by
matching changed-file path stems against the content of test files outside the plan, and
`/spec:review` runs that set as a required, non-blocking leg. Failures become ordinary
findings the session disposes of; a pre-existing sanctioned pin is a waive naming the pin. The
gate never runs unscoped, and the prediction the scoping makes is now itself under test.
(specs/20260815/02-at-risk-pins.md, done 2026-08-16.)

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
