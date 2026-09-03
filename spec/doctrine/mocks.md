---
description: Mocks-stage supplement to the spec pipeline's shared invariants — the provenance ledger grammar and gate, read by the mocks driver and question-style-gate.js, not a workflow entry point
---

# Spec Pipeline: Mocks-Stage Supplement

Mocks-stage supplement — read by the mocks driver (spec 07) in addition to `core.md`.

## Provenance Ledger

The ledger is one markdown file, `design/mocks/ledger.md`, two tables in fixed columns,
parsed and written by `spec/scripts/lib/mocks-ledger.js` (`parseLedger`, `gateVerdict`,
`countsLine`, `appendAssumption`, `appendCatch`, `setStatus`) — that library is the **one
writer**: a session (or a script outside it) hand-typing a row is the class that put malformed
rows into the escape ledger, and every row it writes leaves every other byte in the file
identical.

**Assumptions** table — `id · step · kind · claim · tag · status · rejected · dependents ·
note`:

- `id` — `^[A-Z]+\d+[a-z]?$`, unique across the table.
- `step` — `^[A-Z][A-Z-]*$` (`SEED`, `SHAPES`, `WIREFRAMES`, `THEME`, `SKIN`, `REVIEW`,
  `GENESIS`, …).
- `kind` — one fixed word: `product` or `process`.
- `claim` — free text; the assumption itself.
- `tag` — one fixed word: `said-by-user`, `ratified-doc`, `inferred`, or `invented`.
- `status` — one fixed word `open | confirmed | overridden | decided`, with an optional
  trailing ISO date (`confirmed YYYY-MM-DD`); `decided` is process-only — a `decided`
  `product` row does not parse.
- `rejected`, `dependents`, `note` — free text; `-` means empty.

**Misunderstandings** table — `id · what · step · cost · note`: `id` is `^M\d+$`, unique;
`note` names an originating note id or `-`.

Free text lives only in `claim`, `rejected`, and `note`. A literal pipe inside any cell is
written escaped (`\|`) and read back unescaped — every other cell is one fixed word, never
prose, so a script can gate on it without parsing English.

**Gate rule.** A ledger is **blocked** when any `product` row carries tag `invented` with
status other than `overridden`, or tag `inferred` with status `open`. `ratified-doc` rows and
every `process` row never block — a fact the user ratified as prose stays counted separately
and is re-tested on the screen that renders it, never re-asked as a question. A ledger that
fails to parse never opens a gate (parse errors are reported, not silently passed).

**Counts line.** Every mark prints one fixed line:

```
📒 ledger: {S} said-by-user · {R} ratified-doc · {I} inferred ({Io} open) · {V} invented ({Vo} open) · {P} process · {C} catches
```

counting product rows per tag, every process row in one bucket, and misunderstanding rows as
catches. The shape is fixed so a reader learns it once — change it only under the spec that
owns it.

## Product-Stage Exemption (question-style-gate.js)

While a mocks run is live (`design/mocks/status.json` exists with `state` other than
`APPROVED`) or a genesis run is live (`.claude/genesis/status.json` exists with `handoff`
null), the question-style gate's tier-2 judge cannot return `derive` — that verdict is treated
as `pass` instead. Every question inside those windows is a user decision by construction
(coverage keys, menu picks, product facts), so `derive` has no legitimate target there;
`rewrite` verdicts and every tier-1 check are unchanged. The judge's prompt states the rule
that makes this exemption necessary: a document that cites, discusses, or recommends a
subject is never the user deciding it, and a product fact (who, what, platform, payer,
tenancy, what a screen does) is never `"derive"` — ask it. The exemption reads both status
files on every hook invocation and fails open toward the pre-exemption behavior — a missing or
unparsable status file counts as absent, never as a reason to block.
