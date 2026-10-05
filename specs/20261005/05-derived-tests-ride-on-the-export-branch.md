---
date: 2026-10-05
status: hardened
tier: standard
area: design
breaking: false
depends_on: []
brief: n/a
spiked: 2026-10-05
open_markers: 0
---

# Derived tests ride on the export branch

## Goal

The prototype freeze has the session write one end-to-end test per behaviour pin into the host's
main working tree and commit that file on main. Those tests are red by construction until the
hardening spec lands, so the host's gate on main is red in between: every other spec branched in
that window, and every direct change on main, meets a failing gate it did not cause (seen in the
walkthrough host with `tests/browser/12-proto.spec.ts`). After this spec the session writes the
tests in the prototype worktree, the freeze carries them onto `harden/<stem>` as a second commit,
and they reach a working branch only through the hardening spec's own harden merge. Done means:
after `--mark tests-derived` the main working tree holds no derived test file, `harden/<stem>`
does, a re-run after any refusal resumes cleanly, and the build accepts tests delivered by the
merge exactly as it accepted tests that were already on main.

This supersedes D4 of specs/20260928/02-freeze-export-and-the-contract.md (tests authored in the
main working tree) and narrows that spec's criterion 8 (`harden/<stem>` holds exactly the export
globs' diff): the data commit still holds exactly that diff, and the branch tip adds the tests.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | **The TESTS step names the worktree.** `printTestsStep` prints `File: <worktree rel>/<e2eFile> (prototype worktree — commit it on proto/<stem>) · title: \`<AC-ID> pin <id>: <note>\`` and `Session: write one test per line above in the prototype worktree and commit the file on proto/<stem>; each test must fail against <base> — the build's red check is the oracle.` `<worktree rel>` is `status.worktree`, `<base>` is `status.base`. The strings `(main working tree)` and `it must fail on main today` are gone from the driver. (AC-20261005-05-1) | The session acts on the printed step; the step must name where the file goes. |
| D2 | **Verification reads the prototype branch.** In `cmdMarkTestsDerived`, while `marks.closed` is unset and `git cat-file -e harden/<stem>:<e2eFile>` fails (the tests are not carried yet), these run in order, each exit 2 with nothing later run. (1) `proto/<stem>` does not exist → `harden/<stem> does not carry <e2eFile> and proto/<stem> is gone — remedy: commit the derived tests on harden/<stem> at <e2eFile> by hand (and delete any copy in the main working tree), then re-run --mark tests-derived`. (2) `<root>/<e2eFile>` exists on disk and `git cat-file -e <base>:<e2eFile>` fails → `<e2eFile> is in the main working tree — derived tests ride on harden/<stem>, never on <base>; remedy: move it to <worktree rel>/<e2eFile>, commit it on proto/<stem>, then re-run --mark tests-derived`. (3) `git cat-file -e proto/<stem>:<e2eFile>` fails → `<e2eFile> is not committed on proto/<stem> — remedy: write the derived tests at <worktree rel>/<e2eFile>, commit them on proto/<stem>, then re-run --mark tests-derived`. (4) `git -C <worktree> status --porcelain -- <e2eFile>` prints anything → `<e2eFile> has uncommitted edits in <worktree rel> — remedy: commit them on proto/<stem>, then re-run --mark tests-derived`. (5) every reserved AC id occurs in `git show proto/<stem>:<e2eFile>`, else today's `does not carry <AC-ID>` refusal. (6) `prototype.e2eList` with `{file}` substituted runs with **cwd = the prototype worktree**; non-zero exit and an unlisted id keep today's two refusals. When `harden/<stem>` already carries the file, all six are skipped. The read of `<root>/<e2eFile>` as the authored file is deleted. (AC-20261005-05-2, AC-20261005-05-3, AC-20261005-05-4, AC-20261005-05-8) | The committed blob is what gets exported, so it is what gets checked; a stray copy on main is the exact defect this spec removes, so it is refused, never ignored. |
| D3 | **A second, idempotent carry step.** `lib/freeze.js` gains `exportTests({ root, branch, stem, base, e2eFile })`, called by the driver right after `exportHarden` succeeds or is skipped, before the spec is written. When `git cat-file -e harden/<stem>:<e2eFile>` succeeds it returns `{ skipped: true }`. Otherwise: `git worktree add <root>/.claude/worktrees/harden-<stem> harden/<stem>` (the existing branch, no `-b`); `git diff <base>...proto/<stem> -- <e2eFile>` piped to `git -C <that worktree> apply --index`; commit with subject `harden(<stem>): derived behaviour tests from proto/<stem>`; remove the worktree. Any failing git step force-removes that worktree and returns `{ ok: false, message }` carrying the step's stderr; the driver dies with it. No status field is written: the branch content is the postcondition. `status.exported.files`, `status.exported.commit`, the brief's Data/API sub-plan and the ledger row's `exported` keep counting the data and API layer only. (AC-20261005-05-4, AC-20261005-05-5, AC-20261005-05-7) | Leaves `exportHarden` and its `marks.exported` guard untouched, and makes resume and an in-flight prototype exported by an older plugin the same code path. Rejected: adding the file to the one export diff — a run that exported before this change could never gain the tests. |
| D4 | **One File Plan row for the test file.** `buildFilePlanRows` takes the e2e file path and drops it from the export rows and from the outside-export rows; `writeSpec`'s `tests`-layer `CREATE` row stays the only row naming it. (AC-20261005-05-6) | The file is now part of the prototype branch's diff, so without the filter it gains a second row with layer `other`. |
| D5 | **The generated spec says where its tests are.** `spec/templates/prototype-spec.md` — Behavior: `…became exactly one derived end-to-end test, already authored, carried on \`harden/{{stem}}\`, and red against \`{{base}}\` — this spec's own Acceptance Criteria…`; A1 opens `the derived end-to-end tests, carried on \`harden/{{stem}}\` and red against \`{{base}}\` today, turn green once…`; Rationale: `The derived tests are red today by construction, asserting against contract ids the \`{{base}}\` tree does not yet reproduce, and they reach this spec's branch only through the \`harden/{{stem}}\` merge — \`{{base}}\` never carries them before this spec lands; this spec never tags one pre-green…`. Every other byte of the template is unchanged. (AC-20261005-05-9) | A cold reader of a generated spec must not look for the tests on main. |
| D6 | **Command prose follows the driver.** `spec/commands/prototype.md`: TESTS says the target file is authored in the prototype worktree and committed on `proto/<stem>`, each test fails against the base, `e2eList` runs in the worktree, and the refusal list gains the stray copy in the main working tree and the uncommitted file; its success sentence says the mark exports `harden/<stem>` — the data and API layer, then the derived tests as a second commit. CLOSED says: commit `design/prototypes/<stem>/`, the brief and the generated spec on main — never the e2e file, which rides on `harden/<stem>` and reaches main only through the hardening spec's merge. The Rules bullet reads `…lives under design/prototypes/<stem>/ on the main working tree, or on harden/<stem>…`. Edits replace text in place; the file's line count does not grow by more than 2. `[no-ac: prose — the driver criteria are the oracle, and tests/consistency/read-load.test.js bounds the length]` | Doctrine follows the driver; one binding home per rule. |
| D7 | **The design rule names the second survivor.** `spec/doctrine/design.md` § Design Canon, prototype paragraph: `…so any file the freeze or a later build must still read has to already be on main, or exported to \`harden/<stem>\` (the data and API layer and the derived tests), before that happens`, and the citation list gains this spec's path with `D3`. `[no-ac: prose — citations-check is the oracle for the citation]` | ADR-0030 already names tests among what is exported to the harden branch; the paragraph now agrees with it. |
| D8 | **The build is unchanged, and pinned.** No edit to `spec-build-driver.js`. A tests-row file delivered by the harden merge is part of the merged pre-image, exactly as a file already on main was. (AC-20261005-05-10) | Spiked green on the current driver; the pin guards the seam between the two stages after this spec's own tests expire. |
| D9 | The driver's header comment (the `--mark tests-derived` paragraph) says the derived file is committed on `proto/<stem>` and carried to `harden/<stem>`. `[no-ac: comment]` | Header comments state what the script does. |
| D10 | Bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`. `[no-ac: bump — plugin-bump.js --check is the oracle]` | Version discipline. |

## File Plan

<!-- Machine-consumed: the build stage parses this table into workflow batches.
     Layer ∈ the host config's layerGroups (flattened, in order) plus tests | other | baseline. -->

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/prototype-driver.js | MODIFY | scripts | D1, D2, D4, D9 — TESTS step lines, verification against `proto/<stem>`, the `exportTests` call, the e2e filter in `buildFilePlanRows` |
| spec/scripts/lib/freeze.js | MODIFY | scripts | D3 — `exportTests`, exported from the module |
| spec/templates/prototype-spec.md | MODIFY | doctrine | D5 — three sentences |
| spec/commands/prototype.md | MODIFY | doctrine | D6 — TESTS, CLOSED, one Rules bullet |
| spec/doctrine/design.md | MODIFY | doctrine | D7 — one sentence and its citation |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D10 — `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |
| tests/prototype/fixture.js | MODIFY | tests | shared helper `authorDerivedTests(dir, contract, opts)` — writes the e2e file in the prototype worktree and commits it on the prototype branch (`opts.commit === false` leaves it uncommitted; `opts.where === 'main'` writes it in the main working tree instead) |
| tests/prototype/freeze-tests-ride.test.js | CREATE | tests | AC-20261005-05-1, AC-20261005-05-2, AC-20261005-05-3, AC-20261005-05-4, AC-20261005-05-6, AC-20261005-05-7, AC-20261005-05-8, AC-20261005-05-9 |
| tests/prototype/freeze.test.js | MODIFY | tests | AC-20261005-05-5 (the rewritten harden-diff case). Fixture currency for every other case: each setup that wrote `e2e/proto-28.smoke.spec.ts` (and the lettered-brief `04a` case, if it writes one) into the main tree calls `authorDerivedTests` instead; original AC tags are kept; the case titled `…refuses naming the e2e file when it does not exist on main` is retitled `…when it is not committed on proto/<stem>` with its AC prefix unchanged |
| tests/prototype/freeze-tier.test.js | MODIFY | tests | fixture currency only — `drive` calls `authorDerivedTests`; original AC tags kept; no new criterion |
| tests/build/build-driver-lane.test.js | MODIFY | tests | AC-20261005-05-10 — one new case |

## Contracts

```js
// spec/scripts/lib/freeze.js
// Carries the derived test file from proto/<stem> onto harden/<stem> as its own commit.
// Idempotent by branch content: skipped when harden/<stem> already holds e2eFile.
exportTests({ root, branch, stem, base, e2eFile })
//   → { skipped: true, hardenBranch }                      harden/<stem>:<e2eFile> exists
//   → { ok: true, commit: '<sha>', hardenBranch }          committed
//   → { ok: false, message }                               a git step failed; worktree force-removed
```

`harden/<stem>` after a completed freeze, oldest first:

```
harden(<stem>): data and API layer exported from proto/<stem>     (absent when the export diff is empty)
harden(<stem>): derived behaviour tests from proto/<stem>
```

Order of work inside `--mark tests-derived` (unchanged steps in plain text, changed in bold):
`--tier` flag check → frozen check → **D2 verification (skipped once the branch carries the
tests or `marks.closed` is set)** → `exportHarden` → **`exportTests`** → write and lint the spec
(**File Plan without a second e2e row**) → `dbDestroy` → remove worktree and branch → ledger row
→ `marks.closed`. On the first run `harden/<stem>` does not exist when D2 runs, so `cat-file`
fails and the checks run; `exportHarden` creates the branch before `exportTests` needs it.

## Behavior

A session at TESTS reads the printed step, writes the tests under the prototype worktree at the
printed path, and commits them on `proto/<stem>` with its own git (the session owns git on that
branch already — round changes are commits there). In that worktree the tests can be run against
the live prototype; nothing in this spec requires it.

In-flight prototypes opened under an older plugin:

- **At TESTS with the file written in the main working tree, uncommitted** → refusal D2 (2);
  the session moves the file into the worktree, commits, re-runs.
- **Exported, then stopped at the risk-tier question, file in the main working tree** → the same
  refusal; after the move the re-run skips `exportHarden` and `exportTests` adds the tests commit.
- **Spec written, worktree and branch already deleted, ledger row not yet written, file in the
  main tree** → refusal D2 (1); the session commits the file on `harden/<stem>` by hand, deletes
  the main-tree copy and re-runs, which then skips to the ledger row. The driver itself can never
  produce this state: it deletes the prototype branch only after the tests are carried.
- **CLOSED** → nothing runs; the tests are already on main and the generated spec builds as before.

A host whose e2e file already exists on its base (a second prototype of one brief) is not refused
by D2 (2): the file is tracked there, the session edits it in the worktree, and the carried diff
is a modification.

## Acceptance Criteria

- **AC-20261005-05-1**: WHEN the bare run prints state `TESTS` on the fixture host THE SYSTEM SHALL print a `File:` line containing `.claude/worktrees/proto-28-functional-prototype/e2e/proto-28.smoke.spec.ts` and `commit it on proto/28-functional-prototype`, a `Session:` line containing `must fail against main`, and stdout SHALL NOT contain `main working tree` → writes tests/prototype/freeze-tests-ride.test.js
- **AC-20261005-05-2**: WHEN `--mark tests-derived` runs with `e2e/proto-28.smoke.spec.ts` carrying both reserved ids written only in the main working tree THE SYSTEM SHALL exit 2 with stderr containing `e2e/proto-28.smoke.spec.ts is in the main working tree` and `.claude/worktrees/proto-28-functional-prototype/e2e/proto-28.smoke.spec.ts`, `git branch --list 'harden/*'` SHALL be empty, and the reserved spec file SHALL NOT exist; WHEN the same file is also committed on the prototype branch while the main-tree copy remains THE SYSTEM SHALL exit 2 with the same sentence → writes tests/prototype/freeze-tests-ride.test.js
- **AC-20261005-05-3**: WHEN the file is written in the prototype worktree and not committed THE SYSTEM SHALL exit 2 with stderr containing `is not committed on proto/28-functional-prototype`; WHEN it is committed and then edited in the worktree without a commit THE SYSTEM SHALL exit 2 with stderr containing `has uncommitted edits in .claude/worktrees/proto-28-functional-prototype` → writes tests/prototype/freeze-tests-ride.test.js
- **AC-20261005-05-4**: WHEN `--mark tests-derived` runs with the file committed on the prototype branch carrying both ids, absent from the main working tree, after the branch modified `src/db/schema.js`, added `drizzle/0001.sql` and deleted `src/db/old.js` THE SYSTEM SHALL exit 0 and `--state` SHALL print `CLOSED\n`; `git show harden/28-functional-prototype:e2e/proto-28.smoke.spec.ts` SHALL equal the committed content byte for byte; `git log --format=%s main..harden/28-functional-prototype` SHALL print exactly two lines, the newer one `harden(28-functional-prototype): derived behaviour tests from proto/28-functional-prototype`; `<root>/e2e/proto-28.smoke.spec.ts` SHALL NOT exist; `git -C <root> status --porcelain` SHALL list no path starting `e2e/`; `git worktree list --porcelain` SHALL NOT list `harden-28-functional-prototype`; and the ledger row's `exported.files` SHALL be `3` → writes tests/prototype/freeze-tests-ride.test.js
- **AC-20261005-05-5**: WHEN the same mark completes THE SYSTEM SHALL leave `git diff --name-status main harden/28-functional-prototype` as exactly `M src/db/schema.js`, `A drizzle/0001.sql`, `D src/db/old.js`, `A e2e/proto-28.smoke.spec.ts` (no `src/ui/a.js`, no overlay file), and the data commit alone (`harden/28-functional-prototype~1`) SHALL differ from `main` by exactly the first three → rewrites tests/prototype/freeze.test.js :: AC-20260928-02-8: --mark tests-derived creates
- **AC-20261005-05-6**: WHEN the same mark completes THE SYSTEM SHALL write a generated spec whose File Plan has exactly one row with the path `e2e/proto-28.smoke.spec.ts`, and that row SHALL be `| e2e/proto-28.smoke.spec.ts | CREATE | tests |` followed by its summary → writes tests/prototype/freeze-tests-ride.test.js
- **AC-20261005-05-7**: WHEN the first run stops at the risk-tier refusal (a rules file naming `drizzle/*.sql`) and the mark is re-run with `--tier critical` THE SYSTEM SHALL exit 0, reach `CLOSED`, and `git log --format=%s main..harden/28-functional-prototype` SHALL print exactly two lines; WHEN, between those two runs, the branch is moved back one commit (`git branch -f harden/28-functional-prototype harden/28-functional-prototype~1`, the state an older plugin's export leaves) THE SYSTEM SHALL on the re-run exit 0 and `git cat-file -e harden/28-functional-prototype:e2e/proto-28.smoke.spec.ts` SHALL exit 0 with exactly two commits on the branch → writes tests/prototype/freeze-tests-ride.test.js
- **AC-20261005-05-8**: WHEN a completed freeze has `marks.closed` deleted from `status.json` and its harden branch moved back one commit (`git branch -f harden/28-functional-prototype harden/28-functional-prototype~1` — the state an interrupted run of an older plugin leaves: spec written, prototype branch deleted, tests never carried) and the mark is re-run THE SYSTEM SHALL exit 2 with stderr containing `does not carry e2e/proto-28.smoke.spec.ts and proto/28-functional-prototype is gone` and `by hand`; WHEN the file is then committed on `harden/28-functional-prototype` and the mark re-run THE SYSTEM SHALL exit 0 and `--state` SHALL print `CLOSED\n` → writes tests/prototype/freeze-tests-ride.test.js
- **AC-20261005-05-9**: WHEN the same mark completes THE SYSTEM SHALL write a generated spec containing ``carried on `harden/28-functional-prototype` `` at least twice and ``only through the `harden/28-functional-prototype` merge``, and not containing ``red on `main` `` → writes tests/prototype/freeze-tests-ride.test.js
- **AC-20261005-05-10**: WHEN a `lane: behaviour` build merges a `harden/<stem>` branch that itself carries the File Plan's `tests`-row file (absent from the base before the merge) and no session writes that file afterwards THE SYSTEM SHALL CONTINUE TO accept `--mark harden-merged`, accept `--mark tests-authored` and land `RED_ATTRIBUTION`, accept `--mark red-attributed` and print the first wave state, with `diff_base` still the commit before the merge → writes tests/build/build-driver-lane.test.js

## Assumptions (escalation triggers)

- A1: the build treats a tests-row file delivered by the harden merge as it treats one already on
  the base. **Executed 2026-10-05** — a scratch case on `tests/build/build-driver.fixtures.js`'s
  host put `tests/foo.test.js` and `other.txt` on `harden/<stem>` only, merged, and ran the marks:
  `harden-merged` exit 0 (`HARDEN_MERGE → TESTS`), `tests-authored` exit 0 (`RED_ATTRIBUTION`),
  `red-attributed` exit 0 (`WAVE:doctrine+scripts`); the file was absent on main before the merge.
  — **if false:** STOP, ask the user; the fix belongs in the build driver's pre-image, never in
  putting the file back on main.
- A2: git carries one added file onto an existing branch as D3 spells it. **Executed 2026-10-05**
  in a throwaway repository: `cat-file -e harden/x:e2e/p.spec.ts` exit 128 before and 0 after;
  `git worktree add <dir> harden/x` then `git diff main...proto/x -- e2e/p.spec.ts | git apply
  --index` exit 0; `git diff --name-status main harden/x` printed `A e2e/p.spec.ts`; the main
  tree had no `e2e/`; an edited worktree copy printed ` M e2e/p.spec.ts` under `status
  --porcelain -- <file>`. — **if false:** blocked return naming the git step.
- A3: a host's `e2eList` command works with cwd = the prototype worktree, because the worktree
  boots the app and so has its dependencies. The fixture's `list-tests.js` resolves `{file}`
  against cwd, so criterion 4 passing proves the cwd. — **if false in a real host:** the host
  declares its own directory change inside `e2eList`; the driver does not fall back to the root.
- A4: the seven test setups that write the e2e file (six in `freeze.test.js`, one in `freeze-tier.test.js`) are the complete set (`grep -rn "proto-28.smoke\|e2eAbs"
  tests/` at lock: `tests/prototype/freeze.test.js` and `tests/prototype/freeze-tier.test.js`
  only). This is a prediction. — **if false:** convert the extra setup to `authorDerivedTests` in
  the same batch; never weaken D2's refusals to let a main-tree file through.
- A5: `spec/commands/prototype.md` stays inside its read-load cap with in-place replacement. —
  **if false:** condense inside the TESTS section only; never drop a refusal from its list.

## Rationale

Tier: standard — no File Plan path is named in this repo's § Risk Tiers; the grounding contract is
deliberately not edited (its `e2eFile` line, "where the freeze stage's derived tests land", stays
true and no host owes a re-stamp).

Why the worktree and not the main tree with a later move (rejected): a test file sitting in the
main working tree, even uncommitted, is discovered by the host's runner, so a direct change gated
on main in the same hour still meets the red; and the driver would have to delete a file the
session wrote. Authoring on `proto/<stem>` means main never holds the file at all, the session
can run the tests against the live prototype, and the export is an ordinary branch diff.

Why a second commit and not a wider export diff: `exportHarden` is guarded by `marks.exported`
and by the branch not existing. A prototype exported by an older plugin, stopped at the risk-tier
question, would be skipped forever and never gain its tests. A separate step whose only guard is
"does the branch hold the file" has no such history, and it is the same path a plain resume takes.

Why the stray-copy refusal: the old flow's last instruction was to commit that file on main. A
session following habit, or an older in-flight prototype, would recreate the defect silently. The
refusal is tied to "not tracked on the base" so a host whose file legitimately lives on main from
an earlier prototype of the same brief is not blocked.

No regression pin on the freeze side: every freeze criterion here is new behaviour, red on the
pre-image, so none can be a pin. The one pin (criterion 10) is on the build side, where the
behaviour already holds and this spec starts to depend on it.

Fragile: the fixture-currency edits. A new refusal strands every setup that relied on the old
permissive path (§ Gotchas, seventh trigger); A4 names the inventory and its remedy. The retitled
case keeps its AC prefix so the done spec's criterion 7 stays covered; criterion 8 of that spec
stays covered by its two other cases.

Collision sweep at lock (`collision-closure --literal`): 17 literal hits. Nine are in File Plan
files and are fixed there. Eight are waived as the same words in an unrelated sense — `main
working tree` in `spec/commands/run.md`, `spec/scripts/merge-back.sh`, `spec/scripts/replay.js`
and `tests/merge-back.test.js` (the spec worktree flow), and `authored on` in
`docs/adr/0001-design-authoring-local-first.md`, `docs/roadmap/19-escape-seeded-replay.md`,
`spec/templates/adaptation-rules.json` and `tests/build/build-driver-commit.test.js`. The
sentence in `spec/doctrine/design.md` that prototype rounds, pins and states live in the main
working tree stays true and is not edited beyond D7.

Out of scope: any change to hosts. The walkthrough host's `12-proto.spec.ts` is already on its
main and its hardening spec has merged.

## Canonical Delta

`docs/canonical/design.md` § Prototypes, heading citation list gains
`specs/20261005/05-derived-tests-ride-on-the-export-branch.md`.

In the first paragraph, replace "Rounds, pins and declared states live under
`design/prototypes/<stem>/` on main; nothing on `proto/*` is read after close." with: "Rounds,
pins and declared states live under `design/prototypes/<stem>/` on main; the data and API layer
and the derived tests survive on `harden/<stem>`; nothing on `proto/*` is read after close."

In the freeze paragraph, replace "the session writes one derived e2e test per behaviour pin on
main, and the host runner must list every reserved AC id → `harden/<stem>` is created from `git
diff base...proto -- <export globs>`" with: "the session writes one derived e2e test per behaviour
pin in the prototype worktree and commits the file on `proto/<stem>`; the mark refuses a copy
left in the main working tree, an uncommitted file, and a reserved AC id the host runner (run in
the worktree) does not list → `harden/<stem>` is created from `git diff base...proto -- <export
globs>`, then gains the test file as a second commit, so the base branch never carries a derived
test before its hardening spec merges".
