---
date: 2026-08-26
status: done
tier: critical
area: review
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
spiked: 2026-08-26
diff_base: ef59519cae4d39e27e25343310d68684e78bdd17
open_markers: 0
---

# Replay scratch worktree: spec-derived path and neutral marker

## Goal

The mutation-replay harness (`/spec:replay`, run by `/spec:review`'s REPLAY state) measures
whether the blind reviewer catches a planted defect — and its own doctrine says blindness is
the measurement's validity. Today the harness hands the reviewer a root path named after the
harness (`.claude/worktrees/replay-<random>`, a doctrine *example* nothing derives or
enforces) and plants a marker file named after the harness (`replay-worktree`) in the scratch
tree's private git dir, one `ls "$(git rev-parse --git-dir)"` away. Both were observed from
inside a real `--setup` tree on 2026-08-26. Done means: `--setup` derives a build-shaped path
from the target spec itself, refuses any caller path that announces the harness, the marker
carries a neutral name across every site that reads it, the blindness rule names the path as
a surface, and tests pin all of it — so the catch rate is a defensible number from the first
post-fix row onward.

## Decisions (locked — workers apply verbatim, never override)

<!-- Carrier contract (specs/20260817/07-promise-sweep-leg.md D8; enforced by promise-sweep.js
     at plan lock and in every review): every row cites ≥1 of this spec's own AC-IDs — the AC
     whose test goes red if the decision is unimplemented — or carries `[no-ac: <reason>]` for
     a row with no testable surface. An empty reason ([no-ac: ]) does not count as a sanction. -->

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `replay.js --setup` derives `{dir}` itself when `--dir` is omitted: it requires `--spec <path>` (already parsed), derives the name as `merge-back.sh branch-for {spec}` with `/`→`-` (the exact rule build worktrees use) plus `-` and 6 lowercase hex from `crypto.randomBytes(3)`, places it at `<root>/.claude/worktrees/<name>`, runs it through the existing in-repo ignore-provision arm, and prints the unchanged `setup dir=<abs> commit=<sha>` line. `--dir` present → it wins, verbatim, as today. Neither flag → exit 2 naming both (AC-20260826-01-1, AC-20260826-01-2) | The name is load-bearing for validity, so the script owns it — a doctrine example is exactly how it leaked; the suffix is forced (S2: git refuses an existing non-empty dir, and the target spec's real build worktree may still be registered) and a suffix on a build-shaped name is a whisper, not a tell. Rejected: an in-JS copy of the stem rule — `branch-for` is the sole owner of build-worktree naming (pipeline rules § Risk Tiers on `merge-back.sh`); rejected: a bland/random name — replay.md's own Phase 1 argument ("vocabulary is not the leak, provenance is") applies to the path as it does to the commit subject |
| D2 | `--setup` refuses a caller-supplied `--dir` whose **basename** opens with `replay` (case-insensitive, `/^replay/i`) with exit 3, creating nothing — in-repo or out-of-repo alike — and the stderr remedy says to omit `--dir` and pass `--spec`. The header's exit-code 3 list and the usage line gain this arm (AC-20260826-01-3) | Mirrors the structural subject refusal `--apply` already has (`/^\s*replay\b/i`): the invariant is enforced, not requested. Zero false positives on real spec names — every derived name opens with `spec-` (S5: `specs/20260819/02-mutation-replay.md` → `spec-02-mutation-replay-<hex>`) |
| D3 | The private-git-dir marker is renamed `replay-worktree` → `scratch-worktree` at every site: `replay.js` (`--setup` plants, `--teardown` guards, header prose), `block-cross-worktree-writes.sh` (allow arm, comments, the BLOCKED message's "replay harness setup" hint), `replay.md`, and both test files' fixtures/helpers. No grandfathering of the old name in `--teardown` (A4: no marked tree exists) (AC-20260826-01-4, AC-20260826-01-5) | The marker is readable from inside the tree (S1: `ls "$(git rev-parse --git-dir)"` lists it) and the blindness rule forbids the harness's name in "anything readable from that tree" — same invariant, second surface, cheapest closed in the same change. `scratch-worktree` describes what the tree is, not what it is for |
| D4 | `replay.md` Phase 1 step 1 is rewritten: `{dir}` is the `dir=` value `--setup --spec {spec} --commit {parent}` prints; the `replay-<random>` example is deleted; `--dir` is documented as the manual out-of-repo fallback and as subject to D2's refusal. Steps 2 and the worker-dispatch step say `scratch-worktree`. Rules § Blindness's surface list gains "the worktree **path** handed to the reviewer as its root" and "the marker filename in the tree's private git dir" [no-ac: doctrine prose restating D1–D3, whose enforcement is the script behavior AC-1..5 pin; a regex over prose is not a test (pipeline rules § Test Rules)] | The rule enumerated branch name but never path — the path is the surface that bit. Doctrine must describe the derivation, never supply a name a session copies |
| D5 | `block-cross-worktree-writes.sh` changes **only** the marker filename (D3); the allow stays TARGET-only, narrowed to a git dir with a `/worktrees/` segment, fail-open elsewhere, and the git-metadata forgery block is untouched (AC-20260826-01-5, AC-20260826-01-7) | Critical-tier hook: the smallest diff that closes the surface; every existing invariant keeps its pin, re-tagged, never weakened |
| D6 | `spec/.claude-plugin/plugin.json` bumps to the next free 7.38.x at build time (target 7.38.0; Gotchas: the literal is a target, not a pin — sibling specs 20260825/03 and /04 race the same minors) with a changelog paragraph naming the derived scratch path, the basename refusal, the marker rename, and the pre-fix catch-rate caveat [no-ac: plugin-version guard] | Review Checks: a behavior change without a version bump is hard |
| D7 | The six `stage:"replay"` ledger rows dated before this spec's close (`rp_048e28386da8` … `rp_02b3f1ee52f1`, all `caught`) are left untouched and `--stats` is unchanged; the caveat that they were measured under a path tell is recorded in this spec's Rationale and in the Canonical Delta, never in the ledger [no-ac: the ledger is append-only and derived-not-attested; no behavior changes] | Re-labelling would fabricate a conclusion nothing supports — a reviewer *may* have caught each defect on merit; what is lost is proof, not the observations. Splitting `--stats` pre/post is overkill for six rows; revisit only if the catch rate ever becomes a gate input |
| D8 | Regression pins on the neighbours the rename and refusal touch: `--setup --dir <out-of-repo, neutral basename>` continues to build a marker-carrying detached worktree leaving the host repo byte-identical; `--teardown` continues to refuse an unmarked dir with exit 3; the hook continues to block an unmarked cross-worktree write and a write into another tree's git metadata. Existing covering tests are re-tagged with the new AC-IDs, never duplicated (AC-20260826-01-6, AC-20260826-01-7) | Defect-fix spec: every behaviour that must survive gets a `SHALL CONTINUE TO` pin (plan § ACs); tagging beats duplicating |

## File Plan

<!-- Machine-consumed: /spec:build parses this table into workflow batches.
     Layer ∈ the host config's layerGroups (flattened, in order) plus tests | other.
     Tests rows list their AC-IDs in Summary. -->

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/replay.js | MODIFY | scripts | D1 derived `{dir}` in `cmdSetup` (shell out to `merge-back.sh branch-for`, `/`→`-`, `-<6hex>`), D2 basename refusal (exit 3) before any git op, D3 marker rename in `cmdSetup`/`cmdTeardown` and header prose, usage line + exit-code 3 list updated, dated incident paragraph (2026-08-26, this spec) appended to the header |
| spec/scripts/block-cross-worktree-writes.sh | MODIFY | scripts | D3/D5: `replay-worktree` → `scratch-worktree` in the allow arm (`[ -f "$tgt_gitdir/scratch-worktree" ]`), the invariant comment block, and the BLOCKED hint line; nothing else moves |
| spec/commands/replay.md | MODIFY | doctrine | D4: Phase 1 step 1 derivation + fallback wording, steps 2 and worker-dispatch marker rename, Rules § Blindness surface list gains path + marker filename |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D6 version bump + changelog paragraph (last-3-versions form) |
| tests/replay/replay.test.js | MODIFY | tests | AC-20260826-01-1, AC-20260826-01-2, AC-20260826-01-3, AC-20260826-01-4, AC-20260826-01-6; `markerPath()` and every marker assert/string switch to `scratch-worktree`; the four existing `--dir` fixtures whose basenames open with `replay` (`replay-x`, `replay-y`, `replay-first`, `replay-second` in AC-20260823-05-1/-3/-4) are renamed in place to `scratch-*` so they keep exercising the in-repo arm rather than tripping D2 — updated, never weakened; AC-20260823-05-6 and AC-20260819-02-8 tests gain the AC-20260826-01-6 tag |
| tests/worktree-hook.test.js | MODIFY | tests | AC-20260826-01-5, AC-20260826-01-7; `markedFixture()` plants `scratch-worktree`; AC-20260820-02-1 test name/asserts say `scratch-worktree`; AC-20260820-02-3/-4/-9 tests gain the AC-20260826-01-7 tag; a new fixture planting only the retired `replay-worktree` name proves the old name grants nothing |

Orchestrator duty outside the table: `docs/canonical/review.md` is **not** a build row — its
two stale sentences (`replay-<id>`, `replay-worktree`) are replaced by `/spec:review` applying
the Canonical Delta below on CLEAN.

## Contracts

`replay.js --setup` — the flag grammar after D1/D2 (header usage line and the `usage()` string
both carry it):

```
--setup --commit <sha> (--spec <path> | --dir <path>)
  --spec  : derive {dir} = <root>/.claude/worktrees/<name>-<6hex>
            where <name> = `merge-back.sh branch-for <path>` with "/" → "-"
            e.g. specs/20260825/02-genesis-consultant-discovery.md
                 → <root>/.claude/worktrees/spec-02-genesis-consultant-discovery-3f9a1c
  --dir   : use the path verbatim (manual out-of-repo fallback); wins when both are given
  stdout  : setup dir=<absolute dir> commit=<sha>        (unchanged shape)
Exit 2 : neither --spec nor --dir (usage), or --spec names an unreadable/absent file
Exit 3 : (new arm) --dir basename matches /^replay/i — nothing created; stderr names the
         remedy: "omit --dir and pass --spec <path> so the harness derives a build-shaped name"
         (existing exit-3 arms unchanged: in-repo --dir outside .claude/worktrees/)
Exit 4 : unchanged (git worktree add / git-dir resolution / marker write failure;
         merge-back.sh branch-for failing to print a `spec/<stem>` line joins this list)
```

Marker (D3) — the one filename every reader agrees on:

```
<git -C {dir} rev-parse --git-dir>/scratch-worktree      # planted by --setup, guarded by --teardown,
                                                          # keyed on by block-cross-worktree-writes.sh
```

Hook allow arm after D3 (the only behavioural line that changes):

```bash
case "$tgt_gitdir" in
  */worktrees/*) [ -f "$tgt_gitdir/scratch-worktree" ] && exit 0 ;;
esac
```

Derivation helper shape in `replay.js` (name/placement free; contract fixed):

```js
// D1: {dir} for a derived setup — build-shaped, spec-derived, random-suffixed.
// branch-for is the SOLE owner of the stem rule (merge-back.sh header); never re-derive it here.
function deriveScratchDir(resolvedRoot, specPath) {
  const branch = execFileSync('bash', [path.join(__dirname, 'merge-back.sh'), 'branch-for', specPath],
    { encoding: 'utf8' }).trim()                       // "spec/02-genesis-consultant-discovery"
  const name = branch.replace(/\//g, '-')              // "spec-02-genesis-consultant-discovery"
  const suffix = crypto.randomBytes(3).toString('hex') // 6 lowercase hex
  return path.join(resolvedRoot, '.claude', 'worktrees', `${name}-${suffix}`)
}
```

## Behavior

1. **Derived setup (the scheduled path).** `/spec:review`'s REPLAY step already inlines
   `spec` and `parent`; replay.md Phase 1 step 1 becomes: run
   `node "$(spec-paths replay)" --setup --commit {parent} --spec {spec}` and read `{dir}` from
   the printed `dir=`. The derived path always lands under `<root>/.claude/worktrees/`, so it
   takes the existing in-repo arm: ignore-line self-provisioning, `git worktree add --detach`,
   marker write. Two consecutive derived setups for the same spec coexist (different suffixes);
   a derived setup coexists with the spec's real build worktree at the un-suffixed path.
2. **Refusal order in `cmdSetup`.** Flag validation (exit 2) → D2 basename refusal on a supplied
   `--dir` (exit 3) → existing in-repo location refusal (exit 3) → git ops (exit 4). The
   basename check runs before any filesystem or git side effect, so a refused call leaves
   `git worktree list` and the filesystem exactly as found.
3. **Manual fallback.** `--dir /some/outside/path` keeps working when its basename is neutral;
   `--dir /tmp/replay-abc` is refused. Existing tests that used `replay-*` basenames for the
   in-repo arm rename their fixtures — the arm they test is unchanged.
4. **Teardown.** `--teardown --dir {dir}` guards on `scratch-worktree`; a tree carrying only the
   old `replay-worktree` name is refused as unmarked (exit 3) — by A4 none exists.
5. **What the reviewer can now observe.** Root path `…/.claude/worktrees/spec-<stem>-<hex>`
   (build-shaped); `git worktree list` shows that path; the private git dir lists
   `scratch-worktree`; HEAD is detached (accepted residual, see Rationale). No surface names
   the harness, a corpus term, or a class id.

## Acceptance Criteria

- **AC-20260826-01-1**: WHEN `replay.js --setup --commit <sha> --spec <spec path>` runs with no
  `--dir` from a repo root `R` whose ignore rules already cover `.claude/worktrees/` THE SYSTEM
  SHALL exit 0, print exactly one stdout line `setup dir=<abs> commit=<sha>` where `<abs>` is
  `R/.claude/worktrees/<name>-<6 lowercase hex>` and `<name>` equals
  `merge-back.sh branch-for <spec path>` with `/`→`-`, register a detached worktree at `<abs>`
  carrying `scratch-worktree` at `<git -C <abs> rev-parse --git-dir>/scratch-worktree`, and leave
  `git -C R status --porcelain` empty
  (e.g. `--spec specs/20260825/02-genesis-consultant-discovery.md` → stdout matches
  `^setup dir=R/\.claude/worktrees/spec-02-genesis-consultant-discovery-[0-9a-f]{6} commit=<sha>$`;
  `--spec specs/20260819/02-mutation-replay.md` → basename `spec-02-mutation-replay-[0-9a-f]{6}`,
  which does not open with `replay`) → new test in tests/replay/replay.test.js
- **AC-20260826-01-2**: WHEN a worktree already occupies `R/.claude/worktrees/<name>` (the spec's
  real build worktree) and `--setup --spec` for the same spec runs twice THE SYSTEM SHALL succeed
  both times at two distinct suffixed siblings, leaving the un-suffixed worktree and its HEAD
  untouched; and WHEN `--setup --commit <sha>` runs with neither `--spec` nor `--dir` THE SYSTEM
  SHALL exit 2 with a usage line naming both flags and register nothing
  (e.g. existing `…/spec-02-genesis-consultant-discovery` on branch `spec/02-genesis-consultant-discovery`
  → after two derived setups `git worktree list` has 3 entries under `.claude/worktrees/`, the
  first still on that branch; `--setup --commit <sha>` alone → exit 2, `git worktree list`
  unchanged) → new test in tests/replay/replay.test.js
- **AC-20260826-01-3**: WHEN `--setup --commit <sha> --dir <path>` is called with a `<path>`
  whose basename matches `/^replay/i` THE SYSTEM SHALL exit 3, create no directory and register
  no worktree, and print a stderr line containing `--spec` as the remedy; a `--dir` whose
  basename merely *contains* `replay` is not refused
  (e.g. `--dir R/.claude/worktrees/replay-x` → exit 3, `R/.claude/worktrees/replay-x` absent,
  `git worktree list` unchanged; `--dir /outside/Replay-abc` → exit 3; `--dir
  R/.claude/worktrees/spec-02-mutation-replay-a1b2c3` → exit 0) → new test in
  tests/replay/replay.test.js
- **AC-20260826-01-4**: WHEN `--setup` succeeds (derived or supplied dir) THE SYSTEM SHALL plant
  exactly `scratch-worktree` in the worktree's private git dir and no file named
  `replay-worktree` or `.replay-worktree` in that git dir or in the working tree; and
  `--teardown --dir <that dir>` SHALL exit 0 and remove it, while `--teardown` on a linked
  worktree whose private git dir carries only `replay-worktree` SHALL exit 3 and delete nothing
  (e.g. `ls "$(git -C {dir} rev-parse --git-dir)"` → contains `scratch-worktree`, not
  `replay-worktree`; hand-planted `replay-worktree` only → `--teardown` exit 3, dir still
  present) → new test in tests/replay/replay.test.js
- **AC-20260826-01-5**: WHEN a Write's TARGET is a same-repo linked worktree whose private git dir
  carries `scratch-worktree` THE SYSTEM (the cross-worktree write hook) SHALL allow with exit 0
  and empty stderr; WHEN that git dir carries only the retired `replay-worktree` name THE SYSTEM
  SHALL block with exit 2 and a stderr line opening `BLOCKED:`
  (e.g. marker file `…/.git/worktrees/rt/scratch-worktree` → exit 0; marker file
  `…/.git/worktrees/rt/replay-worktree` and nothing else → exit 2) → new + updated tests in
  tests/worktree-hook.test.js
- **AC-20260826-01-6**: WHEN `--setup --commit <sha> --dir <path outside the repo with a neutral
  basename>` runs THE SYSTEM SHALL CONTINUE TO build a marker-carrying detached worktree there
  leaving the host repo byte-identical, and WHEN `--teardown --dir <a directory that is not a
  marked linked worktree>` runs THE SYSTEM SHALL CONTINUE TO exit 3 and delete nothing
  (e.g. `--dir /tmp/scratch-abc` → exit 0, host `git status --porcelain` empty; `--teardown
  --dir /tmp/plain-dir` → exit 3, dir present) → existing tests AC-20260823-05-6 and
  AC-20260819-02-8 in tests/replay/replay.test.js, re-tagged
- **AC-20260826-01-7**: WHEN a Write targets a same-repo sibling worktree carrying no marker, or
  targets another tree's git metadata from a different worktree, THE SYSTEM SHALL CONTINUE TO
  block with exit 2 and a `BLOCKED:` stderr line, and a same-worktree write SHALL CONTINUE TO
  allow
  (e.g. cwd `R/.claude/worktrees/w1`, target `R/a.txt` → exit 2; cwd `R`, target
  `R/.git/worktrees/w1/scratch-worktree` → exit 2; cwd `R/.claude/worktrees/w1`, target
  `R/.claude/worktrees/w1/a.txt` → exit 0) → existing tests AC-20260820-02-3/-4/-9 in
  tests/worktree-hook.test.js, re-tagged

## Assumptions (escalation triggers)

<!-- Load-bearing assumptions. If one proves false mid-build, the worker returns
     blocked and adjudication starts HERE. Pair every assumption with its fallback. -->

- A1 (S1, executed 2026-08-26 in a throwaway repo via the real `replay.js --setup --dir
  <R>/.claude/worktrees/replay-x`): from inside the tree, `ls "$(git rev-parse --git-dir)"`
  printed `commondir gitdir HEAD index logs ORIG_HEAD refs replay-worktree`, and `git worktree
  list` printed the `…/.claude/worktrees/replay-x  <sha> (detached HEAD)` row; `git branch
  --show-current` printed empty (no branch to leak). This is the incident evidence; the
  reviewer's tool surface includes Bash, so both are one command away — **if false:** n/a,
  observed.
- A2 (S2, executed): `git worktree add --detach <existing non-empty dir> <sha>` exits 128
  `fatal: '<dir>' already exists` — the random suffix is load-bearing whenever the spec's
  build worktree is still registered — **if false:** keep the suffix anyway (two derived
  setups for one spec must coexist, AC-2).
- A3 (S3, executed): a build worktree at `…/spec-02-x` (branch `spec/02-x`) and a detached
  scratch at `…/spec-02-x-a1b2c3` coexist (both exit 0); the scratch's private git dir is
  `<common>/.git/worktrees/spec-02-x-a1b2c3` — basename-derived, so the hook's `*/worktrees/*`
  arm is unaffected by the new naming — **if false:** STOP, ask the user.
- A4 (executed 2026-08-26, main repo): `git worktree list` shows only the main checkout at
  `ef59519`, so no tree carrying the old `replay-worktree` marker exists and `--teardown` need
  not grandfather the old name — **if false at build time:** run `git worktree remove --force
  <dir>` on the stale tree before building; never add a legacy-name arm.
- A5 (S5, executed): `merge-back.sh branch-for specs/20260819/02-mutation-replay.md` → `spec/02-mutation-replay`,
  so the derived basename `spec-02-mutation-replay-a1b2c3` does not match `/^replay/i` — D2 has
  no false positive on the one real spec name that contains the word — **if false:** STOP, the
  refusal would block the harness on its own spec; ask the user.
- A6 (S4, executed): `crypto.randomBytes(3).toString('hex')` → `37d211`, length 6, matches
  `/^[0-9a-f]{6}$/` — **if false:** n/a, Node builtin behaviour.
- A7 (S6, executed): `replay.js --teardown --dir <the S1 tree>` exited 0 and printed `torn down
  dir=…` — the marker guard works on the current name, so the rename is a pure substitution
  with no path-resolution change — **if false:** STOP, the teardown guard has a second defect.

## Rationale

**The incident.** On 2026-08-26 (`rv_6229b7af0d0b`'s due replay, `rp_02b3f1ee52f1`) the session
noticed mid-run that the review-legs manifest tempfile it had created was named
`replay-manifest-*.jsonl`, renamed it before dispatch, and then reported the surface it could
not fix mid-measurement: the scratch worktree root handed to the blind reviewer was
`.claude/worktrees/replay-a21258cb`, copied from replay.md's example. A consult with Fable 5
confirmed the severity ("a validity threat, not a demonstrated compromise": the 6/6 catch rate
cannot serve as proof for the pre-fix window) and surfaced the second surface — the marker in
the private git dir — which S1 then observed directly. Every other surface checked clean:
branch name (detached), commit subject (already refused), committer identity/dates, and `git
worktree list` (leaks only the path, which this spec fixes).

**Why enforce in the script, not the doctrine.** The path leaked precisely because it lived as
a doctrine example that each session paraphrased; this pipeline's own rule is that a value
whose correctness matters is derived by a script, never asserted in prose (core § Incident
Policy, § Rule Enforcement). D1 moves ownership; D2 adds the structural refusal the commit
subject already had; D4 leaves doctrine describing the derivation, not supplying a name.

**Why build-shaped, not bland.** replay.md's own Phase 1 argument for the commit subject —
vocabulary is not the leak, provenance is — applies to the path: a random or neutral name is
itself an anomaly in a directory that otherwise holds `spec-<stem>` build worktrees. The
random suffix is unavoidable (A2/A3) and is the least-anomalous shape available.

**Waived 2026-08-26 — out-of-plan file `.claude/spec.config.json`.** The review's File Plan
reconcile leg flagged the two-line grounding re-stamp (`generatedBy` 7.32.1→7.38.0,
`contractHash`) that landed as its own `chore(doctor)` commit inside the review window. It is a
downstream consequence of D6's plugin version bump — `/spec:doctor` keeping the host's grounding
stamp aligned with the installed plugin — not spec implementation work; reverting it would leave
the config naming a version that no longer exists. Waived by JJ; no behavior in this spec's diff
depends on it.

**Accepted residuals.** Detached HEAD is a mild anomaly a reviewer could notice; fixing it means
inventing a branch name, which reopens the naming problem. In this self-hosting repo the
replay doctrine and corpus sit in the reviewed tree — knowing the harness *exists* is not
knowing *this run* is a harness run; the path and marker were the connectors, and this spec
severs both.

**The six existing rows (D7).** They stay as recorded. Their observations are real; what is
lost is the proof that blindness held. Relabelling would invent a conclusion, and the ledger is
append-only and derived-not-attested. Practically: blindness is only provable going forward,
and at the every-5 cadence a full six-class window takes roughly thirty reviews to rebuild — the
6/6 number should retire quietly rather than keep being cited.

**Why critical tier.** `block-cross-worktree-writes.sh` is a hook that runs in every session of
every host repo (pipeline rules § Risk Tiers); the change there is a one-token rename, but the
tier follows the surface, not the diff size. Every AC carries a literal example; every
dependency-adjudicated claim was executed (A1–A7); the user confirms the lock.

**Fragile during execution.** The four existing in-repo `--dir` fixtures use `replay-*`
basenames and would trip D2 — they are renamed in place (never weakened); a worker that instead
loosens D2 to keep them green has inverted the fix. The hook test's `markedFixture()` must plant
the new name or AC-20260820-02-1 goes red for the wrong reason.

**Collision closure at lock (2026-08-26, D3 retires the literal `replay-worktree`; fixture
names `replay-x/-y/-first/-second` swept alongside).** Literals leg: every `replay-worktree`
hit is a File Plan row except `docs/canonical/review.md`, which is waived as a row because the
Canonical Delta rewrites it at review close (applying it at build would double-edit the same
sentence); the `replay-first` hits in `docs/canonical/review.md` and `spec/scripts/replay.js`
are substrings of the spec filename `03-replay-first-run-fixes.md`, not fixture names — waived.
Paths leg `likely` hits (advisory, no waive owed per Gotchas): `tests/run-ledger.test.js` pins
review.md→replay.md phase wiring and the `replay-recorded` mark, neither of which this spec
touches; `tests/consistency/entrypoints.test.js` pins the hook's presence in the entrypoint
inventory, not its body. Build Phase 4's whole-suite check adjudicates anything this reading
missed.

## Canonical Delta

In `docs/canonical/review.md`, under the replay paragraph, replace the sentence beginning "The
scratch worktree lives at `<root>/.claude/worktrees/replay-<id>`" with:

> The scratch worktree lives at `<root>/.claude/worktrees/spec-<stem>-<6hex>` — a path
> `replay.js --setup --spec` derives from the target spec (the build-worktree naming rule
> `merge-back.sh branch-for` owns, `/`→`-`, plus a random suffix because the spec's own build
> worktree may still be registered), never a name a session supplies. `--setup` refuses a
> caller `--dir` whose basename opens with `replay`. Inside the repo, so agent edits are
> auto-approved and the scheduled replay runs unattended (an out-of-repo scratch tree is denied
> Edit/Write by the permission classifier, which blocked the mutation worker on both live runs
> of 2026-08-23); a neutral-named `--dir` outside the repo remains the manual fallback.

Replace "carries the `replay-worktree` marker" with "carries the `scratch-worktree` marker",
and append after the isolation sentence:

> Blindness surfaces enumerated and closed to date: file contents, prompt text, branch name
> (detached), commit subject (`--apply` refusal), the worktree **path** handed to the reviewer
> as its root, and the marker filename in the tree's private git dir — the last two closed by
> specs/20260826/01-replay-scratch-path-blindness.md. Catch-rate rows dated before that spec's
> close (`rp_048e28386da8` through `rp_02b3f1ee52f1`) were measured under a path tell and stand
> as observations, not as proof of blind review; the defensible catch rate starts at the first
> row after it.

Add `specs/20260826/01-replay-scratch-path-blindness.md` to the trailing spec citation list.
