---
description: Compile paste-ready Claude Design prompts from a spec — new-surface briefs for screens with no mock, and fix-at-source prompts for recorded drift between the bound mock and what actually shipped
argument-hint: <spec path> [surface name …] [--drift]
---

# Spec Design Brief: spec → Claude Design prompt

The courier for the **Claude Design escape hatch** (shared § Design Stage). The main path
authors mocks locally — `/spec:design`'s mock-authoring preamble needs no prompt courier because
the harness reads the spec directly. When a surface IS being designed externally in Claude
Design (`claude.ai/design`), this command compiles the spec's intent into the prompt the user
pastes there. Two modes, both producing **paste-ready prompt text** for a Claude Design session:

- **Brief mode** (default) — the spec needs a screen or component that has no mock: emit one
  brief per missing surface, carrying the spec's binding intent.
- **Drift mode** (`--drift`, or auto-appended when drift rows exist) — the bound mock has drifted
  from what actually shipped (sanctioned deltas, fork rulings, iteration-round changes folded
  into spec Decisions at reconcile): emit fix-at-source prompts so the mock is re-aligned in
  Claude Design instead of rotting as stale canon.

**Intended model: the session model — no expensive seat required.** The brief never *invents*
design intent: it selects, quotes, and compresses what the spec, doctrine, and Decisions already
record. Taste is spent on the other side of the paste, by Claude Design — this command is
the courier for that escape-hatch seat, not a competitor to it. A BINDING line with no spec/doctrine anchor
is a new design decision and belongs in `/spec:plan`, not here.

**Setup:** run `spec-paths shared-for design-brief` and read its output. Read the host's
`.claude/spec.config.json` `design` block if present (doctrine + token paths, catalog); read the
spec; read `.claude/design-coverage.json` if present. No workflow, no driver, no DesignSync
mutation — this command writes prompt text, never canvas files. (It MAY load `DesignSync` for a
read-only `get_file` in drift mode to quote the mock's current state precisely; never required.)

## Input

`$ARGUMENTS` — path to a spec (hook allows `status: hardened`, `implementing`, or `done`), plus
optionally: surface names to restrict the brief to, and/or `--drift` to emit only fix-at-source
prompts. `design: false` or no UI section → STOP ("nothing to brief — this spec declares no UI").

Mode resolution: `--drift` → drift mode only (requires a `design_source`). Otherwise brief mode
for every UI surface **not already covered by a mock** — a surface counts as covered when the
spec's `design_source` exists and the coverage ledger (or the spec's own reconciled UI section)
claims its regions. If drift rows exist (below), append the drift section to the same output
either way: noticing recorded drift is not optional.

## Brief mode — one prompt per missing surface

1. **Ground.** From the spec: Goal/Rationale (the job and the user), the UI section (surfaces,
   states, component inventory), Decisions, ACs touching the UI. From the repo: the design
   doctrine doc and token files (**role names only — never values**), the component catalog
   inventory (names), and the coverage ledger (regions other specs already claimed on any source
   — those are context to honor, not surfaces to redesign).
2. **Author each brief** in this shape — intent-dense, short; the reader is Fable 5, which needs
   constraints, not prescriptions:
   - **Intent** — 2–4 sentences: the user, the job, the moment this screen serves. From
     Goal/Rationale, not paraphrased fresh.
   - **BINDING** — the contract lines, each traceable to a spec clause: exact copy the spec
     fixes (verbatim, quoted), required states (empty/loading/error/success/etc.), the data
     fields shown with one realistic sample value each, flows and interactions the spec commits
     to, a11y and platform/breakpoint obligations. These survive `/spec:design`'s fidelity gate
     later — anything binding that the brief omits becomes reconciliation work downstream.
   - **Vocabulary** — if `/design-sync` has seeded the Claude Design project, name the synced
     tokens/components BY NAME and say "use the synced design system"; otherwise give the
     doctrine's voice in a few adjectives plus token *role* names. Never a hex, a px, or a
     restated token value — fidelity by construction is `/design-sync`'s job (shared § "Seed
     Claude Design upstream"), not the prompt's.
   - **Open canvas** — explicitly list what is the designer's choice: layout, hierarchy, visual
     treatment, motion — everything not in BINDING. Silence reads as constraint; say it's open.
   - **Coordination footer** — instruct the file name (`<Surface>.dc.html`) and
     `data-screen-label` region labels **matching the spec's surface/region names**, so
     `dc-extract`'s region graph lines up with the `regionRef`s this spec will bind; name any
     regions already claimed by other specs (coverage ledger) as *do not redesign* context.
3. **Deliver.** Write all briefs to `<spec path minus .md>.briefs.md` (plain sidecar file — no
   frontmatter mutation, no status change, freely re-runnable) AND print each prompt in its own
   fenced block for direct pasting. If the repo has never been seeded, recommend `/design-sync`
   once before pasting. Close with the round-trip: paste → iterate in Claude Design → pass the
   resulting URL to `/spec:design <spec> <url>` (or record it as `design_source:` frontmatter).

## Drift mode — fix-at-source prompts

1. **Collect the recorded drift** for the spec's `design_source` — recorded only, never inferred
   by re-reading code: spec Decisions rows carrying delta evidence (target + sliceQuote + proof,
   folded from `deltas.json` at reconcile), token forks / local exceptions recorded in Decisions,
   and iteration-round rulings the reconcile folded in. No rows → say so and stop the mode; an
   *unrecorded* suspicion of drift is a `/spec:escape` or a code-vs-mock question for
   `/spec:design`, not brief material.
2. **Emit one prompt per drifted mock file**, grouping rows by screen and region
   (`data-screen-label`): quote what the mock currently shows (the sliceQuote; optionally
   re-verified via read-only `get_file`), state what shipped instead and *why* (the proof or
   ruling — the reason is what lets the designer re-solve it well), and instruct the change at
   intent level. Exception to the no-literal rule: when the drift IS a literal — copy, a data
   field, a state added or dropped — give the exact new value; copy is a binding contract, not a
   pixel instruction.
3. **Close the loop.** Note that after the user applies fixes in Claude Design, the revised file
   is re-importable with `?file=<name>` targeting (`/spec:import-design`'s revised-screen rule)
   or becomes the aligned canon for the next spec that binds this source; region labels must not
   be renamed, or the coverage ledger's `regionRef`s dangle.

## Rules

- **State-free:** writes only the `.briefs.md` sidecar; never frontmatter, `status`, the
  coverage ledger, or any canvas file. Re-running overwrites the sidecar — it is generated
  output, not a record.
- **Every BINDING line is traceable** to a spec clause, a Decisions row, or the doctrine. An
  untraceable constraint is invented design intent — route it to `/spec:plan`.
- **Intent and constraints, not pixels:** no hex values, px/spacing numbers, or layout
  prescriptions in any prompt; token roles and component names only. The one exception is drift
  mode's literal-drift rule above.
- **Claude Design stays read-only** (shared § "Claude Design as a source"): `get_file` at most,
  in drift mode, to quote current state — never `write_files` / `finalize_plan` / any mutating
  method. The paste is the only write path into Claude Design, and the user owns it.
- Prompts are **self-contained**: the Claude Design session sees nothing but the pasted text —
  never reference "the spec", repo paths, or this session as if the reader could open them.
- `AskUserQuestion` dismissed → STOP (re-invoke to continue; nothing is half-written).
