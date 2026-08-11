# 04 — Review advisory smell lens: duplicate helpers + error masking

Phase: P2
Depends on: none

## Why this brief

2026-08-10 research session (four-agent fan-out over 2025–26 field practice): the two
dominant AI-signature code smells are (1) **duplication** — GitClear measures copy-paste now
~5× more common than refactoring, 8× duplicated blocks — and (2) **error masking** — 47%
growth in silent catch/fallback blocks that convert shape bugs into wrong-but-green behavior.
Both are structurally invisible to this pipeline: every check is spec-scoped (one diff, one
spec), and batch-scoped build workers literally cannot see that a helper they are writing
already exists two specs away. The reviewer is the first eye positioned to catch either, but
today it is forbidden from taste opinions and its duplication calibration only fires on three
near-identical blocks *inside one diff* (pipeline rules § Review Checks).

The companion continuous layer (ratchet-mode `duplication`/`cycle` enforcers,
specs/20260810/06) catches mechanical clone blocks in the gate. This brief covers the
judgment residue the gate cannot: *semantic* duplicates (a new `formatDate` when
`renderTimestamp` exists — different tokens, same job) and error-masking patterns that a
linter cannot distinguish from legitimate defensive code.

## Scope

- **Advisory lens in wf-review.** The review workflow gains one additional finding source
  scoped to two classes only: (a) a diff symbol whose responsibility an existing repo symbol
  already covers (cite both locations); (b) a catch/fallback/default that masks a shape or
  contract bug instead of surfacing it — extending the existing "defensive fallbacks" medium
  check with cross-file reach. Findings are **advisory**: they never gate CLEAN, never enter
  the verifier kill loop, and render in their own labeled section of the review report.
- **Durable capture.** Advisory findings that the session (user) accepts get a durable row —
  home and shape decided at plan time; the natural sink is brief 05's disposition ledger, and
  until 05 lands an interim home (e.g. a dated section the audit later ingests) is
  acceptable. An advisory finding with no accepted row simply expires with the review.
- **Reviewer doctrine carve-out.** `spec/agents/reviewer.md` and pipeline-rules § Review
  Checks language adjusted so the two classes are sanctioned lens output, not forbidden
  "taste" — without reopening scope/over-engineering opinions generally.

## Grounding

- `spec/workflows/src/wf-review.body.js` + fragments — where finding sources and the verify
  loop live; the lens must bypass the kill loop by construction, not by prompt.
- `spec/agents/reviewer.md` — the taste prohibition and the existing defensive-fallback
  medium check this extends.
- `.claude/rules/spec-pipeline.md` § Review Checks — the in-diff duplication calibration
  (three near-identical blocks) this generalizes across files.
- specs/20260810/06-ratchet-enforcers.md — the deterministic layer; the lens covers only what
  that gate cannot (semantic duplication, judgment-residue error masking).
- 2026-08-10 research session rulings: advisory-never-gating; duplication + error masking as
  the two sanctioned classes.

## Out of scope

- Gating CLEAN on any lens finding, or sending lens findings through adversarial
  verification — advisory by construction.
- General architecture/taste review (layering opinions, naming aesthetics, scope judgments) —
  the reviewer's prohibition stands for everything outside the two named classes.
- Mechanical clone detection — owned by the ratchet enforcer layer (specs/20260810/06).
- Whole-repo sweeps — owned by brief 05; the lens sees only the review's diff plus targeted
  cross-file lookups.

## Open questions

- Interim durable home for accepted advisory findings before brief 05's ledger exists.
- Whether the lens runs as an extra prompt duty of the existing reviewer panel or as one
  dedicated cheap agent per review (cost vs recall — measure on ledger evidence).
