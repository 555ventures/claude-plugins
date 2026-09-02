# 21 — Comment hygiene: owner citations, never history

Phase: P2 · Depends on: — · Primary workspaces: spec/scripts, tests, spec/commands,
spec/doctrine, .claude/rules, .claude/agents, spec/scripts/init-gen.js ·
Risk: T2 (a ~3,000-line comment/prose sweep is only safe because a code-identical oracle
proves no executable line moved) · Design stage: no · Expected specs: 3

## Result

One rule, stated once: a comment or rule note cites an owner id in one line — spec path,
AC-ID, D-number, ADR, run id, pin id — and never narrates dates, people, hosts, versions, or
prior behavior. A deterministic gate (`comment-narration.js`, registered as a standing
`node --test` test) makes the rule un-violable in this repo; the plugin's scripts, tests,
commands, doctrine, agents and rules are swept to zero findings with the baseline file
deleted; the host generators (init, enforce, review CLOSE, escape, doctor) stop planting the
habit in host rules layers, and doctor trims it where it already exists. Provenance lives
where it already lived: git, specs, ledgers, ADRs.

## Current state

Five audits found ~3,000 lines of history narration across the plugin: dated rulings,
incident stories, "previously / no longer / retired", named hosts, version changelogs, and
the same fact restated several times per file. Worst offenders are the verdict, replay and
AC-matrix scripts and the review/genesis test suites; four comments describe deleted code.
Host repos' generated rules layers carry the same habit in Gotchas entries and
`enforcement.json` notes.

The root cause is a convention, not a person: the scripts/tests conventions (and their two
copies in the rules file and the gate-scripts agent) mandate "why (dated incident)" in every
header. That rule was init-generated from observed habit, never decided, never enforced, and
every build worker since has appended to headers rather than replaced them. Current
agent-guidance practice says the opposite: every loaded line costs context; provenance
belongs in git/ADRs/specs; comments state the current invariant plus a pointer.

Reusable shape already exists: `prose-cap.js` (flags, ratchet baseline, exit codes), the
whole-line comment discriminator in the host-config tests, the AC-ID and run-id regexes in
`ac-matrix.js` and the review driver, and `tests/helpers.js` fixtures.

## Scope

Order is binding: the gate lands first so the mess cannot regrow during the sweep.

1. **Gate + convention rewrite** — new `spec/scripts/comment-narration.js` (scan with
   ratchet baseline; `--code-identical <git-base>` oracle proving only comment/blank lines
   changed; `--rules-mode <hostRoot>` for doctor), registered via `spec-paths`,
   `entrypoints.json`, and a standing test that scans the live tree against a tracked
   baseline. The four convention homes (scripts.md, tests.md, spec-pipeline.md,
   gate-scripts.md) move together and shrink to "usage · one owner citation · does-NOT-do ·
   Exit codes; never dates, names, hosts, versions, prior behavior". Admitted under core
   § Incident Policy's five tests (portability, generality, materiality, falsifiability,
   removability).
2. **Plugin sweep to zero** — mechanical, driven by the gate's own finding list; per-file
   header collapse, restated-fact deletion, the four stale comments fixed, cross-file
   duplicates reduced to one home with citations, ~40 narrated doctrine/prose lines
   rewritten. Acceptance is the gate at zero with the baseline file deleted, plus
   `--code-identical` reporting every js/sh file in scope identical to the pre-sweep base.
3. **Stop planting it in hosts + host refresh** — init's Gotchas grammar, init's
   conventionRules bar, enforce's `notes` (report-only, pointer-only if persisted), review
   CLOSE and escape Gotchas drafts all adopt "tag + rule + one citation"; the grounding
   contract picks up the spec-2 wording change and is re-hashed; doctor gains a numbered
   "Rules-layer narration" check whose findings are line-item `--fix` patches. Host refresh
   is JJ-run per host after merge.

## Out of scope

- `specs/`, `docs/`, ledgers, README, CHANGELOG, `plugin.json` description, and memory —
  these are the records that history belongs in; never scanned.
- Trailing `//` comments and `/* */` block comments — the discriminator is whole-line only;
  a documented non-goal of the gate.
- Host repos' source code — measured clean; only their generated rules layers are in scope,
  and only through doctor.
- Any new doctrine paragraph explaining the rule — the convention shrinks; the gate is the
  explanation.

## Grounding

- `spec/doctrine/core.md` § Incident Policy — standing guards are deterministic scripts
  earned by recurrence; the gate's admission argument is written against its five tests.
- `spec/doctrine/core.md` § Doctrine Authoring — dedupe at touch-time; the sweep is the
  touch.
- `docs/canonical/gate-integrity.md` "Guards ban the name, not the shape" — the ban list
  targets narration classes, not specific sentences.
- `.claude/rules/conventions/doctrine.md` — grounding-contract edits are contract changes
  and re-hash; `spec-paths` keys for every script a command names; semver bump per behavior
  change.
- `.claude/rules/spec-pipeline.md` "New-surface checklist" — doctor's new check and the
  script registration must satisfy it.

## Open questions for planning

- Ban-list calibration: the prose-scope list allows `incident` (core § Incident Policy is a
  contract) but bans `previously / no longer / used to`; the plan session should run the
  scanner over the live tree and confirm the false-positive rate on doctrine before
  locking the lists.
- Whether `enforcement.json` `notes` is persisted anywhere today (enforce.md says
  report-only); if it is, spec 3 must decide pointer-only vs. drop.
- Baseline granularity: per-file counts (planned) vs. per-line hashes — per-file is
  simpler and ratchets monotonically; confirm it survives a file rename mid-sweep.
