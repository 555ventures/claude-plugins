---
date: 2026-09-04
status: done
tier: critical
area: replay
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
open_markers: 0
diff_base: 9406d14e741210226d840f8d98f2362ced20c16c
---

# Worktree include: one shared owner for the `.worktreeinclude` copy step

## Goal

`git worktree add` materializes tracked files only, so a host whose app boots from gitignored
env files (the `.worktreeinclude` manifest names them) boots env-less in any worktree the
pipeline creates. The build worktree path already copies the manifest's matches; the replay
harness's scratch worktree does not, so on every such host every replay run dies at the
setup gate or the smoke leg for a reason that has nothing to do with the reviewer being
measured (UpWell `rp_8d26b38255a6`, 2026-09-04: smoke failed on missing `app/.env.local`;
hand-copying the two declared files made it pass, unchanged otherwise). Done means: one
script owns "copy the manifest's gitignored matches into this worktree", both worktree
creation paths call it, a host with no manifest behaves exactly as today, and a test pins
each path through the owner so they cannot drift apart again.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | New script `spec/scripts/worktree-include.sh --root <main root> --dest <worktree path>` is the sole owner of the copy step: it enumerates files that are BOTH gitignored in `--root` AND matched by `<root>/.worktreeinclude`, excludes anything under `.claude/worktrees/`, and copies them into `--dest` preserving relative paths (AC-20260904-02-1, AC-20260904-02-2, AC-20260904-02-3, AC-20260904-02-4, AC-20260904-02-5) | A separate single-purpose script is cheaper to reverse than a `merge-back.sh` subcommand and keeps the replay harness from depending on the merge-back script; rejected: a function inlined twice (the drift this spec closes), a `merge-back.sh include` subcommand (couples replay to a critical-tier script's flag loop). |
| D2 | The owner writes nothing on stdout; stderr carries exactly one line when files were copied — `worktree-include: copied N .worktreeinclude-matched file(s) into <dest>` — and nothing when nothing qualifies (AC-20260904-02-1, AC-20260904-02-2, AC-20260904-02-7) | `replay.js --setup`'s stdout is pinned to exactly one `setup dir=… commit=…` line, and the existing merge-back test matches the substring `copied N .worktreeinclude-matched file`; the phrase is preserved, only the prefix changes. |
| D3 | `merge-back.sh create` replaces its inline copy block with one call to the owner right after `git worktree add`; exit 0 and 3 from the owner continue (3 is already printed as a WARNING by the owner), any other exit is a `die` naming the owner's usage remedy (AC-20260904-02-6, AC-20260904-02-7, AC-20260904-02-8) | Preserves every observable of today's create path (files delivered, unmatched skipped, quiet on nothing); a usage-class failure from the owner is a programmer error, never a host condition, so it stays loud. |
| D4 | `replay.js --setup` calls the owner (via `spawnSync('bash', [ownerPath, '--root', root, '--dest', dir])`, stderr forwarded verbatim) immediately after the scratch marker is written and BEFORE `--overlay` materializes; owner exit 0 or 3 continues to the unchanged `setup dir=…` line; any other exit prints a stderr line naming the remedy `git -C <root> worktree remove --force <dir>` and exits 4 (AC-20260904-02-9, AC-20260904-02-10, AC-20260904-02-11) | Copied files are gitignored at the target commit, so they never enter `git apply --index` and the overlay commit stays identical; exit 4 is the header's existing "worktree registered but unusable" arm, no new exit code. |
| D5 | `spec/bin/spec-paths` gains the key `worktree-include` → `spec/scripts/worktree-include.sh`, listed in its usage line; `replay.js` resolves the owner by path relative to its own `__dirname` (sibling script), never through `spec-paths` (AC-20260904-02-12) | Every bundled script needs a key or doctrine cannot name it (§ Risk Tiers: "a wrong key breaks commands silently"); the in-script sibling resolution keeps `--setup` free of a shell lookup on its hot path. |
| D6 | `spec/commands/replay.md` Phase 1 step 1 states that `--setup` copies the host's `.worktreeinclude`-matched gitignored files into the scratch worktree before the setup gate runs, and names the no-manifest behavior as unchanged; `spec/commands/init.md`'s worktree env manifest bullet says the manifest feeds BOTH the build worktree and the replay scratch worktree (AC-20260904-02-13) | The 2026-08-19 deferral lived only in an old spec's prose, invisible to a host author reading init.md; the doctrine must name both consumers so the manifest is written once for both. |
| D7 | Bump `spec/.claude-plugin/plugin.json` to the next free minor (target 7.80.0) and prepend the changelog entry in the last-3-versions form `[no-ac: review's version-bump check is the oracle]` | Behavior change in two scripts plus doctrine; the literal number is a target, not a pin (§ Gotchas: concurrent sessions race the semver). |
| D8 | When the replay target commit does NOT ignore a manifest-matched file (the ignore rule postdates the commit), the owner still copies it and nothing force-excludes it: `git status` in the scratch tree shows it untracked and the setup gate's `git clean -fd` removes it, so that run fails honestly at setup/smoke `[no-ac: documented limitation with no behavioral surface of its own — A4 records the executed evidence]` | Provisioning `info/exclude` per copied path would make the harness edit the tree it must keep blind; the condition is rare (a manifest newer than the last CLEAN close) and self-heals at the next review. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/worktree-include.sh | CREATE | scripts | D1/D2: the sole owner of the manifest copy; `--root`/`--dest` flags, `set -u`, header with owner citation, what it does NOT do (never touches tracked files, never edits ignore rules, never copies under `.claude/worktrees/`), and `Exit codes:` 0 copied-or-nothing · 2 usage/precondition · 3 copy failed (WARNING printed) |
| spec/scripts/merge-back.sh | MODIFY | scripts | D3: `create` replaces the inline `.worktreeinclude` block with one call to the owner; exit 0/3 continue, else `die`; header note names the owner |
| spec/scripts/replay.js | MODIFY | scripts | D4: `cmdSetup` calls the owner after the marker write and before `materializeOverlay`; stderr forwarded; exit 0/3 continue; other → exit 4 with the worktree-remove remedy; header comment names the owner and this spec |
| spec/bin/spec-paths | MODIFY | scripts | D5: `worktree-include` key + usage-line entry |
| spec/commands/replay.md | MODIFY | doctrine | D6: Phase 1 step 1 names the copy and the unchanged no-manifest behavior |
| spec/commands/init.md | MODIFY | doctrine | D6: worktree env manifest bullet names both consumers (build worktree and replay scratch worktree) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D7: version bump to the next free minor + changelog entry |
| spec/entrypoints.json | MODIFY | scripts | D1: registry row for the new script naming its entry points (`merge-back.sh`, `replay.js`, `replay.md`) — the entrypoints consistency sweep refuses an unregistered script; added to scope at build (auto-picked, logged in the deviations sidecar) |
| tests/worktree-include.test.js | CREATE | tests | AC-20260904-02-1, AC-20260904-02-2, AC-20260904-02-3, AC-20260904-02-4, AC-20260904-02-5 |
| tests/merge-back.test.js | MODIFY | tests | AC-20260904-02-6, AC-20260904-02-7, AC-20260904-02-8 — retag the two existing `.worktreeinclude` tests as pins, add the owner-prefix assertion |
| tests/replay/replay.test.js | MODIFY | tests | AC-20260904-02-9, AC-20260904-02-10, AC-20260904-02-11, AC-20260904-02-13 — two new `--setup` tests, one pin retag on the existing derived-`--setup` test, one doctrine pin |
| tests/spec-paths.test.js | MODIFY | tests | AC-20260904-02-12 — add `worktree-include` to the exhaustive key list and one resolution test |

## Contracts

```
spec/scripts/worktree-include.sh --root <main worktree root> --dest <existing directory>

  stdin:  none
  stdout: nothing, ever
  stderr: one line when N > 0:
            worktree-include: copied N .worktreeinclude-matched file(s) into <dest>
          one line on copy failure:
            worktree-include: WARNING — .worktreeinclude copy failed; <dest> may be missing env/config files
          one line on usage/precondition failure naming the flag or condition and the remedy
  exit:   0  copied N ≥ 0 files (N = 0 when no manifest, or the manifest matches nothing gitignored)
          2  usage: --root/--dest missing, --root not a git repo, --dest not an existing directory
          3  copy failed after enumeration (tar pipeline non-zero)

  selection (unchanged from merge-back.sh create today):
    (cd ROOT && git ls-files -oi --exclude-from=.worktreeinclude | grep -v '^\.claude/worktrees/' | git check-ignore --stdin)
  copy (unchanged): (cd ROOT && printf '%s\n' "$INCLUDES" | tar -cf - -T - | tar -xf - -C DEST)

spec-paths worktree-include   → <plugin root>/scripts/worktree-include.sh
```

`replay.js --setup` stdout contract is unchanged: exactly one line `setup dir=<abs> commit=<sha>[ overlay=<sha> overlaid=<n>]`.

## Behavior

**Build worktree (`merge-back.sh create`).** After `git worktree add -b …` succeeds, create
runs `bash "$(dirname "$0")/worktree-include.sh" --root "$CROOT" --dest "$WT"`. Exit 0 or 3 →
continue to the `created worktree` line and print the path. Any other exit → `die "create:
worktree-include.sh failed (exit N) — run it by hand: bash <path> --root <root> --dest <wt>"`.
The observable behavior of a host with or without a manifest is identical to today; only the
stderr prefix of the copy line changes from `merge-back:` to `worktree-include:`.

**Scratch worktree (`replay.js --setup`).** Order inside `cmdSetup` becomes: refusals →
`git worktree add --detach` → git-dir resolution → marker write → **owner call** → overlay
materialization → `setup dir=…` line. The owner's stderr is forwarded verbatim (so the
`copied N` line reaches the session's console). Exit 0/3 continue. Exit 2 or any other value
prints `replay.js: worktree-include.sh exited N for <dir> — the worktree is registered but
unusable; remove it with git -C <root> worktree remove --force <dir>: <stderr>` and exits 4.

**Setup gate interplay (doctrine, unchanged mechanics).** The setup gate then runs
`setupCommand` inside the scratch tree, `git checkout -- .`, `git clean -fd`. Copied files
are ignored at the target commit in the normal case, so `clean -fd` leaves them (A3). When the
target commit predates the ignore rule they are untracked there and `clean -fd` removes them
(D8, A4).

**Blindness.** Copied files are the host's own gitignored config, identical to what the
build worktree carries; they are invisible to `git status`, `git diff`, and `git log` in the
scratch tree, so no new surface tells the reviewer it is being measured.

## Acceptance Criteria

- **AC-20260904-02-1**: WHEN `worktree-include.sh --root R --dest D` runs where `R/.gitignore` ignores `.env`, `config/local.json`, and `secret.txt`, `R/.worktreeinclude` lists `.env` and `config/local.json`, all three files exist untracked, and `D` is an empty directory THE SYSTEM SHALL exit 0, leave `D/.env` = `KEY=1\n` and `D/config/local.json` = `{}\n`, leave `D/secret.txt` absent, print nothing on stdout, and print on stderr exactly one line matching `^worktree-include: copied 2 \.worktreeinclude-matched file\(s\) into ` → `tests/worktree-include.test.js`
- **AC-20260904-02-2**: WHEN `--root R` has no `.worktreeinclude`, OR its manifest is `a.txt\n.env\n` with `a.txt` tracked and no `.env` on disk THE SYSTEM SHALL exit 0, copy nothing (`D` stays empty), and print nothing on stdout or stderr (stderr = `""`) → `tests/worktree-include.test.js`
- **AC-20260904-02-3**: WHEN `--dest` is omitted (`--root R` alone), OR `--root` names a directory that is not a git repo, OR `--dest` names a path that does not exist THE SYSTEM SHALL exit 2, copy nothing, and print one stderr line naming the missing flag or failed precondition (`--root R` alone → stderr matches `/--dest/`) → `tests/worktree-include.test.js`
- **AC-20260904-02-4**: WHEN `R/.gitignore` ignores `.claude/worktrees/` and `x.txt`, `R/.worktreeinclude` lists `x.txt` and `.claude/worktrees/`, and both `R/x.txt` and `R/.claude/worktrees/stale/x.txt` exist THE SYSTEM SHALL copy `x.txt` only, never any path under `.claude/worktrees/` (stderr says `copied 1`, `D/.claude` absent) → `tests/worktree-include.test.js`
- **AC-20260904-02-5**: WHEN the manifest selects `.env` but `D` is read-only (`chmod 0555 D`) so the copy cannot write THE SYSTEM SHALL exit 3 and print on stderr one line matching `^worktree-include: WARNING — \.worktreeinclude copy failed; .* may be missing env/config files$` → `tests/worktree-include.test.js`
- **AC-20260904-02-6**: WHEN `merge-back.sh create --source spec/wi --root R` runs in the AC-1 host shape THE SYSTEM SHALL CONTINUE TO deliver `.env` and `config/local.json` into the new worktree, leave `secret.txt` behind, exit 0, and print a stderr line matching `copied 2 \.worktreeinclude-matched file` → the existing test `create honors .worktreeinclude…` in `tests/merge-back.test.js`, retagged
- **AC-20260904-02-7**: WHEN `merge-back.sh create` copies manifest files THE SYSTEM SHALL emit that stderr line from the shared owner — the line matches `^worktree-include: copied 2 ` and no `merge-back: copied` line appears (`R` as in AC-6 → stderr contains `worktree-include: copied 2 .worktreeinclude-matched file(s) into <wt>`) → `tests/merge-back.test.js`
- **AC-20260904-02-8**: WHEN `merge-back.sh create` runs with a manifest that matches only tracked files (`a.txt\n.env\n`, no `.env` on disk) THE SYSTEM SHALL CONTINUE TO exit 0, deliver `a.txt` via checkout, and print no `copied` line on stderr → the existing test `create with a manifest matching nothing…` in `tests/merge-back.test.js`, retagged
- **AC-20260904-02-9**: WHEN `replay.js --setup --commit <sha> --spec specs/x.md` runs in a host whose committed `.gitignore` ignores `app/.env.local`, whose committed `.worktreeinclude` lists `app/.env.local`, and where `R/app/.env.local` = `DATABASE_URL=x\n` exists untracked THE SYSTEM SHALL exit 0, print exactly one stdout line `setup dir=<abs> commit=<sha>`, leave `<abs>/app/.env.local` = `DATABASE_URL=x\n`, print a stderr line matching `^worktree-include: copied 1 `, and leave both `git -C <abs> status --porcelain` and `git -C R status --porcelain` empty → `tests/replay/replay.test.js`
- **AC-20260904-02-10**: WHEN the AC-9 host is set up with `--overlay <close sha>` where the close commit adds `lib/fix.js` THE SYSTEM SHALL leave `<abs>/app/.env.local` present on disk while `git -C <abs> show --name-only --format= HEAD` lists `lib/fix.js` and NOT `app/.env.local`, and `git -C <abs> status --porcelain` is empty → `tests/replay/replay.test.js`
- **AC-20260904-02-11**: WHEN `--setup --commit <sha> --spec <path>` runs in a host with no `.worktreeinclude` THE SYSTEM SHALL CONTINUE TO exit 0, print exactly one stdout line `setup dir=<abs> commit=<sha>`, register a detached scratch worktree carrying the `scratch-worktree` marker, leave the host `git status --porcelain` empty, and print no line containing `copied` on stderr → the existing `AC-20260826-01-1 / AC-20260831-01-6` test in `tests/replay/replay.test.js`, retagged
- **AC-20260904-02-12**: WHEN `spec-paths worktree-include` runs THE SYSTEM SHALL print one line ending in `spec/scripts/worktree-include.sh` that names an existing file, and `spec-paths` given an unknown key (e.g. `spec-paths nope`) prints its usage line, containing `worktree-include`, on stderr and exits 1 (`spec-paths` with no argument keeps printing the plugin root, AC-20260902-06-10) → `tests/spec-paths.test.js` (the key joins the exhaustive resolution list)
  - superseded at review (2026-09-04, reviewer soft finding): "and `spec-paths` with no argument prints a usage line containing `worktree-include`" — a no-arg `spec-paths` prints the plugin root (AC-20260902-06-10); the usage line is printed on an unknown key only.
- **AC-20260904-02-13**: WHEN `spec/commands/replay.md` is read THE SYSTEM SHALL state, inside Phase 1 step 1 (the text between `1. **Setup:**` and `2. **Setup gate`), that `--setup` copies the host's `.worktreeinclude`-matched gitignored files into the scratch worktree, and that a host without the manifest is unchanged (the step-1 text matches `/\.worktreeinclude/` and `/no .*manifest|without .*manifest/`) → `tests/replay/replay.test.js`

## Assumptions (escalation triggers)

- A1: `git worktree add --detach <dir> <sha>` materializes tracked files only — executed 2026-09-04 in a scratch repo whose root held gitignored `.env` and `app/.env.local`: the new worktree listed `.gitignore .worktreeinclude a.txt app/index.js` and no env file. **if false:** the copy is a no-op; the spec still lands as pure refactor — proceed.
- A2: `git ls-files -oi --exclude-from=.worktreeinclude | grep -v '^\.claude/worktrees/' | git check-ignore --stdin` in the root prints exactly the manifest-matched AND gitignored set — executed: output `.env` and `app/.env.local`, `secret.txt` (ignored, unlisted) absent. **if false:** STOP, ask the user — the selection rule is the contract.
- A3: In a scratch worktree whose commit ignores the copied paths, the copy leaves `git status --porcelain` empty and survives `git clean -fd` — executed: after `tar` copy, status `[]`; after `git clean -fd -q`, `app/.env.local` present = yes. **if false:** D4's placement before the setup gate is wrong; move the owner call after the gate's `clean -fd` in replay.md and re-plan the AC-9 assertions.
- A4: In a scratch worktree at a commit that does NOT yet ignore the copied paths, they show as untracked and `git clean -fd` removes them — executed: status `?? .env ?? app/.env.local`, after clean present = no. **if false:** nothing changes; D8 becomes moot and its row is struck at review.
- A5: `spawnSync('bash', [owner, …], { encoding: 'utf8' })` from Node returns the owner's exit status and captured stderr intact — executed with a stub owner printing the copy line and exiting 0: `status=0 stderr="owner: copied 2 .worktreeinclude-matched file(s) into /r\n"`. **if false:** use `execFileSync` with `stdio: ['ignore','pipe','pipe']` and read `e.status`/`e.stderr` on throw.
- A6: `tests/replay/replay.test.js` has headroom under the 45 s per-file budget guard — executed: 62 tests pass in 11.38 s wall; `tests/merge-back.test.js` 12 tests in 1.75 s. **if false:** split the new `--setup` tests into `tests/replay/replay-setup-include.test.js` (same helpers) rather than trimming assertions.
- A7: The two existing merge-back manifest tests match the copy line by substring (`/copied 2 \.worktreeinclude-matched file/`), not by the `merge-back:` prefix, so they stay green through D3 — read from `tests/merge-back.test.js`. **if false:** update the regex in place and retag (never weaken).

## Rationale

The 2026-08-19 replay-fixes spec declined to copy the manifest into the scratch worktree
"until a real occurrence". The occurrence arrived the first time the harness ran in a host
whose app validates its env at boot: setup and smoke both need `app/.env.local`, the scratch
tree never gets it, and every replay row on that host is `setup-failed` — honest, but the
harness is permanently unmeasured there, which defeats its purpose. The build path had
already solved this inline in `merge-back.sh create`; the defect is duplication, so the fix
is extraction, not a second copy of the block.

**Why a separate script (D1) over a `merge-back.sh` subcommand.** `merge-back.sh` is a
critical-tier surface (destructive git ops, load-bearing exit alphabet); making the replay
harness spawn it would couple two hot paths through a flag loop that `die`s on any bare
positional. A twenty-line single-purpose script with its own exit alphabet is trivially
testable and trivially removable. **Why stderr only (D2).** Two pinned contracts constrain
the owner: replay's one-stdout-line rule and merge-back's existing copy-line regex. Keeping
the phrase and moving only the prefix satisfies both without touching any test's
expectation. **Why before the overlay (D4).** The setup gate runs `setupCommand` right after
`--setup` returns, so the files must exist by then; A3 proves they are inert to the overlay's
`git apply --index` commit. **Why D8 is a documented limitation.** The only alternative is
writing per-path ignore lines into the scratch tree's exclude file, which is exactly the kind
of harness fingerprint the blindness rules forbid; the condition needs a manifest newer than
the last CLEAN close and clears itself at the next review.

**Tier.** Critical because `merge-back.sh` is edited (host § Risk Tiers); every AC carries a
literal example and the lock is user-confirmed. **Fragile to watch at build.** The exhaustive
`spec-paths` key pin gains a member (in-plan, so no waive line); `replay.js`'s header comment
must name the new exit-4 arm; the copy-failure test (AC-5) relies on `chmod 0555` denying
writes to the running user — a root-run CI would make it pass vacuously, which this repo
does not have. No existing behavior is retired, so no collision-closure sweep was owed; the
copy-line substring was grepped by hand across `tests/` and lives only in the two retagged
merge-back tests.

**Build deviation (folded at review close, 2026-09-04, one-off).** `spec/entrypoints.json`
gained a row for `spec/scripts/worktree-include.sh` although the File Plan did not list it:
the entrypoints consistency sweep refuses any bundled script without a manifest row, so the
whole-suite gate could not go green without it. The row was added to the File Plan at build
rather than asked — filing separately would have left the suite red. The general rule (a new
bundled script needs an entrypoints row) is already a Gotchas entry; no new entry.

## Canonical Delta

`docs/canonical/review.md`, in the replay paragraph that begins "The scratch worktree lives
at `<root>/.claude/worktrees/spec-<stem>-<6hex>`", append after the sentence ending
"never a name a session supplies.":

> `--setup` then copies the host's `.worktreeinclude`-matched gitignored files into the
> scratch tree through the same owner `merge-back.sh create` uses for build worktrees
> (`spec/scripts/worktree-include.sh`, `spec-paths worktree-include`), so a host that boots
> from env files reaches the setup gate and the smoke leg with them present; a host with no
> manifest is unchanged, and a `setup-failed` row still means the host's own `setupCommand`
> failed, never that the scratch copy was under-provisioned.
> (specs/20260904/02-worktree-include-shared-owner.md)
