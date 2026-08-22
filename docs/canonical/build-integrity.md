# Build integrity

Canonical behavior of the evidence the build phase must produce before an implementation is
allowed to claim it was tested.

## Red attribution

The TDD red-check validates a new test by "fails before the implementation, passes after". A
red observation only carries that meaning when it is **attributed** — when the file's own
assertions actually ran. A test file whose import crashes at load time is "failing" while
executing zero assertions, and a spec's first act is overwhelmingly a new module or a new
export, so the vacuous case is the common case rather than an edge. (Ground truth: hearwell
2026-08-14 — deleting the six words implementing a spec's headline guarantee left 9/9 tests
green through a two-reviewer CLEAN panel, because the carrier that should have caught it was
load-blocked and read as satisfied red.)

Four rules follow (v7: the red-check is an executed step in build.md Phase 1 — the
wf-build workflow that mechanized them is retired; the rules bind the by-hand check):

- **Runtime red satisfies a red expectation only when demonstrated.** Each sentinel carries a
  required `assertionsRun` integer — the count of assertions that actually executed in the probe
  run it reports. Runtime red with `assertionsRun` 0, absent, or non-numeric fails **closed** as
  `not-collected`, exactly like every other uncertain path in the cross-check, with a detail
  naming the load-shaped red and the stub re-probe remedy. Silence is never read as "assertions
  ran".
- **Load-blocked carriers demonstrate via the inert-stub re-probe.** When a red-expected file
  fails to load on a specifier the spec's own File Plan CREATEs, the probe writes an inert stub
  at that path, re-runs the file's probe leg(s), reports the **post-stub** sentinel and
  `assertionsRun`, then deletes the stub and verifies those exact stub paths are gone. The
  residue check is scoped to the paths the probe created — never a whole-tree cleanliness demand,
  since a build's own newly authored test files are legitimately untracked at probe time. A
  post-stub red with `assertionsRun ≥ 1` is a demonstrated red; a post-stub green, a still-load-red
  file, or a specifier no CREATE row names is reported honestly as `assertionsRun: 0` and fails
  closed into the `tdd-red-check` consult. This is the one sanctioned exception to the probe's
  no-edit rule, and the dispatch prompt states it in the same sentence as the rule.
- **Resolution-shaped typecheck evidence never satisfies red.** A typecheck diagnostic that is
  itself a missing-module or missing-export error — `cannot find module`, `cannot resolve`,
  `module_not_found`, `modulenotfounderror`, `TS2307`, `TS2305`, `has no exported member` — names
  the importing file exactly like a genuine type-level red does, but proves nothing about that
  file's own assertions. It is load-shaped and routes to the same stub remedy. Without this, a
  typed host's vacuous carrier walks back in through the typecheck door.
- **Compile-time-only carriers stay classifiable.** A type-level assertion or an assert-absence
  pin is *erased* at runtime, not crashed by it, so it legitimately executes zero assertions; its
  proof is an attributed **non-resolution** typecheck diagnostic naming the file. The legs compose
  by OR: an attributed leg alone satisfies a red expectation, so a genuine type-level red still
  stands even when the same sentinel's runtime leg is unattributed.

Scope guard: the attribution requirement applies only where it would *satisfy* a red
expectation. A green-expected file observed runtime-red remains a broken-pin mismatch whatever
its `assertionsRun`, and green observations never consult the field.

Honest limits, recorded rather than solved: `assertionsRun` is agent-reported, so the structure
forces an active claim where silence fails closed but a fabricating agent defeats it as it
defeats every reading; the stub route reaches only specifiers a File Plan CREATEs, so a
not-yet-written export on a MODIFY target ends in a consult rather than a demonstration; and a
stub that itself fails to compile reports still-load-red, which is a consult, never an escape.

## Mechanized red-check

Build Phase 1's red-check is mechanized by `spec/scripts/red-check.js` (`spec-paths
red-check`). Expectation derives from `SHALL CONTINUE TO` regression pins and closed-enum
`[pre-green:]` tags (`fallback-rejection` | `absence-invariant` | `predicate-in-test`);
observation is per-file `{testCommand}` exit codes against the pre-image, purity-refused when
non-tests File Plan paths already differ from the diff base. The plan-time tag count rides
review's ac-matrix manifest row as `observed.preGreen` into every ledger row, making the class
fleet-countable. The kill condition and the rejected per-AC mutation mandate (with its reopen
condition) are recorded in specs/20260821/01-red-check.md D12/Rationale.

**AC-grammar tags are position-anchored.** `[oracle:]`, `[env:]`, and `[pre-green:]` are
recognized in exactly two positions on an AC bullet — the declaration slot (first line, between
the bold AC token's closing `**` and the requirement-opening `:`, optionally backticked, as
`spec/templates/spec.md` prescribes) and trailing (the end of the bullet's raw text). Each
position accepts a run of one or more sibling tags. A tag appearing anywhere else is prose, not
a declaration, and parses `null`. Without this anchoring an AC that documents the tag grammar by
example self-tags, and the parser fabricates findings against the very spec that explains it;
without multi-tag runs, template-sanctioned sibling tags (e.g. `[env:]` with `[pre-green:]`)
silently drop, un-sanctioning a declared skip. Both failure modes manufacture hard findings from
correct authoring, which is the class the mechanized red-check exists to eliminate.
