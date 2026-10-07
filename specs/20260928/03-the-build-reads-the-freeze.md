---
date: 2026-09-28
status: done
build_base: design-retool
tier: standard
area: prototype
breaking: false
depends_on: [specs/20260928/02-freeze-export-and-the-contract.md]
depended_on_by: []
brief: 28
spiked: 2026-09-28
open_markers: 0
diff_base: 610a6d71426159c1756055deef81ec4569b19c2a
---

# The build reads the freeze

## Goal

The build driver gains the behaviour lane: a spec stamped `lane: behaviour` starts by merging
`harden/<stem>` into its worktree, builds the UI from main against the frozen contract, and
after a green gate runs the capture gate route by route — a diff is either accepted by the user
at a look stop or fixed and re-captured — recording the diff count on the build row. Any spec
carrying a brief is refused while that brief's `proto/` branch still exists; `/git:merge`
refuses a `proto/*` source; the review driver deletes `harden/<stem>` after a behaviour-lane
merge-back; the reviewer reads the host's design tables. Done means: on a fixture host the
refusal fires, the harden merge is verified, the capture gate stops on a diff and proceeds on
acceptance, the build row carries `capture`, and the harden branch is gone after merge.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec-build-driver.js` admission, before PREFLIGHT: for a spec whose `brief:` is not `n/a`, `git branch --list 'proto/<NN>-*'` non-empty → exit 2: `prototype <branch> is still open for brief <NN> — freeze it first: /spec:prototype docs/roadmap/<NN>-*.md`. (AC-20260928-03-1) | ADR-0030 (h), ratified 2026-09-24: `/spec:run` refuses while `proto/<brief>` exists; the branch list is repo-wide, so it holds from a worktree. |
| D2 | Frontmatter `lane: behaviour` (`spec/templates/spec.md` gains the commented line `# lane: behaviour  # written by the prototype freeze; the build driver adds the harden merge and the capture gate`). For that lane, a new first state `HARDEN_MERGE` after PREFLIGHT: the step prints `Session: git merge --no-ff harden/<stem> -m "merge harden/<stem>: data and API layer from the prototype"` (`<stem>` = the brief's stem, from `docs/roadmap/<NN>-*.md`) and `Then: --mark harden-merged`; the mark verifies `git merge-base --is-ancestor harden/<stem> HEAD` (exit 2 otherwise: `harden/<stem> is not merged into HEAD`), and when the branch does not exist at all, exit 2 naming the freeze. `diff_base` stays the PREFLIGHT sha, so the merge is inside the reviewed range. Other lanes are unchanged. (AC-20260928-03-2) | Brief scope 3: the data/API layer is merged from `harden/<stem>` and hardened in place through the naming and kit gates — which the ordinary gate, red-check and review then apply. The session runs git, never the driver (stage-build rule). |
| D3 | New state `CAPTURE` for the behaviour lane, derived after the gate is green and before `COMMIT`: the step prints `Read only: design/prototypes/<stem>/contract.json`, `Session: start the app in the background (tracked): <runtime.bootCommand>` and `Then: --mark captured`. `--mark captured` runs `proto-capture.js` (spec 02) per route × state in the contract against `prototype.url` (composites from the contract, viewport from the contract) into `<spec>.build/captures/<slug>.json`, then `--diff <baseline> <current>` per pair, and writes `<spec>.build/capture-state.json` `{ pairs: [{ route, state, diffs, accepted }] }`. Every pair at zero diffs → next state `COMMIT`. Otherwise the step re-prints as a look stop (Contracts): `🎨 route /women (empty): 3 diffs — <url>` per diffing pair with up to five entries each, the fixed line `Reply \`accept <route> <state>\` to accept a pair as the new baseline; anything else is a fix for this session, then --mark captured again`, and `Then (only on the literal accept): --mark capture-accepted --route <r> --state <s>`. `capture-accepted` sets that pair's `accepted`; when every diffing pair is accepted the state becomes `COMMIT`. A capture exit 2 is the refusal, verbatim. (AC-20260928-03-3, AC-20260928-03-4) | The rebuild must match the capture route by route; a diff is either accepted at a look stop or sent back (brief scope 3). Acting on the user's literal word, never on a request (Gotchas). |
| D4 | The build ledger row gains `capture: { pairs: N, diffs: N, accepted: N }` for the behaviour lane (absent otherwise), the counts from `capture-state.json` at `committed`. (AC-20260928-03-5) | ADR-0030 Consequences: the first two prototype runs record round count (the prototype row) and post-rebuild diff count (here). |
| D5 | `spec-review-driver.js` `finishMerge`: when the spec's `lane` is `behaviour` and `harden/<stem>` exists after `merge-back.sh cleanup` + `verify`, run `git branch -D harden/<stem>` from the main root and print `harden/<stem> deleted`. (AC-20260928-03-6) | `harden/<stem>` is the only survivor of the prototype and it is spent once merged. |
| D6 | `git/commands/merge.md` Step 1: when the resolved source branch matches `proto/*`, STOP — report `outcome: {anchor:'🚫', text:'<source> is a prototype branch — it is never merged'}`, `next: {kind:'command', text:'/spec:prototype <brief> — freeze it; harden/<stem> is what lands'}`; `/git:merge` on a `harden/*` source is allowed only through the review driver's merge-back (the same review-row logic that already governs spec branches applies: a `harden/*` source outside the loop is reported as `🚫 harden/<stem> lands through /spec:run, not by hand`). Bump the git plugin. [no-ac: command prose; no script executes Step 1 — `plugin-bump.js --check` is the oracle for the bump] | JJ 2026-09-24: `/git:merge` refuses `proto/*`. |
| D7 | Doctrine: `spec/doctrine/stages/stage-build.md` gains a `## Behaviour lane` paragraph (HARDEN_MERGE, CAPTURE, the look stop and the word `accept`, `capture` on the row); `spec/commands/run.md` § Routing gains one sentence: a spec stamped with a brief is refused by the build driver while that brief's `proto/` branch exists (read-load ≤ 334, the ratchet); `spec/agents/reviewer.md` § Ground yourself first adds the host's `design.rules` file (the intent-to-pattern and naming tables) to the read list with the rule that a finding may cite a table row but a table never scores alone (ADR-0030 c). [no-ac: prose — `read-load`, `run-ledger`'s stage-doc pins and `citations-check` are the oracles] | Brief scope 3: the review rubric gains the pattern-table citation. |
| D8 | Bump via `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` and `node scripts/plugin-bump.js --bump --plugin git --changelog "<paragraph>"`. [no-ac: bumps — `plugin-bump.js --check` is the oracle] | Two plugin directories touched → two bump rows (Gotchas, fourth surface). |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/spec-build-driver.js | MODIFY | scripts | D1 admission refusal; D2 `HARDEN_MERGE` + `harden-merged`; D3 `CAPTURE`, `captured`, `capture-accepted`, look-stop print; D4 row field; header states/marks/exit codes updated |
| spec/scripts/spec-review-driver.js | MODIFY | scripts | D5 — harden branch deletion in `finishMerge` |
| spec/entrypoints.json | MODIFY | other | proto-capture.js row gains caller `spec/scripts/spec-build-driver.js` |
| spec/templates/spec.md | MODIFY | doctrine | D2 — commented `lane:` line |
| spec/doctrine/stages/stage-build.md | MODIFY | doctrine | D7 — Behaviour lane paragraph |
| spec/commands/run.md | MODIFY | doctrine | D7 — one routing sentence; read-load ≤ 334 |
| spec/agents/reviewer.md | MODIFY | doctrine | D7 — `design.rules` in the read list |
| git/commands/merge.md | MODIFY | doctrine | D6 — Step 1 refusals and report slots |
| spec/.claude-plugin/plugin.json | MODIFY | other | D8 — `node scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"` |
| git/.claude-plugin/plugin.json | MODIFY | other | D8 — `node scripts/plugin-bump.js --bump --plugin git --changelog "<paragraph>"` |
| tests/build/build-driver-lane.test.js | CREATE | tests | AC-20260928-03-1, AC-20260928-03-2, AC-20260928-03-3, AC-20260928-03-4, AC-20260928-03-5 |
| tests/review/harden-branch-cleanup.test.js | CREATE | tests | AC-20260928-03-6 |
| tests/build/build-driver.fixtures.js | MODIFY | tests | `makeHost` gains `{ lane: 'behaviour', brief, contract }` options: writes `docs/roadmap/<NN>-x.md`, `design/prototypes/<stem>/{contract.json,captures/}`, a `prototype` config block, `runtime.bootCommand`, and sets `PROTO_CAPTURE_BIN` to a stub whose diff output is scripted per url |

## Contracts

The `CAPTURE` look stop (D3), rendered after a diffing run:

```
[spec-build-driver] state: CAPTURE  spec: specs/20260928/09-functional-prototype.md
## Step: the rebuilt screens against the frozen capture
Read only: design/prototypes/28-functional-prototype/contract.json, specs/20260928/09-functional-prototype.md.build/capture-state.json
🎨 route /women (empty): 3 diffs — http://localhost:3000/women?proto=empty
  changed WomanRow[w_01]<WomenList<WomenScreen#0 styles.padding-left 16px → 20px
  changed WomanRow[w_01]<WomenList<WomenScreen#0 box [399,209,558,54] → [399,209,558,58]
  extra   WomanRow[w_04]<WomenList<WomenScreen#3
route /women (default): 0 diffs
Reply `accept /women empty` to accept a pair as the new baseline; anything else is a fix for this session, then:
  node <driver> <spec> --mark captured
Then (only on the literal accept):
  node <driver> <spec> --mark capture-accepted --route /women --state empty
```

`<spec>.build/capture-state.json` (D3):

```json
{ "pairs": [ { "route": "/women", "state": "default", "diffs": 0, "accepted": false },
             { "route": "/women", "state": "empty", "diffs": 3, "accepted": true } ] }
```

Build row addition (D4): `"capture": { "pairs": 2, "diffs": 3, "accepted": 1 }`.

`/git:merge` refusal (D6):

```report
🚫 **proto/28-functional-prototype is a prototype branch — it is never merged**
Next: /spec:prototype docs/roadmap/28-functional-prototype.md — freeze it; harden/28-functional-prototype is what lands
```

## Behavior

`/spec:run <generated spec>` opens the spec's worktree as today. The build driver refuses while
the brief's prototype branch exists; otherwise, for the behaviour lane, its first step is the
harden merge, run by the session in the worktree and verified by the mark. TESTS through GATE run
unchanged: the derived e2e file is the red tests row, the rebuild is the UI work, the host gate
(kit and naming gates, brief 27) hardens the merged data and API layer in place. After a green
gate the session boots the app and marks `captured`; the driver captures and diffs every route ×
state against the freeze. Zero diffs continue to COMMIT; otherwise the look stop is printed and
the turn ends. On `accept <route> <state>` the session marks that pair accepted; on anything
else it fixes and re-marks `captured`. Review is unchanged; after merge-back the review driver
deletes the harden branch. The capture counts land on the build row.

## Acceptance Criteria

- **AC-20260928-03-1**: WHEN the build driver runs on a hardened spec with `brief: 28` while branch `proto/28-functional-prototype` exists THE SYSTEM SHALL exit 2 with stderr containing `prototype proto/28-functional-prototype is still open for brief 28` and `/spec:prototype`, flip no status, and stamp no `diff_base`; WHEN the branch is absent THE SYSTEM SHALL admit the spec as today; WHEN the spec is `brief: n/a` and a `proto/` branch exists THE SYSTEM SHALL admit it → writes tests/build/build-driver-lane.test.js [retired: specs/20261007/03-plan-cites-the-build-replays-and-status-derives-the-delete.md]
- **AC-20260928-03-2**: WHEN a `lane: behaviour` spec is admitted THE SYSTEM SHALL print `state: HARDEN_MERGE`, a `Session:` line containing `git merge --no-ff harden/28-functional-prototype`, and `--mark harden-merged`; WHEN `--mark harden-merged` runs before the merge THE SYSTEM SHALL exit 2 containing `harden/28-functional-prototype is not merged into HEAD`; WHEN it runs after the merge THE SYSTEM SHALL print `(HARDEN_MERGE → TESTS)`; WHEN no `harden/` branch exists THE SYSTEM SHALL exit 2 naming `/spec:prototype`; a spec without `lane:` SHALL print `state: TESTS` first as today → writes tests/build/build-driver-lane.test.js [retired: specs/20261007/03-plan-cites-the-build-replays-and-status-derives-the-delete.md]
- **AC-20260928-03-3**: WHEN a behaviour-lane build reaches a green gate THE SYSTEM SHALL print `state: CAPTURE`, `Read only:` naming `contract.json`, a `Session:` line containing the host's `runtime.bootCommand`, and `--mark captured`; WHEN `--mark captured` runs with the capture stub reporting zero diffs for both pairs THE SYSTEM SHALL write `capture-state.json` with two pairs at `diffs: 0`, print `(CAPTURE → COMMIT)`, and the next run SHALL print `state: COMMIT` → writes tests/build/build-driver-lane.test.js [retired: specs/20261007/03-plan-cites-the-build-replays-and-status-derives-the-delete.md]
- **AC-20260928-03-4**: WHEN `--mark captured` runs with the stub reporting 3 diffs on `/women` `empty` and 0 on `default` THE SYSTEM SHALL print `🎨 route /women (empty): 3 diffs — http://localhost:3000/women?proto=empty`, three indented entry lines, `route /women (default): 0 diffs`, the `accept /women empty` reply line, and stay at `CAPTURE`; WHEN `--mark capture-accepted --route /women --state empty` runs THE SYSTEM SHALL set that pair's `accepted: true` and print `(CAPTURE → COMMIT)`; WHEN `capture-accepted` names a pair with zero diffs THE SYSTEM SHALL exit 2 containing `has no diffs`; WHEN the stub exits 2 THE SYSTEM SHALL exit 2 forwarding its stderr and write no `capture-state.json` → writes tests/build/build-driver-lane.test.js [retired: specs/20261007/03-plan-cites-the-build-replays-and-status-derives-the-delete.md]
- **AC-20260928-03-5**: WHEN a behaviour-lane build reaches `--mark committed` after AC-4's acceptance THE SYSTEM SHALL append a build row carrying `capture: { pairs: 2, diffs: 3, accepted: 1 }`; a non-behaviour build's row SHALL carry no `capture` key → writes tests/build/build-driver-lane.test.js [retired: specs/20261007/03-plan-cites-the-build-replays-and-status-derives-the-delete.md]
- **AC-20260928-03-6**: WHEN the review driver's merge concludes for a `lane: behaviour` spec whose `harden/<stem>` branch exists THE SYSTEM SHALL delete that branch (`git branch --list 'harden/*'` empty) and print `harden/<stem> deleted`; WHEN the spec has no `lane` THE SYSTEM SHALL leave an unrelated `harden/x` branch in place → writes tests/review/harden-branch-cleanup.test.js [retired: specs/20261007/03-plan-cites-the-build-replays-and-status-derives-the-delete.md]

## Assumptions (escalation triggers)

- A1 (executed 2026-09-28): `git branch --list 'proto/28-*'` prints nothing once the branch is deleted and one line while it exists; `git merge-base --is-ancestor` exits 1 for an unmerged branch. — **if false:** STOP, ask the user.
- A2: the build driver's `deriveState` can insert two states (`HARDEN_MERGE` before `TESTS`, `CAPTURE` between the green gate and `COMMIT`) without moving any existing mark's admission — the existing states keep their order and marks (`MARK_STATE`); `tests/build/*.test.js` pins on the default lane stay green because the new states derive only under `lane: behaviour`. — **if false:** the hit is a fix row here, never a weakened pin.
- A3: the review driver's `finishMerge` runs from the main root after `merge-back.sh cleanup`, so a `git branch -D` there is a plain git call, not a merge-back.sh change (merge-back.sh is untouched; its exit alphabet is unchanged). — **if false:** STOP — merge-back.sh is critical tier and would need its own row and tier upgrade.
- A4: `tests/review/merge-reentry.test.js`'s `driveToMerge` harness can be reused to reach `finishMerge` with a `lane: behaviour` spec body. — **if false:** the new test builds its own harness from `review-driver.fixtures.js`.
- A5: `run.md` has slack under its 334 read-load budget for one sentence (measured at lock: 97 own + 222 shared = 319). — **if false:** condense an existing sentence in the same edit; never raise the budget.
- A6: no test pins `spec/agents/reviewer.md` § Ground yourself first byte-for-byte (`reviewer-seat.test.js` and `reviewer-scope-identity.test.js` pin other sections). — **if false:** the hit is a fix row here.

## Rationale

The behaviour lane is two extra states in the existing build state machine, not a second driver:
the harden merge is the one thing that must happen before tests are authored (the schema the tests
run against), and the capture gate is the one thing that can only run once the gate is green and
the app boots. Both are derived only for `lane: behaviour`, so every other spec sees the driver it
saw yesterday. The capture gate is a build state rather than a review leg because a diff needs a
human word and a fix cycle, which is what build stops are for; review inherits the accepted
baseline as part of the reviewed range. The `accept` word mirrors `approve` at the prototype and
genesis stops. `harden/<stem>` is deleted by the review driver, not by merge-back.sh, so the
critical-tier script's exit alphabet stays untouched. `/git:merge`'s refusal is prose because the
command is prose; a script would be a guard with zero recurrences (Incident Policy). No
`SHALL CONTINUE TO` pin: the default lane's behaviour is unchanged and already pinned by the build
and review suites.

Build departures (folded from the deviations sidecar, one-offs): the fixture's capture stub is
scripted per URL through a `PROTO_CAPTURE_SCRIPT` env var naming a JSON map file (the File Plan
fixed no shape); the fixture stem is `<brief>-functional-prototype`, following the Contracts
example; A4 fired as stated — `driveToMerge` is not exported, so the harden cleanup test builds
its own worktree/merge harness from the same recipe. Review found the D1 refusal stripped only
`*` from `git branch --list`, so a proto branch checked out in the prototype's own worktree
(`+ ` prefix) leaked the marker into the message; the driver now reads
`--format=%(refname:short)` and a linked-worktree case pins it.

## Canonical Delta

`docs/canonical/build-integrity.md` gains **Behaviour lane**: a spec stamped `lane: behaviour`
(written by the prototype freeze) starts with `HARDEN_MERGE` (the session merges
`harden/<stem>`, the mark verifies ancestry) and, after a green gate, `CAPTURE` (the driver
captures every contract route × state and diffs against the freeze; a diff is accepted by the
user's literal `accept <route> <state>` or fixed and re-captured); the build row records
`capture: { pairs, diffs, accepted }`; any spec carrying a brief is refused while
`proto/<NN>-*` exists; the review driver deletes `harden/<stem>` after merge-back; `/git:merge`
refuses `proto/*`.
