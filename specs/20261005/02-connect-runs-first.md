---
date: 2026-10-05
status: done
build_base: design-retool
tier: standard
area: design
breaking: false
depends_on: []
brief: n/a
spiked: 2026-10-05
open_markers: 0
diff_base: d61c86ad50ed43dda6e6b5864e9da92dda9af653
---

# Connect runs first

## Goal

`/spec:connect` refuses a project that has no `.claude/spec.config.json`, so a new project
cannot be wired to the review service until genesis or init has run. This spec lets connect run
first: in a project with no config it creates one that holds only the `walkthrough` block, and
the two commands that later generate the config (`/spec:genesis` at its HANDOFF step and
`/spec:init`) carry that block through instead of refusing on it or wiping it. Done means: an
empty git folder can be connected with one command and told to run `/spec:genesis` next; the
block survives every later generate; a hand-edited config is still refused; and a project that
is connected but not yet grounded gets no false "grounding drift" warning.

This reverses criterion 13 of specs/20261005/01-connect-wires-a-project-to-the-review-service.md
(a host with no config is refused).

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | When the host config file does not exist, `walkthrough-connect.js` proceeds as if it were the empty object. The file is created only by the existing block write (after the proof passes), so it then holds exactly `{ "walkthrough": { … } }`; `.claude/` is created when missing; a run that is refused or whose proof fails creates no config file. (AC-20261005-02-1, AC-20261005-02-2) | Spiked: nothing else in the run reads the config. Rejected: writing the file before the proof, which would leave a block that points at a link nobody proved. |
| D2 | A config file that exists but cannot be read, is not JSON, or is not a JSON object is refused with the existing code `bad-config`, exit 2, sentence `.claude/spec.config.json is not a JSON object`, remedy `repair or delete .claude/spec.config.json, then run /spec:connect again`. The file is never overwritten. The code `no-config` and the remedy that names `/spec:init` are deleted from the script. (AC-20261005-02-3, AC-20261005-02-4) | A refusal called "no config" for a file that is present would be false; `bad-config` already means "the config is there and unusable". Rejected: treating an unparseable file as absent, which would overwrite a file the user may want. |
| D3 | When the existing `git check-ignore` guard fails, the script runs `git rev-parse --is-inside-work-tree` in the root. When that command starts and exits non-zero, the `not-ignored` refusal reads: sentence `this folder is not a git repository, so nothing keeps a stored token out of a later commit`, remedy `run git init, add .claude/settings.local.json to .gitignore, then run /spec:connect again`. In every other case the refusal keeps its current words. The guard itself, its position (before any `create`) and its exit code do not change; the script never runs `git init` and never writes `.gitignore`. (AC-20261005-02-5) | Spiked: a brand-new folder is not a git repository, so connect-first meets this refusal at once and the old remedy ("add it to .gitignore") does not say the first step. Rejected for now: connect running `git init` and writing `.gitignore` itself (specs/20261005/01 D6 rejected script edits to `.gitignore`); refusing with exact words is the choice that is cheapest to reverse. |
| D4 | On exit 0, after the `connected …` line, the script prints a second stdout line `next: /spec:genesis` when both hold: the root has no directory entry whose name does not start with `.`, and the config on disk after the run has no `generatedBy` that is a non-empty string. Otherwise stdout stays exactly one line. Both lines go out in one synchronous write. (AC-20261005-02-6) | "Empty folder" must be decided by the script, not by whoever reads the folder. The `generatedBy` half keeps a grounded project from ever being sent to genesis, and leaves every existing connect test's one-line output unchanged (their hosts carry `generatedBy`). Rejected: always printing a `next:` line, which changes the output of every run for no gain. |
| D5 | `spec/commands/connect.md`: print the script's output verbatim; on exit 0 name the next step — the command on the script's `next:` line when it printed one, else `/spec:mocks`. The frontmatter `description` says the same (it no longer says that the config must exist or that `/spec:mocks` is always next). `README.md`'s `/spec:connect` row: the "when" cell becomes `Once per project, first — before /spec:genesis in an empty folder, otherwise before /spec:mocks`. [no-ac: command and README prose; the line the command relays is pinned by AC-20261005-02-6] | The command stays a thin shell with no judgment of its own. |
| D6 | `init-gen.js generate` carries the block: when the existing host config parses to a JSON object that has its own `walkthrough` key, the config target the script compares and writes carries that value verbatim, replacing any `walkthrough` the profile's `config` holds. This applies with and without `--refresh`, and the stamp step keeps it. A profile's `walkthrough` is used only when the disk has none (unchanged behaviour). (AC-20261005-02-7, AC-20261005-02-8, AC-20261005-02-9) | Connect is the one writer of the block (ADR-0033). Spiked: today a `--refresh` deletes the block and a plain generate exits 3 on it. Rejected: telling the session to copy the block into the profile, which is a prose step a model can skip. |
| D7 | An existing config that parses to a JSON object with no own key other than `generatedBy`, `contractHash` and `walkthrough` counts as not yet generated: the refuse-or-refresh scan treats the config target as not existing, so generate writes it without `--refresh`, and `--refresh` reports it `changed:`. (AC-20261005-02-7) | A config that holds only the block has no hand-edit to lose; without this rule genesis HANDOFF (which runs generate without `--refresh`) exits 3 on every project that connected first. |
| D8 | Every other difference is refused as before: an existing config with any other key that differs from the target still exits 3 without `--refresh`, names the file and leaves it byte-identical; a config that is not a JSON object is handled exactly as today. (AC-20261005-02-10) | The carry must not become a way around the hand-edit guard. |
| D9 | `spec-state-gate.sh` prints the grounding-drift warning only when the config's `generatedBy` is non-empty (`jq -r '.generatedBy // empty'`) and the `contractHash` stamp differs from the plugin's hash. A config with no `generatedBy` gets no warning. Nothing else in the hook changes; it still never blocks on drift. (AC-20261005-02-11, AC-20261005-02-12) | The warning says the grounding layer "predates current plugin contracts"; a config that was never generated has no grounding layer, so the sentence is false there and its remedy (`/spec:doctor`) leads nowhere. |
| D10 | The spec plugin is bumped with `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`. The header comments of the three scripts are brought in line with D1–D4, D6–D7 and D9 (exit-code lists stay accurate; no dates or prior behaviour). [no-ac: `plugin-bump.js --check` in the gate is the oracle; header comments are prose] | Version-bump discipline; script headers are the first thing a worker reads. |
| D11 | specs/20261005/01's criterion 13 bullet gains the pointer tag `[retired: specs/20261005/02-connect-runs-first.md]`. [no-ac: a provenance tag on a done spec; `ac-drift.js` already accepts the form] | A cold reader of the first spec must see that the refusal was reversed. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/walkthrough-connect.js | MODIFY | scripts | D1–D4, D10 — absent config proceeds as `{}`; `bad-config` for a present unusable file, `no-config` deleted; the not-a-repository wording; the `next: /spec:genesis` line; header |
| spec/scripts/init-gen.js | MODIFY | scripts | D6–D8, D10 — carry the disk's `walkthrough`; a block-only config counts as not generated; header's exit-3 line |
| spec/scripts/spec-state-gate.sh | MODIFY | scripts | D9, D10 — one added condition on the drift warning; header sentence |
| spec/commands/connect.md | MODIFY | doctrine | D5 |
| README.md | MODIFY | other | D5 — the `/spec:connect` row's "when" cell |
| spec/.claude-plugin/plugin.json | MODIFY | other | D10 — `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |
| specs/20261005/01-connect-wires-a-project-to-the-review-service.md | MODIFY | other | D11 — the retired tag on criterion 13's pointer line, nothing else |
| tests/walkthrough/connect.test.js | MODIFY | tests | AC-20261005-02-1 — the first spec's criterion-13 case rewritten in place and retitled; no other case touched |
| tests/walkthrough/connect-first.test.js | CREATE | tests | AC-20261005-02-2, AC-20261005-02-3, AC-20261005-02-4, AC-20261005-02-5, AC-20261005-02-6 |
| tests/init-gen/walkthrough-carry.test.js | CREATE | tests | AC-20261005-02-7, AC-20261005-02-8, AC-20261005-02-9, AC-20261005-02-10 |
| tests/state-gate-drift.test.js | CREATE | tests | AC-20261005-02-11, AC-20261005-02-12 |

`tests/walkthrough/fixture.js` is reused unchanged (`makeGitHost(name, { config: false })`,
`makeRailway`, `runConnect`, `startStub`, `connectAnswers`); a test that needs a folder that is
not a git repository makes it inline with `tmpdir` and `fs.mkdirSync`.

## Contracts

`walkthrough-connect.js`, changed rows only (flags, the other refusal codes and exit codes are
unchanged):

| Code | Exit | When | Sentence · remedy |
|------|------|------|-------------------|
| `bad-config` | 2 | the config file exists and cannot be read, is not JSON, or is not a JSON object | `.claude/spec.config.json is not a JSON object` · `repair or delete .claude/spec.config.json, then run /spec:connect again` |
| `not-ignored` | 2 | `git check-ignore -q .claude/settings.local.json` does not exit 0 AND `git rev-parse --is-inside-work-tree` starts and exits non-zero | `this folder is not a git repository, so nothing keeps a stored token out of a later commit` · `run git init, add .claude/settings.local.json to .gitignore, then run /spec:connect again` |
| `not-ignored` | 2 | the same guard fails in any other case | unchanged |

The `no-config` row is gone. An absent config file is not a refusal.

Stdout on exit 0:

```
connected <id> → <baseUrl>/p/<id>[ (new project)| (joined existing project)| (already connected)]
next: /spec:genesis          ← only when the root has no non-dot entry AND the config has no generatedBy
```

File written in a host that had no config (same writer, same atomic temp-file-and-rename, mode
`0644`):

```json
{
  "walkthrough": {
    "baseUrl": "https://walkthrough-staging-4090.up.railway.app",
    "project": "acme-shop",
    "tokenEnv": "WALKTHROUGH_TOKEN"
  }
}
```

`init-gen.js generate`, the config target only:

```
existing   = the host config, when the file exists and parses to a JSON object (not an array, not null)
carry      : existing has its own key `walkthrough`
             → target.walkthrough = existing.walkthrough   (verbatim; the profile's value is ignored)
ungenerated: existing has no own key outside { generatedBy, contractHash, walkthrough }
             → the refuse-or-refresh scan treats the target as { existed: false }
otherwise  : compared as today (generatedBy and contractHash stripped) against the carried target
```

`spec-state-gate.sh`, the drift block:

```bash
GENERATED_BY=$(jq -r '.generatedBy // empty' "$CONFIG" 2>/dev/null)
if [ -n "$GENERATED_BY" ] && [ "$STAMPED" != "$CONTRACT_HASH" ]; then   # warn, as today
```

## Behavior

Connect, in a folder with no config: step 1 reads no file and goes on with an empty object.
Steps 2 to 6 are unchanged (target, candidate token, create or join, store, prove). The block
write at the end creates the config. A run that stops anywhere before that leaves no config
file; a token already stored stays stored and the next run resumes with it, as before.

The existing ignore guard runs first and decides whether the run is refused. The work-tree
probe runs only after the guard has failed and only picks the words.

The three ways, for the one actor who runs connect (the engineer with Railway access). Success
sentence: the `connected …` line, and in an empty ungrounded folder the `next: /spec:genesis`
line under it. Path back: delete `.claude/spec.config.json` (it holds only the block) or delete
the block from a fuller config; the project then reviews in the terminal again. Farthest
artifact: one project row and one token on the service, as in the first spec. Both lines are
printed by `spec/scripts/walkthrough-connect.js` and relayed by `spec/commands/connect.md`.

Generate, on a project that connected first: genesis HANDOFF and `/spec:init` both run
`init-gen.js generate`. The block-only config is not an offender, the written config is the
profile's config plus the block, and the stamp step adds `generatedBy` and `contractHash` to
that. From then on the config is an ordinary generated one that happens to carry a block:
generate without `--refresh` succeeds while nothing else differs, and `--refresh` keeps the
block.

The state gate, between connect and the first generate: `/spec:plan` and `/spec:run` print no
drift line. The commands' own setup still stops such a project, because the pipeline rules
file does not exist yet.

## Acceptance Criteria

Fixtures used by the examples. Connect: the first spec's fixtures — a git-initialised host
folder named `acme-shop` whose `.gitignore` holds `.claude/settings.local.json`, made with
`{ config: false }` so no config file exists; the fake `railway` first on `PATH` (project list
with the id `11111111-2222-3333-4444-555555555555`, `create` → stdout `token:
wt_3f9a1c0de4b7a2c5`); the stub service `<stub>`; runs pass `--base-url <stub>` with
`WALKTHROUGH_TOKEN` unset. The block `B` is `{ "baseUrl": "<stub>", "project": "acme-shop",
"tokenEnv": "WALKTHROUGH_TOKEN" }`. Generate: the synthetic git host and the complete profile
`tests/init-gen/generate.test.js` uses (`gateCommand` is `node --test {testDirs}`); the block
`W` is `{ "baseUrl": "https://x.example", "project": "acme", "tokenEnv": "WALKTHROUGH_TOKEN" }`.
Gate: `spec-state-gate.sh` fed `{"prompt":"/spec:plan add a thing"}` on stdin with
`CLAUDE_PROJECT_DIR` set to a temp folder holding the named config.

- **AC-20261005-02-1**: WHEN connect runs in a host that has no config file and the id is new
  on the service THE SYSTEM SHALL connect and create a config that holds only the block (e.g.
  exit 0; the first stdout line is exactly `connected acme-shop → <stub>/p/acme-shop (new
  project)`; `.claude/spec.config.json` is exactly `JSON.stringify({ walkthrough: B }, null, 2)`
  plus a newline; `.claude/settings.local.json` holds `wt_3f9a1c0de4b7a2c5`; the fake's log holds
  one `create acme-shop acme-shop` line; a second run exits 0 with the first line `connected
  acme-shop → <stub>/p/acme-shop (already connected)` and the config byte-identical)
  → rewrites tests/walkthrough/connect.test.js :: AC-20261005-01-13:
- **AC-20261005-02-2**: WHEN connect in a host with no config file ends without a passed proof
  THE SYSTEM SHALL create no config file (e.g. the stub answers the approvals call `401
  {"error":"bad-token","detail":null,"apiVersion":1}`: exit 1, `.claude/settings.local.json`
  holds the token, `.claude/spec.config.json` does not exist)
  → writes tests/walkthrough/connect-first.test.js
- **AC-20261005-02-3**: WHEN the config file exists and is not a JSON object THE SYSTEM SHALL
  refuse `bad-config`, name repairing or deleting the file, and leave it as it is (e.g. a file
  holding `[]`, and a file holding `not json`: exit 2; stderr starts `walkthrough-connect:
  bad-config`, contains `repair or delete .claude/spec.config.json` and does not contain
  `/spec:init`; the fake's log is empty; the file's bytes are unchanged; no settings file exists)
  → writes tests/walkthrough/connect-first.test.js
- **AC-20261005-02-4**: WHEN `spec/scripts/walkthrough-connect.js` and `spec/commands/connect.md`
  are read THE SYSTEM SHALL contain zero occurrences of the retired refusal code (e.g. the regex
  `/no-config(?![\w-])/` matches neither file's text)
  → writes tests/walkthrough/connect-first.test.js
- **AC-20261005-02-5**: WHEN connect has to store a token in a folder that is not a git
  repository THE SYSTEM SHALL refuse before creating anything and name `git init` first (e.g. a
  plain folder `fresh-app` with no `.git` and no config, run with `GIT_CEILING_DIRECTORIES` set
  to its parent: exit 2; stderr starts `walkthrough-connect: not-ignored — this folder is not a
  git repository` and contains `remedy: run git init, add .claude/settings.local.json to
  .gitignore, then run /spec:connect again`; the fake's log holds no `create` line; the folder
  is still empty)
  → writes tests/walkthrough/connect-first.test.js
- **AC-20261005-02-6**: WHEN connect succeeds in a root with no entry outside dot-names and a
  config without `generatedBy` THE SYSTEM SHALL print `next: /spec:genesis` as a second stdout
  line, and SHALL print exactly one line in every other case (e.g. the host of criterion 1,
  whose entries are `.git`, `.gitignore` and `.claude`: stdout is exactly `connected acme-shop →
  <stub>/p/acme-shop (new project)\nnext: /spec:genesis\n`, and the second run's stdout is
  exactly `connected acme-shop → <stub>/p/acme-shop (already connected)\nnext: /spec:genesis\n`;
  the same host with a file `package.json` added before the first run: stdout is exactly
  `connected acme-shop → <stub>/p/acme-shop (new project)\n`; a host with no non-dot entry whose
  config is `{ "generatedBy": "test" }`: stdout is exactly that one line too)
  → writes tests/walkthrough/connect-first.test.js
- **AC-20261005-02-7**: WHEN generate runs without `--refresh` on a host whose config holds only
  a `walkthrough` block THE SYSTEM SHALL generate, stamp, and keep the block (e.g. config `{
  "walkthrough": W }` → exit 0; the written config has `gateCommand` equal to `node --test
  {testDirs}`, a `generatedBy` starting `spec@`, a 12-hex `contractHash`, and `walkthrough`
  deep-equal to `W`; the same start with `--refresh` → exit 0 and stdout contains `changed:
  .claude/spec.config.json`) → writes tests/init-gen/walkthrough-carry.test.js
- **AC-20261005-02-8**: WHEN generate runs on a generated host whose config has since gained a
  `walkthrough` block THE SYSTEM SHALL succeed with and without `--refresh` and keep the block
  (e.g. generate once, add `W` to the config by hand, then: a plain generate → exit 0 and
  `walkthrough` deep-equal to `W`; a `--refresh` generate → exit 0, stdout contains `unchanged:
  .claude/spec.config.json`, and `walkthrough` deep-equal to `W`)
  → writes tests/init-gen/walkthrough-carry.test.js
- **AC-20261005-02-9**: WHEN the profile's config carries a `walkthrough` that differs from the
  one on disk THE SYSTEM SHALL write the one on disk (e.g. disk `{ "walkthrough": W }`, profile
  config with `walkthrough: { "baseUrl": "https://other.example", "project": "zzz", "tokenEnv":
  "WALKTHROUGH_TOKEN" }` → exit 0 and the written `walkthrough` is deep-equal to `W`)
  → writes tests/init-gen/walkthrough-carry.test.js
- **AC-20261005-02-10**: WHEN the existing config carries a `walkthrough` block and another key
  that differs from the profile and `--refresh` is not given THE SYSTEM SHALL CONTINUE TO exit 3,
  name the config file and leave it byte-identical (e.g. config `{ "gateCommand": "make
  hand-edit", "walkthrough": W }` → exit 3, stderr contains `.claude/spec.config.json`, the
  file's bytes are unchanged) → writes tests/init-gen/walkthrough-carry.test.js
- **AC-20261005-02-11**: WHEN `/spec:plan` is submitted in a project whose config has no
  `generatedBy` THE SYSTEM SHALL print no grounding-drift warning (e.g. config `{ "walkthrough":
  W }` → exit 0 and stdout is empty; config `{}` → exit 0 and stdout is empty)
  → writes tests/state-gate-drift.test.js
- **AC-20261005-02-12**: WHEN `/spec:plan` is submitted in a project whose config has a
  `generatedBy` and a `contractHash` that is not the plugin's THE SYSTEM SHALL CONTINUE TO exit 0
  and print the grounding-drift warning naming both stamps (e.g. config `{ "generatedBy":
  "spec@7.0.0", "contractHash": "000000000000" }` → exit 0, stdout contains `Spec grounding
  drift`, `spec@7.0.0` and `000000000000`) → writes tests/state-gate-drift.test.js

## Assumptions (escalation triggers)

Executed on 2026-10-05 against this repo's tree at `dd539e17` (git 2.54.0), in temp hosts:

- A1 (spiked): `init-gen.js generate` (no `--refresh`) on a host whose config is `{
  "walkthrough": W }` exits 3 naming `.claude/spec.config.json`. This is what genesis HANDOFF
  would hit today. — **if false:** D7 is unneeded; keep D6.
- A2 (spiked): on a generated host with `W` added to the config, a plain generate exits 3 and a
  `--refresh` generate exits 0 with the `walkthrough` key gone. — **if false:** D6 is already
  true; keep its tests.
- A3 (spiked): `spec-state-gate.sh` on a config of `{ "walkthrough": W }`, and on `{}`, prints
  one `Spec grounding drift …` line for `/spec:plan`. — **if false:** D9 is unneeded.
- A4 (spiked): a copy of `walkthrough-connect.js` changed only so that an absent config reads
  as `{}` ran in a git host with no config: exit 0, the config written is exactly `{
  "walkthrough": B }`, the root's entries are `.claude`, `.git`, `.gitignore`, and a second run
  prints `(already connected)`. The same copy on a config of `[]` still refuses. — **if false
  (some step reads another config key):** STOP, ask the user.
- A5 (spiked): in a folder that is not a git repository `git check-ignore -q
  .claude/settings.local.json` exits 128 and `git rev-parse --is-inside-work-tree` exits 128;
  after `git init` the second prints `true` and exits 0. Today's connect refuses that folder
  `not-ignored` with no `create` call and writes nothing. — **if false:** key D3's wording on
  the check-ignore exit code 128 instead.
- A6 (spiked): the two regression pins hold on today's code — criterion 10's example exits 3
  with the file unchanged; criterion 12's example prints the warning with both stamps and
  exits 0. — **if false:** the pin is wrong; fix the example, never the code.

Read, not executed:

- A7: genesis HANDOFF runs `init-gen.js generate --root <root> --profile <file>` and adds
  `--refresh` only when the mark carries it (`genesis-driver.js`, the `profile-written` mark),
  so D6 and D7 are what make HANDOFF pass after a connect-first; the driver itself needs no
  edit and derives no state from the config's presence. — **if false:** add the driver to the
  File Plan with an AC that marks `profile-written` on a block-only config.
- A8: no test outside this File Plan runs connect in a host without a config, seeds a
  block-only or empty config before a generate, or asserts the drift warning's text (greps
  2026-10-05: `runConnect` occurs only in `tests/walkthrough/`; no test under `tests/init-gen/`
  or `tests/genesis/` writes the config before generate; `grounding drift` and `predates
  current plugin` have no hit under `tests/`). This is a prediction, not an inventory. — **if
  false:** fix the colliding setup in the same batch; never weaken an assertion.
- A9: every existing connect test's host is made by the fixture's `writeConfig`, which writes
  `{ "generatedBy": "test" }`, so D4 adds no line to their output. — **if false:** the test's
  host is given a non-dot file; the expected output is not changed.
- A10: a test folder under the system temp directory can sit inside a git repository on some
  machines, so criterion 5's run sets `GIT_CEILING_DIRECTORIES` to the folder's parent. — **if
  false (the variable is ignored):** the test asserts the folder is outside any work tree first
  and fails loudly if not.
- A11: `tests/walkthrough/connect.test.js` still exists with the criterion-13 case in it
  (stat and `count-tests --titles`, 2026-10-05). — **if false (an expiry sweep deleted it):**
  write criterion 1's test into `tests/walkthrough/connect-first.test.js` and record the row
  change as a deviation.

## Rationale

The request and the pick came from JJ with a Fable consult; this spec adds the mechanism and
two things the pick did not name.

Why the config is created by connect rather than by a new "pre-config" file: every reader of
the block (`walkthrough.js`, the mocks driver, doctor's check) already reads it from the
config, and connect's own writer already merges into whatever object it was given. Reading an
absent file as the empty object is a one-line change and needs no second home for the block.

Why init-gen needs two rules, not one. Carrying the block (D6) fixes the wipe on `--refresh`
and the refusal on a grounded host. It does not fix the first generate after a connect-first,
because a block-only config still differs from the full target in every other key. D7 closes
that: a config with nothing but the block and the two stamps has no hand-edit in it, so
treating it as absent loses nothing. D8 and criterion 10 pin that the guard still fires the
moment a real key differs. The disk's block beats the profile's (criterion 9) because connect
is the one writer of the block; a session that re-profiles a repo may copy the block into the
profile, and a typo there must not move the project.

Added beyond the pick, both small and both about the empty-folder case the pick names:

- D3. A brand-new folder is not a git repository, and connect refuses to store a token where
  git cannot be shown to ignore the file. That refusal stays; only its words change so the
  first step (`git init`) is named. Connect does not run `git init` or write `.gitignore`
  itself: the first spec rejected script edits to `.gitignore`, and reversing that is JJ's
  call, not a side effect of this spec.
- D4. "Names /spec:genesis in an empty folder" needs something to decide what empty means.
  The script decides (no entry outside dot-names, and never for a grounded project) and prints
  the answer; the command only relays it. A README alone makes a folder non-empty and the
  command then names `/spec:mocks`; that is the plain reading of "empty folder".

No doctrine and no grounding-contract edit. Core's "either missing → STOP: run /spec:init"
still stops a connected-but-ungrounded project because the pipeline rules file is missing.

Tier. JJ set standard, on the ground that the grounding contract is not edited. One touched
file, `spec-state-gate.sh`, is on this repo's critical-trigger list as a hook surface. The
change there is one added condition that can only remove a warning line; it cannot block a
prompt. The spec is written to the critical bar anyway (a literal example on every criterion,
every load-bearing assumption executed) and the tier question is put to JJ in the lock report.

Fragile, watch during the build. The work-tree probe must stay below the ignore guard: a new
branch placed above an existing guard bypasses it (pipeline rules § Gotchas, fourth trigger).
The rewritten criterion-13 case keeps its place in the file and gets the new id in its title;
no other case in that file is touched or tagged. Test files cite other specs' criteria by spec
and number, never by id. The retired code's sweep uses a boundary (`(?![\w-])`) so it cannot
ban a longer name.

Collision sweep at lock (literals leg, 5 hits, none waived). All five are File Plan rows: the
retired code and its remedy in `walkthrough-connect.js`, the criterion-13 case in
`tests/walkthrough/connect.test.js`, the next-step sentence in `spec/commands/connect.md`, and
the "when" cell in `README.md`. The `executes` hits were read: `tests/init-gen/generate.test.js`
and `tests/state-gates.test.js` seed no block-only or unstamped config, so no fixture repair
is planned (A8 carries the remedy if that proves wrong). Nothing is queued behind this spec:
the one open question (whether connect should run `git init` itself) is a decision, not work.

One regression pin each for the two guards this spec loosens next to (criteria 10 and 12);
every other criterion is new behaviour whose test expires at close.

Build deviation, folded at close (2026-10-05, one-off): the "other" wave (README cell,
plugin.json bump, retired tag on specs/20261005/01 criterion 13) was applied by the
orchestrator in-session rather than by a dispatched worker — three mechanical one-line edits.

## Canonical Delta

`docs/canonical/design.md`, the paragraph that begins "A project is connected with
`/spec:connect`" — append:

Connect can run first (specs/20261005/02). In a project with no config it creates
`.claude/spec.config.json` holding only the `walkthrough` block, and only after the link is
proved; a config file that is present but not a JSON object is refused and never overwritten.
A folder that is not a git repository is refused with `git init` named as the first step,
because the token is stored only where git ignores the file. In an empty folder that nothing
has grounded yet, connect prints `next: /spec:genesis` under its line; otherwise the next step
is `/spec:mocks`. `init-gen.js generate` carries the block from disk on every run, with and
without `--refresh`, treats a config that holds only the block as not yet generated, and still
refuses any other hand-edit without `--refresh`. The state gate prints its grounding-drift
warning only for a config that carries a `generatedBy` stamp.
