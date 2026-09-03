---
date: 2026-09-02
status: hardened
tier: critical             # question-style-gate.js is a hook surface (pipeline rules § Risk Tiers); spec/bin/spec-paths gains a key
area: mocks
design: false
breaking: false
depends_on: []
depended_on_by: [specs/20260902/07-mocks-command-driver.md]
brief: 22
open_markers: 0
spiked: 2026-09-02
---

# Mocks provenance ledger + the question gate's product-stage exemption

## Goal

Land the record every later design stage is gated on: a markdown provenance ledger
(`design/mocks/ledger.md`) with fixed-word columns a script parses, counts, and turns into one
advance/blocked verdict — a product-kind claim that is the session's invention, or an inference
the user never confirmed, blocks; process claims are listed, never asked. The question-style
gate stops auto-deriving product facts: while a mocks run or a genesis run is live in the
repo, the tier-2 judge can no longer return `derive`, and its prompt states that a document
citing a subject is not the user deciding it. Done = the parser round-trips the Hearwell dry
run's ledger, the gate verdict is executable, and the hook exemption is measured red/green.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | The ledger is a markdown file, `design/mocks/ledger.md`, with two tables in fixed columns — Assumptions `id · step · kind · claim · tag · status · rejected · dependents · note` and Misunderstandings `id · what · step · cost · note` — parsed by `spec/scripts/lib/mocks-ledger.js`; every enum cell is one fixed word (tag ∈ `said-by-user\|ratified-doc\|inferred\|invented`, status ∈ `open\|confirmed\|overridden\|decided` + optional ISO date, kind ∈ `product\|process`) and free text lives only in `claim`/`rejected`/`note` (AC-20260902-06-1, AC-20260902-06-2) | JJ picked markdown over JSON: the dry run's table was readable and hand-editable; what it lacked was fixed words (spike: 15/74 tag cells and 22/74 status cells were free text). Same grammar posture as the genesis brief the driver already parses. |
| D2 | Gate verdict: a ledger is **blocked** when any `product` row has tag `invented` with status other than `overridden`, or tag `inferred` with status `open`; `ratified-doc` rows and every `process` row never block; the verdict names every blocking row (AC-20260902-06-3) | The brief's rule verbatim. `ratified-doc` is distinct on purpose: the user ratified it as prose (M9 showed prose survives until rendered), so it is counted separately and re-tested on screens, never re-asked before the first screen. |
| D3 | Counts render as one fixed line, `📒 ledger: {S} said-by-user · {R} ratified-doc · {I} inferred ({Io} open) · {V} invented ({Vo} open) · {P} process · {C} catches`, counting product rows per tag, process rows in one bucket, misunderstanding rows as catches (AC-20260902-06-4) | The driver prints it at every mark (spec 07); one shape so a reader learns it once. |
| D4 | The lib is the one writer of rows: `appendAssumption`, `appendCatch`, `setStatus` rewrite only the touched row/table and leave every other byte identical; `\|` inside a cell is written escaped and read back unescaped (AC-20260902-06-5) | A session `printf`-ing rows is the class that put malformed rows into the escape ledger (escape-row.js's own header); one writer, byte-stable edits. |
| D5 | `question-style-gate.js` gains a **product-stage exemption**: when `<root>/design/mocks/status.json` exists with `state` ≠ `APPROVED`, or `<root>/.claude/genesis/status.json` exists with `handoff` null, a judge verdict of `derive` is treated as `pass`; `<root>` = `CLAUDE_PROJECT_DIR`, else the hook input's `cwd`, else the process cwd. `rewrite` verdicts and every tier-1 check are unchanged (AC-20260902-06-6, AC-20260902-06-7) | Measured on Hearwell (M4): the judge blocked a product question because a document cited the subject, and the session auto-picked. In a mocks or genesis run every question is a user decision by construction, so `derive` has no legitimate target there. Rejected: a per-question `metadata.source` tag — its delivery to the hook is undocumented and unverifiable without a restart-bound hook install (Rationale). |
| D6 | The judge prompt gains one rule sentence in its verdict list: `A document that cites, discusses, or recommends a subject is never the user deciding it; a product fact (who, what, platform, payer, tenancy, what a screen does) is never "derive" — ask it.` (AC-20260902-06-8) | The dry run's rule 6; the sentence binds outside the stage window too, where `derive` still exists for repo facts. |
| D7 | New doctrine file `spec/doctrine/mocks.md` (frontmatter + `## Provenance Ledger`) resolved by the new `spec-paths shared-mocks` key; core § Question Style gains one sentence: product facts are asked, never derived, and the product-stage exemption is the mechanism (AC-20260902-06-9) | design.md is pinned to exactly five headings and ≤160 lines (AC-20260824-05-1/2), so the mocks doctrine needs its own file, the way genesis has one; spec 07 grows it with the state machine. |
| D8 | Fixture `tests/fixtures/mocks-ledger/dry-run.md` — the Hearwell ledger normalized to D1's grammar (74 assumption rows, 13 catches) — is committed at plan time and is the parser's realistic corpus (AC-20260902-06-1) | The brief: "Spec 1's fixtures derive from it". Pre-generated here because the source lives outside this repo; workers never read another repo. |
| D9 | Version bump `spec/.claude-plugin/plugin.json` → 7.60.0 (target; build bumps to the next free minor and records a departure), description changelog entry names the ledger grammar and the exemption | Pipeline rules § Planning; concurrent sessions race the semver (§ Gotchas). Existing pin: tests/consistency/plugin-version.test.js. `[no-ac: covered by the standing plugin-version pin]` |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/mocks-ledger.js | CREATE | scripts | D1–D4: `parseLedger(text)`, `gateVerdict(ledger)`, `countsLine(ledger)`, `appendAssumption(text,row)`, `appendCatch(text,row)`, `setStatus(text,id,status,[tag])`; pure text-in/text-out, no fs |
| spec/scripts/question-style-gate.js | MODIFY | scripts | D5/D6: product-stage exemption (root resolution, status reads) + the prompt sentence; fail-open on any read error |
| spec/doctrine/mocks.md | CREATE | doctrine | D7: frontmatter + `## Provenance Ledger` — grammar, tags, gate rule, counts line, the "one writer" rule |
| spec/doctrine/core.md | MODIFY | doctrine | D7: one sentence in § Question Style (product facts asked, never derived; the stage exemption) |
| spec/bin/spec-paths | MODIFY | scripts | D7: `shared-mocks` key → `$ROOT/doctrine/mocks.md`; usage line updated |
| spec/templates/mocks-ledger.md | CREATE | doctrine | D1: the empty ledger — title, the two table headers, a grammar comment naming the fixed words |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D9: version + changelog entry |
| tests/mocks/mocks-ledger.test.js | CREATE | tests | AC-20260902-06-1, AC-20260902-06-2, AC-20260902-06-3, AC-20260902-06-4, AC-20260902-06-5 |
| tests/question-style-gate.test.js | MODIFY | tests | AC-20260902-06-6, AC-20260902-06-7, AC-20260902-06-8 |
| tests/spec-paths.test.js | MODIFY | tests | AC-20260902-06-9 |

Pre-existing input (no row): `tests/fixtures/mocks-ledger/dry-run.md` (D8, committed with this spec).

## Contracts

```js
// spec/scripts/lib/mocks-ledger.js — pure text functions; callers own file I/O.
// Grammar (D1). Header rows are matched by cell names, not position of the table in the file.
// Assumptions:  | id | step | kind | claim | tag | status | rejected | dependents | note |
//   id      ^[A-Z]+\d+[a-z]?$   unique across the table
//   step    ^[A-Z][A-Z-]*$      (SEED, SHAPES, WIREFRAMES, THEME, SKIN, REVIEW, GENESIS, …)
//   kind    product | process
//   tag     said-by-user | ratified-doc | inferred | invented
//   status  (open|confirmed|overridden|decided)( \d{4}-\d{2}-\d{2})?   — `decided` only on process rows
//   rejected, dependents, note   free text; `-` = empty; `\|` inside a cell = a literal pipe
// Misunderstandings:  | id | what | step | cost | note |     id ^M\d+$ unique; note = originating note id or `-`
//
// parseLedger(text) -> { assumptions: Row[], catches: Catch[], errors: Err[] }
//   Row   = {id, step, kind, claim, tag, status, statusDate|null, rejected, dependents, note, line}
//   Catch = {id, what, step, cost, note, line}
//   Err   = {id|null, line, column|null, message}   // e.g. {id:'W7', column:'tag', message:'tag "inferred (my recommendation)" — allowed: said-by-user|ratified-doc|inferred|invented'}
//   A missing table header is one Err {column:null, message:'no Assumptions table header …'}.
// gateVerdict(ledger) -> { open: boolean, blocking: [{id, tag, status}] , errors: Err[] }
//   errors non-empty ⇒ open:false with blocking:[] (a ledger that does not parse never opens a gate)
// countsLine(ledger) -> string   (D3's fixed shape)
// appendAssumption(text, row) -> text ; appendCatch(text, row) -> text   (validated first; throws Error naming the column on a bad row)
// setStatus(text, id, status, tag?) -> text   (rewrites that row's status cell — and tag cell when given — nothing else)
```

```js
// question-style-gate.js — D5 root resolution and stage read (fail-open: any throw → no exemption)
function productStageRoot(input) {           // input = the parsed hook JSON
  return process.env.CLAUDE_PROJECT_DIR || (input && input.cwd) || process.cwd()
}
function inProductStage(root) {
  // design/mocks/status.json with state !== 'APPROVED'  OR  .claude/genesis/status.json with handoff == null
}
// judge(): verdict 'derive' && inProductStage(root) → return null (allow). 'rewrite' unchanged.
```

Judge prompt (D6) — the exact sentence inserted after the `"derive"` verdict line:

```
- A document that cites, discusses, or recommends a subject is never the user deciding it; a product fact (who, what, platform, payer, tenancy, what a screen does) is never "derive" — ask it.
```

`spec-paths shared-mocks` → `<plugin>/doctrine/mocks.md`. `spec/templates/mocks-ledger.md`:

```markdown
# Provenance ledger — { project }

<!-- Grammar: spec/doctrine/mocks.md § Provenance Ledger. Enum cells are one fixed word:
     kind product|process · tag said-by-user|ratified-doc|inferred|invented ·
     status open|confirmed|overridden|decided (+ optional YYYY-MM-DD). Free text only in
     claim / rejected / note; write a literal pipe as \| . Rows are written by the mocks driver
     (spec-paths mocks-driver), never by hand-typed printf. -->

## Assumptions

| id | step | kind | claim | tag | status | rejected | dependents | note |
| - | - | - | - | - | - | - | - | - |

## Misunderstandings

| id | what | step | cost | note |
| - | - | - | - | - |
```

## Behavior

- Parsing is header-driven: the first pipe row whose cells equal the Assumptions header (order
  and names) starts that table; rows continue until a blank line or a non-pipe line. Same for
  Misunderstandings. A ledger with both headers but zero rows parses clean (empty arrays).
- Escaping: `\|` in a cell is a literal pipe; the writer escapes on append and the parser
  unescapes on read, so `claim` may contain the dry run's `a \| b` fragments.
- `status` keeps its date: `confirmed 2026-09-02` → `{status:'confirmed', statusDate:'2026-09-02'}`;
  a bare `confirmed` → `statusDate:null`. Any other trailing text is an Err on that row.
- Gate on the fixture: 35 blocking rows (30 `inferred open` + 5 `invented open`); `process`
  rows (8) and `ratified-doc` rows (8) never appear in `blocking`.
- Exemption window: reads happen on every hook invocation, cheap `fs.existsSync` + one
  `JSON.parse` each; an unparsable status file counts as absent (fail-open toward the existing
  `derive` behavior, never toward blocking).
- Nothing in this spec asks the ledger to be created — spec 07's driver creates it from the
  template at SEED. The lib operates on text and is safe on an absent file (callers pass `''`
  → `errors:[{message:'no Assumptions table header …'}]`).

## Acceptance Criteria

- **AC-20260902-06-1**: WHEN `parseLedger` reads `tests/fixtures/mocks-ledger/dry-run.md`
  THE SYSTEM SHALL return 74 assumption rows and 13 catches with `errors: []`, and row `P1b`
  SHALL parse as `{id:'P1b', step:'SEED', kind:'product', tag:'said-by-user',
  status:'confirmed', statusDate:'2026-09-02'}` while row `A3` parses `kind:'process',
  tag:'invented', status:'decided', statusDate:null` → `tests/mocks/mocks-ledger.test.js`
- **AC-20260902-06-2**: WHEN a row carries a tag, status, or kind cell outside the fixed
  words THE SYSTEM SHALL report one Err naming the id, the column, and the allowed words
  (`| W7 | WIREFRAMES | product | c | inferred (my recommendation) | open | - | - | - |` →
  `{id:'W7', column:'tag', message:'tag "inferred (my recommendation)" — allowed:
  said-by-user|ratified-doc|inferred|invented'}`), a duplicate id SHALL be an Err naming both
  lines, a `decided` status on a `product` row SHALL be an Err, and `gateVerdict` on a
  ledger with any Err SHALL return `{open:false, blocking:[]}` → `tests/mocks/mocks-ledger.test.js`
- **AC-20260902-06-3**: WHEN `gateVerdict` evaluates a ledger THE SYSTEM SHALL return
  `open:false` listing exactly the product rows that are `invented` (status ≠ `overridden`)
  or `inferred` + `open` (fixture: 35 rows, first `W1`, includes `W10` and `T2`, never `A3`
  or `P1`), and `open:true, blocking:[]` for a ledger whose only non-confirmed rows are a
  `process invented decided` row and a `product ratified-doc open` row →
  `tests/mocks/mocks-ledger.test.js`
- **AC-20260902-06-4**: WHEN `countsLine` renders the fixture THE SYSTEM SHALL print exactly
  `📒 ledger: 21 said-by-user · 8 ratified-doc · 32 inferred (30 open) · 5 invented (5 open) · 8 process · 13 catches`
  → `tests/mocks/mocks-ledger.test.js`
- **AC-20260902-06-5**: WHEN `appendAssumption` adds `{id:'X1', step:'SEED', kind:'product',
  claim:'a | b', tag:'invented', status:'open'}` to the template text THE SYSTEM SHALL write
  the cell as `a \| b`, the result SHALL re-parse to one row whose `claim` is `a | b`, and
  WHEN `setStatus(text,'X1','confirmed 2026-09-02','said-by-user')` runs THE SYSTEM SHALL
  change only that row's status and tag cells (every other line byte-identical; a diff of the
  two texts is exactly one line) → `tests/mocks/mocks-ledger.test.js`
- **AC-20260902-06-6**: WHEN the fake judge returns `{"verdict":"derive","problems":["x"]}`
  and the hook runs with `CLAUDE_PROJECT_DIR` pointing at a tmpdir holding
  `design/mocks/status.json` = `{"state":"WIREFRAMES"}` THE SYSTEM SHALL exit 0; with
  `.claude/genesis/status.json` = `{"handoff":null}` it SHALL exit 0; with the same tmpdir
  holding `design/mocks/status.json` = `{"state":"APPROVED"}` and no genesis file it SHALL
  exit 2 with the existing `BLOCKED — this looks answerable without the user` message; and
  with no `CLAUDE_PROJECT_DIR` but hook input `{"cwd": <that tmpdir>, …}` the mocks case
  SHALL exit 0 → `tests/question-style-gate.test.js`
- **AC-20260902-06-7**: WHEN the fake judge returns `rewrite` inside the same product-stage
  tmpdir THE SYSTEM SHALL CONTINUE TO exit 2 with the `unanswerable in ten seconds` message,
  and a tier-1 failure (description under the floor) SHALL CONTINUE TO exit 2 before any judge
  runs → `tests/question-style-gate.test.js` (tag the existing rewrite/tier-1 tests with this
  ID; add the in-stage variant)
- **AC-20260902-06-8**: WHEN the judge is invoked THE SYSTEM SHALL pass a prompt containing
  the literal sentence `A document that cites, discusses, or recommends a subject is never the user deciding it`
  (fake judge bin writes its argv to a file; the test reads it back) → `tests/question-style-gate.test.js`
- **AC-20260902-06-9**: WHEN `spec-paths shared-mocks` runs THE SYSTEM SHALL print an
  absolute path ending in `spec/doctrine/mocks.md`, that file SHALL exist with a `## Provenance
  Ledger` heading, and `spec-paths` with no arguments SHALL CONTINUE TO print the plugin root →
  `tests/spec-paths.test.js`

## Assumptions (escalation triggers)

- A1: The dry-run ledger's tables parse by row shape (executed 2026-09-02: 74 seven-cell rows +
  13 four-cell rows, 0 unparseable `kind` cells; 15 `tag` and 22 `status` cells free-text) —
  normalized into the fixture with the mapping "first fixed word wins, remainder → note"
  (`said-by-JJ` → `said-by-user`; `confirmed via BRIEF` → `ratified-doc`; `answered/recorded
  <date>` → `confirmed <date>`; `—` tag → `invented`); the fixture re-parses with 0 errors and
  35 blocking rows (executed, `normalize-ledger.js`, scratchpad). **if false:** the fixture is
  the spec's own artifact — fix the fixture, never the grammar.
- A2: `CLAUDE_PROJECT_DIR` is set for hook processes and the hook input carries `cwd` — both
  are already relied on by `spec-state-gate.sh` (`${CLAUDE_PROJECT_DIR:-.}`) and
  `spec-session-stamp.sh` (`.cwd`). **if false:** the exemption never fires (fail-open to the
  current behavior) and the test's env-driven cases still pass; the `cwd` case would fail →
  drop that clause of AC-6 and record the departure.
- A3: The judge's `derive` verdict has no legitimate target inside a mocks or genesis run
  (every question there is a user decision: coverage keys, menu picks, product facts). **if
  false:** a repo-fact question asked during that window loses one advisory check; the
  tier-1 floor and `rewrite` still apply — acceptable, noted in Rationale.
- A4: `metadata.source` on `AskUserQuestion` is NOT delivered to the hook in any documented
  way (claude-code-guide, official hooks reference: `tool_input` = "the tool's arguments;
  structure varies by tool type"; the AskUserQuestion input schema is undocumented). **if
  later shown delivered:** a per-question tag can narrow D5's window in a follow-up; nothing
  here depends on it.
- A5: design.md stays untouched (five-heading + 160-line pins). **if a worker is tempted to
  put the ledger doctrine there:** blocked — D7 names mocks.md.

## Rationale

The ledger is the mechanism, not "ask when unsure": the dry run's fourteen catches all came
from the user looking at a screen, none from the session feeling unsure, so the gate must exist
by construction — a tag makes the question exist. Markdown won over JSON because the user
edits and reads it; the one thing the dry run lacked was fixed words, and the spike proved the
free text was confined to two columns. `ratified-doc` is deliberately non-blocking: forcing
every BRIEF-sourced fact back through a question is what JJ refused in the dry run ("Read
BRIEF.md for 11 questions"); rendering them is the re-test.

The exemption is stage-keyed rather than per-question because the only tag channel that would
not show on screen (`metadata.source`) is undocumented for hooks and cannot be verified
without installing a hook and restarting the CLI — a plan-time spike this session could not
execute. A header convention was rejected as a visible chip that would hide the real topic.
Stage-keying is verifiable with a tmpdir, and inside those windows `derive` has nothing to
catch. The judge sentence binds everywhere so the citation-is-not-a-decision rule also holds
in plan sessions.

Fragile: the counts line is a fixed string other specs will grep — change it only with its
AC. Rejected: appending catches to `.claude/spec-runs.jsonl` as rows (a second writer and a
second schema for a table that already lives in the repo; spec 11 reads the table directly).

## Canonical Delta

`docs/canonical/design.md` gains a section **Provenance ledger (specs/20260902/06)**: the
mocks ledger (`design/mocks/ledger.md`) is a markdown file with fixed-word columns parsed by
`spec/scripts/lib/mocks-ledger.js`; a product row that is `invented` (not overridden) or
`inferred` + `open` blocks every advance; `ratified-doc` and process rows never block and are
counted on the `📒 ledger:` line; the lib is the one writer. `docs/canonical/pipeline.md` (or
the doctrine-governance file) notes under the question-style gate: the `derive` verdict is
suppressed while a mocks run (`design/mocks/status.json` not APPROVED) or a genesis run
(`.claude/genesis/status.json` with no handoff) is live, and the judge prompt states that a
citation is never a decision.
