---
date: 2026-09-09
status: hardened
tier: standard
area: replay-harness
design: false
breaking: false
depends_on: [specs/20260908/03-test-fixture-dedupe.md]
depended_on_by: [specs/20260909/02-replay-base-and-label-honesty.md]
brief: n/a
spiked: 2026-09-09
open_markers: 0
---

# The replay mutation commit is shaped like a real build commit

## Goal

A replay mutation lands as a commit that skips the last step every real build performs —
reconciling the host's derived artifacts against the tree it just changed. In this repo that
artifact is `size-baseline.json`, a byte-exact ceiling per tracked file, so a mutation that
changes any file's length reddens the gate on the length change alone, with no defect involved.
Step 7's ladder then reads that redness as newly-red, retries, verifies against the pristine
tree, finds it green, and records `leg-caught` — a measurement that says a review leg caught a
defect when all it caught was an edit. After this lands, `--apply` runs a host-declared
post-apply reconcile inside the scratch worktree and carries exactly the declared paths into the
mutation commit, so the commit is indistinguishable in shape from a real build commit; the
canonical patch every later phase scores against still names only the mutation's own files; a
failure of that hook is recorded rather than improvised; and a host that declares nothing behaves
byte-for-byte as it does today. Done means: a length-changing mutation in this repo leaves the
size ratchet green, and `scripts/size-ratchet.js --reconcile --cite <spec>` exists as the
one-shot form of what a build does by hand today.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `.claude/spec.config.json` gains an optional `replay.afterApply` block, `{"command": "<shell string>", "paths": ["<repo-relative path>", …]}`. When present, `--apply` runs `command` through `bash -c` with `cwd` = `--dir`, after `git apply --index` and **before** the commit; `{spec}` anywhere in `command` is replaced with `--apply`'s `--spec` value; then every declared path that is dirty after the command runs is staged with `git add -- <path>` (one path per invocation, never `git add -A` — specs/20260819/03 D10 stands) and rides the same commit (AC-20260909-01-1) | A real build's final step reconciles derived artifacts; a mutation commit that skips it is distinguishable from a real build commit by exactly the checks that read those artifacts. Rejected: teaching the harness which legs are edit-sensitive — replay-specific doctrine no host gate can see, and a new hole per leg. |
| D2 | Two different sets govern staging and refusal, so neither can hide the other. `--apply` records `D0` = `git diff --name-only` ∪ `git ls-files --others --exclude-standard` inside `--dir` immediately before running `command`, and `Dafter` the same two lists immediately after. **Staged** = `paths ∩ Dafter` — a declared path dirty now is staged whether or not it was already dirty in `D0`. **Refused** = `(Dafter \ D0) \ paths` — only a path the command itself newly dirtied and nobody declared; non-empty is exit 4, one stderr line naming every offender plus the remedy (narrow the command, or declare the path), with nothing committed. A nonzero exit from `command` is exit 4 quoting its stderr (AC-20260909-01-2, AC-20260909-01-3) | Staging on `Dafter` closes the case where the hook rewrites a path that was already dirty — a `D0`-relative staging rule would silently drop it. Refusing on the delta keeps a manually driven `--dir` whose tree was not restored from failing on dirt the hook never touched. |
| D3 | The canonical `--patch-out` emission becomes `git diff HEAD^ HEAD -- . ':(exclude)<p>'` for every `p` in `paths`, under the same pinned `-c` flags as today. The reviewer still reads the whole commit; `--score` and `--record`'s derived `files` see only the mutation's own files (AC-20260909-01-4) | The reconcile is commit shape, not the defect under measurement — scoring a reviewer finding on `size-baseline.json` as a kill would inflate the catch rate with something the reviewer was never asked to find. |
| D4 | `--apply` accepts `--spec <path>`. It is **required** exactly when the resolved `command` contains the literal `{spec}`: absent then, `--apply` exits 2 naming `--spec` before applying anything. Its value must match `^specs/\d{8}/\d{2}-` — the shape `size-ratchet.js --cite` already demands — before it is substituted into a `bash -c` string; anything else is exit 2. A command with no `{spec}` never needs it (AC-20260909-01-5, AC-20260909-01-6) | The only reconcile this repo needs cites the target spec, and `--apply` is the one mode that never knew it. The shape check is the boundary between a caller-supplied path and a shell string; without it `--spec` is a command-injection seam in the harness's own mutation step. |
| D5 | `paths` entries are repo-relative and normalized: a leading `./` is stripped; a trailing `/` means "this directory and everything under it" for both the refusal check and the `:(exclude)` pathspec; an absolute path, a `..` segment, or anything resolving under the three review-outcome meta prefixes (`specs/`, `.claude/`, `docs/canonical/`) is exit 2 naming the offender. A `replay.afterApply` that is not an object carrying a non-empty string `command` and a non-empty array of non-empty strings `paths` is exit 2 naming `.claude/spec.config.json` and the offending field. Every check here runs before `git apply` (AC-20260909-01-7, AC-20260909-01-8) | The meta prefixes are the surfaces `--setup`'s overlay deliberately strips so the close commit's `status: done` never reaches the blind reviewer; a hook re-introducing one would undo that in the same breath. A host with a generated directory needs a subtree form, and exact-string membership would silently refuse it forever. |
| D6 | The config is read from `<--root>/.claude/spec.config.json` — the main tree, the way `--pick-class` already reads it — never from `<--dir>`, whose `.claude/` sits at the parent's version by the overlay's own design. Absent config file, or a config with no `replay.afterApply`, means no hook: `--apply` is byte-for-byte today's behavior (apply, commit, emit the full `git diff HEAD^ HEAD`). A config file that exists but cannot be parsed is exit 2, never a silent no-hook (AC-20260909-01-9, AC-20260909-01-10) | `<--dir>`'s config is a stale copy by construction, and reading it would make the hook depend on which commit the target spec closed at. A malformed config falling through to "no hook" is the `silent-fallback` corpus class committed by the harness that exists to plant it. |
| D7 | An `--apply` refusal at the hook — nonzero `command`, an undeclared newly-dirtied path, a bad `--spec`, a malformed config — is recorded, never improvised: `replay.md` Phase 1 step 5 gains an arm running `--record --spec {spec} --review-run-id {reviewRunId} --legs none --outcome setup-failed` (no `--class`, even though one was selected — nothing was measured), then `--teardown`, then Phase 5's `setup-failed` report with the hook's stderr in the bullet that would otherwise name `setupCommand`, then STOP. Phase 4's "recorded and torn down in Phase 1 step 2 — it never reaches this phase" sentence is corrected to name both step-2 and step-5 sites (AC-20260909-01-11) | A designed failure path with no doctrine arm is a path the next session invents an answer for; `setup-failed` already means "nothing was measured, the harness stays due", which is exactly true here. |
| D8 | `scripts/size-ratchet.js --root <dir> --reconcile --cite <spec path>` writes a baseline under which a plain check exits 0: every tracked file's and tree's ceiling is set to its actual byte count, and one `raises[]` entry `{path, from, to, cite}` is appended per finding that `--update` would have refused (`over`, `tree-over`, `new-over-cap`), in the finding order `evaluate` already produces. With nothing to reconcile it rewrites the baseline byte-identically and appends no entry. It prints one line per appended raise, then the count. `--reconcile` is mutually exclusive with `--update`, `--raise` and `--json`; `--cite` is required and validated exactly as `--raise` validates it (AC-20260909-01-12, AC-20260909-01-13) | `--update` already writes ceilings equal to actual for every tracked file — it just refuses to do so over a growth (specs/20260908/01-size-ratchet.md D3), which is why a build raises by hand first. `--reconcile` is that same pass with the refusal replaced by the audit trail the refusal exists to force. Rejected: relaxing `--update` — the friction there is deliberate and load-bearing on the main tree. |
| D9 | `--reconcile` keeps `--update`'s tracked-but-missing refusal unchanged: a path `git ls-files` reports that is absent from disk is exit 1 with the restore-or-`git rm` remedy, and nothing is written (AC-20260909-01-14) | A missing file is a broken checkout, not a growth to baseline; lifting that refusal too would let a reconcile silently drop a file from the budget. |
| D10 | This repo declares the hook: `"replay": {"afterApply": {"command": "node scripts/size-ratchet.js --root . --reconcile --cite {spec}", "paths": ["size-baseline.json"]}}`, alongside the existing `inapplicableClasses` `[no-ac: host configuration data — the mechanism it feeds is pinned by AC-20260909-01-1..11; a config value has no behavioral surface of its own]` | The grounding contract (`spec-paths contract`) does not enumerate the `replay` block, so this is an additive host key and no host's grounding stamp changes. |
| D11 | `spec/commands/replay.md` Phase 1 step 5 states that `--apply` takes `--spec {spec}`, runs the host's declared post-apply reconcile between applying and committing, stages only the declared paths so the mutation commit carries the same derived-artifact reconciliation a real build commit carries, excludes those paths from the canonical patch, and that a host declaring none is unchanged. Phase 3 gains one sentence: a survivor naming **only** a declared reconcile path is not a kill — the reviewer spent its finding on commit shape rather than the planted defect — so that adjudication resolves `missed` (AC-20260909-01-11, AC-20260909-01-15) | Doctrine is where a host author learns a hook exists; a mechanism reachable only by reading `replay.js` is a mechanism hosts never adopt (the `.worktreeinclude` precedent, specs/20260904/02 D6). The excluded path turns such a survivor into `--score`'s `ambiguous`, and an unruled `ambiguous` is a coin flip in the catch-rate numerator. |
| D12 | `spec/.claude-plugin/plugin.json` is bumped via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` `[no-ac: version discipline is pinned mechanically by scripts/plugin-bump.js --check in the gate]` | Pipeline rules § Planning: a plugin.json row cites the command and names no version literal. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/replay.js | MODIFY | scripts | D1–D6: `--apply` reads `replay.afterApply` from `<--root>`, validates its shape, path normalization and meta-prefix ban, substitutes a shape-checked `{spec}`, runs the command between `git apply --index` and the commit, stages `paths ∩ Dafter`, refuses `(Dafter \ D0) \ paths` with exit 4, and emits `--patch-out` with the declared paths excluded; `--apply` gains `--spec` |
| scripts/size-ratchet.js | MODIFY | scripts | D8, D9: `--reconcile --cite <spec>` — `doUpdate`'s pass with the `over`/`tree-over`/`new-over-cap` refusal replaced by one `raises[]` entry each, byte-identical when there is nothing to reconcile; flag exclusivity and `--cite` validation reuse the existing `--raise` checks; the tracked-but-missing refusal is untouched |
| spec/commands/replay.md | MODIFY | doctrine | D7, D11: Phase 1 step 5 documents `--spec`, the post-apply reconcile, the declared-paths staging, the patch exclusion, the unchanged behavior for a host that declares none, and the hook-failure `setup-failed` arm; Phase 3 gains the reconcile-path-survivor ruling; Phase 4's "never reaches this phase" sentence names both `setup-failed` sites |
| .claude/spec.config.json | MODIFY | other | D10: `replay.afterApply` declared for this repo; no other key changes |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D12: bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |
| tests/replay/replay.test.js | MODIFY | tests | AC-20260909-01-1, AC-20260909-01-2, AC-20260909-01-3, AC-20260909-01-4, AC-20260909-01-5, AC-20260909-01-6, AC-20260909-01-7, AC-20260909-01-8, AC-20260909-01-9, AC-20260909-01-10, AC-20260909-01-11, AC-20260909-01-15. Fixture duty: the existing `--apply` tests build hosts with **no** `.claude/spec.config.json`; they keep working unchanged under D6's absent-config arm and are retagged with AC-20260909-01-9 rather than rewritten. New hook tests author against `tests/replay/replay.fixtures.js` (see A4) |
| tests/size-ratchet/size-ratchet.test.js | MODIFY | tests | AC-20260909-01-12, AC-20260909-01-13, AC-20260909-01-14 |

Orchestrator duty, outside the table: the build's last step reconciles this repo's own
`size-baseline.json` for the files this spec grows, exactly as every build here already does —
`size-baseline.json` is not a File Plan row and no worker edits it.

## Contracts

```
.claude/spec.config.json  (additive, optional; not enumerated by the grounding contract)

  "replay": {
    "inapplicableClasses": [ ... ],            # unchanged
    "afterApply": {                            # NEW, optional
      "command": "<shell string>",             # required, non-empty; {spec} substituted
      "paths":   ["<repo-relative path>", …]   # required, non-empty array of non-empty strings
                                               # "./x" -> "x"; trailing "/" = subtree;
                                               # absolute, "..", or under specs/ .claude/
                                               # docs/canonical/ -> exit 2
    }
  }
```

```
spec/scripts/replay.js  --apply  (Node built-ins only)

  --apply --dir <path> --patch <file> --patch-out <file> --class <id>
          [--spec <path>] [--subject <text>] [--root <path>]

  order of operations (every refusal below leaves the commit unmade):
    1. validateClass(--class)                                   exit 2   (unchanged)
    2. --patch-out required                                     exit 2   (unchanged)
    3. subject refusal (leading "replay", contains --class)      exit 2   (unchanged)
    4. --patch-out inside --dir                                 exit 3   (unchanged)
    5. read <--root>/.claude/spec.config.json                            (D6)
         file absent, or no replay.afterApply -> HOOK OFF; steps 6,8,9 skipped and
           step 11 emits the full `git diff HEAD^ HEAD` (today's behavior, byte for byte)
         file present but unparsable                            exit 2
         afterApply malformed shape                             exit 2   (D5)
         a paths entry absolute, containing "..", or under a meta prefix
                                                                exit 2   (D5)
         command contains {spec} and no --spec given             exit 2   (D4)
         --spec given and not matching ^specs/\d{8}/\d{2}-       exit 2   (D4)
    6. D0     = git -C <dir> diff --name-only
              + git -C <dir> ls-files --others --exclude-standard
    7. git apply --index <patch>                                exit 4   (unchanged)
    8. bash -c "<command, {spec} substituted>"  cwd=<dir>
         nonzero exit -> exit 4, stderr quoted, remedy named     (D2)
    9. Dafter = the same two lists
         offenders = (Dafter \ D0) \ paths
         offenders non-empty -> exit 4 naming every offender     (D2)
         else git add -- <p> for each p in (paths ∩ Dafter)      (D2)
   10. git commit -q -m <subject>                               exit 4   (unchanged)
   11. git diff HEAD^ HEAD -- . ':(exclude)<p>' … -> --patch-out (D3)
   stdout on success: applied class=<id> dir=<dir> patchOut=<abs>   (unchanged)
   (subtree form: a paths entry "x/" contributes ':(exclude)x/' and matches any
    Dafter member whose path starts with "x/")
```

```
scripts/size-ratchet.js  --reconcile

  size-ratchet.js --root <dir> --reconcile --cite <spec path> [--baseline <file>]

  Writes: newFileCap unchanged; files[rel] = actual for every tracked file under the three
  trees; trees[t] = the sum of those; raises = baseline.raises ++ one
  {path, from, to, cite} per finding of kind over | tree-over | new-over-cap, in evaluate()'s
  own finding order (from = the recorded ceiling, 0 when the path had none; to = actual).
  Nothing to reconcile -> the same serializer rewrites the same bytes and raises is unchanged.
  stdout: one "size-ratchet: reconciled <path> <from> -> <to>" line per appended raise, then
          "size-ratchet: reconciled <n> raises, <files> files, <trees> trees".
  Refusals (nothing written):
    exit 1  a tracked path missing from disk (same message and remedy as --update)  (D9)
    exit 2  --reconcile with --update, --raise or --json; --cite missing, not matching
            ^specs/\d{8}/\d{2}- , or naming a file that does not exist
  A plain check against the written baseline exits 0.
```

## Behavior

- **Why the commit shape matters.** `--setup` stands the scratch tree at the close commit's
  parent plus an overlay of the close commit's non-meta content, so the tree is byte-identical
  to what the review judged. `--apply` then adds one commit. Every check that compares the tree
  against something recorded *in* the tree — a byte baseline, a generated-file snapshot, a
  lockfile hash — reads that commit as a build that forgot its last step. The mutation is
  supposed to be invisible except as a defect; a missing reconcile makes it visible as a
  process violation instead.
- **Order matters more than the hook.** The reconcile has to run after the mutation is in the
  working tree (its bytes are the input) and before the commit (its output has to ride the same
  commit a real build would). Re-baselining at `--setup` cannot work: at setup time the
  mutation does not exist yet.
- **What a host sees.** A host with no `replay.afterApply` reads none of this: no config lookup
  changes its `--apply` path, its emitted patch is the same bytes, and its `--spec` stays
  optional-and-unused. This repo is the first adopter.
- **Why staging and refusal use different sets.** On the doctrine path the tree is already
  clean when `--apply` runs — step 2 ends with `git checkout -- .` plus `git clean -fd` and
  step 5 with `git checkout -- .` — so `D0` is normally empty and the two sets coincide. They
  diverge on a hand-driven `--dir` whose tree was never restored: there the delta keeps
  pre-existing dirt from being blamed on the hook, while staging on `Dafter` keeps a declared
  path the hook rewrote from being dropped because it happened to be dirty already.
- **`size-baseline.json` in the reconcile leg.** The mutation commit now carries a path the
  target spec's own File Plan did not, so the review's `reconcile.json` for the scratch tree
  lists it as out-of-plan. Step 7 rung 1 already exempts `reconcile` redness by construction, so
  this changes no attribution — it is visible in the evidence and explained by the commit itself.
- **`--reconcile` on the main tree.** It is the same audit trail `--raise` writes, batched: one
  `raises[]` entry per growth, each citing a spec, each visible in the diff and in the live
  `raises[].cite` existence check. What it removes is the hand-transcription of byte counts,
  not the record.

## Acceptance Criteria

- **AC-20260909-01-1**: WHEN `--apply` runs in a host declaring
  `replay.afterApply = {command: "printf '{\"n\":2}\\n' > derived.json", paths: ["derived.json"]}`
  THE SYSTEM SHALL run that command inside `--dir` between `git apply --index` and the commit
  and include the declared path in that same commit — `git diff --name-only HEAD^ HEAD` →
  `derived.json` and the mutated file, both, in one commit → test "the declared post-apply
  reconcile rides the mutation commit" in `tests/replay/replay.test.js`
- **AC-20260909-01-2**: WHEN the declared command newly dirties a path outside `paths` — command
  `printf x > derived.json; printf y > stray.txt` with `paths: ["derived.json"]` — THE SYSTEM
  SHALL exit 4 with a stderr line containing `stray.txt`, and leave `git rev-parse HEAD`
  unchanged from its pre-`--apply` value; and WHEN the command itself exits nonzero — `exit 3` —
  THE SYSTEM SHALL exit 4 quoting that command's stderr, HEAD unchanged → tests "an undeclared
  path dirtied by the post-apply reconcile is refused and nothing is committed" and "a failing
  post-apply command is exit 4 with its own stderr quoted" in `tests/replay/replay.test.js`
- **AC-20260909-01-3**: WHEN a tracked path is already dirty before `--apply` — `lock.txt`
  modified, `D0 = {lock.txt}` — and the declared command rewrites both `derived.json` and
  `lock.txt` with `paths: ["derived.json"]` THE SYSTEM SHALL exit 0, commit `derived.json` and
  the mutated file, and neither refuse on `lock.txt` (it is not in `Dafter \ D0`) nor stage it
  (it is not in `paths`) — `git diff --name-only HEAD^ HEAD` lists `derived.json` and the
  mutated file only; and WHEN `paths` is `["derived.json", "lock.txt"]` instead THE SYSTEM SHALL
  stage `lock.txt` too, because staging reads `paths ∩ Dafter` and not the delta → tests
  "pre-existing dirt is neither refused nor staged" and "a declared path already dirty in D0 is
  still staged" in `tests/replay/replay.test.js`
- **AC-20260909-01-4**: WHEN `replay.afterApply` declares `paths: ["derived.json"]` THE SYSTEM
  SHALL write a `--patch-out` whose `+++ b/` headers name only the mutated file — commit
  touching `derived.json` and `spec/scripts/x.js` → the emitted patch contains
  `+++ b/spec/scripts/x.js` and no `+++ b/derived.json`; and WHEN `paths` is `["gen/"]` and the
  command writes `gen/a.json` THE SYSTEM SHALL exclude `gen/a.json` the same way → tests "the
  canonical patch excludes the declared reconcile paths" and "a trailing-slash path excludes its
  whole subtree" in `tests/replay/replay.test.js`
- **AC-20260909-01-5**: WHEN the declared `command` contains `{spec}` and `--apply` is invoked
  without `--spec` THE SYSTEM SHALL exit 2 with a stderr line naming `--spec`, before the patch
  is applied (`git status --porcelain` in `--dir` unchanged); and WHEN `--spec
  specs/20260909/01-x.md` is supplied the command SHALL run with `{spec}` replaced by that exact
  string → tests "a {spec} placeholder with no --spec is refused before anything is applied" and
  "{spec} is substituted with the --spec value" in `tests/replay/replay.test.js`
- **AC-20260909-01-6**: WHEN `--spec` does not match `^specs/\d{8}/\d{2}-` — `--spec
  'x; rm -rf /'` or `--spec docs/notes.md` — THE SYSTEM SHALL exit 2 naming the expected shape,
  before the patch is applied and before any `bash -c` runs → test "a --spec that is not a dated
  spec path is refused before it reaches the shell" in `tests/replay/replay.test.js`
- **AC-20260909-01-7**: WHEN a `paths` entry is absolute (`/etc/x`), contains `..`
  (`../outside.json`), or resolves under `specs/`, `.claude/` or `docs/canonical/`
  (`.claude/notes.json`) THE SYSTEM SHALL exit 2 naming that entry, applying nothing; and WHEN
  an entry is written `./derived.json` THE SYSTEM SHALL treat it as `derived.json` → tests "an
  afterApply path that escapes the worktree or names a review-outcome surface is refused" and
  "a ./-prefixed path is normalized" in `tests/replay/replay.test.js`
- **AC-20260909-01-8**: WHEN `replay.afterApply` is present but malformed — `{command: ""}`,
  `{command: "x"}` with no `paths`, `{command: "x", paths: "derived.json"}`, or
  `{command: "x", paths: []}` — THE SYSTEM SHALL exit 2 naming `.claude/spec.config.json` and
  the offending field, and leave `git status --porcelain` in `--dir` unchanged → test "a
  malformed afterApply block is refused before the patch is applied" in
  `tests/replay/replay.test.js`
- **AC-20260909-01-9**: WHEN `<--root>/.claude/spec.config.json` does not exist, or exists with
  no `replay.afterApply`, THE SYSTEM SHALL CONTINUE TO apply the patch, commit it under
  `--subject`, and write a `--patch-out` equal to the full `git diff HEAD^ HEAD` → the existing
  `--apply` tests in `tests/replay/replay.test.js` — whose hosts carry no config file at all —
  retagged with this AC-ID in place
- **AC-20260909-01-10**: WHEN `<--root>/.claude/spec.config.json` exists but is not parseable
  JSON THE SYSTEM SHALL exit 2 naming that file, applying nothing — never falling through to
  the no-hook path — and WHEN the config lives at `<--dir>/.claude/spec.config.json` only, with
  none at `<--root>`, THE SYSTEM SHALL read no hook from it (the no-hook path) → tests "an
  unparsable host config is refused rather than read as no-hook" and "the hook is read from the
  main root, never from the scratch worktree" in `tests/replay/replay.test.js`
- **AC-20260909-01-11**: WHEN `spec/commands/replay.md` is read THE SYSTEM SHALL state, in
  Phase 1 step 5, that `--apply` takes `--spec {spec}`, runs the host's declared post-apply
  reconcile between applying and committing, stages only the declared paths, excludes them from
  the canonical patch, that a host declaring none is unchanged, and that an `--apply` refusal at
  the hook records `--legs none --outcome setup-failed` and stops; and SHALL NOT claim in
  Phase 4 that `setup-failed` never reaches that phase — the step-5 slice matching `/--spec/`,
  `/afterApply/`, `/reconcil/i`, `/exclude/i`, `/declares? (none|no)/i` and `/setup-failed/`,
  and the Phase 4 slice not matching `/never reaches this phase/` → test "replay.md Phase 1 step
  5 documents the post-apply reconcile hook and its failure arm" in
  `tests/replay/replay.test.js`, section-scoped exactly as AC-20260831-01-7 scopes its own step
  slices
- **AC-20260909-01-12**: WHEN `size-ratchet.js --root <dir> --reconcile --cite <spec>` runs
  against a tree carrying one stale ceiling and one over file — `scripts/a.js` baselined 10,
  actual 8; `scripts/b.js` baselined 10, actual 12 — THE SYSTEM SHALL write
  `files["scripts/a.js"] = 8`, `files["scripts/b.js"] = 12`, tree ceilings equal to the new sums,
  and append exactly one `raises[]` entry per lifted finding
  (`{path:"scripts/b.js", from:10, to:12, cite:"<spec>"}` plus the tree's own entry), after which
  a plain check against that baseline exits 0; and WHEN the tree is already tight THE SYSTEM
  SHALL rewrite the baseline byte-identically and append no entry → tests "--reconcile tightens
  stale ceilings, lifts growth into cited raises, and leaves the check green" and "a no-op
  reconcile leaves the baseline byte-identical" in `tests/size-ratchet/size-ratchet.test.js`
- **AC-20260909-01-13**: WHEN `--reconcile` is combined with `--update`, `--raise` or `--json`,
  or is given no `--cite`, a `--cite` of `docs/x.md`, or a `--cite` of
  `specs/20260909/99-absent.md` that does not exist THE SYSTEM SHALL exit 2 with a
  `size-ratchet: `-prefixed stderr line naming the remedy and leave the baseline file
  byte-for-byte unchanged → test "--reconcile refuses a bad invocation and writes nothing" in
  `tests/size-ratchet/size-ratchet.test.js`
- **AC-20260909-01-14**: WHEN `--reconcile` runs against a tree where `git ls-files` still lists
  a path a plain `rm` removed from disk THE SYSTEM SHALL CONTINUE TO exit 1 naming that path and
  the restore-or-`git rm` remedy, and leave the baseline byte-for-byte unchanged → the existing
  AC-20260908-01-6 tracked-but-missing test in `tests/size-ratchet/size-ratchet.test.js`,
  extended with the `--reconcile` invocation and retagged with this AC-ID
- **AC-20260909-01-15**: WHEN `spec/commands/replay.md`'s Phase 3 is read THE SYSTEM SHALL state
  that a survivor naming only a declared reconcile path is adjudicated `missed`, because the
  reviewer spent its finding on commit shape rather than the planted defect — the Phase 3 slice
  matching `/reconcile path/i` and `/missed/` → test "replay.md Phase 3 rules a
  reconcile-path-only survivor" in `tests/replay/replay.test.js`

## Assumptions (escalation triggers)

- A1: `git diff HEAD^ HEAD -- . ':(exclude)<p>'` emits the commit minus `<p>`, and `git add --
  <p>` after `git apply --index` puts both the applied patch and `<p>` in one commit —
  **executed 2026-09-09** in a throwaway repo: staged `src.js`, wrote `size-baseline.json`,
  `git diff --name-only` printed exactly `size-baseline.json` (the hook's footprint, nothing
  else), `git add -- size-baseline.json` + commit gave `git diff --name-only HEAD^ HEAD` →
  `size-baseline.json`, `src.js`, and the same diff with `-- . ':(exclude)size-baseline.json'` →
  `src.js` alone. — **if false:** emit the patch by filtering the full diff's file sections in
  `parsePatch`'s own vocabulary instead of a pathspec.
- A2: this repo's size ratchet is green on the pristine scratch tree and red only on a
  length-changing mutation — **executed 2026-09-09** against a real `--setup` worktree at
  `parent=3634701` + `overlay=cce7be7`: `size-ratchet --root <tree>` → `253 files, 4 trees, all
  tight` (exit 0); after appending one newline to `spec/scripts/replay.js` → `over
  spec/scripts/replay.js 68871 > 68870` plus `tree-over spec/scripts`, exit 1; after an
  equal-length identifier swap instead → `all tight`, exit 0. — **if false:** nothing in this
  spec changes; the hook is still the right shape for any host with a derived artifact.
- A3: on the doctrine path the scratch tree is clean when `--apply` runs — **executed
  2026-09-09**: `grep -n 'checkout -- \.\|clean -fd' spec/commands/replay.md` → step 2's
  `git -C {dir} checkout -- .` + `git -C {dir} clean -fd` and step 5's `git -C {dir} checkout --
  .`, so `D0` is empty on every run this command drives. D2's delta therefore protects only a
  hand-driven `--dir`. — **if false:** the delta is load-bearing on the main path too and its
  ACs matter more, not less; no decision changes.
- A4: by the time this builds, `specs/20260908/03-test-fixture-dedupe.md` has landed and
  `tests/replay/replay.test.js`'s repeated host builders live in `tests/replay/replay.fixtures.js`
  — read from that spec's in-flight worktree on 2026-09-09 (`status: implementing`, its diff
  against `main` creates `tests/replay/replay.fixtures.js` and rewrites
  `tests/replay/replay.test.js`). New tests here author against the fixtures module, never a
  re-inlined builder. — **if false:** 03 has not landed at build time; build in place against
  the inlined builders and let 03's own build absorb the new tests, recording the departure.
- A5: the grounding contract does not enumerate the `replay` config block, so `afterApply` is
  additive and no host's `contractHash` stamp changes — `grep -n replay
  spec/templates/grounding-contract.md` returned nothing on 2026-09-09. — **if false:** the
  contract gains one optional-block line and this spec becomes critical tier (pipeline rules
  § Risk Tiers).
- A6: the hook runs the **scratch tree's** copy of the host command, so a replay target whose
  close commit predates this spec has a `size-ratchet.js` with no `--reconcile` and the hook
  exits 2 → `--apply` exit 4. `--select` picks the newest eligible CLEAN row, so the first
  post-landing target is at or after this spec; a lingering older target (kept due by a
  `setup-failed`) can still hit it. — **if false / when it happens:** D7's arm records
  `setup-failed` with the hook's stderr and the harness stays due, which is the honest outcome;
  no code change is owed.

## Rationale

The measurement this harness exists to produce is "did a blind reviewer catch a planted defect".
Everything else the scratch tree does is scaffolding, and scaffolding that changes what the legs
observe corrupts the measurement rather than supporting it. The size ratchet is the clearest
case available: it is a genuinely good check on the main tree, it is green on the pristine
scratch tree, and it reddens on the mutation for a reason that has nothing to do with the
defect. Three fixes were weighed. Excluding edit-sensitive legs from replay's attribution
ladder was rejected because it is replay-only doctrine that no host gate can see, and because
the exclusion list grows one entry per check anyone ever writes. Silencing the ratchet inside a
scratch worktree was rejected for the same reason plus a worse one — a check that knows it is
being tested is a check that can be lied to. Making the mutation commit carry the reconcile
survives both objections: it does not weaken any check, it makes the scratch tree *more* like the
real thing rather than less, and the mechanism is a host hook, so a host with no derived
artifacts pays nothing.

Three spots are fragile. The emission has to exclude the declared paths because `--score` treats
every file in the patch as part of the mutation; leaving `size-baseline.json` in would let a
reviewer's stray comment on it score as a kill. Excluding it instead sends such a survivor to
`--score`'s `ambiguous`, which is a human seam with no default — D11 gives it one, `missed`,
because a reviewer that spent its finding on the reconcile did not find the defect. And the
config has to be read from the main root: `<--dir>`'s `.claude/` is a parent-version copy by the
overlay's own design, so reading it there would make the hook depend on which commit the target
closed at, silently.

`--reconcile` is deliberately not a relaxation of `--update`. `--update`'s refusal on growth is
the friction that makes a human decide whether a file should be allowed to grow, and that verb
keeps it. What changes at the system level is honest to state: a build on the main tree can now
lift every growth in one command instead of one decision per file. The audit trail that replaces
the per-file decision is the `--cite` requirement, the `raises[]` entries the diff carries, the
live check that every cite names a file that exists, and the host review rule that a raise whose
cite is not the spec under review is a hard finding.

The step-7 ladder rewrite that stops a still-red pristine leg from stalling on an unanswerable
question is deliberately **not** here: it depends on the `pristine-red:<leg>` recording shape,
which belongs with the recorder changes in the sibling spec. Until that lands, a pristine-red leg
ends where it ends today — at rung 4's question — which is unchanged behavior, not a regression.

## Canonical Delta

`docs/canonical/gate-integrity.md` gains one bullet after **The gate resolves `{testDirs}` to
the glob form**:

- **A derived artifact is reconciled in the commit that changes its inputs.** The size ratchet
  is a byte-exact ceiling per tracked file, so any commit that changes a file's length and does
  not carry the matching `size-baseline.json` reads as a build that skipped its last step. This
  is true of hand-built commits and of the mutation commits the replay harness plants alike:
  `replay.js --apply` runs the host's declared `replay.afterApply` command inside the scratch
  worktree between applying the patch and committing it, stages exactly the declared paths, and
  excludes them from the canonical patch later phases score against — so the planted commit is
  shaped like a real build commit and the legs judge the defect rather than the edit. A failure
  of that hook records `setup-failed` and stops; it is never worked around in-session. The
  one-shot form of the reconcile is `scripts/size-ratchet.js --reconcile --cite <spec>`: every
  tracked ceiling set to actual, one `raises[]` entry per growth it lifts. `--update` still
  refuses growth outright, so the two verbs differ in what they demand up front — `--reconcile`
  demands a citing spec before it will lift anything, and the record it leaves is the same
  `raises[]` trail `--raise` writes, held by the live cite-existence check and by review's rule
  that a raise citing anything but the spec under review is a hard finding.
