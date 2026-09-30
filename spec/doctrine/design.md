---
description: Mock-app doctrine for /spec:mocks and genesis — Design Canon and Authoring Contracts
---

# Spec Pipeline: Design Doctrine

## Design Canon (the mock app is the one artifact)

`/spec:mocks` authors the mock app on a host whose config declares a `design` block —
`{ "app": "<dir holding mock.config.ts, relative to the repo root>" }` — and genesis ratifies it
at `BRIEF`. There is no second artifact: the mock app **is** the product's frontend, never a
catalog a later stage renders against separately.

The wireframe's approval record (`design/approval.json`) is read by genesis exactly once more,
at `DESIGN_BRIEF` (spec/doctrine/genesis.md § Genesis: Design Stage); the design contract that
follows — the intent-to-pattern and naming tables, checked by `design-contract-check.js` — is
code, never a second hand-kept copy of what the mock app already showed.

**Import layers and doc lines** follow mocks.md § Mocks: Authoring Rules —
`@/components/ui`, `src/records`, `examples` exports; `mock-review check` flags a break.

**Screens carry `meta` and named states.** A screen's `meta` export names its states; each
state renders exactly what the seed or the journey's step demands — no unbound branch, no
paraphrase.

**`design/approval.json` is the canon, one writer.** `mock-review approve --screen <name>` is
the only writer — run by the session on the user's literal `approve` reply at a look stop, never
a served-page control (the page carries no screen-approve surface). `approval.screens[<label>]`
carries `approvedAt` and a `hash`; a named screen is **approved** once `approvedAt` is set and
its `hash` equals `check --json`'s current `hash` for that screen — **stale** the moment the
hash differs (an edit after approval, never silently re-bound).

**The design contract is code, twice over.** Once the design stage lands a kit (genesis.md
§ Genesis: Design Stage), a composite's own state stories are the living showcase of the
intent-to-pattern table — gated by brief 27's `kit-discipline`, never a hand-kept screenshot doc.
A journey story is a genesis artifact, not a mock-app one: it walks the seed's beats against the
real kit and router, once the mock app's wireframe has already done its job. JJ approves the
designed set of journey stories directly in Storybook (genesis.md § Genesis: Design Stage) — there
is no client gate on this approval, and journey stories are frozen at that approval and never
gated again afterward.

**Look stops are never questions.** Every look this doctrine governs prints `🎨 ready for
review — <check.serve.url>/#/<screen>`, one line per surface, then the fixed reply line, then
**ends the turn**; only the literal `approve` accepts. The reviewer page (the mock app's own
served UI) is the one viewer; a session never screenshots a screen to judge it in this
doctrine's place.

**A prototype is a branch of the product, not a second artifact.** `/spec:prototype <brief>`
runs a functional prototype on `proto/<stem>`, built on top of the real kit and records — a
behaviour-lane brief's product, not a wireframe. Its rounds, pins and declared states live under
`design/prototypes/<stem>/` in the main working tree, never on the prototype branch itself:
nothing on `proto/*` is read once the branch closes, so any file the freeze or a later build must
still read has to already be on main before that happens (specs/20260928/01-the-prototype-
command-and-the-pin-overlay.md D2/D6, ADR-0030 h).

## Design Authoring Contracts

Authored against § Design Canon above, consumed by `/spec:mocks`'s own review step and
genesis's design ratification (genesis.md § Genesis: Brief State).

**Grounded vs taste (mock supremacy).** Each ruling is tagged `grounded` (external anchor —
contrast/a11y, legal/brand, destructive-action safety) or `taste` (aesthetic), authored into the
rule itself, not judged per conflict; an untagged legacy ruling defaults to `taste` unless it
names an anchor. With an approved screen as canon, `taste` yields silently; `grounded` binds the
value, not the intent — snap to what the constraint permits, honor the screen's intent
otherwise; a screen's omission is never evidence against it. With no approved screen, doctrine
is canon; a contradicting note is a fork — local exception or doctrine change, never a silent
override.

**Base primitives.** Overlay shells (Sheet/Dialog/Popover/Drawer), the **AppShell**, and the
**Toast host** are **system foundation** — authored once behind a barrel, never re-implemented
per screen, never improvised. A screen needing an absent primitive surfaces the nearest
primitive and its coverage (author as foundation / reuse), default-authoring when no near-match
exists.

## Workflows Encode Shape, Not Judgment

The plugin's `wf-build.js`, `wf-review.js`, `wf-enforce.js` (and genesis `wf-research.js`) own
ordering, schemas, retry caps, kill rules — deterministic control flow; judgment stays in the
main loop. Screen authoring — `/spec:mocks` — is direct, in-session dispatch, never a workflow:
no `Agent` dispatch ever writes a screen (subagents run judgment-free checks only), and taste
(fork adjudication, iteration rulings, visual review) never enters one. Never prompt-engineer
findings into existence — an empty findings list is a valid outcome. **No free text in `args`:**
a workflow's `args` is a control channel — paths, ids, enums, booleans, the host gate command
only; prose lives on disk, Read there.

**On-disk handoff** (core § On-Disk Handoff, unchanged here): every cross-stage handoff is a
file, never conversation context — the spec for the per-feature pipeline, genesis's own
artifact spine otherwise; scratch intermediates go to the session scratchpad, never `specs/`.
