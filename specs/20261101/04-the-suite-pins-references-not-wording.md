---
date: 2026-11-01
status: hardened
tier: standard
area: doctrine-governance
breaking: false
depends_on: []
brief: n/a
open_markers: 0
---

# The suite pins references, not wording

## Goal

The doctrine says behavior is pinned by behavioral tests, never by regexes over prose, while
the test agent is told to pin doctrine prose by regex, and the suite holds about 180 such pins.
This spec narrows the ban instead of dropping it: prose is pinned for three things only — the
references it must keep, the phrases it must no longer contain, and the protocol tokens an
executor prints verbatim — and a pin on the wording of a rule is not a test. Every surface that
states the rule says the same thing, the test agent and its exemplar follow it, two helpers make
pins reflow-safe, and the suite's existing wording pins are removed. Done means the rule has one
home, the agent prescribes it, and `npm test` carries no wording pin.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec/doctrine/core.md` § Doctrine Authoring keeps its heading and first two sentences and replaces the sentence from "Behavior is pinned" to the end of the section with: "Behavior is pinned by behavioral tests that execute it. Prose itself is pinned for three things only: references it must keep (script paths, `spec-paths` keys, flags, headings, step labels, caps), phrases it must no longer contain, and protocol tokens an executor must print or offer verbatim. A pin on the wording of a rule is not a test — wording is read by review, and a rule that matters enough to guard mechanically gets a script (§ Incident Policy)." (AC-20261101-04-3) | The blanket ban left doctrine, which cannot execute in CI, with no mechanical guard; the three kinds are what an executor cannot paraphrase (Rationale). Rejected: dropping the ban — wording pins are the fragile, evadable, duplicating class the ban was written against. |
| D2 | Every other surface that states the ban shrinks to a pointer at D1 and stops saying "regexes over prose", "regex pin(s)" or "by regex": `.claude/rules/spec-pipeline.md` § Test Rules (the behavioral bullet; § Gotchas stays as it is — it is history, with its own writer), `.claude/rules/conventions/tests.md` (Mode line and Agent line), `docs/canonical/doctrine-governance.md` (the second bullet), `README.md` § Notes for plugin authors (first bullet), `.claude/agents/doctrine-author.md` (the "pinned by regex tests" sentence), `.claude/skills/spec-verify/SKILL.md` § Observe (the doctrine-claims bullet), `.claude/commands/doctrine-review.md` (the "regex pins on past incidents" parenthetical). Exact replacement text per surface is in § Behavior. (AC-20261101-04-3) | One binding home per rule (D1's own first sentence); seven restatements were already drifting from each other. |
| D3 | `.claude/agents/plugin-tests.md` prescribes the narrowed rule: its `description` and opening paragraph say prose is pinned for references, retired phrases and protocol tokens via heading-sliced, reflow-safe pins; the mode bullet in § Critical Constraints names the three kinds, forbids pinning an adjective, a synonym alternation or a sentence of intent, and names `section` and `phrase` from `tests/helpers.js`; the Read-before-writing list replaces `tests/doctrine-review.test.js` with `tests/consistency/dead-stops.test.js` as the prose-pin exemplar. `.claude/rules/conventions/tests.md`'s Agent line names the same exemplar beside `tests/merge-back.test.js`. (AC-20261101-04-4) | The agent was written before the ban and never updated; its exemplar is the file with the most wording pins. dead-stops.test.js already slices by heading and uses `\s+`. |
| D4 | `tests/helpers.js` exports three new functions, API in § Contracts: `sliceSection(text, startRe, endRe, label)` (pure), `section(rel, startRe, endRe)` (reads the repo file, fails once with a remedy when the file or heading is missing), `phrase(literal, flags)` (escapes regex metacharacters and matches every whitespace run with `\s+`). `tests/consistency/dead-stops.test.js` deletes its local `section` and `whole` and imports `section` from helpers (its `whole(file)` calls become `read(file)` after one `fs.existsSync` assert kept in a local one-liner, or `section` with `/^/` and `/$(?!)/` — worker's choice, behavior unchanged). (AC-20261101-04-1, AC-20261101-04-2) | The pipeline rules § Gotchas record reflow and hard-wrap as the pin-breaking class; one shared slicer and one literal-to-regex helper remove the per-file hand-rolling that caused it. Rejected: a whitespace-normalised full-file read — it destroys `^…$/m` heading anchors. |
| D5 | Every wording pin listed in § Behavior "Wording pins removed" is deleted as an assertion. A test case left with no assertion is deleted; a file left with no case is deleted. Test titles keep every AC-ID token verbatim; the rest of a title may be shortened to what its surviving assertions state. No assertion is weakened or loosened — removed whole or kept whole, with one sanctioned shape: a single assert that ANDs a reference clause with a wording clause keeps the reference clause (listed explicitly in § Behavior). Any AC-ID of a done spec whose last citing case is deleted is tagged `[retired: specs/20261101/04-the-suite-pins-references-not-wording.md]` on its bullet in the same batch; the lock-time derivation found none (Assumptions A2). `[no-ac: deletion of assertions — the gate and `ac-drift-clean` staying green is the oracle; a sweep over test source would be the pin kind this spec retires]` [asked: delete wording pins rather than keep them as golden snapshots] | A wording pin is a second copy of the rule, breaks on reflow, and is evaded by a synonym; `/doctrine-review` reads every doctrine diff for intent. Snapshots were rejected by the user: every edit would red the suite until re-approved. |
| D6 | Reference, retired-phrase and token pins that already exist stay where they are, untouched. New or rewritten pins use `section`/`phrase`. No consolidation into one file. `[no-ac: nothing changes]` [asked: keep existing keeper pins in place rather than consolidating ~30 files into one table] | `docs/canonical/doctrine-governance.md`'s own rule: touch-time dedup, never a sweep. A consolidation would move ~95 pins and every AC citation with them. |
| D7 | `docs/adr/0037-prose-is-pinned-by-reference-not-wording.md` is written in the repo's ADR shape (Status, Date, Archetype n/a, Deciders, Applies to, Amended by; Context, Decision, Consequences) recording why the ban exists, why it was too broad, the three kinds, and the Gotchas evidence; its Context is this spec's Rationale condensed. `[no-ac: an ADR is provenance, not behavior]` | The 2026-08-17 ban shipped with no ADR and no rationale; the question that opened this spec was "why forbid?". |
| D8 | `spec/.claude-plugin/plugin.json` is bumped via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`; the paragraph says core § Doctrine Authoring now names the three pin kinds. `[no-ac: version mechanics — `plugin-bump.js --check` in the gate is the oracle]` | Pipeline rules § Planning version-bump discipline. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/doctrine/core.md | MODIFY | doctrine | D1 — § Doctrine Authoring's third sentence onward replaced; heading and first two sentences byte-identical |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D8 — `node scripts/plugin-bump.js --bump --plugin spec --changelog "…"`; no dependency change |
| .claude/rules/spec-pipeline.md | MODIFY | other | D2 — § Test Rules behavioral bullet only; § Gotchas untouched |
| .claude/rules/conventions/tests.md | MODIFY | other | D2, D3 — Mode line and Agent/exemplar line |
| .claude/agents/plugin-tests.md | MODIFY | other | D3 — description, opening paragraph, Read-before-writing list, mode bullet |
| .claude/agents/doctrine-author.md | MODIFY | other | D2 — the "pinned by regex tests" sentence |
| .claude/skills/spec-verify/SKILL.md | MODIFY | other | D2 — § Observe doctrine-claims bullet |
| .claude/commands/doctrine-review.md | MODIFY | other | D2 — the parenthetical in the opening paragraph |
| README.md | MODIFY | other | D2 — § Notes for plugin authors, first bullet |
| docs/canonical/doctrine-governance.md | MODIFY | other | D2 — second bullet (Canonical Delta applied in the build wave so AC-20261101-04-3 can go green; review's close finds it applied) |
| docs/adr/0037-prose-is-pinned-by-reference-not-wording.md | CREATE | other | D7 |
| tests/helpers.js | MODIFY | tests | D4 — `sliceSection`, `section`, `phrase` exported; AC-20261101-04-1, AC-20261101-04-2 |
| tests/prose-helpers.test.js | CREATE | tests | AC-20261101-04-1, AC-20261101-04-2 |
| tests/consistency/prose-pins.test.js | CREATE | tests | AC-20261101-04-3, AC-20261101-04-4 |
| tests/consistency/dead-stops.test.js | MODIFY | tests | D4 — local `section`/`whole` replaced by the helpers import; D5 — wording pins removed |
| tests/doctrine-review.test.js | MODIFY | tests | D5 — wording pins removed; the header comment's "regex pins on past incidents" becomes "pins on references and tokens" |
| tests/run-ledger.test.js | MODIFY | tests | D5 — wording pins removed; the header comment's "not by regexing command prose" becomes "not by matching command prose" |
| tests/spec-status.test.js | MODIFY | tests | D5 — wording pin removed |
| tests/commit/escape-row-in-commit.test.js | MODIFY | tests | D5 — wording pins removed |
| tests/commit/secrets-scan.test.js | MODIFY | tests | D5 — wording pin removed |
| tests/review/reviewer-seat.test.js | MODIFY | tests | D5 — wording pins removed |
| tests/review/reviewer-scope-identity.test.js | MODIFY | tests | D5 — wording pins removed |
| tests/review/prototype-close.test.js | MODIFY | tests | D5 — wording pin removed |
| tests/init-gen/policy-round.test.js | MODIFY | tests | D5 — wording pin removed |
| tests/queue/queue-hygiene.test.js | MODIFY | tests | D5 — wording pins removed |
| tests/release-legs/unmeasured.test.js | MODIFY | tests | D5 — wording pin removed |
| tests/consistency/citations-check.test.js | MODIFY | tests | D5 — wording pin removed |
| tests/consistency/critical-tier-doctrine.test.js | MODIFY | tests | D5 — wording pins removed |
| tests/consistency/model-placement.test.js | MODIFY | tests | D5 — wording pin removed |
| tests/consistency/policy-readers.test.js | MODIFY | tests | D5 — wording pin and one wording clause removed |
| tests/consistency/replay-retired.test.js | MODIFY | tests | D5 — wording pin removed |
| tests/consistency/structural-triggers-doctrine.test.js | MODIFY | tests | D5 — the all-wording § Tiers case deleted; AC-20261029-05-7 stays cited by the file's other cases |

## Contracts

```js
// tests/helpers.js — additions (D4). Zero dependencies; node:assert only.

// The lines of `text` from the first line matching `startRe` up to, excluding, the next line
// matching `endRe`; to the end of text when `endRe` never matches after it. Throws an
// AssertionError whose message contains `label` and String(startRe) when no line matches
// `startRe`.
function sliceSection(text, startRe, endRe, label)

// read(rel) sliced by sliceSection. A missing file fails with a message containing `rel` and
// "must exist"; a missing heading fails with a message containing `rel` and "must keep the
// heading". One failure, naming the remedy, never a TypeError.
function section(rel, startRe, endRe)

// new RegExp(source, flags) where source is `literal` with every regex metacharacter
// (. * + ? ^ $ { } ( ) | [ ] \ /) escaped and every maximal run of whitespace replaced by \s+.
// Leading and trailing whitespace of `literal` is trimmed first.
function phrase(literal, flags = '')

module.exports = { …existing, sliceSection, section, phrase }
```

## Behavior

### Replacement text per surface (D2) — the pinned retired phrases are `regexes over prose`, `regex pin`, `regex pins`, `regex-pin`, `by regex`

- `.claude/rules/spec-pipeline.md` § Test Rules, the "Tests are **behavioral**" bullet: the
  final sentence "Regexes over prose are not tests — a rule that matters gets a script (core §
  Incident Policy)." becomes "Prose is pinned only for references, retired phrases and protocol
  tokens (core § Doctrine Authoring), sliced by heading with `section` and spelled with `phrase`
  from `tests/helpers.js` so a reflow never reds a pin; a pin on wording is not a test — a rule
  that matters gets a script (core § Incident Policy)."
- `.claude/rules/conventions/tests.md`: the Mode bullet becomes "Mode: behavioral —
  exec-a-script in a `tmpdir()` synthetic host. Prose pins only for references, retired phrases
  and protocol tokens (core § Doctrine Authoring), sliced by heading (`section`) with reflow-safe
  literals (`phrase`); never the wording of a rule. Fixtures only for realistic multi-file
  inputs." The Agent bullet becomes "Agent: `plugin-tests` · exemplars: `tests/merge-back.test.js`
  (exec-a-script), `tests/consistency/dead-stops.test.js` (prose pins)."
- `docs/canonical/doctrine-governance.md`, second bullet: "**Prose is pinned for three things
  only** (core.md § Doctrine Authoring): references it must keep, phrases it must no longer
  contain, and protocol tokens an executor prints verbatim; a pin on the wording of a rule is
  not a test — `/doctrine-review` reads wording (ADR-0037)."
- `README.md`, first bullet of § Notes for plugin authors: "pinned by behavioral tests that
  execute them — never regexes over prose" becomes "pinned by behavioral tests that execute them;
  prose is pinned only for the references, retired phrases and protocol tokens it must keep
  (core § Doctrine Authoring)".
- `.claude/agents/doctrine-author.md`: "and much of the prose is pinned by regex tests in
  `tests/`" becomes "and `tests/` pins the references, retired phrases and protocol tokens the
  prose must keep (core § Doctrine Authoring) — keep a pinned heading, path, flag or token
  verbatim and on one line".
- `.claude/skills/spec-verify/SKILL.md` § Observe: the doctrine-claims bullet becomes "Doctrine
  references and tokens are verified over the markdown itself with `section`/`phrase` from
  `tests/helpers.js` — the mode `tests/consistency/dead-stops.test.js` uses; wording is read,
  never matched."
- `.claude/commands/doctrine-review.md`: "gets `npm test` (regex pins on *past* incidents)"
  becomes "gets `npm test` (pins on references and tokens, never on wording)".

### plugin-tests.md (D3)

- `description`: "Owns tests/*.test.js and tests/fixtures — use for authoring or extending the
  node:test suite that pins scripts by execution, doctrine references and tokens by
  heading-sliced pins, and workflow source by shape; never writes implementation code."
- Opening paragraph: "…`node:test` files that pin gate scripts by execution, doctrine references,
  retired phrases and protocol tokens by heading-sliced pins, and workflow source by shape."
- Read-before-writing list: `tests/doctrine-review.test.js` (doctrine regex-pin mode) →
  `tests/consistency/dead-stops.test.js` (prose-pin mode: `section`/`phrase`).
- Mode bullet, the doctrine clause: "doctrine pins over `section()` slices, for three kinds
  only — references the prose must keep, phrases it must no longer contain, protocol tokens it
  prints verbatim — spelled with `phrase()` so a hard-wrap never reds them; never an adjective,
  a synonym alternation, or a sentence of intent (core § Doctrine Authoring)".

### Wording pins removed (D5) — file :: line at the pre-image :: pin

Lines are the pre-image's; the worker matches by the regex or literal, never by line number.

- tests/doctrine-review.test.js :: 30 `/context-free|stranger/i` · 32 `/under-deliver|improvise/i` · 34 `/contradict/i` · 36 `/uncorrelated|independent/i` · 41 `/advisory/i` · 43 `/never blocks|does not block/i`
- tests/run-ledger.test.js :: 52 `/derived by \`verdict\.js\`, never asserted in prose/` · 55 `/Never hand-write the word/` · 126 `/carry, correct, or delete/` · 140 `/not (a|an) .{0,40}carrier|never a carrier|…/` · 144 `/dispos/`
- tests/spec-status.test.js :: 980 `/verbatim, as a fenced code block/`
- tests/commit/escape-row-in-commit.test.js :: 28 `/one escape row/i` · 32 the `/class/` match on the AskUserQuestion sentence · 49 the "`"fix"` line within 3 lines of `landed`" proximity assert · 56 `'A commit never earns both rows'` · 77 README `/escape row/` · 120 the ground-truth sentence literal · 121 `/commit-time escape row still lands/` · 124 fix.md `/escape row/` (kept as references: 40 the `spec`/`reviewRunId`/`pick` field names, 44 `sha`/`HEAD`, 54 `exit 3`/`"fix"`)
- tests/commit/secrets-scan.test.js :: 112 `'Secrets never stage silently'`
- tests/review/reviewer-seat.test.js :: 54 `/policy\.models[^.]*overrid|overrid[^.]*policy\.models/` · 56 `/fresh-context/`
- tests/review/reviewer-scope-identity.test.js :: 31 `/whatever\s+its author, subject line, or apparent subject matter/i` · 34 `/it never defines\s+one|never a definition/i` · 41 `` /red at `<base>`/ `` · 43 `/\bboth\b/i` · 45 `/fails \(1\) by construction/i` · 47 `/soft.{0,40}finding carrying both command outputs/is`
- tests/review/prototype-close.test.js :: 270 `'unmerged commits'`
- tests/init-gen/policy-round.test.js :: 128 `/AskUserQuestion. dismissed[^\n]*STOP[^\n]*except the two policy rounds/`
- tests/queue/queue-hygiene.test.js :: 195 `/never tick/` · 202 `` /`Agent \{model: "haiku"\}` per flagged item/ `` · 203 `` /presumed `done`/ `` · 204 `` /`keep` only with/ `` · 205 `/No agent, no proposal/`
- tests/release-legs/unmeasured.test.js :: 204 `/never promote over a leg that observed nothing/`
- tests/consistency/citations-check.test.js :: 252 `/advisory/i`
- tests/consistency/critical-tier-doctrine.test.js :: 24 `"the spec's own gated test must still execute"` · 30 `/critical/` (kept as references: 26 `` 'refused at lock by `ac-matrix --lint`' ``, 29 the template section check, 31 `/missing-literal/`)
- tests/consistency/dead-stops.test.js :: 40 `/same\s+wave/` · 41 `/\bONE\b[^\n]*AskUserQuestion|AskUserQuestion[^\n]*\bONE\b/` · 57 `/only\s+the\s+user\s+waives/` · 70 `/at\s+most\s+FOUR/` · 88 `/never\s+tick\s+without\s+a\s+yes/` · 95 `/exactly\s+one/` (kept: 80 `/queued/` — a report-render slot name)
- tests/consistency/model-placement.test.js :: 49 README `'fresh-context reviewer'`
- tests/consistency/policy-readers.test.js :: 42 `'still no spec'` · 59 the `'only when it is tracked'` clause only — the assert keeps its `'policy.ledgerCommitted'` clause (the one sanctioned narrowing: a single assert that ANDs a reference with wording keeps the reference)
- tests/consistency/replay-retired.test.js :: 120 the ground-truth sentence literal (`'## Feedback Loop'` presence and the `!/replay/i` retired pin stay)
- tests/consistency/structural-triggers-doctrine.test.js :: 21 `'non-empty Data Model is critical'` — the case's only assertion, so the `core.md § Tiers` case is deleted whole
- Kept although an agent flagged them: tests/consistency/base-derivation.test.js:112 (the order of two field names is a reference).

Every case above except structural-triggers-doctrine's § Tiers case keeps at least one
reference, retired-phrase or token assertion; that one case's AC-20261029-05-7 is cited by five
other cases in the same file. So no file is deleted and no AC citation is stranded (A2).

### Kind test the worker applies to anything not listed

Reference: a path, `spec-paths` key, flag, heading, step label, command name, table cell or
count. Retired: a `doesNotMatch`/`!includes` on a phrase the prose must not carry. Token: a
string the executor prints or offers verbatim (`📌 …`, `(Recommended)`, `AskUserQuestion`, a
quoted command line). Anything else that matches prose is wording — and is not in this spec's
list, so it stays; the worker returns `blocked {kind: "stale-assumption"}` naming it rather than
deleting on its own judgement.

## Acceptance Criteria

- **AC-20261101-04-1**: WHEN `phrase('spec-paths worktree-include')` is tested against `'spec-paths\n  worktree-include'` and `'spec-paths worktree-include'` THE SYSTEM SHALL match both, and SHALL NOT match `'spec-paths-worktree-include'`; `phrase('a.b (c) [d]')` SHALL match `'a.b (c) [d]'` and SHALL NOT match `'axb (c) [d]'`; `phrase('  Hard  stop ', 'i')` SHALL have source `Hard\s+stop` and flags `i` → writes tests/prose-helpers.test.js
- **AC-20261101-04-2**: WHEN `sliceSection('## A\nx\n## B\ny', /^## A$/, /^## /, 'f')` runs THE SYSTEM SHALL return `'## A\nx'`; with `/^## B$/` it SHALL return `'## B\ny'` (no later heading → to the end); with `/^## C$/` it SHALL throw an `AssertionError` whose message contains `f` and `/^## C$/`; and `section('spec/doctrine/core.md', /^## Doctrine Authoring$/, /^## /)` SHALL return text starting with `## Doctrine Authoring` while `section('spec/doctrine/nope.md', /^## X$/, /^## /)` SHALL throw an `AssertionError` whose message contains `spec/doctrine/nope.md` and `must exist` → writes tests/prose-helpers.test.js
- **AC-20261101-04-3**: WHEN each of `spec/doctrine/core.md` (§ Doctrine Authoring slice), `.claude/rules/spec-pipeline.md` (§ Test Rules slice only), `.claude/rules/conventions/tests.md`, `.claude/agents/plugin-tests.md`, `.claude/agents/doctrine-author.md`, `.claude/skills/spec-verify/SKILL.md`, `.claude/commands/doctrine-review.md`, `README.md` and `docs/canonical/doctrine-governance.md` is read THE SYSTEM SHALL match none of `phrase('regexes over prose', 'i')`, `phrase('regex pin', 'i')`, `phrase('regex-pin', 'i')`, `phrase('by regex', 'i')`, and the core.md slice SHALL match `phrase('§ Incident Policy')` (e.g. core.md pre-image → red on `regexes over prose`; post-image → green) → writes tests/consistency/prose-pins.test.js
- **AC-20261101-04-4**: WHEN `.claude/agents/plugin-tests.md` and `.claude/rules/conventions/tests.md` are read THE SYSTEM SHALL find `tests/consistency/dead-stops.test.js` in both, `tests/merge-back.test.js` in both, `section` and `phrase` in plugin-tests.md's § Critical Constraints slice (`/^## Critical Constraints$/` to `/^## /`), and SHALL NOT find `tests/doctrine-review.test.js` in plugin-tests.md → writes tests/consistency/prose-pins.test.js

## Assumptions (escalation triggers)

- A1: The pre-image line numbers in § Behavior "Wording pins removed" identify the assertions, but the worker matches on the regex or literal text — **if false** (a listed pin is not found by its text): return `blocked {kind: "stale-assumption"}` naming the file and pin; never delete a neighbour.
- A2: Exactly one test case loses its last assertion under D5 (structural-triggers-doctrine's § Tiers case, whose AC-ID five sibling cases still cite), so no file is deleted and no done spec's AC-ID loses its last citing test. Checked at lock by reading every listed case (three classification agents, 2026-11-01) — **if false** at build: delete the empty case, grep its AC-IDs across `specs/`, tag each bullet `[retired: specs/20261101/04-the-suite-pins-references-not-wording.md]` in the same batch, and list the spec file in the build receipts as a deviation.
- A3: `tests/consistency/read-load.test.js` and `prose-cap.js` place no line budget on the surfaces D1–D3 edit (checked: no cap names core.md, plugin-tests.md or tests.md; § Gotchas' 15-entry cap is untouched because § Gotchas is not edited) — **if false**: condense within the edited paragraph only, never reflow a neighbouring one (Gotchas fifth trigger).
- A4: `collision-closure` at lock lists every test and doctrine hit for the retired literals `regexes over prose`, `regex pin`, `by regex`; every hit is in the File Plan or recorded as a waive in Rationale — **if false** (a hit outside the File Plan appears at build): add the file to the batch as a D2 pointer edit, never weaken the pin.
- A5: `scripts/plugin-bump.js --check` is green after D8 with only the `spec` plugin bumped (no file under `git/` changes) — **if false**: bump the plugin the check names with the same command.

## Rationale

**Why the ban exists.** The rule "never by regexes over prose" was added in the v7 consolidation
(2026-08-17) with no ADR. Its evidence is in the pipeline rules § Gotchas: the retired-literal
entry records a reflow splitting a literal and breaking a pin, one added `id` attribute breaking
four pins, and one narrowed enum reddening 25 tests across eight files; the first `[plugin]`
entry records a single-quote-form regex evaded by retyping one quote. A prose pin is fragile
(breaks on edits that change no meaning), evadable (a synonym passes it), and a second copy of
the rule (one binding home forbids that). § Incident Policy wants guards to be scripts.

**Why it was too broad.** In this repo the doctrine is the program an LLM executes, so most of
it cannot be executed in CI, and the blanket ban left it with no mechanical guard at all. The
suite ignored the ban — about 180 prose pins across 30 files at planning time — and the test
agent prescribed the opposite. Three pin kinds survive scrutiny because an executor cannot
paraphrase them: a reference (a path, flag or heading the executor must resolve; prior art:
markdown-link-check, Sphinx nitpicky, Vale existence rules), a retired phrase (prior art:
semgrep and Danger forbidden-token rules), and a protocol token the executor must emit verbatim.
Wording-of-intent pins (`/context-free|stranger/i`) are the class the ban was right about;
intent is guarded by `/doctrine-review`, which reads every doctrine diff, and by scripts when a
class recurs. Prior art for testing intent — promptfoo `llm-rubric`, DeepEval — is an LLM judge,
which this repo already has in `/doctrine-review`.

**Forks the user decided.** Wording pins are deleted, not turned into golden snapshots: a
snapshot is a second copy that reds on every reflow until re-approved. Existing keeper pins stay
in place: the canonical doc's own rule is touch-time dedup, never a sweep, and a consolidation
would move ~95 pins and their AC citations through ~30 files for no behavioral gain.

**Classification at plan time.** Three agents read every test file and tabled every prose pin
with a kind: 319 pins in 36 files — 154 reference, 66 retired, 42 token, 57 flagged wording,
of which 51 are deleted here and 6 were re-read as references (field names, exit codes, a slot
name). The split is roughly 48% reference, 21% retired, 13% token, 18% wording. Fable 5's
earlier estimate of 35% wording was high; the sampled files were the worst ones.

**Collision-closure waives (literals leg, lock time).** `docs/canonical/scripts.md` ("regex
pin" in a recorded gotcha about contiguous literals — history, not a rule statement, and not a
surface AC-3 reads); `tests/env-preflight.test.js` line 13, `tests/review/verdict.test.js` line
77 and `tests/verdict-require-leg.test.js` line 133 ("by regex" in test comments and a message
about shape parsing — unrelated meaning, not doctrine). The hits in `tests/doctrine-review.test.js`
and `tests/run-ledger.test.js` are closed by their File Plan rows. Every `likely`/`mentions`
paths-leg hit is visibility only; the build's whole-suite check adjudicates.

**What to watch.** `escape-row-in-commit.test.js` lost eleven assertions written four days ago;
its cases still hold the path, flag, token and retired-phrase pins that matter. § Gotchas in
spec-pipeline.md still says "dense regex pins" — it is history, written only by review close,
and AC-3 slices § Test Rules so that line never trips it.

## Canonical Delta

`docs/canonical/doctrine-governance.md`, second bullet, is replaced in the build wave by the
text in § Behavior (D2) so AC-20261101-04-3 can go green; review's close finds it already
applied and changes nothing further.
