# Canonical: doctrine-governance

<!-- Maintained by /spec:review Canonical Delta application. Last delta: specs/20260807/04-claims-registry.md (2026-08-07). -->

## Claims registry (specs/20260807/04-claims-registry.md)

- **Marker grammar** — binding home: `spec/doctrine/shared.md` § Doctrine Authoring. Two
  tokens only: `<!-- enforcedBy: <repo-path>[, <repo-path>…] -->` (every path must exist) and
  `<!-- unenforced: <reason ≥20 chars> -->`. Association is per physical line: trailing on the
  claim's bar-keyword line, or the marker is the entire next non-blank line (binds to the
  nearest preceding non-blank content line). In wrapped sentences the marker must share the
  physical line that carries the bar keyword — trailing a later wrapped line strands it.
- **Claim bar** — a closed pattern list living as data in `spec/scripts/claims-lint.js`:
  `**hard**`, `hard finding` (case-insensitive), uppercase-only `STOP`/`MUST`/`NEVER`/`ALWAYS`.
  Fenced code blocks (including indented fences) and HTML comments are excluded from scanning.
  Extending the list = a script edit with a pinning test, never a prompt clause.
- **Sole derivation** — `spec/scripts/claims-lint.js` (`spec-paths claims-lint`) is the only
  computation of the claims inventory and both ratchets; modes `--check` (exit 0/1/2),
  `--json` (single object: `files`, `totalLines`, `baseline`, `findings`), `--update-baseline`
  (the ONLY writer of the baseline). Never a second derivation of claim state anywhere.
- **Dual-ratchet baseline** — `spec/doctrine/claims-baseline.json` records per-file
  `{lines, orphans}` + corpus total; `--check` fails on ANY mismatch in either direction
  (growth AND shrinkage), naming the remedy `node "$(spec-paths claims-lint)" --update-baseline`.
  Every line-count change in the corpus therefore requires a visible baseline hunk in the same
  diff (pipeline rules § Review Checks carries the mechanical bullet).
- **Orphan reporting semantics** (review-adjudicated 2026-08-07) — when a file's unmarked-claim
  count exceeds baseline, the lint flags every unmarked line but each finding's detail carries
  count context (`file has A unmarked claims; baseline accepts B — surplus S`): the baseline
  stores counts, not line identities, so slicing to "the surplus lines" would blame arbitrary
  lines. The ratchet trigger is the count excess; the finding list is diagnostic.
- **Corpus** — `spec/commands/*.md` + `spec/doctrine/*.md` + `spec/agents/*.md` (D2a).
  Excluded with recorded reasons: `spec/templates/` (host-copied; grounding-contract.md is
  hash-stamped), `git/commands/` (separate plugin/version line), `specs/` and `docs/`
  (artifacts, not doctrine).
- **Migration rule** — touched-file-only, never a sweep. Seed state: `spec/commands/review.md`
  converted 2026-08-07 (zero orphans); all other files baselined at their pre-conversion
  orphan counts, converted at touch-time.
- **Teeth** — `tests/claims/*.test.js` runs `--check` against the live corpus in `npm test`
  (gates every version bump); `/spec:doctor` check 18 runs `--json` on demand
  (recommendations only, never edits).
