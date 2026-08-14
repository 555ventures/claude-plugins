---
date: 2026-08-13
status: implementing
diff_base: 607085137519e2a7ee1e0e398a92ac90d2550a5b
open_markers: 0
risk: T3
area: report-surface
design: false
breaking: false
depends_on: ["specs/20260813/05-workflow-correctness-repairs.md"]
depended_on_by: ["specs/20260813/07-command-report-conformance.md"]
brief: n/a
---

# Report renderer — one script owns the console skeleton; workflow returns carry its slots

## Goal

Give the console-output contract its first deterministic carrier: a renderer script that is
the sole authority on the end-of-run report skeleton (the spec-status precedent — the render
lives in a script, the model never restyles), and extend the workflow return schemas so
every slot the skeleton needs arrives as data instead of being freehanded at report time.
Done means: the renderer exists behind a `spec-paths` key with exec tests, shared.md
§ Console Output Style delegates the render to it, and the six workflow bodies return the
fields the audit found missing (impact, exhaustion cause, degradation flags). Command-side
adoption is spec 07.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | New script `spec/scripts/report-render.js`: reads a slots JSON file (`--slots <path>`; file-based, never inline shell args — free text in argv is the corruption class the workflow layer already banned), validates, renders the skeleton to stdout: outcome line → detail bullets → 📌 derived-decision lines → ⚠️ lines → 🚫 item lines → 📦 artifact lines → ✨ lines → `Next:` close. Empty slots drop their lines. Exit 2 with remedy on contract violations. The script is side-effect-free: exit 2 recovery = fix the slots file and re-run the renderer ONLY — never re-run the command's phases (stated in the script header; the render step is always safe to repeat). | The contract is prose-only today — exactly one command's report ending is test-pinned repo-wide; a script render survives long-context drift by construction (v6.15.0/v6.23.0 precedent). The recovery rule exists because render-time failure happens after side-effecting work (merges, ledger rows) — re-running phases would double them. |
| D2 | Slots contract (see Contracts): `outcome.anchor` ∈ `✅\|⚠️\|🚫`, `outcome.text` bold-rendered by the script; `warns` (⚠️ lines) and `blocks` (🚫 item lines — doctor's broken-item list shape) are distinct arrays; `artifacts` is an array (a report may point at several written artifacts); `next` is required and is either `{kind:'command', text}` (single line, must not end with `?` — no shape whitelist: host gate commands and sanctioned chains are arbitrary strings), `{kind:'status-verbatim', text}` (pre-captured `spec-status --next` output passed through; rendered verbatim as the close, so the report may legitimately end with the script's own `🎯` lines), or `{kind:'none', reason}` (rendered `Next: nothing needs you — {reason}`). A missing/empty `next` is a contract violation, not a droppable slot. | "Close the loop" becomes mechanically unskippable — audit Class A's defect class. The commands that today end without a Next (review non-CLEAN, escape's "Then stop.", audit's conditional) are themselves the Class-A defects; spec 07's rulings define their `next`, and `kind:'none'` exists only for genuinely-no-action closes with the reason stated. (Refuter-driven: the original `/^(\/|node \|npm \|git )/` whitelist was itself over-fitting — it rejected backtick-wrapped commands, prose remedies carrying resolved gateCommands, and arbitrary host invocations.) |
| D3 | The script renders; it never derives. `status-verbatim` text is captured by the command (which runs `spec-status --next` itself) and passed in — a renderer that shells out to spec-status would become a second derivation path (v6.20.0 rule). | Preserves the sole-derivation invariant while letting the skeleton close on the script's verbatim output. |
| D4 | `spec-paths` gains key `report-render`; shared.md § Console Output Style is edited in place: the skeleton sentence now names the script as the render authority ("commands assemble slots and print the script's output verbatim"), gains a one-line 📌 slot cross-reference (the announce-line is already defined in § Question Style — reference, don't redefine) and the shared two-line STOP shape (`🚫 **{what failed — plain consequence}**` + `Next: {named remedy}`) — rendered via the same script with `outcome.anchor: 🚫`. The section's total line count may not exceed its pre-change 44 lines — additions are paid by deleting the now-script-owned mechanics prose (the "Enforcement is split…" paragraph is the primary deletion candidate). | The 📌 slot and the failure path get their single home (audit D3/D4); the ≤44-line bound is test-pinned (AC-10) because the claims ratchet only detects *undisclosed* drift, not growth — a refuter executed `--update-baseline` and proved re-stamping legalizes any size, so the original "ratchet enforces net-zero" claim was false. |
| D5 | `wf-review` finding schema gains required `impact` — "one line, plain English, no code identifiers: what a user or operator sees go wrong if this ships" — enforced in the schema description and consumed by the report as the finding's display line (identifiers stay in the finding's `claim`/`evidence` for the ledger). review.md's documented return-shape string (`{verdict, survivors, killed, …}` in ## Rules) is synced to include the new fields in the same commit. | Findings currently surface verbatim in the report's plain-language slots as jargon (E4); the field is born at the only seat that knows the answer. The doc-string sync closes the drift the blind-spot pass flagged (the wave must not itself create doc/behavior drift). |
| D6 | `wf-build` and `wf-design` exhaustion returns surface `exhaustedBy` (recorded since spec 05) plus `agentsFailed: N`; `wf-panel` returns `agentsFailed` (proposer/angle deaths — currently filtered silently) and throws when fewer than 3 proposals survive (the arg-boundary invariant enforced at runtime too; the throw sits inside the `runProposers` block so the selective-skip path is untouched); `wf-research` returns `verifyFailed: true` when the currency verifier died (stale versions must not read as fresh) and `alsoConsidered: [labels]` for options cut by the 2–4 cap. | Silent-degradation class (E9): every reduced-assurance path gets a data carrier so reports can state it; the <3-proposal throw upgrades a loudly-guarded-then-silently-violated invariant into a real one. |
| D7 | `wf-enforce.notes` becomes required (may be `""` only when no category fell back; schema description says the report's ⚠️ fallback line consumes it); `wf-build`'s `GATE.summary` is dropped from the required set — it is the field required-but-consumed-by-nobody (repo-wide grep: zero readers). `RECEIPT` and `files[].summary` are untouched — `files[].summary` is actively consumed in repair prompts. | One field starves a mandatory ⚠️ line (E6), the other is pure waste. (Refuter-corrected: the audit's E10 named `RECEIPT.summary`, which does not exist — the real dead field is `GATE.summary`; un-requiring `files[].summary` would have injected `undefined` into repair prompts.) |
| D8 | `wf-review`'s `FINDINGS` verdict (mediums-only) gets an explicit outcome mapping in the return→report contract: `⚠️` anchor with an advisory line ("no hard findings; N advisory findings recorded — CLEAN is not blocked"). The `hard/medium/soft` severity enum stays. | The enum's extra grade is information; the defect was the missing outcome line (E7) — collapsing the enum would touch verdict.js for no user-visible gain. |
| D9 | Every workflow return envelope pins `runId` explicitly in its schema/assembly (audit E11: report templates and the runs-ledger consume it; no workflow declares it). | The envelope contract exists only by convention today; pinning it closes the report's provenance slot. |
| D10 | Renderer gets a scaffold-ledger row (promote: already-promoted — it IS the enforcement; retire: only if the console contract itself retires); tests live under `tests/report/`. | Doctor check 13 discipline. |
| D11 | Version bump target 6.64.0, plugin.json description as changelog. | Repo discipline; target not pin. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/report-render.js | CREATE | scripts | D1 renderer (slots file → skeleton, side-effect-free, recovery rule in header), D2 contract, D3 no-derivation |
| spec/bin/spec-paths | MODIFY | scripts | D4 `report-render` key |
| spec/doctrine/shared.md | MODIFY | doctrine | D4 § Console Output Style in-place edit: script authority + 📌 cross-ref + STOP shape; section stays ≤44 lines |
| spec/workflows/src/wf-review.body.js | MODIFY | workflows | D5 required `impact`; D8 FINDINGS→⚠️ mapping note in return contract comment; D9 runId pin |
| spec/commands/review.md | MODIFY | doctrine | D5 return-shape doc string sync (runId + finding impact) |
| spec/workflows/src/wf-build.body.js | MODIFY | workflows | D6 `agentsFailed`; D7 `GATE.summary` un-required; D9 runId pin |
| spec/workflows/src/wf-design.body.js | MODIFY | workflows | D6 `agentsFailed`; D9 runId pin |
| spec/workflows/src/wf-panel.body.js | MODIFY | workflows | D6 `agentsFailed` + throw on <3 surviving proposals (inside runProposers block); D9 runId pin |
| spec/workflows/src/wf-research.body.js | MODIFY | workflows | D6 `verifyFailed` + `alsoConsidered`; D9 runId pin |
| spec/workflows/src/wf-enforce.body.js | MODIFY | workflows | D7 `notes` required; D9 runId pin |
| spec/doctrine/scaffold-ledger.md | MODIFY | doctrine | D10 renderer row |
| spec/doctrine/claims-baseline.json | MODIFY | doctrine | ratchet re-stamp for doctrine deltas (same commit) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D11 bump + changelog |
| tests/report/report-render.test.js | CREATE | tests | AC-20260813-06-1 … AC-20260813-06-5, AC-20260813-06-10 |
| tests/report/return-slots.test.js | CREATE | tests | AC-20260813-06-6 … AC-20260813-06-9 |
| tests/terminal-observable-acs.test.js | MODIFY | tests | AC-20260813-06-11 (the spec-paths key-set literal gains `report-render` — this test deep-equals the full key list and breaks otherwise) |

## Contracts

```js
// spec/scripts/report-render.js — slots file schema (JSON):
// {
//   outcome: { anchor: '✅'|'⚠️'|'🚫', text: string },       // required
//   bullets: [string],                                        // optional, plain lines
//   pins:    [string],                                        // optional, 📌-anchored (derived decisions announced)
//   warns:   [string],                                        // optional, ⚠️-anchored
//   blocks:  [string],                                        // optional, 🚫-anchored item lines (e.g. doctor's broken list)
//   artifacts: [string],                                      // optional, 📦-anchored path lines
//   found:   [string],                                        // optional, ✨-anchored
//   next: { kind: 'command'|'status-verbatim'|'none', text?: string, reason?: string } // required
// }
// Render order: outcome → bullets → pins → warns → blocks → artifacts → found → next.
// One line per entry, anchor prepended by the script (slot text must NOT carry its own
// anchor — exit 2). next.kind 'command': text is one non-empty line not ending in '?'.
// next.kind 'status-verbatim': text rendered verbatim as the close (may span lines and
// begin with 🎯 — it is spec-status's own output). next.kind 'none':
// renders `Next: nothing needs you — {reason}` (reason required).
// Exit codes: 0 rendered; 2 contract violation (message names the offending slot + remedy;
// header states: fix the slots file and re-run the renderer only — never re-run the
// command's phases).

// Workflow return deltas (schema-level):
// wf-review finding:  + impact: string (required)  — plain-English consequence line
// wf-build return:    + agentsFailed: integer, runId: string; GATE.summary un-required
// wf-design return:   + agentsFailed: integer, runId: string
// wf-panel return:    + agentsFailed: integer, runId: string; throws Error('panel degraded: N<3 proposals') pre-aggregation
// wf-research return: + verifyFailed: boolean, alsoConsidered: [string], runId: string
// wf-enforce return:  notes: required, runId: string
```

## Behavior

- A command's report step becomes: assemble the slots object → Write it to the session
  scratch dir (the existing mktemp/scratchpad convention review/release already use) →
  `node "$(spec-paths report-render)" --slots <file>` → print stdout verbatim. (The
  command-side migration is spec 07; this spec ships the mechanism + shared.md authority.)
- The renderer is layout-only: it validates anchors and ordering, prepends anchors, bolds
  the outcome line, and refuses free-form endings. It never reorders, merges, or rewrites
  slot text (glossing quality stays with the model; the script guarantees shape).
- Slot mapping guidance for spec 07 (stated here so 07 stays mechanical): report lines that
  are artifact pointers (review's `🔍 smells: … → docs/audit/advisory-findings.md`) become
  📦 `artifacts` entries; per-item failure lists (doctor's `🚫 broken:` lines) become
  `blocks`; informational one-offs with bespoke glyphs (enforce's `🔒 ratchet baseline`)
  become plain `bullets` — the fixed anchor set is closed, bespoke glyphs retire.
- Slot text quality (plain English, no identifiers) remains a prose obligation on the
  assembling command — the renderer enforces structure; a content lint is deliberately out
  of scope (no honest deterministic check; revisit only if the next audit shows content
  drift surviving the shape rail).

## Acceptance Criteria

- **AC-20260813-06-1**: WHEN a full slots file renders THE SYSTEM SHALL emit the skeleton in
  fixed order with script-prepended anchors (literal:
  `{"outcome":{"anchor":"✅","text":"review CLEAN"},"pins":["auto-picked ff-merge"],"next":{"kind":"command","text":"/spec:audit"}}`
  → line 1 `✅ **review CLEAN**`, a `📌 auto-picked ff-merge` line, last line
  `Next: /spec:audit`) → tests/report/report-render.test.js
- **AC-20260813-06-2**: WHEN `next` is absent or empty THE SYSTEM SHALL exit 2 naming the
  missing slot and its remedy; WHEN `next.kind` is `none` with `reason` THE SYSTEM SHALL
  render the last line `Next: nothing needs you — {reason}`; WHEN `kind` is
  `status-verbatim` THE SYSTEM SHALL emit the text verbatim as the close (literal: text
  `🎯 Next\n→ /spec:build specs/x.md` survives byte-identical) →
  tests/report/report-render.test.js
- **AC-20260813-06-3**: WHEN slot text arrives pre-anchored (bullet starting `✅ `) or
  `next.kind:'command'` text ends with `?` or spans multiple lines THE SYSTEM SHALL exit 2
  naming the offending slot → tests/report/report-render.test.js
- **AC-20260813-06-4**: WHEN empty optional slots are given (`bullets: []`,
  `artifacts: []`) THE SYSTEM SHALL drop those lines entirely — output contains no blank
  anchor lines; WHEN `blocks` has entries THE SYSTEM SHALL render each as a `🚫 `-anchored
  line between warns and artifacts → tests/report/report-render.test.js
- **AC-20260813-06-5**: WHEN `spec-paths report-render` is invoked THE SYSTEM SHALL print
  the script's absolute path (key wired) → tests/report/report-render.test.js
- **AC-20260813-06-6**: WHEN the wf-review finding schema is read THE SYSTEM SHALL require
  `impact` with a description demanding plain English and forbidding code identifiers, and
  review.md's documented return-shape string SHALL name `runId` (source + doctrine pins) →
  tests/report/return-slots.test.js
- **AC-20260813-06-7**: WHEN wf-panel's proposal-filtering block executes with 2 surviving
  proposals (evalFns on its named filter helper) THE SYSTEM SHALL throw naming the degraded
  count; with 3 it SHALL CONTINUE TO proceed to aggregation →
  tests/report/return-slots.test.js
- **AC-20260813-06-8**: WHEN the six return assemblies are read THE SYSTEM SHALL each pin
  `runId` and their new degradation fields (`agentsFailed`/`verifyFailed`/`alsoConsidered`
  per body; source-shape pins) → tests/report/return-slots.test.js
- **AC-20260813-06-9**: WHEN wf-enforce's schema is read THE SYSTEM SHALL require `notes`,
  and wf-build's GATE schema SHALL no longer require `summary` while `files[].summary`
  SHALL CONTINUE TO be required (source-shape pins; the second half is a regression pin on
  the actively-consumed field) → tests/report/return-slots.test.js
- **AC-20260813-06-10**: WHEN shared.md is read THE SYSTEM SHALL contain § Console Output
  Style spanning at most 44 lines (its pre-change size — additions paid by deletion; direct
  line-count pin, not a ratchet oracle) → tests/report/report-render.test.js
- **AC-20260813-06-11**: WHEN the spec-paths key-set test runs THE SYSTEM SHALL find
  `report-render` in the expected-keys literal (deep-equal survives the new key) →
  tests/terminal-observable-acs.test.js

## Assumptions (escalation triggers)

- Emoji anchors survive stdout round-trips in every host terminal the plugin targets (they
  already do for spec-status). If false → renderer gains `--ascii` degradation flag.
- Making `impact` required does not break wf-review resume flows (schema change invalidates
  cached agent results across resume — acceptable: resumes span one session). If a
  mid-flight resume matters → the field lands optional-with-warning for one version.
- § Console Output Style can absorb the edits within 44 lines by deleting the
  skeleton-mechanics prose the script now owns ("Enforcement is split…" ¶, ~6 lines,
  refuter-identified). If it genuinely cannot → escalate; never silently exceed the pin.

## Rationale

Audit provenance: Class D (D1/D3/D4 structural gaps), Class E (E4–E11). The renderer is the
wave's holistic answer to Class A: instead of 19 per-command template fixes being 19 chances
to drift again, the skeleton becomes code and spec 07's migration deletes the per-command
mechanics.

Refuter-driven corrections (two seats + blind-spot, 2026-08-13): `GATE.summary` replaces the
audit's nonexistent `RECEIPT.summary` (E10's citation was wrong; the literal fix would have
broken repair prompts); the `next` shape whitelist was dropped as over-fitting (it rejected
backtick-wrapped chains, prose remedies, and arbitrary host gate commands); `artifacts`
became an array and `blocks` was added (doctor's severity-split item lists and multi-artifact
reports were inexpressible); `status-verbatim` is defined to end the report with
spec-status's own 🎯 lines (the `^Next:` close and the sole-derivation rule would otherwise
collide); AC-10 became a direct line-count pin after a refuter executed `--update-baseline`
and proved the claims ratchet legalizes growth on re-stamp; the exit-2 recovery rule was
made explicit (render failure happens after side-effecting work); the spec-paths key-set
test and review.md's return-shape doc string are hidden consumers now in the File Plan.
Precedent framing corrected: spec-status's `--pretty` is today a no-op flag (the script
always renders) — the precedent cited is "script owns the render," not the flag itself.

Deliberately rejected: renderer shelling to `spec-status --next` (second derivation path);
a content-quality lint on slot text; collapsing wf-review's severity enum (D8 keeps
information, adds the missing outcome line); reintroducing bespoke glyphs (🔍/🔒/🧹) as
slots — the fixed anchor set is the contract, and their content maps to existing slots.
E2/E1/E3 (question-side schema fields) are spec 08's — disjoint by concern where files are
shared; chain ordering serializes.

The 📌 slot ships here (in shared.md + renderer) but fires from commands only after specs
07/08 land — mechanism before migration, migration before the doctrine that assumes it.

## Canonical Delta

None — scaffold-ledger row is the durable record.
