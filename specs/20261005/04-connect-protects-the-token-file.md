---
date: 2026-10-05
status: done
build_base: design-retool
tier: standard
area: design
breaking: false
depends_on: [specs/20261005/02-connect-runs-first.md]
brief: n/a
spiked: 2026-10-05
open_markers: 0
diff_base: fe5bf745e5a39d14326c7eedb641fdb68555bf81
---

# Connect protects the token file itself

## Goal

`/spec:connect` stores the service token in `.claude/settings.local.json` and refuses to run
while git does not ignore that file. A brand-new folder has no `.gitignore` line and is often
not a git repository yet, so the command that is meant to run first stops and asks for hand
steps. This spec makes connect add the ignore line itself and go on, in a git repository and in
a plain folder. Done means: one command connects an empty folder with no hand step; the token
file is still never stored where git already tracks it; and connect never runs `git init`.

This reverses criterion 9 of specs/20261005/01-connect-wires-a-project-to-the-review-service.md
(an unlisted file is refused) and criterion 5 of specs/20261005/02-connect-runs-first.md (a
folder that is not a git repository is refused). It builds after spec 02 has merged.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | The ignore guard keeps its position (create-or-join, before any `create`) and becomes four steps, in this order. (1) `git check-ignore -q .claude/settings.local.json` in the root; exit 0 → go on, nothing is written. (2) Otherwise `git ls-files --error-unmatch .claude/settings.local.json`; exit 0 means git tracks the file → refuse (D2), `.gitignore` untouched. (3) Otherwise append the line `.claude/settings.local.json` to `<root>/.gitignore`: the file is created when absent, one newline is added first when the existing text is non-empty and does not end with one, every existing byte is kept, and the result ends with a newline. (4) When step 1's exit status was 128 (git's answer outside a repository) → go on. Otherwise run step 1's command again; exit 0 → go on, anything else → refuse with the guard's current sentence and remedy. The script never runs `git init`. (AC-20261005-04-1, AC-20261005-04-2, AC-20261005-04-4) | JJ's ruling 2026-10-05: connect fixes it. The existing check still runs first and still decides, so nothing gets past it that it used to stop for a tracked file. Rejected: writing the line before looking (it would edit `.gitignore` on hosts that are already safe) and running `git init` (not connect's job; the line protects the folder the moment it becomes a repository). |
| D2 | The tracked case is refused with the code `not-ignored`, exit 2, sentence `.claude/settings.local.json is tracked by git, so a token stored there would be committed`, remedy `run git rm --cached .claude/settings.local.json, then run /spec:connect again`. When `git` itself cannot be started the guard refuses with its current sentence and remedy, as today. (AC-20261005-04-3, AC-20261005-04-4) | An ignore line does not protect a file git already tracks, so this is the one case connect cannot fix; the old sentence listed three causes, two of which no longer refuse. |
| D3 | A `.gitignore` that cannot be written is refused with the existing code `write-failed`, exit 2, sentence `.gitignore could not be written (<error code>)`, and that code's existing remedy. Nothing is created on the service and no token is stored. (AC-20261005-04-5) | Same alphabet as the script's other file writes. |
| D4 | The wording branch spec 02 added for a folder that is not a git repository, and the `git rev-parse --is-inside-work-tree` probe that only it uses, are deleted from `walkthrough-connect.js`. (AC-20261005-04-6) | The case no longer refuses, so the branch is dead; a retired refusal's code and words leave with it. |
| D5 | The test case of spec 02's criterion 5 in `tests/walkthrough/connect-first.test.js` is deleted (that one case, nothing else in the file). The pointer lines of spec 01's criterion 9 and spec 02's criterion 5 each gain the tag `[retired: specs/20261005/04-connect-protects-the-token-file.md]`. [no-ac: a deletion and two provenance tags; the suite going green and `ac-drift.js` accepting the form are the oracles] | A case whose subject is reversed is retired, never weakened into passing. |
| D6 | The header comment of `walkthrough-connect.js` states the new guard (what it writes, that it never runs `git init`) and its exit-code list stays accurate. The spec plugin is bumped with `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`. [no-ac: header prose; `plugin-bump.js --check` in the gate is the oracle] | Version-bump discipline; the header is the first thing a worker reads. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/walkthrough-connect.js | MODIFY | scripts | D1–D4, D6 — the four-step guard, the tracked wording, `write-failed` for `.gitignore`, spec 02's not-a-repository branch and its probe deleted, header |
| spec/.claude-plugin/plugin.json | MODIFY | other | D6 — `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |
| specs/20261005/01-connect-wires-a-project-to-the-review-service.md | MODIFY | other | D5 — the retired tag on criterion 9's pointer line, nothing else |
| specs/20261005/02-connect-runs-first.md | MODIFY | other | D5 — the retired tag on criterion 5's pointer line, nothing else |
| tests/walkthrough/connect.test.js | MODIFY | tests | AC-20261005-04-1 — spec 01's criterion-9 case rewritten in place and retitled; no other case touched |
| tests/walkthrough/connect-first.test.js | MODIFY | tests | D5 — delete spec 02's criterion-5 case; no AC of this spec lives here and no id of this spec is written into the file |
| tests/walkthrough/connect-ignore.test.js | CREATE | tests | AC-20261005-04-2, AC-20261005-04-3, AC-20261005-04-4, AC-20261005-04-5, AC-20261005-04-6 |

`tests/walkthrough/fixture.js` is reused unchanged (`makeGitHost`, `makeRailway`, `runConnect`,
`startStub`, `connectAnswers`); a test that needs a folder that is not a git repository makes
it inline with `tmpdir` and `fs.mkdirSync`. `spec/commands/connect.md` and `README.md` say
nothing about git and are not touched.

## Contracts

`walkthrough-connect.js`, changed refusal rows only (flags, stdout, the other codes and the
exit codes are unchanged):

| Code | Exit | When | Sentence · remedy |
|------|------|------|-------------------|
| `not-ignored` | 2 | git tracks `.claude/settings.local.json` (D1 step 2) | `.claude/settings.local.json is tracked by git, so a token stored there would be committed` · `run git rm --cached .claude/settings.local.json, then run /spec:connect again` |
| `not-ignored` | 2 | `git` cannot be started, or the file is still not ignored after the line was written inside a repository (D1 step 4) | unchanged from today |
| `write-failed` | 2 | `.gitignore` cannot be written (D1 step 3) | `.gitignore could not be written (<error code>)` · the code's existing remedy |

The row "a folder that is not a git repository" is gone. That case is not a refusal.

The guard, in order (each `git` call: no shell, stdin closed, the root as working directory):

```
1. git check-ignore -q .claude/settings.local.json      0 → go on (no write)
2. git ls-files --error-unmatch .claude/settings.local.json
                                                         0 → refuse not-ignored (tracked)
3. append ".claude/settings.local.json\n" to <root>/.gitignore
     absent file            → the file is exactly ".claude/settings.local.json\n"
     "node_modules/"        → "node_modules/\n.claude/settings.local.json\n"
     "node_modules/\n"      → "node_modules/\n.claude/settings.local.json\n"
     write error            → refuse write-failed
4. step 1 exited 128        → go on
   else run step 1 again    0 → go on · else refuse not-ignored (current words)
```

## Behavior

The guard runs only on the create-or-join path, where a token is about to be stored. A run that
ends "already connected", or that writes the block from a token it already holds, never reaches
it and never touches `.gitignore`.

The line stays in `.gitignore` when a later step of the same run fails (Railway refuses, the
proof does not answer). It is harmless, and the next run finds step 1 satisfied.

A second run in the same host writes nothing more: step 1 exits 0 inside a repository, and
outside one the run is "already connected" before the guard.

The three ways, for the one actor who runs connect (the engineer with Railway access). Success
sentence: the `connected …` line, unchanged; the added line is visible in `.gitignore` and in
`git status`. Path back: delete the line from `.gitignore`. Farthest artifact: one line in the
project's `.gitignore`. The line is written by `spec/scripts/walkthrough-connect.js`, which
`spec/commands/connect.md` runs.

## Acceptance Criteria

Fixtures used by the examples: spec 01's fixtures — a git-initialised host folder named
`acme-shop` whose config is `{ "generatedBy": "test" }`; the fake `railway` first on `PATH`
(`create` → stdout `token: wt_3f9a1c0de4b7a2c5`); the stub service `<stub>`; runs go through
the fixture's `runConnect`, which unsets `WALKTHROUGH_TOKEN` and switches off the user's global
git ignore file, and pass `--base-url <stub>`. `L` is the line `.claude/settings.local.json`.
A "plain folder" is a folder with no `.git`, run with `GIT_CEILING_DIRECTORIES` set to its
parent.

- **AC-20261005-04-1**: WHEN connect has to store a token in a git repository that neither
  ignores nor tracks the token file THE SYSTEM SHALL add the ignore line itself and connect
  (e.g. host `acme-shop` whose `.gitignore` holds `node_modules/` with no final newline: exit 0;
  the first stdout line is exactly `connected acme-shop → <stub>/p/acme-shop (new project)`;
  `.gitignore` is exactly `node_modules/\n.claude/settings.local.json\n`;
  `.claude/settings.local.json` holds `wt_3f9a1c0de4b7a2c5`; a second run exits 0 and leaves
  `.gitignore` byte-identical; a host whose `.gitignore` is empty ends with `.gitignore` exactly
  `.claude/settings.local.json\n`; a host whose `.gitignore` was deleted before the run ends
  with the same one-line file) → rewrites tests/walkthrough/connect.test.js :: AC-20261005-01-9:
- **AC-20261005-04-2**: WHEN connect has to store a token in a folder that is not a git
  repository THE SYSTEM SHALL write the ignore line, connect, and leave the folder a plain
  folder (e.g. a plain folder `fresh-app` holding only `.claude/spec.config.json` with `{
  "generatedBy": "test" }`, the stub answering for the id `fresh-app`: exit 0; the first stdout
  line is exactly `connected fresh-app → <stub>/p/fresh-app (new project)`; `.gitignore` is
  exactly `.claude/settings.local.json\n`; `.claude/settings.local.json` holds
  `wt_3f9a1c0de4b7a2c5`; no `.git` entry exists in the folder after the run)
  → writes tests/walkthrough/connect-ignore.test.js
- **AC-20261005-04-3**: WHEN git already tracks the token file THE SYSTEM SHALL say so and name
  the command that untracks it (e.g. a host made with the fixture's `tracked: true`: stderr
  starts `walkthrough-connect: not-ignored — .claude/settings.local.json is tracked by git` and
  contains `remedy: run git rm --cached .claude/settings.local.json, then run /spec:connect
  again`) → writes tests/walkthrough/connect-ignore.test.js
- **AC-20261005-04-4**: WHEN git already tracks the token file THE SYSTEM SHALL CONTINUE TO
  refuse `not-ignored` with exit 2 before creating anything and leave `.gitignore` as it is
  (e.g. a host made with `tracked: true`, and one made with `tracked: true` and an empty
  `.gitignore`: exit 2; stderr starts `walkthrough-connect: not-ignored` and contains `git rm
  --cached`; the fake's log holds no `create` line; `.gitignore` is byte-identical to before
  the run; the tracked settings file still holds `{}`)
  → writes tests/walkthrough/connect-ignore.test.js
- **AC-20261005-04-5**: WHEN the ignore line cannot be written THE SYSTEM SHALL refuse
  `write-failed` before creating anything (e.g. a plain folder `fresh-app` holding the config
  of criterion 2 and a directory named `.gitignore`: exit 2; stderr starts `walkthrough-connect:
  write-failed` and contains `.gitignore`; the fake's log holds no `create` line; no settings
  file exists) → writes tests/walkthrough/connect-ignore.test.js
- **AC-20261005-04-6**: WHEN `spec/scripts/walkthrough-connect.js` is read THE SYSTEM SHALL
  contain zero occurrences of the retired refusal's remedy and of its probe (e.g. neither the
  regex `/run git init/` nor the regex `/is-inside-work-tree/` matches the file's text)
  → writes tests/walkthrough/connect-ignore.test.js

## Assumptions (escalation triggers)

Executed on 2026-10-05 (git 2.54.0, temp folders, `GIT_CONFIG_GLOBAL=/dev/null`):

- A1 (spiked): `git check-ignore -q .claude/settings.local.json` exits 1 in a repository whose
  `.gitignore` holds only `node_modules/`, exits 0 after the line `L` is appended, and exits 128
  in a folder that is not a repository. — **if false (another status outside a repository):**
  key step 4 on `git rev-parse --is-inside-work-tree` exiting non-zero and keep that probe.
- A2 (spiked): `git ls-files --error-unmatch .claude/settings.local.json` exits 0 for a file
  that is only staged (`git add -f`), 1 for an untracked file, and 128 outside a repository. —
  **if false:** STOP, ask the user; the tracked case must be refused.
- A3 (spiked): a `.gitignore` holding `.claude/*` then `!.claude/settings.local.json` leaves the
  file not ignored (exit 1); appending `L` as the last line makes it ignored (exit 0). — **if
  false:** step 4's second check refuses, as written.
- A4 (spiked): for a tracked file `git check-ignore -q` exits 1 even when `.gitignore` lists it,
  so step 1 never lets a tracked file through. — **if false:** run step 2 before step 1.
- A5 (spiked): in a repository, a directory named `.gitignore` makes `git check-ignore -q` exit
  0, so that shape never reaches step 3 there; outside a repository the same directory makes
  `fs.writeFileSync` throw `EISDIR`, which is why criterion 5's example is a plain folder. —
  **if false:** use a read-only `.gitignore` file in the example instead.
- A6 (spiked): today's connect, in a host with an empty `.gitignore` and in a plain folder,
  refuses `not-ignored` with no `create` call and writes nothing; in a `tracked: true` host it
  refuses the same way and its remedy already contains `git rm --cached`. So criteria 1, 2 and
  5 are red before the change and criterion 4 is green. — **if false:** the pin's example is
  wrong; fix the example, never the code.

Resting on spec 02, which is being built now and is not in this tree (its Contracts and its
build worktree were read, not executed):

- A7: after spec 02 the guard is followed by a `git rev-parse --is-inside-work-tree` probe and
  a refusal whose remedy starts `run git init`, both in `walkthrough-connect.js`; criterion 6
  is red against that and D4 deletes them. — **if false (spec 02 landed without them):**
  criterion 6 is already true; mark it with the absence-invariant pre-green tag and record the
  deviation.
- A8: `tests/walkthrough/connect-first.test.js` exists after spec 02 and holds one case whose
  title starts with spec 02's criterion-5 id. — **if false (renamed, or an expiry sweep removed
  it):** there is nothing to delete; record the row as a deviation.
- A9: `tests/walkthrough/connect.test.js` still holds spec 01's criterion-9 case after spec 02
  (spec 02 rewrites only the criterion-13 case). — **if false:** write criterion 1's test into
  `tests/walkthrough/connect-ignore.test.js` and record the row change as a deviation.
- A10: no other test runs connect in a host whose token file git does not ignore (grep
  2026-10-05 over `tests/`: `gitignore:` and `tracked:` occur only in the criterion-9 case; the
  spec 02 build adds only the plain-folder case D5 deletes). A prediction, not an inventory. —
  **if false:** fix the colliding setup in the same batch; never weaken an assertion.
- A11: a temp folder can sit inside a git repository on some machines, so plain-folder runs set
  `GIT_CEILING_DIRECTORIES` to the folder's parent. — **if false (the variable is ignored):**
  the test asserts the folder is outside any work tree first and fails loudly if not.

## Rationale

Spec 01 refused an unlisted token file and rejected letting the script edit `.gitignore`
because it is a tracked host file. Spec 02 made connect runnable before genesis and then met
that refusal in every brand-new folder; it kept the refusal, reworded it, and left the reversal
as JJ's call. JJ made the call on 2026-10-05: connect fixes it. `init-gen.js` already appends
its own lines to a host's `.gitignore`, so the plugin editing that file is not new.

Order is the fragile part. The existing check runs first and a pass writes nothing, so a host
that is already safe is never edited. The tracked check runs before the write, so the one case
an ignore line cannot fix is refused with `.gitignore` untouched (criterion 4 pins it, and it
is the test that outlives this spec). Inside a repository the check runs again after the write,
so the script never trusts its own edit. Outside a repository there is nothing to ask; the line
is written and takes effect when the folder becomes a repository. A new branch placed above the
existing check would bypass it (pipeline rules § Gotchas, fourth trigger) — the write is
additional work after the check, never a replacement for it.

Status 128 is used for "not a repository" instead of spec 02's second probe, so that probe and
its words can be deleted whole (D4) rather than left as a second way to ask the same question.

Not done here: connect does not run `git init`, does not touch a global ignore file, and does
not untrack a tracked file. `spec/commands/connect.md` and `README.md` do not mention git, so
they stay as spec 02 leaves them.

Watch during the build. This spec's pre-image is spec 02's merged tree; the queue holds it
until then. Test files cite other specs' criteria by spec and number, never by id, except the
one rewritten case's title, which takes this spec's id. The fixture's `runConnect` already
switches off the global ignore file; without that, a developer's own global ignore would make
criterion 1 pass for the wrong reason.

Collision sweep at lock (literals leg, 2 hits, 1 waived). Spec 02's remedy words do not exist
in this tree yet; their only homes will be the two files D4 and D5 name. Fixed by a File Plan
row: the guard's current sentence in `walkthrough-connect.js`, which stays for the two cases D2
keeps it for. Waived: `spec/scripts/memory-sweep.js` runs the same `git rev-parse` probe for its
own purpose; criterion 6 reads `walkthrough-connect.js` only. The `executes` hits were read:
`tests/walkthrough/fixture.js` makes every other host with the ignore line present, so no
fixture repair is planned (A10 carries the remedy if that proves wrong).

## Canonical Delta

`docs/canonical/design.md`, in the passage spec 02 appends ("Connect can run first") — replace
the sentence that begins "A folder that is not a git repository is refused" with:

Connect protects the token file itself (specs/20261005/04): when git does not ignore
`.claude/settings.local.json` it appends that line to the project's `.gitignore`, creating the
file when needed, in a git repository and in a plain folder alike, and never runs `git init`.
It refuses only when git already tracks the file, naming `git rm --cached` as the way out.
