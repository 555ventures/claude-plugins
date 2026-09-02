# 20 — Shell-composed mocks: one canonical app shell, content-only sketches, planning-seat authorship
Amended by: ADR-0006 (brief 22 — mocks-first genesis)

Phase: P2 · Depends on: none · Amends: 02 (decision D8 of specs/20260810/01 — via ADR-0003)

## Why this brief

The design flow decides the navigation shell once at genesis and scaffolds it once in code
(the `AppShell` base primitive at `rules-locked`), but the mock layer — which is authored
FIRST and is the render gate's `design_source` — has no shell at all. Every
`design/mocks/<label>.html` is a standalone page that redraws its own sidebar, header, and
tabs by hand. Observed 2026-09-01 (JJ): "whenever you design something, it drifts because
you don't use shared layout or app shell." The pipeline's only defence today is prose —
"cite earlier mocks as exemplars so late surfaces match early chrome" (atlas sweep) — which
asks the author to copy consistently; `design-atlas.js check` verifies tokens, box-sizing,
line-height, and harness marks, never shell sameness, so chrome drift is invisible to every
gate and is caught only by the user's eyes at the atlas review.

Two things compound it:

- **The sweep author is the cheap model.** Brief 02's D8 (2026-08-10) put the atlas gap sweep
  on one sequential Sonnet author, reasoning that atlas sketches are disposable gap-fillers.
  But the greenfield sweep is the product-understanding contract the user audits
  (`/spec:atlas` § The sweep); authoring it on Sonnet means the user audits Sonnet's grasp of
  the product, and the planning model's grasp is never written down. `/spec:sketch` already
  runs the session as author with a Sonnet overflow valve past 5 surfaces — the same
  compromise, rarely triggered because one brief seldom has more than 5 surfaces. Core
  § Model Placement names "atlas direction rounds, sketch brainstorms" as planning-seat
  duties but assigns sketch-tier *authorship* nowhere. Reversing D8 is a recorded amendment
  (ADR-0003), not a repair.
- **The taste decision never reaches the author.** Genesis explore produces a picked position
  (stance, anti-defaults, reference direction, starter tokens — `design-positions.md`), but
  the sweep and sketch grounding sets are brief + research brief + doctrine + `tokens.css`.
  The stance and reference direction reach the sketch author only through whatever survives
  in a CSS variables file.
- **The shared doctrine home D8 mandated is gone.** D8 placed "one warm author per pass,
  exemplar-grounded" in shared § Design Atlas as the single home for both contracts; the v7
  rewrite of `design.md` dropped it. `atlas.md:101` still cites it — a phantom citation no
  check can see.

## Result

Every visual host has one canonical shell mock per declared shell (`design/shell/<name>.html`
— `app` at minimum; one responsive file each, rendered at every `targets.json` viewport),
authored in the planning seat when the navigation shell is decided. Page mocks declare their
shell (`data-shell="app"`, or `"none"` by name for shell-less surfaces such as auth and
landing) and author only the content region; the shell chrome inside a mock is byte-identical
to canon by mechanism — synced by script, never copied by an author — and `design-atlas.js
check` fails any mock whose shell region differs from canon or which declares a shell and
still carries its own nav markup. A shell edit propagates to every mock in one sync run and
surfaces as one atlas look, not N re-authors. The `AppShell` base primitive is authored from
the shell mock, so mock shell and code shell are one decision. Sketch-tier authorship sits in
the planning seat for both commands: the session authors the journey-central exemplars
in-session, one sequential `Agent {model: "fable"}` (Opus fallback, core § Model Placement)
authors the overflow from them, Sonnet keeps mechanical edits only; every sketch author reads
the picked position brief; the sweep report names the position and the author split. The
authorship rule lives in one restored shared paragraph both commands cite.

## Current state

- `spec/doctrine/design.md` § Design Canon — `mocks/<label>.html` one screen per file, root
  `data-screen-label`, IS the `design_source` ("no extraction"); harness marks
  `data-status`/`data-state-btn`/`data-contract="none"`/`data-positioned`; one responsive
  mock per surface (JJ standing rule), matrix at approval. § Base primitives — `AppShell`
  created once behind the base barrel; `base-primitive-containment` enforced in CODE only.
  § Design Atlas — journey view, badges, annotation triage; **no authorship paragraph**.
- `spec/doctrine/genesis.md` — navigation shell is a design-state DECIDED row (sidebar /
  top-nav / tabs); `--mark tokens-landed` promotes the winner's signature screens into
  `design/mocks/` `approved` + matrix; `--mark rules-locked` scaffolds `AppShell` in code
  ("nav slots + content region, no feature content").
- `spec/scripts/design-atlas.js` — `build` renders each mock in an iframe card by path;
  `check` (`--matrix`) verifies braces, box-sizing, line-height, frame borders, harness
  marks, tokens link, dark block, viewport meta. No shell awareness, no sync subcommand.
- `spec/scripts/render-gate.js` — resolves `design_source` / `--mocks` to mock files
  directly and requires a `data-screen-label` root on each; `render-rules.js` runs
  `renderCheck` rules over the render inventory. Both consume mocks as-is.
- `spec/commands/atlas.md:22-26, 97-104` — "the sweep dispatches Sonnet agents"; sweep =
  one Sonnet author, chained past ~10, exemplar-grounded; cites the phantom shared rule.
- `spec/commands/sketch.md:18-24, 63-70` — session authors; past 5 gaps one sequential
  Sonnet dispatch with session mocks as exemplars; exit = coherence readout → expansion pass
  → `check --matrix` → `render-gate --mocks` → ratify.
- `spec/doctrine/core.md` § Model Placement — planning seat holds "genesis position briefs,
  atlas direction rounds, sketch brainstorms"; `fable` → `opus` fallback rule exists.
- `specs/20260810/01-design-path-model-placement.md` D8 — the ruling this brief reverses.
- Memory rulings that bind: atlas stays a habit, no design-coverage anomaly in status
  (2026-08-31); one responsive mock per surface; draft at the most-constrained viewport;
  mock authority inverts at `built`.

## Scope

1. **Shell canon** — `design/shell/<name>.html` per declared shell, one responsive file,
   token-consuming, carrying named slots (`data-slot="nav"`, `"header"`, `"content"`) and no
   feature content; `design/targets.json` viewports apply. Authored in the planning seat: at
   genesis, alongside the signature-screen promotion (`tokens-landed`, visual archetypes only);
   in a repo without genesis state, by the first `/spec:atlas` sweep or `/spec:sketch` run that
   finds no shell, in-session, before any page mock. The shell decision stays a genesis
   DECIDED row; the shell file is its mock-side artifact the way `tokens.css` is the token
   canon's.
2. **Shell-declared mocks, mechanically synced** — every page mock carries `data-shell="<name>"`
   or `data-shell="none"`; the shell region inside the mock is a marked subtree that
   `design-atlas.js shell sync` (re)writes from canon so it is byte-identical everywhere;
   authors write only into the content slot. Mocks stay full self-contained pages so
   render-gate, render-rules, and the atlas consume them unchanged (no composition step in
   the gate path — Open questions hold the alternative). `sync` touches every non-`built`
   mock; `built` surfaces follow mock-authority inversion (stale allowed, re-synced at the
   next design touch).
3. **Shell drift is a check failure** — `design-atlas.js check` gains: missing `data-shell`;
   shell region ≠ canon; nav/header markup outside the shell region in a mock that declares a
   shell; a declared shell name with no canon file. Enforced at the same tiers the existing
   checks are (`ratified`/`approved` or `--matrix`); a `sketch` mock gets the finding as a
   warn so the sweep can land before the shell is final. Atlas status/design-coverage
   anomalies are NOT added (2026-08-31 ruling stands — this is a mock harness check, not a
   coverage trigger).
4. **Code twin** — `rules-locked` authors the `AppShell` base primitive FROM
   `design/shell/app.html` (slots ↔ nav slots + content region); the design-stage worker
   grounding set names the shell mock so surfaces are implemented into the primitive, never
   around it. `base-primitive-containment` already forbids a second shell in code.
5. **Authorship seat (amends 02 D8)** — one shared paragraph, restored in `design.md`
   § Design Atlas (the home D8 mandated), phrased to cover both commands: the session authors
   the journey-central set in-session (up to 5, chosen so every declared journey has at least
   one session-authored exemplar); one sequential `Agent {model: "fable"}` dispatch (Opus
   fallback) authors the rest with those paths as exemplars, never one agent per surface;
   Sonnet for mechanical edits only (copy swaps, reorders, rule-checklist passes). `atlas.md`
   and `sketch.md` replace their local rules and the phantom citation with a pointer. Core
   § Model Placement lists "sketch-tier authorship (atlas sweep, sketch scoped sweep)" among
   the planning-seat duties.
6. **Grounding and visibility** — the sketch grounding set (both commands) adds the picked
   position brief (`design/explore/positions.md` pick, or the genesis design state's recorded
   stance when explore was pruned) ahead of tokens; the sweep/sketch report names the
   position authored under and the author split (`{N} in-session · {M} fable`), so the seat
   is visible in the terminal rather than discovered by asking.
7. **Migration** — a one-time `shell sync --adopt` pass over existing full-page mocks:
   detect the chrome subtree per mock (heuristic, session-confirmed in one table), wrap it as
   the shell region, replace with canon; report residual diffs as the first shell-drift
   findings. Never re-authors content.

## Out of scope

- Real-pixel reference grounding (screenshots of the position's reference direction via the
  Mobbin connector) — parked; see Open questions. A later brief once this one measures
  whether shell + position grounding closes the drift JJ sees.
- Component vocabulary / registry-grounded workers — brief 02 (shipped).
- The unified design → build → review loop — brief 18 (in flight; consumes mocks unchanged
  because mocks stay full pages).
- Render-gate rule semantics, render-rules — brief 08 (shipped).
- Any status/genesis-handoff trigger for atlas coverage — ruled out 2026-08-31.

## Grounding

- ADR-0003 — sketch coherence is a canonical shell, sketch authorship is the planning seat;
  reverses specs/20260810/01 D8. Applies-to lists this brief as 02's successor carrier.
- `spec/doctrine/core.md` § Model Placement (expensive model authors the contract; `fable` →
  `opus` fallback), § Feedback Loop.
- `spec/doctrine/design.md` § Design Canon (mock contract, one responsive mock, harness
  marks), § Base primitives (`AppShell`, containment), § Design Atlas.
- `spec/doctrine/genesis.md` design-state ledger (navigation shell, layout system),
  `--mark tokens-landed`, `--mark rules-locked`.
- `docs/adr/0001-design-authoring-local-first.md` — mocks are local HTML canon; nothing
  here may depend on an external design tool.
- JJ rulings: 2026-08-10 (session authors sketches; parallel per-surface agents drift),
  2026-08-31 (atlas is a habit, no coverage anomaly), 2026-09-01 (this brief's observation;
  Fable preferred over Sonnet wherever taste shows up in the artifact).

## Open questions for planning

- **Sync-in-place vs compose-at-build.** Scope 2 keeps mocks self-contained and syncs the
  shell region in place (gate path unchanged). The alternative — content-only mocks composed
  into `design/atlas/composed/` at build, with render-gate/render-rules resolving the composed
  page — is cleaner for authors but changes `design_source` resolution and the "no
  extraction" rule. Recommended: sync-in-place; revisit if the region marker proves fragile.
- **Shell region identity.** Byte-equality of the region's inner HTML, or a structural
  compare that tolerates whitespace and the active-nav marker? The active-nav state is
  per-page and must survive sync — likely a `data-active="<label>"` attribute the sync
  preserves.
- **Where a second shell is justified.** `app` + `public` covers most products; is a third
  (`print`, `embed`) ever a shell or always `data-shell="none"`?
- **Exemplar cap.** Five in-session with a per-journey floor is the default; measure the
  context cost on a 25-surface greenfield sweep before raising it.
- **Reference pixels (parked).** Whether a position's "reference direction" should carry
  2–3 real screenshots fetched via the Mobbin connector into the grounding set — and where
  they live given ADR-0001's local-only rule.
