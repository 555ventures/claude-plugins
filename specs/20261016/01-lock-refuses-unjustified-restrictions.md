---
date: 2026-10-16
status: hardened
tier: standard
area: plan-lock
breaking: false
depends_on: []
brief: n/a
open_markers: 0
---

# Lock refuses unjustified restrictions and untracked deferrals

## Goal

A spec's Decisions table can withhold an affordance from a product's users ("cannot edit",
"write-once", "only a Manager may archive", "requires a reason") without naming the failure the
restriction prevents, and can defer work ("in a later spec", "not offered now") into a cell no
queue ever reads. Both lock green today because a refusal is the cheapest Decision to write.
After this spec, `/spec:plan`'s lock runs one deterministic script, `decision-lint.js`, that
refuses to lock a restrictive row unless it carries `[guards: <text found in the host's rules
§ Risk Tiers>]` or `[asked: <what the user chose>]`, and refuses a deferral row unless it cites
a queue id that `spec-queue show` resolves. Done means: the script exists with the two checks,
its exit codes and findings are pinned by tests against fixture specs, the lock step invokes it,
and the plan ledger row records its counts.

## Decisions (locked — workers apply verbatim, never override)

<!-- Carrier contract (specs/20260817/07-promise-sweep-leg.md D8; enforced by promise-sweep.js
     at plan lock and in every review): every row cites ≥1 of this spec's own AC-IDs — the AC
     whose test goes red if the decision is unimplemented — or carries `[no-ac: <reason>]` for
     a row with no testable surface. An empty reason ([no-ac: ]) does not count as a sanction. -->

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | New script `spec/scripts/decision-lint.js --spec <path> --root <dir> [--json]`: reads the spec's `## Decisions` section through `lib/spec-sections.js`'s `extractSection`, enumerates live rows with promise-sweep.js's row regex (`^\|\s*(~~)?\s*D\d+`), skips struck rows, and runs the two checks of D2 and D3. Exit 0 = no findings; 1 = findings emitted; 2 = usage error, unreadable spec, no Decisions section, or unreadable host rules. (AC-20261016-01-1, AC-20261016-01-8, AC-20261016-01-9) | One script, same shape as promise-sweep.js, so the lock step gains one invocation line and no new mechanism. |
| D2 | **Restriction check.** A live row whose text matches the restrictive vocabulary (Contracts, `RESTRICT_RE`) is a finding `unjustified-restriction` unless it carries `[guards: <text>]` where `<text>` is a non-empty, case-insensitive substring of the host's pipeline rules file's `## Risk Tiers` section, or `[asked: <non-empty text>]`. A `[guards: <text>]` whose text is not found in § Risk Tiers is a finding `guard-not-in-risk-tiers`. An empty tag (`[asked: ]`, `[guards: ]`) is no sanction. (AC-20261016-01-1, AC-20261016-01-2, AC-20261016-01-3, AC-20261016-01-4) | The host's § Risk Tiers already lists the surfaces where restriction is the norm; tying `[guards:]` to it makes the product posture a host fact the script reads, not a closed enum the plugin invents. Rejected: a failure-class enum (money, message, legal…) in the plugin — it names product concepts no plugin file should own. |
| D3 | **Deferral check.** A live row whose text matches the deferral vocabulary (Contracts, `DEFER_RE`) is a finding `untracked-deferral` unless it cites at least one queue id `q\d+`; each cited id is resolved by spawning `node "$(spec-paths spec-queue)" show <id>` with `cwd = --root` — exit 0 = resolved (live or archived-done), any other exit = finding `dead-queue-id` naming the id and the exit code. (AC-20261016-01-5, AC-20261016-01-6) | spec-queue.js is the queue's sole reader/writer (core § Console Output Style, "deferred work is queued… never prose"); the lint spawns it rather than re-deriving the file's location or doneness. Rejected: reading `spec-queue.json` directly — a second derivation of the git-common-dir idiom. |
| D4 | **Applicability cutoff.** `lib/spec-sections.js` exports `DECISION_LINT_APPLIES_FROM = '20261016'`; a `--spec` path whose first `specs/<YYYYMMDD>/` segment is earlier exits 0 and prints `decision-lint: not-applicable spec=<date> appliesFrom=20261016`; a path with no such segment runs the lint in full. (AC-20261016-01-7) | Same convention as promise-sweep.js's `V7_APPLIES_FROM`: 246 existing specs would otherwise produce 37 restriction and 10 deferral findings (micro-spike, A1) and train bulk-waiving, the measured route to escape rv_8b7c4e2e9ec0. |
| D5 | **Output.** Plain stdout: one line `decision-lint: restrictions=<R> deferrals=<F> findings=<N>` where R and F count matched live rows (justified or not) and N counts findings; findings print to stdout one per line as `  <class> <Dn>: <detail>`. `--json` prints `{"findings":[{severity:"hard",class,id,detail}],"counts":{"restrictions":R,"deferrals":F}}`. No manifest append, no report rendering. (AC-20261016-01-9) | R and F are the removability numbers (Rationale): the plan ledger row copies them, so "zero lock-time matches over the last 20 plan rows" is a ledger query. |
| D6 | `spec/bin/spec-paths` gains the key `decision-lint` → `scripts/decision-lint.js`, listed in the usage string. (AC-20261016-01-10) | Every bundled script resolves through spec-paths; a missing key breaks the lock line silently (host rules § Risk Tiers, spec-paths). |
| D7 | `spec/commands/plan.md` Lock step 2 adds, after the promise-sweep sentence: run `node "$(spec-paths decision-lint)" --spec {spec path} --root .` and resolve every finding by tagging the row (`[guards: <§ Risk Tiers text>]` or `[asked: <what the user chose>]` for a restriction; a `q<id>` from `spec-queue add` for a deferral) — zero findings to lock. Step 3's ledger row gains `"decisionLint":{"restrictions":R,"deferrals":F}` copied from the script's stdout counts. [no-ac: command prose; the behaviour it invokes is pinned by AC-20261016-01-1…9] | A lock check that the lock step never runs is decoration; the ledger field is the only way the removability question (Rationale) gets a count. |
| D8 | `spec/templates/spec.md`'s Decisions carrier comment gains two sentences: a row that withholds an affordance from a user (cannot edit/delete/undo/restore, write-once, immutable, `only a <Role> may`, requires a reason) carries `[guards: <text from the host rules § Risk Tiers>]` or `[asked: <what the user chose>]`; a row that defers work carries the queue id from `spec-queue add`. Enforced by `decision-lint.js` at plan lock. [no-ac: template prose; the markers' semantics are pinned by AC-20261016-01-2…6] | Planners write from the template, not from doctrine; one comment line is the whole discoverability surface. No doctrine prose is added anywhere (core § Doctrine Authoring). |
| D9 | No review leg, no reviewer or disposer change, no host config key, no grounding-contract edit. [no-ac: an absence; the File Plan lists no such file] | The reviewer checks conformance to the spec (agents/reviewer.md); a wrong spec is caught at lock, where it is cheapest. Research 2026-10-16: every published spec gate is structural, so the check's home at authoring time is the field's own seam. |
| D10 | Plugin version: `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` run by the build orchestrator at the version-bump row. [no-ac: version discipline; `plugin-bump --check` in the gate (tests/consistency/plugin-bump.test.js) is the oracle] | Host rules § Planning, version bump discipline. |
| D12 | `spec/entrypoints.json` gains the row `"spec/scripts/decision-lint.js": {"entryPoints": ["spec/commands/plan.md"]}`. [no-ac: exhaustive live-file pin; tests/consistency/entrypoints.test.js reddens on the orphan until the row lands] | A shipped script with zero declared callers is the orphan class that test exists to catch; one caller, the lock step. |
| D11 | `tests/decision-lint.test.js` builds every fixture in a tmp git repo (`helpers.gitRepo`) with a `.claude/spec.config.json` pointing `pipelineRules` at a rules file whose `## Risk Tiers` section names `Money/rates` and `Telegram send paths`, and seeds `<git-common-dir>/spec-queue.json` with one live item `q7`; each AC's spec fixture is written inline by the test, never a committed fixture file. (AC-20261016-01-1…9) | spec-queue.js exits 3 outside a git repo, so a tmpdir alone cannot host the deferral check; inline fixtures keep the vocabulary under test visible next to the assertion. |

## File Plan

<!-- Machine-consumed: the build stage parses this table into workflow batches.
     Layer ∈ the host config's layerGroups (flattened, in order) plus tests | other | baseline
     (baseline = a file only the built product can produce and a person approves, e.g. a
     screenshot; demanded before the gate runs, never at TESTS).
     Tests rows list their AC-IDs in Summary. -->

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/decision-lint.js | CREATE | scripts | D1–D5: the two checks, applicability cutoff, stdout/--json shapes, exit codes |
| spec/scripts/lib/spec-sections.js | MODIFY | scripts | D4: export `DECISION_LINT_APPLIES_FROM = '20261016'` beside `V7_APPLIES_FROM` |
| spec/bin/spec-paths | MODIFY | scripts | D6: `decision-lint` key + usage string entry |
| spec/commands/plan.md | MODIFY | doctrine | D7: Lock step 2 invocation + resolution sentence; step 3 ledger row gains `decisionLint` |
| spec/templates/spec.md | MODIFY | doctrine | D8: two sentences in the Decisions carrier comment |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D10: `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"` |
| spec/entrypoints.json | MODIFY | other | D12: one row declaring plan.md as decision-lint.js's entry point |
| tests/decision-lint.test.js | CREATE | tests | AC-20261016-01-1, AC-20261016-01-2, AC-20261016-01-3, AC-20261016-01-4, AC-20261016-01-5, AC-20261016-01-6, AC-20261016-01-7, AC-20261016-01-8, AC-20261016-01-9 |
| tests/spec-paths.test.js | MODIFY | tests | AC-20261016-01-10 |

## Contracts

```js
// spec/scripts/decision-lint.js — vocabulary (case-insensitive; measured on this repo's 2,501
// Decision rows: 37 restriction hits, 10 deferral hits — Assumptions A1)
const RESTRICT_RE = /\b(cannot|can't|may not|must not|never)\s+(be\s+)?(edit|delet|undo|undone|restor|reassign|reactivat|renam|remov|fix|correct)\w*|\b(immutable|write-once|frozen to)\b|\bonly (an? |the )?[A-Z][a-z]+s? (can|may)\b|\b(restricted|limited) to (an? |the )?[A-Z][a-z]+s?\b|\brequires? a reason\b|\bwith(out)? (a )?reason only\b/i
const DEFER_RE = /\b(in|to|for) a (later|follow-up|future|separate) spec\b|\bnot (offered|now|in this spec)\b|\bdeferred (to|until)\b|\b(later|follow-up|future) spec\b|\bcheap(ly)? later\b|\babsent now\b/i
const QUEUE_ID_RE = /\bq\d+\b/g
// tags: `[guards: <text>]` and `[asked: <text>]` — same bracket grammar as [no-ac:]; empty = absent
// host rules: JSON.parse(<root>/.claude/spec.config.json).pipelineRules → extractSection(rules, 'Risk Tiers')
//   missing config, rules file or section → exit 2 (fail-closed, never "no strict surfaces")

// stdout (plain):   decision-lint: restrictions=<R> deferrals=<F> findings=<N>
//                   <one line per finding>  "  <class> <Dn>: <detail>"
// stdout (--json):  { findings: [{ severity: 'hard', class, id, detail }], counts: { restrictions, deferrals } }
// not-applicable:   decision-lint: not-applicable spec=<YYYYMMDD> appliesFrom=20261016   (exit 0; --json: { findings: [], counts: {restrictions:0, deferrals:0}, notApplicable: { spec, appliesFrom } })
// finding classes:  unjustified-restriction | guard-not-in-risk-tiers | untracked-deferral | dead-queue-id
// exit: 0 none · 1 findings · 2 usage / unreadable spec / no Decisions / unreadable host rules
```

Plan ledger row (plan.md step 3) gains one field:

```json
"decisionLint":{"restrictions":0,"deferrals":0}
```

## Behavior

- Row enumeration and the struck-row exclusion are promise-sweep.js's, byte for byte; a row
  is the whole table line, so a tag may sit in either cell.
- A row can match both vocabularies; each check reports independently.
- `[guards:]` matching is a plain `includes` on the lower-cased § Risk Tiers section text against
  the lower-cased, trimmed tag text. "Money/rates" matches `[guards: money/rates]` and
  `[guards: Money]`; `[guards: provenance]` matches nothing in a host that never wrote it.
- `[asked: …]` is an attestation; the script verifies only non-emptiness. The lock step's
  AskUserQuestion is the human path; the tag records its outcome in the row.
- The deferral check spawns spec-queue.js once per distinct cited id; a row citing two ids
  where one is dead reports one `dead-queue-id` and is still `untracked` only if no id resolved.

## Acceptance Criteria

- **AC-20261016-01-1**: WHEN a live Decision row reads `| D2 | Tasks cannot be edited after creation | no update path exists |` and carries no tag THE SYSTEM SHALL exit 1 and print the finding `unjustified-restriction D2: …` → writes tests/decision-lint.test.js
- **AC-20261016-01-2**: WHEN that row carries `[guards: Money/rates]` and the fixture rules § Risk Tiers contains "Money/rates" THE SYSTEM SHALL exit 0 with `restrictions=1 deferrals=0 findings=0` (match is case-insensitive: `[guards: money/rates]` also passes) → writes tests/decision-lint.test.js
- **AC-20261016-01-3**: WHEN that row carries `[guards: provenance]` and "provenance" does not occur in § Risk Tiers THE SYSTEM SHALL exit 1 with the finding `guard-not-in-risk-tiers D2: …` naming "provenance" → writes tests/decision-lint.test.js
- **AC-20261016-01-4**: WHEN that row carries `[asked: JJ chose write-once on 2026-10-16]` THE SYSTEM SHALL exit 0; WHEN it carries `[asked: ]` THE SYSTEM SHALL exit 1 with `unjustified-restriction` → writes tests/decision-lint.test.js
- **AC-20261016-01-5**: WHEN a live row reads `| D3 | Reassignment is not offered now; a later spec adds it | cheap later |` and cites no `q<id>` THE SYSTEM SHALL exit 1 with `untracked-deferral D3: …` → writes tests/decision-lint.test.js
- **AC-20261016-01-6**: WHEN that row ends with `(q7)` and `q7` is an item in the fixture repo's `<git-common-dir>/spec-queue.json` THE SYSTEM SHALL exit 0 with `deferrals=1`; WHEN it cites `(q999)` instead THE SYSTEM SHALL exit 1 with `dead-queue-id D3: q999 …` → writes tests/decision-lint.test.js
- **AC-20261016-01-7**: WHEN `--spec` is `specs/20261015/01-x.md` (one day before the cutoff) containing the AC-1 row THE SYSTEM SHALL exit 0 and print `decision-lint: not-applicable spec=20261015 appliesFrom=20261016`; WHEN the path has no `specs/<YYYYMMDD>/` segment THE SYSTEM SHALL run the lint in full (exit 1 on the same row) → writes tests/decision-lint.test.js
- **AC-20261016-01-8**: WHEN the AC-1 row is struck (`| ~~D2~~ | …`) THE SYSTEM SHALL exit 0 with `restrictions=0`; WHEN the spec has no `## Decisions` section, or `--root` has no readable `.claude/spec.config.json`, or its rules file has no `## Risk Tiers` section THE SYSTEM SHALL exit 2 → writes tests/decision-lint.test.js
- **AC-20261016-01-9**: WHEN `--json` is passed on a spec with the AC-1 row and the AC-5 row (no tags) THE SYSTEM SHALL print one JSON object with two findings (`unjustified-restriction`, `untracked-deferral`) and `counts: {restrictions: 1, deferrals: 1}` → writes tests/decision-lint.test.js
- **AC-20261016-01-10**: WHEN `spec-paths decision-lint` runs THE SYSTEM SHALL print an existing path ending in `scripts/decision-lint.js` → rewrites tests/spec-paths.test.js :: AC-20260926-03-8: every

## Assumptions (escalation triggers)

- A1: The vocabulary's forward false-positive rate is tolerable. Micro-spike 2026-10-16 over this repo's 246 specs / 2,501 live Decision rows: `RESTRICT_RE` hits 37 rows (1.5%, all pipeline invariants such as "ledger rows are never deleted"), `DEFER_RE` hits 10 (0.4%), 0 of which cite a queue id. An earlier draft with `\b[A-Z][a-z]+-only\b` hit 206 rows (ESM-only, deny-only…) and was dropped. — **if false** (a host reports >5% of post-cutoff rows needing a tag): tighten `RESTRICT_RE` in a Direct-lane fix; never add an allow-list file.
- A2: `spec-queue show <id>` exits 0 for a live item and for an archived-done item, 2 for an unknown id, 3 outside a git repo. Executed 2026-10-16: `show q310` → 0, `show q1` (done) → 0, `show q9999` → 2. — **if false:** the lint reads the exit code it observes; the test fixture pins the live-item path only.
- A3: `extractSection(text, 'Risk Tiers')` returns the section body for a `## Risk Tiers` heading in a host rules file (it matches `^(#{2,3}) Risk Tiers`, case-insensitive). salon-os's rules file carries exactly that heading with "Money/rates" and "Telegram send paths" bullets (read 2026-10-16). — **if false:** exit 2 per D2's fail-closed rule; the host runs `/spec:doctor`.
- A4: Materiality for this guard is **0** in the fleet reader (`escapes.byClass` has no `unjustified-restriction` on 2026-10-16; salon-os's 11 escape rows carry other classes). The user overrode the admission bar's third-recurrence requirement by invoking `/spec:plan` after being told the count (Rationale). — **if false** (rows get recorded before build): nothing changes in the build; the number moves into Rationale at review close.

## Rationale

**Why now, against the admission bar.** A 2026-10-16 four-agent audit of salon-os found ~25
Decision-locked rules that stop staff editing, undoing, restoring or deleting, about half
protecting nothing; the recorded rationales were "no update path exists", "cheap to reverse",
"the mock did not draw it". Every one passed a CLEAN review, because the reviewer checks
conformance to the spec and the spec was the defect. Core § Incident Policy wants a standing
guard earned at the third ledger-recorded recurrence; the fleet reader shows 0 because the audit
was never recorded as escape rows. The user chose to plan anyway, with the five admission fields
filled as follows. *Portability*: the script reads only the spec and the host's own § Risk Tiers
section — any host stack. *Generality*: the class has one triggering report (salon-os) and no
second ledger member; stated, not claimed. *Materiality*: 0 (A4), overridden by the user.
*Falsifiability*: AC-1 and AC-5 are the deliberately tripped runs — the test suite's red
fixtures. *Removability*: "how many of the last 20 plan ledger rows have
`decisionLint.restrictions + deferrals > 0`?" — zero means the lint never fires and is removed.

**Why `[guards:]` binds to § Risk Tiers rather than an enum.** Research on 2026-10-16 (three
agents, post-July sources) found no spec tool that encodes product posture and no gate that
checks a product decision's content; the convergent practice is a static product doc plus
ADR-style "revisit if" rows. The host's § Risk Tiers is that product doc's one deterministic
slice we already parse: finance hosts list many strict surfaces, a salon tool lists money,
personal data and customer sends. The plugin names no product concept; the host does.

**Why lock, not review.** Agents guess on underspecified requirements rather than ask (two
2026 benchmarks), so "ask on product forks" works only when a script detects the fork. At lock
the fix is one tag or one AskUserQuestion; at review it is a rebuild.

**Rejected.** A failure-class enum in the plugin (names product concepts). A reversibility
rule as doctrine prose (prose does not hold across hundreds of specs). A genesis research
stage that derives a posture matrix (automation before the manual path; the Risk Tiers list is
the manual path). A review leg (cost on every review for what lock catches once). Reading
`spec-queue.json` directly (second derivation). A `-only` role pattern (206 false hits).

**Fragile.** `RESTRICT_RE` is English vocabulary; a host that writes Decisions in Japanese
gets no protection and no noise. Watch the plan ledger's `decisionLint` counts on salon-os for
the first ten specs after this ships.

## Canonical Delta

None — this repo keeps no `docs/canonical/` area for the plan lock.
