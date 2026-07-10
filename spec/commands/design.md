---
description: Optional UI design stage, driver-stepped — the expensive model authors skeletons and judges; Sonnet expands them via wf-design; the user iterates in the catalog; spec reconciled to the approved design
argument-hint: <spec path> [claude.ai/design URL | local mockup file/dir]
---

# Spec Design: Driver-Stepped Plan + Implement + Catalog Iteration

For UI-bearing specs (`design: true`) in hosts whose config declares a `design` block (component
catalog — shared § Design Stage). Sits between `/spec:plan` and `/spec:build`: authors the
foundation + real, **kept** stateless components + catalog entries by **expanding pre-authored
skeletons**, lets the user iterate in the running catalog, then reconciles the spec and sets
`designed: YYYY-MM-DD`. Build treats these components as done inputs.

**Intended model: Fable or Opus** (Opus is the cost-rational default — the taste seat is the
skeleton-authoring step, not the whole session). Model split: the expensive model authors
`skeletons.json`, adjudicates forks, runs the visual review and iteration rulings — and **writes
no framework code**; Sonnet expands 100% of components via `wf-design`.

**Setup:** run `spec-paths shared-for design` and read its output (the shared invariants scoped
to this command). Read the host's `.claude/spec.config.json` and its pipeline rules file. Then
run `spec-paths design-driver` once and keep the printed path — it is `{driver}` below.

## Input

`$ARGUMENTS` — path to a spec with `status: hardened` (hook-enforced), plus an optional second
arg: a **design source** — either a `claude.ai/design` mockup URL, or a **local path** (a single
exported HTML file, or a handoff-bundle directory of HTML screens + optional per-screen
`*.prompt.md` notes). On the first invocation, if a source is passed and frontmatter has no
`design_source`, persist it into frontmatter, then proceed — thereafter frontmatter is
authoritative. No `design_source` anywhere → the mockup path never engages (byte-for-byte the
no-mockup flow). A local source is extracted directly by `dc-extract --bundle` (no DesignSync
fetch); a URL is fetched read-only via DesignSync as before.

## Protocol — the driver owns the state machine

Loop until the driver prints `DONE`:

1. Run `node {driver} <spec path>`. It inspects the on-disk state (frontmatter, the
   `##-name.design/` sidecar, progress marks) and prints the **current step's instructions** —
   fetch/extract, skeleton authoring, the `wf-design` invocation, visual review, the human
   iteration loop, reconcile.
2. Execute exactly that step. Record progress the way the step says
   (`node {driver} <spec> --mark <mark>` after a step completes green).
3. Re-run the driver. It verifies the step's artifacts actually exist before advancing — never
   skip ahead of it, and never re-do a step it reports complete.

Re-entrancy is the driver's job: a fresh session (or a session resuming days later) runs step 1
and lands exactly where the work stopped. All state is on disk; nothing depends on this
conversation. The iteration loop is deliberately **cold between rounds** — the sidecar's
`design-log.md` carries each round's rulings, so no expensive session idles while the user looks
at the catalog.

## Rules (session-binding — the driver cannot enforce these)

- **The expensive model writes no framework code.** It authors `skeletons.json`, adjudicates
  forks, issues visual-review notes and iteration rulings; Sonnet/Haiku apply every edit (sole
  exception: the driver's micro-edit rule for one-line exact-string changes).
- **Gate-green ≠ visually right.** A green author is structural (skeleton-expanded) only; the
  screenshot review (when configured) or the human catalog loop is the visual gate. Never show
  the user output you have not at least gated.
- **With a mock bound, the mock is a contract, not an influence.** The slice files are the binding
  authority for structure, copy, element order, and layout; skeletons carry judgment only (a
  binding map: token mapping, props, states, forks — no tree). The driver greps the authored code
  against the mock's extracted strings/order/layout **fail-closed** at `author-green` and
  `round-green`; a refused mark lists the divergences. The ONLY sanctioned divergence is an
  evidence-gated `deltas.json` row (verbatim slice quote, verified mechanically, plus an
  impossibility proof) — a taste rationale is never valid evidence; taste yields to the mock
  (shared § mock supremacy). Fold delta rows into spec Decisions at reconcile.
- Tokens and the design doctrine are **binding canon** — extending is normal, contradicting is a
  fork, adjudicated via the driver's steps, never silently overridden.
- Components built here are **real and kept**; `/spec:build` wires them, never rebuilds them.
- Design changes propagate **forward into the spec at reconcile** — never left for build to discover.
- Workers never run git; the session owns every checkpoint-commit.
- **Never Read `wf-design.js`** — the AUTHOR step prints the full `args` contract; the workflow
  is invoked by `scriptPath` and its source is never session context.
- `AskUserQuestion` dismissed → STOP (state is safely on disk; re-invoke to continue).
