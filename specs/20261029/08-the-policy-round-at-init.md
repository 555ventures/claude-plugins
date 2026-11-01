---
date: 2026-10-29
status: implementing
build_base: main
tier: critical           # edits spec/templates/grounding-contract.md (hash-stamped into every host) and init-gen.js's settings.json permission writes (rules § Risk Tiers)
area: bootstrap
breaking: false
depends_on: [specs/20261029/04-the-four-questions-that-did-not-exist.md]
brief: n/a
spiked: 2026-10-31
open_markers: 0
diff_base: 5684e6bb942c29cbe061fc14b393c440f00a4e64
---

# The policy round at init

## Goal

The standing preferences the plugin imposes on a host today without asking — how git is used,
whether spec tests expire, whether run history is committed, whether the hosted review service
is used, which model runs each dispatched seat, what counts as high-risk — are asked once at
`/spec:init` in two rounds of up to four questions, stored in `.claude/spec.config.json` under
one `policy` block, validated by `/spec:doctor`, and the reviewer seat returns to Fable at low
effort as the block's default. A host that never answers keeps today's behaviour. Done means
every key in the block has one default, one place it is asked, one validator, and (through the
sibling spec 09) one reader; this spec lands the block, the questions, the validator, the
confirm-before-writing step and the reviewer seat, and leaves the system green on its own.

Source: docs/audit/question-points-and-model-placement-2026-10-29.md Part 3 rows 4, 9, 10, 12,
16, 17, 18, 21. Sibling: specs/20261029/09-the-commands-read-the-policy-block.md (the readers).

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec/templates/grounding-contract.md` gains one optional block, `policy` (new § Policy, listed beside `capabilities` in § Required config keys), with exactly these keys and defaults: `worktreePerSpec: true`, `directLaneToMain: true`, `mergeStrategy: "derived"` (enum `derived \| merge-commit \| ff-only \| squash \| rebase-ff`), `testExpiry: "classify"` (enum `classify \| off`), `ledgerCommitted: true`, `reviewService: "terminal"` (enum `terminal \| hosted`), `models: {workers, reviewer, disposer}` each `{model, effort}` (model enum `fable \| opus \| sonnet \| haiku`, effort enum `low \| medium \| high \| xhigh \| max`; defaults `workers sonnet/medium`, `reviewer fable/low`, `disposer opus/medium`), `riskTiers` (array of non-empty strings; default `[]`). The section states the absent-block rule: absent or partial block = the defaults above, key by key; a host that predates the block changes nothing. The one contract edit this spec makes; `.claude/spec.config.json`'s `contractHash` is restamped to `spec-paths contract-hash` in the same change (AC-20261029-08-1, AC-20261029-08-11) `[guards: spec/templates/grounding-contract.md — its hash is stamped into every host's spec.config.json; any edit flags every host's grounding as stale; edit only when the contract genuinely changes]` | One block, one hash bump. `models` holds only the three seats a driver dispatches (the planner is the session itself; lookups run inside a hook) — a key nobody reads is not a policy. `riskTiers` defaults empty because the rules file's § Risk Tiers, not the key, is what planning reads (D5). |
| D2 | `spec/scripts/lib/host-config.js` exports `POLICY_DEFAULTS` (frozen, the D1 defaults), `policy(root)` → `readConfig(root).policy` deep-merged over `POLICY_DEFAULTS` (unknown keys dropped, `models` merged per seat), and `validatePolicy(block)` → `[]` or finding strings, one per defect: `unknown key <k>`, `<k>: expected boolean`, `<k>: expected one of <enum>`, `models.<seat>.model: expected one of fable\|opus\|sonnet\|haiku`, `models.<seat>.effort: expected one of low\|medium\|high\|xhigh\|max`, `riskTiers: expected an array of non-empty strings`. `POLICY_DEFAULTS.models` equals core.md § Model Placement's table rows for workers, reviewer and disposer (AC-20261029-08-1, AC-20261029-08-2) | One accessor, one validator, both in the library every script already imports (`tests/host-config/config-read.test.js` bans a second reader of the config filename under `spec/scripts/`). The defaults-equal-the-table pin keeps doctrine and code from drifting apart. |
| D3 | `spec/commands/init.md` Phase 3 gains **Policy round 1** and **Policy round 2**: two `AskUserQuestion` calls of four questions each, texts verbatim from § Contracts, every question's first option the derived default labeled `(Recommended)` with the consequence in each option's `description`. Round 1: worktree per spec (`worktreePerSpec`), direct lane to main (`directLaneToMain`), merge shape (`mergeStrategy`), test expiry (`testExpiry`). Round 2: run history committed (`ledgerCommitted`), review service (`reviewService`), model mix (`models` — "plugin defaults (Recommended)" / "same model as this session: reviewer Opus at high" / "I will edit the block by hand"), high-risk areas (`riskTiers`, multi-select over `auth`, `money`, `migrations`, `data deletion`, `public API`, `PII` plus every bullet Phase 1 found). The answers land in the profile at `config.policy` (Phase 4); the chosen risk areas are ALSO written as bullets into `rules.sections["Risk Tiers"]`. A dismissed round keeps the defaults for that round, prints `📌 policy defaults kept — edit .claude/spec.config.json policy to change (veto anytime)` and continues; the command's "`AskUserQuestion` dismissed → STOP" rule gains the exception "except the two policy rounds, which keep their defaults" (AC-20261029-08-3) `[asked: user 2026-10-31 — reviewer default Fable/low because the session that runs /spec:run is Opus at medium and a same-model reviewer is not independent; disposer stays Opus/medium; models block holds workers/reviewer/disposer only]` | Asked once, in the command that already profiles the repo. A dismissal must not stop init: every policy has a working default, unlike a mid-run product question. |
| D4 | `init-gen.js generate` reads `profile.config.policy`: absent → writes `POLICY_DEFAULTS` into the config target and prints `📌 policy defaults kept — edit .claude/spec.config.json policy to change (veto anytime)`; present → `validatePolicy` findings exit 2 printing `policy: <finding>` lines and writing nothing; valid → written merged over the defaults. `ledgerCommitted: false` adds two conditional rows to `IGNORE_ENTRIES` — `.claude/spec-runs.jsonl` and `.claude/spec-runs/` — so `ensureGitignore` appends them and `ignore-check` reports them missing on such a host; `true` adds nothing (AC-20261029-08-4) `[asked: docs/audit/question-points-and-model-placement-2026-10-29.md Part 3 row 18 — the owner answers "committed (Recommended) / gitignored" at init; never-staged is that answer's consequence, and the default stays committed]` | The script is the sole writer of the config; the session never edits it by hand. Git refuses an explicit `git add` of an ignored path (S1) and `git add -A` skips it, and `commitPromotedEvidence` already skips ignored ledger paths — so the ignore lines are the whole mechanism for "never committed". |
| D5 | `init-gen.js policy-check --root <dir> [--json]` (new subcommand, usage line added): runs `validatePolicy` over the on-disk block, then two drift checks — `ledgerCommitted=false but .claude/spec-runs.jsonl is tracked` when `git ls-files --error-unmatch .claude/spec-runs.jsonl` exits 0, and `riskTiers entry "<s>" is not in <rules file> § Risk Tiers` when the entry does not occur case-insensitively in that section's text. Exit 0 with no findings, 1 with findings (one per line, or a JSON array under `--json`), 2 on usage / unreadable config. `spec/commands/doctor.md` gains check **24**, **Policy block** (advisory): run `node "$(spec-paths init-gen)" policy-check --root . --json`; each finding is one ⚠️ line (AC-20261029-08-7, AC-20261029-08-8) `[guards: spec/templates/grounding-contract.md — the drift the check reports is the contract's own policy semantics]` | Drift is how a policy silently stops being true. The risk areas live in the rules file (planning reads core § Tiers → § Risk Tiers); the key is provenance and the check keeps the two equal. Ordinal 24 because 23 is Walkthrough config. |
| D6 | `init-gen.js generate --dry-run`: computes the settings merge and the file targets, prints `Confirm before writing: N permissions, M files` followed by one line per item (`  + allow <entry>` / `  + deny <entry>` for every allow or deny entry absent from the existing `.claude/settings.json` permissions block; `  + <path>` for every target whose path does not exist), writes nothing, exits 0 (2 on the usual profile/usage errors). `init.md` Phase 5 runs `--dry-run` first and asks ONE `AskUserQuestion` whose question text is that printed anchor line with the items (text in § Contracts; "Write them (Recommended)" / "Stop here" → STOP, nothing written), then runs `generate` without the flag (AC-20261029-08-5) | Mirrors `/spec:enforce` Phase 4's `Confirm before writing: {N} files will be rewritten` — the permission allowlist is the one init write the audit marked security-relevant (row 17). |
| D7 | `init.md` Phase 1.5 opens with ONE `AskUserQuestion` listing every substrate item the session is about to create in host source (health endpoint, seed script, `.worktreeinclude`, README section — only the items Phase 1 found missing), text in § Contracts: "Create them (Recommended)" / "Declare them inert instead" (every listed item becomes an `inert` manifest row with the reason `declined at init`). Nothing is created before the answer (AC-20261029-08-6) | Audit row 16: init writes application source from a bootstrap; one question, listing what, before the first write. |
| D8 | The reviewer seat returns to `model: fable`, `effort: low` in `spec/agents/reviewer.md` and in core.md § Model Placement's Reviewer row; the table gains one sentence after it: "A host's `policy.models` overrides the workers, reviewer and disposer rows (spec 09 wires the readers); the reviewer default is a model the orchestrating session does not run." `spec/commands/fix.md` step 4's parenthetical "(`opus` at `effort: high`, core § Model Placement)" reads "(`fable` at `effort: low`, core § Model Placement)". The independence sentence (fresh context, blind to author) stays; no "family" wording returns (AC-20261029-08-9, AC-20261029-08-10) `[asked: user 2026-10-31 — "it is Opus medium when invoking spec:run"; reviewer back to Fable/low, disposer stays Opus/medium]` | The `/spec:run` session is Opus; spec 01 put the reviewer on the same model. The ledger cannot adjudicate which is better (review rows record no reviewer model), so the owner's call stands and becomes the configurable default. |
| D9 | `spec/.claude-plugin/plugin.json` is bumped via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` naming the policy block, the two init rounds, the dry-run confirm and the reviewer seat. `[no-ac: plugin-bump.js --check in the gate is the oracle; reviewer-held against the merge base]` | Rules § Planning version-bump discipline; only the spec plugin directory is touched here (git/ rows belong to spec 09). |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/templates/grounding-contract.md | MODIFY | doctrine | § Policy block; `policy` listed in § Required config keys (D1) |
| .claude/spec.config.json | MODIFY | other | `contractHash` restamped over the D1 edit (D1) |
| spec/scripts/lib/host-config.js | MODIFY | scripts | `POLICY_DEFAULTS`, `policy(root)`, `validatePolicy(block)` (D2) |
| spec/commands/init.md | MODIFY | doctrine | Phase 1.5 substrate confirm (D7); Phase 3 policy rounds 1 and 2 (D3); Phase 4 `config.policy` + Risk Tiers bullets (D3); Phase 5 `--dry-run` + confirm (D6); dismissed-round exception (D3) |
| spec/scripts/init-gen.js | MODIFY | scripts | `generate` writes/validates `policy`, 📌 line, conditional ignore rows (D4); `--dry-run` manifest (D6); `policy-check` subcommand (D5) |
| spec/commands/doctor.md | MODIFY | doctrine | check 24 Policy block (D5) |
| spec/agents/reviewer.md | MODIFY | doctrine | frontmatter `model: fable`, `effort: low` (D8) |
| spec/doctrine/core.md | MODIFY | doctrine | § Model Placement Reviewer row `fable`/`low` + override sentence (D8) |
| spec/commands/fix.md | MODIFY | doctrine | step 4's seat parenthetical reads `fable` at `effort: low` (D8) |
| spec/.claude-plugin/plugin.json | MODIFY | other | bump via plugin-bump.js (D9) |
| tests/host-config/policy-block.test.js | CREATE | tests | AC-20261029-08-1, AC-20261029-08-2, AC-20261029-08-7 |
| tests/init-gen/policy-round.test.js | CREATE | tests | AC-20261029-08-3, AC-20261029-08-4, AC-20261029-08-5, AC-20261029-08-6, AC-20261029-08-8 |
| tests/review/reviewer-seat.test.js | MODIFY | tests | AC-20261029-08-9, AC-20261029-08-10 (rewrites spec 01's reviewer pins) |
| tests/consistency/contract-stamp.test.js | MODIFY | tests | AC-20261029-08-11 (tag the existing restamp pin) |

## Contracts

Contract § Policy (added to `spec/templates/grounding-contract.md`; the JSON is the default block):

```json
"policy": {
  "worktreePerSpec": true,
  "directLaneToMain": true,
  "mergeStrategy": "derived",
  "testExpiry": "classify",
  "ledgerCommitted": true,
  "reviewService": "terminal",
  "models": {
    "workers":  {"model": "sonnet", "effort": "medium"},
    "reviewer": {"model": "fable",  "effort": "low"},
    "disposer": {"model": "opus",   "effort": "medium"}
  },
  "riskTiers": []
}
```

Semantics (one line per key, carried into the contract section verbatim): `worktreePerSpec`
false → `/spec:run` runs in place without `--in-place`; `directLaneToMain` false → a Direct-lane
change lands through a branch and `/git:merge`, never a commit on main, still no spec;
`mergeStrategy` `derived` → `merge-back inspect`'s RECOMMEND, else the named strategy is
auto-picked; `testExpiry` `off` → review close runs no classification and `/spec:doctor` check 20
reports `disabled by policy`; `ledgerCommitted` false → `.claude/spec-runs.jsonl` and
`.claude/spec-runs/` are gitignored at init and never staged; `reviewService` `terminal` → the
wireframe command never suggests `/spec:connect`; `models.<seat>` → the model and effort every
driver prints on that seat's dispatch line; `riskTiers` → the high-risk areas the owner chose,
also written as bullets into the rules file's § Risk Tiers (the section planning reads; the key
is provenance, checked by doctor 24). Readers are wired by spec 09.

`host-config.js`:

```js
POLICY_DEFAULTS            // frozen; the JSON above
policy(root)               // readConfig(root).policy merged over POLICY_DEFAULTS; unknown keys dropped
validatePolicy(block)      // [] | ['unknown key foo', 'mergeStrategy: expected one of derived|merge-commit|ff-only|squash|rebase-ff', ...]
```

`init-gen.js` usage additions:

```
init-gen.js generate --root <dir> --profile <path> [--refresh] [--dry-run]
init-gen.js policy-check --root <dir> [--json]   (exit 0 clean · 1 findings · 2 usage)
```

Question texts (verbatim in `init.md`; every option description ≥ 25 chars, recommended first):

Round 1 — `header: Worktrees` — "Should each spec build in its own git worktree, away from your
working copy?" — **Yes, isolate each spec (Recommended)**: "Builds never touch the files you are
editing; costs one checkout per spec." / **No, build in place**: "Builds run on your current branch
and can collide with uncommitted work." — `header: Direct lane` — "May a one-line fix be committed
straight to main?" — **Yes (Recommended)**: "Tiny fixes skip the branch; a gate still runs and the
escape row still lands." / **No, always a branch**: "Every fix lands through a branch and a guided
merge; main only moves by merge." — `header: Merge shape` — "How should finished spec branches land
on main?" — **Let the tool pick per branch (Recommended)**: "One commit fast-forwards, a few merge,
many squash; the pick is printed and you can veto it." / **Always merge commit**: "Every branch
keeps its history behind one merge commit." / **Always squash**: "Every branch lands as one commit;
the branch history is dropped." / **Always rebase then fast-forward**: "Linear history; conflicts
are repaired commit by commit." — `header: Test expiry` — "After a spec closes, should the review
classify which of its tests can be retired?" — **Classify, delete nothing (Recommended)**: "Close
prints what is retirable; a separate deliberate sweep is the only deletion." / **Never classify**:
"Every spec test stays forever; the close prints no expiry line."

Round 2 — `header: Run history` — "Should the pipeline's run history be committed into this
repo?" — **Commit it (Recommended)**: "Reviews, builds and fixes are recorded in git for everyone
on the project." / **Keep it out of git**: "History stays on this machine only; the ledger files
are gitignored." — `header: Review service` — "Where are wireframes confirmed?" — **In the
terminal (Recommended)**: "Nothing leaves this machine; you approve stories here." / **On the
hosted review service**: "Screens and notes are uploaded for a client to review; /spec:connect
sets it up." — `header: Model mix` — "Which models run the build workers, the reviewer and the
disposer?" — **Plugin defaults (Recommended)**: "Sonnet builds, Fable reviews at low effort, Opus
disposes — the reviewer is never the model your session runs." / **Reviewer on Opus at high**:
"Same model as an Opus session; cheaper per token, more effort per review." / **I will edit the
block by hand**: "Defaults are written now; change models in the config file later." — `header:
High-risk areas` (multiSelect) — "Which areas are high-risk in this repo, where a spec must be
confirmed before it locks?" — options `auth`, `money`, `migrations`, `data deletion`, `public
API`, `PII` plus Phase 1's findings, each description naming what the area covers here.

Phase 1.5 question — `header: Substrate` — "Init wants to create these files in your source:
<one line per item>. Create them?" — **Create them (Recommended)**: "The pipeline can boot, seed
and verify the app; every file is listed above." / **Declare them inert instead**: "Nothing is
written; each item is recorded as inert and verification skips it."

Phase 5 question — `header: Write` — the printed `Confirm before writing: N permissions, M
files` line plus the item lines — **Write them (Recommended)**: "The listed permissions and
files are written now; nothing else changes." / **Stop here**: "Nothing is written; re-run
/spec:init after editing the profile."

## Behavior

Init flow with the block: Phase 1 profiles → Phase 1.5 asks the substrate question before any
write → probe → Phase 3 asks the two policy rounds (defaults derived from today's behaviour,
risk areas seeded from Phase 1's findings) → Phase 4 puts the answers at `config.policy` and the
risk areas into `rules.sections["Risk Tiers"]` → Phase 5 `--dry-run`, the confirm question,
then `generate`, which validates, writes, prints the 📌 line only when the block was absent, and
appends the ledger ignore lines only on `ledgerCommitted: false`. A re-run (`--refresh`) treats
`policy` like every other config key: the on-disk block is compared and a differing one is a
refresh-or-refuse like the rest.

## Acceptance Criteria

- **AC-20261029-08-1**: WHEN `policy(root)` reads a config with no `policy` block THE SYSTEM SHALL return the full default block (e.g. `{}` → `models.reviewer` = `{"model":"fable","effort":"low"}`, `mergeStrategy` = `"derived"`); with `{"policy":{"mergeStrategy":"squash","models":{"reviewer":{"model":"opus","effort":"high"}}}}` it SHALL return the defaults with `mergeStrategy: "squash"`, `models.reviewer` = opus/high and `models.workers` still sonnet/medium; `validatePolicy({"mergeStrategy":"rebase"})` SHALL return exactly one finding `mergeStrategy: expected one of derived|merge-commit|ff-only|squash|rebase-ff`, and `validatePolicy({"foo":1,"models":{"reviewer":{"model":"gpt","effort":"low"}}})` SHALL return two findings naming `unknown key foo` and `models.reviewer.model` → writes tests/host-config/policy-block.test.js
- **AC-20261029-08-2**: WHEN `POLICY_DEFAULTS.models` is compared with `spec/doctrine/core.md` § Model Placement's table THE SYSTEM SHALL match row for row: `Implementation workers | sonnet | medium`, `Reviewer | fable | low`, `Disposer | opus | medium` (the test parses the rows with the same regex as `tests/review/reviewer-seat.test.js`) → writes tests/host-config/policy-block.test.js
- **AC-20261029-08-3**: WHEN `spec/commands/init.md` Phase 3 is read THE SYSTEM SHALL contain exactly two headings `Policy round 1` and `Policy round 2`, round 1 naming `worktreePerSpec`, `directLaneToMain`, `mergeStrategy` and `testExpiry`, round 2 naming `ledgerCommitted`, `reviewService`, `models` and `riskTiers`, eight occurrences of `(Recommended)` between the two headings, the literal line `📌 policy defaults kept — edit .claude/spec.config.json policy to change (veto anytime)`, and the Rules section's dismissed-STOP bullet carrying `except the two policy rounds` → writes tests/init-gen/policy-round.test.js
- **AC-20261029-08-4**: WHEN `init-gen.js generate` runs on a synthetic host with a valid profile whose `config` has no `policy` THE SYSTEM SHALL write `.claude/spec.config.json` with `policy` equal to `POLICY_DEFAULTS`, print `📌 policy defaults kept`, and append no `.claude/spec-runs` line to `.gitignore`; with `config.policy = {"ledgerCommitted": false}` it SHALL write `ledgerCommitted: false` (other keys defaulted), print no 📌 line, and `.gitignore` SHALL end with the lines `.claude/spec-runs.jsonl` and `.claude/spec-runs/`; with `config.policy = {"testExpiry": "sometimes"}` it SHALL exit 2, print `policy: testExpiry: expected one of classify|off`, and leave no config file → writes tests/init-gen/policy-round.test.js
- **AC-20261029-08-5**: WHEN `init-gen.js generate --dry-run` runs on a synthetic host whose existing `.claude/settings.json` already allows one of the config-derived entries and where 2 of the file targets already exist THE SYSTEM SHALL print `Confirm before writing: N permissions, M files` with N = the allow+deny entries not yet present (e.g. derived allow 4 + default deny 2, one allow present → `5 permissions`) and M = targets absent (e.g. 9 targets, 2 present → `7 files`), one `  + ` line per item, write nothing (the host tree is byte-identical before and after), exit 0; and `spec/commands/init.md` Phase 5 SHALL contain `--dry-run` before `AskUserQuestion` and the literal `Confirm before writing:` → writes tests/init-gen/policy-round.test.js
- **AC-20261029-08-6**: WHEN `spec/commands/init.md` Phase 1.5 is read THE SYSTEM SHALL open with an `AskUserQuestion` paragraph containing `Create them (Recommended)` and `Declare them inert instead`, placed before the `Health endpoint` bullet → writes tests/init-gen/policy-round.test.js
- **AC-20261029-08-7**: WHEN `init-gen.js policy-check --root <host> --json` runs on a synthetic git host with `policy.ledgerCommitted: false`, a committed `.claude/spec-runs.jsonl`, and `policy.riskTiers: ["auth","PII"]` where the rules file's § Risk Tiers mentions only `auth` THE SYSTEM SHALL exit 1 with exactly the two findings `ledgerCommitted=false but .claude/spec-runs.jsonl is tracked` and `riskTiers entry "PII" is not in .claude/rules/spec-pipeline.md § Risk Tiers`; on the same host with the ledger untracked and `riskTiers: ["Auth"]` (case differs) it SHALL exit 0 printing `[]`; with `policy.mergeStrategy: "rebase"` it SHALL include the validator's finding → writes tests/host-config/policy-block.test.js
- **AC-20261029-08-8**: WHEN `spec/commands/doctor.md` is read THE SYSTEM SHALL contain a check numbered `24.` titled `Policy block` naming `policy-check` and `--json`, and no other check numbered 24 → writes tests/init-gen/policy-round.test.js
- **AC-20261029-08-9**: WHEN `spec/agents/reviewer.md` frontmatter is parsed THE SYSTEM SHALL yield `model: fable` and `effort: low` (e.g. the frontmatter block `model: fable\neffort: low`) → rewrites tests/review/reviewer-seat.test.js :: AC-20261029-01-1
- **AC-20261029-08-10**: WHEN `spec/doctrine/core.md` § Model Placement is read THE SYSTEM SHALL carry the row `Reviewer | fable | low`, the row `Disposer | opus | medium`, the sentence containing `policy.models` overriding the three seats, the fresh-context independence sentence, and still no `different model family` or `different family` phrase; and `spec/commands/fix.md` step 4 SHALL contain `` `fable` at `effort: low` `` and not `` `opus` at `effort: high` `` → rewrites tests/review/reviewer-seat.test.js :: AC-20261029-01-3
- **AC-20261029-08-11**: WHEN this repo's `.claude/spec.config.json` is read THE SYSTEM SHALL CONTINUE TO carry a `contractHash` equal to `spec-paths contract-hash` over the edited contract (e.g. the 12-hex stamp equals the first 12 characters of the SHA-256 of `spec/templates/grounding-contract.md`) → reuses tests/consistency/contract-stamp.test.js :: AC-20260912-15-8

## Assumptions (escalation triggers)

- A1: Spec 04 (done) and spec 03 (done) each made their one contract edit and restamped; this spec's § Policy is the only contract edit in flight and bumps the hash once. — **if false:** fold the concurrent edit into this spec's single restamp and record the deviation in Decisions.
- A2: `/spec:doctor`'s next free check ordinal is 24 (verified: check 23 is Walkthrough config). — **if false:** take the next free ordinal and amend every mention (Decisions, File Plan, AC-20261029-08-8, Canonical Delta), grepping case-insensitively.
- A3 (S1, executed 2026-10-31, git 2.47.3, scratch repo with `.claude/spec-runs.jsonl` and `.claude/spec-runs/` ignored): `git add -- .claude/spec-runs.jsonl` exits 1 ("paths are ignored"); `git add -A` stages only `.gitignore`; `git ls-files --error-unmatch .claude/spec-runs.jsonl` exits 1 untracked and 0 after `git add -f`; `git add --ignore-errors` on an ignored path still exits 1. So the ignore lines alone make "never staged" true for `git add -A` callers, an explicit `git add` of the ledger must be skipped when ignored (spec 09 fixes plan.md step 5; `commitPromotedEvidence` already skips via `check-ignore`), and `ls-files --error-unmatch` is the tracked test for doctor 24. — **if false:** blocked; re-run the spike on the host's git and amend D4/D5.
- A4: `init-gen.js`'s `buildFileTargets` is the complete list of files `generate` writes (config, rules file, convention rules, agents, skills, patterns script, manifest) plus `.gitignore`, `.gitattributes` and `.claude/settings.json`; `--dry-run`'s M counts the `buildFileTargets` targets absent on disk and N counts settings entries absent from the existing block. — **if false:** count whatever the writer list is at build time and record it in the Decision.
- A5: `tests/review/reviewer-seat.test.js`'s AC-20261029-01-1 and AC-20261029-01-3 are the only executable pins of the reviewer's `opus`/`high` seat; `tests/consistency/model-placement.test.js` line 19 only mentions "opus/high" in an assertion message. — **if false:** the build rewrites the additional pin and records it as a File Plan deviation.
- A6: `question-style-gate.js` tier 1 passes the question texts in § Contracts as authored (recommended first, descriptions ≥ 25 chars, no two backticked identifiers in a question). — **if false:** reword in the build and amend § Contracts; the texts in `init.md` are the ones the gate judges.

## Rationale

The audit's deepest finding was that the plugin mixes policy (what the pipeline guarantees) with
preference (how this team works) and hard-codes both. This spec moves every preference with a
reader into one config block whose default equals today's behaviour, so an owner who answers
nothing sees no change and an owner who answers once never sees the question again. The block
lands in two specs because the File Plan ran to fourteen source rows: 08 is the block, the
questions, the validator and the confirm step (green on its own — a key with no reader is inert);
09 wires every reader.

The reviewer seat moves back to Fable at low effort on the owner's ruling (2026-10-31): the
session that runs `/spec:run` is Opus at medium, so spec 01's Opus reviewer was the same model as
the orchestrator that repairs and commits. The ledger cannot decide the question — review rows
record no reviewer model, and surviving-finding counts look alike on both sides of spec 01 — so
the ruling becomes the default and the mix question offers the Opus alternative. The disposer
stays Opus/medium: bounded judgment over a short list, and the seat whose `inherit` drift spec 01
fixed. The `models` block holds only seats a driver dispatches; the planner is the session and
the lookup judge is a hook, so neither can read a config key today.

`riskTiers` is provenance, not a second trigger list: planning reads the rules file's § Risk Tiers
(core § Tiers), the session writes the chosen areas there, and doctor 24 keeps the two equal.
`reviewService` defaults to `terminal`, which is the one default that changes a visible line
(spec 09 suppresses the `/spec:connect` hint unless the host opted in) — the audit's point for
row 12 is that an upload service is opted into, never nudged. Audit rows 11 (suite-twice knob) and
22 (cost line before heavy runs) are dropped from this spec's source: row 11's premise — a
documented knob — has no surviving text, and row 22 is per run, not an init policy.

Collision closure (literals leg, lock 2026-10-31): `model: opus` in `spec/agents/disposer.md`, `spec/commands/enforce.md` and `spec/commands/genesis.md` are the disposer, enforce and genesis seats, which stay Opus — waived; `docs/audit/…` is an audit record — waived; `opus/high` in `tests/consistency/model-placement.test.js` is an assertion MESSAGE, not an assertion (A5) — waived; `effort: high` in `docs/canonical/pipeline.md` is the Canonical Delta's own sentence — applied at close; `effort: high` in `spec/commands/fix.md` entered the File Plan (D8).

Rejected: a `/spec:policy` command (new frontmatter, spec-paths key and shared-for list for a
re-answer case that editing the block plus doctor 24 covers); a `policy-check.js` script with its
own spec-paths key (a subcommand on the script that already owns the config avoids a new entry
point and an entrypoints.json row).

## Canonical Delta

docs/canonical/bootstrap.md, new section "Policy block": the keys and defaults from § Contracts;
the two init rounds and that a dismissed round keeps defaults and continues; `generate`'s
validation (exit 2 naming the key), the 📌 line on an absent block, the conditional ledger ignore
lines; `generate --dry-run` and the Phase 5 confirm; the Phase 1.5 substrate confirm;
`policy-check` and `/spec:doctor` check 24; readers are listed in docs/canonical/pipeline.md once
spec 09 lands.
docs/canonical/pipeline.md: the reviewer seat sentence ("the reviewer seat is `opus` at
`effort: high`") becomes "the reviewer seat is `fable` at `effort: low` — a model the Opus run
session does not run — and a host's `policy.models` overrides the workers, reviewer and disposer
seats"; the disposer sentence is unchanged.
