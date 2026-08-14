# Canonical: workflows

## Degraded verification is a distinct state, never a green one (2026-08-13, specs/20260813/05-workflow-correctness-repairs.md)

A workflow that finishes with nothing deterministic having verified it must say so in its own
return, not in a comment. `spec-design-driver.js` resolves the design gate **per leg**: it
splits `config.gateCommand` on `&&` at top nesting level only (a depth/quote-aware scan — `&&`
inside balanced `()` or inside quotes never splits; unbalanced input passes through unsplit
rather than mis-split), drops any leg still carrying an unresolved `{placeholder}` token while
logging the drop into the emitted step text, and re-joins the survivors. `design.gateCommand`
overrides the whole derivation when a host declares it.

When every leg drops, the gate becomes the literal `__UNGATED__` and `wf-design` returns
`stage: 'complete-ungated'` — never `'complete'` — with next-step text that states verification
is absent and routes to `/spec:review`. The rule this encodes: Sonnet-authored code is never
marked done with zero deterministic verification, and the degradation is loud at every
consumer because it is a distinct enum value rather than a flag someone must remember to read.

Same principle at the exhaustion end: the gate loop's return carries
`exhaustedBy: 'agent-died' | 'no-attributable-failure' | 'oscillation' | 'ceiling'` alongside
`stage: 'gate-exhausted'`. A dead gate agent and a genuinely red gate are different facts and
are recorded as different facts.

## Every gate-runner substitutes its own placeholders (2026-08-13, same spec)

`gateCommand` may contain `{testDirs}`-style placeholders, so **each** command that executes it
resolves them first, from the spec's File Plan tests rows to the repo-root-relative glob form.
An unresolvable placeholder makes that leg `unavailable`, naming the offending token — never a
raw execution. Running the unsubstituted command turns the gate into an unconditional red on
every such host, which is worse than no gate: it is a red that carries no information.

`/spec:build` and `/spec:review` both do this. The class of bug is a command that assumes some
*other* command already substituted.

## Twins are fixed by extraction, not by copied comments (2026-08-13, same spec)

`wf-build` and `wf-design` had each inherited a gate-repair loop by copy. Build's grew a
deviations sidecar, anti-oscillation repair history, and phantom-failure hardening; design's
grew only the *comments justifying* those things. The fix is `fragments/gate-loop.js.frag`,
spliced into both bodies, holding the probe, the repair-round loop and its single named
ceiling constant, the hardening, the history, the sidecar accumulation, and the exhaustion
return assembly. Per-body differences (batch shapes, prompts) stay in the bodies as parameters.

Extraction is behavior-preserving for the source-of-truth twin and behavior-*adding* for the
drift victim. A forced departure from the source twin's semantics during such an extraction is
a recorded deviation, never a silent adaptation.

The extraction includes the schemas the shared loop dispatches with (2026-08-14, spec 06a D4).
`GATE` lives in `fragments/gate-loop.js.frag` beside its sole reader — the `schema: GATE`
dispatch inside `runGateLoop` — with `required: ['pass', 'failures']` and `summary` an optional
property (zero readers). Leaving the schema in each body is exactly the copy the fragment
exists to prevent: the twins had already diverged, wf-design still requiring `summary` after
wf-build's shape was loosened. A schema defined beside its one reader reaches both twins by
construction. Related, same spec: wf-research's cap contract is `alsoConsidered:
[{dimension, label}]` with a minority-preserving cut order — `is_minority` options are cut only
when minority options alone exceed the cap.

## A pass sentinel must prove the whole gate passed (2026-08-13, same spec, D12)

The gate probe is two lines — `( set -e; <gateCmd> )` on its own, then a separate
`if [ $? -eq 0 ]; then echo __GATE_PASS__; fi` — and prompts explicitly forbid collapsing them
back into `( … ) && echo`.

This is not style. The old one-line form reported only the *last* statement's status, so a
`;`-joined host gate whose first leg failed still printed the pass sentinel: a false green at
the single point the whole pipeline trusts. The naive repair is also inert — POSIX ignores
`errexit` for any non-final command of an AND-OR list, and bash applies that suppression
*inside* the subshell, so both `( set -e; … ) && echo` and `if ( set -e; … ); then` leave the
`set -e` doing nothing at all.

The durable lesson outlives the shell detail: **a source-text pin asserting `set -e` is present
would have passed while the guard did nothing.** Guards that claim a behavior are pinned by
executing them, including executing the known-bad shapes to show they still leak.

## Evidence rides exit codes, not model reading (2026-08-13, same spec)

The TDD red-check — the only proof that tests fail before implementation — took its verdict
from an agent's reading of raw stdout. It now takes it from sentinels: the agent runs
`<testCommand> <path> && echo AUDIT_GREEN:<path> || echo AUDIT_RED:<path>` per file and reports
the observed lines verbatim in a required `RED.sentinels` array. The workflow cross-checks each
file's reported state against its sentinel; a mismatch or a missing sentinel is an UNVERIFIED
red state on the existing fail-closed path.

The cross-check applies only where an agent actually ran. The sanctioned all-carriers-green
path hand-builds its `red` literal with no agent, carries `sentinels: null`, and the
cross-check skips `null`. A verification tightening that silently invalidates a sanctioned
path is a regression, not a tightening.

## Workflow arg boundaries assert, in named functions (2026-08-13, same spec)

Unguarded dereferences of `args` crash cryptically mid-run, and an unvalidated discriminant
routes work to the wrong prompt silently. Each workflow asserts at its arg boundary:
`assertGateArgs` (a gate carries a string `testCommand`), `assertBatchKinds` (every batch kind
is in the closed set; the throw names the offending value), `assertResolutions` (every
resolution value matches the args token alphabet `/^[A-Za-z0-9._\/:@=-]+$/`; the throw names
the offending key — free text in `args` is the args-corruption class's last open door).

Each is a **named function** at the boundary rather than a bare top-level statement,
specifically so tests can execute it: the source-extraction helpers used to pin workflow
bodies cannot reach bare top-level statements, so an assert written that way is unpinnable.

## Per-seat reviewer emphases are framings only (2026-08-13, same spec, D3 + its review fix)

`wf-review`'s `EMPHASES` array holds nothing but a one-line primary framing per reviewer seat.
Every substantive requirement — File Plan, Contracts, Decisions, AC↔test coverage and the
no-drift-script note, wiring, architectural boundaries — renders unconditionally in the shared
prompt body.

The reason is panel arithmetic: the second seat exists only on T3 panels above the diff-size
threshold, so anything living solely in `EMPHASES[1]` never renders on the majority path
(fix-delta is always one reviewer; full scope usually is). Requirements placed in a seat are
requirements that mostly do not run.

The review of this very spec caught the half-done version of this move: the checklist was added
to the shared body but also left in `EMPHASES[1]`, so seat-1 prompts stated it twice. Moving a
block means deleting the original — and the acceptance criteria that assert *presence* of text
cannot see a duplicate, so they will not catch it for you.

## A workflow never claims data only its caller holds (2026-08-14, spec 06a D1/D2)

A workflow script cannot know its own run id. The harness mints it at invoke time and delivers
it only in the caller's tool result, so a return envelope that echoes `args.runId` evaluates to
`undefined` in every live run — no orchestrator passes such a key, and none can at first invoke.

Provenance stays where the value actually exists: the orchestrator stamps the run id from the
Workflow tool result into the run-ledger row and the 📦 report line. Return envelopes carry no
`runId`.

The general rule: a return-envelope field whose value the script cannot observe is a contract
that lies. Delete it rather than thread it — a field defined only on resume is worse than no
field, because consumers cannot tell the two states apart.
