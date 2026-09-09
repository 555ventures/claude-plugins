---
date: 2026-09-08
status: done
build_base: main
tier: standard
area: scripts
design: false
breaking: false
depends_on: [specs/20260908/01-size-ratchet.md]
depended_on_by: [specs/20260908/04-duplicate-window-ratchet.md]
brief: n/a
open_markers: 0
spiked: 2026-09-08
diff_base: ba8b5ae5cf11fed2829cefa6a72dda8893373afe
---

# Driver dedupe — one surfaces grammar in lib, genesis-driver on driver-io

## Goal

The ```surfaces line grammar (a bare label, an `a -> b` edge, a `#` comment) is parsed in
exactly one place, `spec/scripts/lib/surfaces.js`, and both `design-atlas.js` and
`genesis-driver.js` fold over it. `genesis-driver.js` stops carrying its own copies of the
synchronous stdout writer and the fail-closed child runner and uses `lib/driver-io.js` like
the review, build, and mocks drivers do. Behavior is unchanged: every existing genesis and
atlas test keeps passing, and the deduplicated drivers shrink, which the size baseline
records.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `spec/scripts/lib/surfaces.js` exports `parseSurfaceLines(block)`, `parseSeedJourneys(text)`, `parseSurfaces(roadmapDir)`, and `parseSurfacesPlacement(roadmapDir)` (signatures in Contracts). The grammar lives only in `parseSurfaceLines`; the other three are folds over it. (AC-20260908-02-1, -2, -3) | The two drivers' copies had already diverged semantically — genesis tracks every declaring brief and returns no edges, atlas keeps the first brief and returns edges — so the lib must expose both folds over one grammar, never one function. Rejected: exporting from `design-atlas.js` (a CLI entrypoint; the entrypoint-conformance inventory treats a script-to-script require as a second activation path). |
| D2 | `parseSeedJourneys` takes the seed **text** (`null` → empty Map) and returns `{persona, labels, edges}` per journey; callers own the read. `design-atlas.js` keeps a two-line `parseSeedJourneys(root)` wrapper that reads `design/mocks/seed.md`; `genesis-driver.js` calls `surfacesLib.parseSeedJourneys(seedText())`. (AC-20260908-02-2) | genesis already reads the seed through its own `seedText()`; atlas reads by root. Passing text keeps the lib free of path policy. |
| D3 | `genesis-driver.js` requires `./lib/driver-io` and defines `writeOut(fd, str)` as a one-line wrapper appending `\n` (its callers pass unterminated lines) and `const runChild = driverIo.runChild`; the local `spawnSync` import and both local implementations are removed. The dead-child remedy text becomes lib's generic "fix the cause and re-run the driver". (AC-20260908-02-4, -5) | mocks-driver and design-atlas already use lib correctly; genesis's copy was justified in its own comment by an "A1" that no longer holds. No test pins the genesis-specific re-run command line (grep executed). |
| D4 | `parseSeedJourneysLocal` and `parseSurfacesPlacementLocal` are deleted from `genesis-driver.js`; the header comment paragraph justifying them ("Assumption A1: design-atlas.js's own parseSeedJourneys is not exported…") is deleted, not rewritten. `journeyPlacementCheck()` calls `surfacesLib.parseSurfacesPlacement(path.join(root, 'docs/roadmap'))`. (AC-20260908-02-3, -6) | The comment narrates a rejected alternative; the lib's header states the current invariant once. |
| D5 | `design-atlas.js` drops its `parseSurfaces` and `parseSeedJourneys` bodies (about 70 lines) for `const parseSurfaces = surfacesLib.parseSurfaces` plus the D2 wrapper; all four call sites (`cmdBuild`, the review-page route) are untouched. (AC-20260908-02-7) | Spike showed the swap is call-site neutral. |
| D6 | Regression pins: the existing genesis placement tests and atlas surfaces tests are tagged with this spec's AC-IDs rather than duplicated; new tests cover only the lib contract (AC-1..3). (AC-20260908-02-6, -7) | Template rule: tag the covering test over duplicating it. |
| D7 | `spec/.claude-plugin/plugin.json` bumps to **7.106.0** (target, not pin — bump to the next free number if a sibling spent it) and its `description` changelog names the lib. `[no-ac: version metadata; review's bump check is the oracle]` | Shipped script content changes; the host rules make the bump a hard review check. |
| D8 | After all rows land, the orchestrator runs `node scripts/size-ratchet.js --root . --update` so the baseline records the shrink (`genesis-driver.js` −~105 lines, `design-atlas.js` −~70 lines, new `lib/surfaces.js` ~3.7 KB under the 40 KB cap). `[no-ac: the live ratchet test from spec 01 is the oracle]` | A shrink that is not recorded is a stale ceiling and the live check goes red. |
| D9 | Review closed at the driver's iteration cap with the third-iteration survivor (the stale `genesis-driver.js` mention in `lib/driver-io.js`'s writeOut comment) recorded as waived rather than fix-dispatched: the fix itself already landed in commit 838e936. User ruling, 2026-09-09. | Three consecutive reviewer passes returned CLEAN; the only edit left un-re-reviewed is one identifier removed from a comment, which cannot change behavior. Restarting cold would not reset the cap. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/lib/surfaces.js | CREATE | scripts | D1, D2: the one grammar and its three folds; header cites this spec |
| spec/scripts/genesis-driver.js | MODIFY | scripts | D3, D4: driver-io wrappers, lib folds, two local parsers and the A1 paragraph deleted |
| spec/scripts/design-atlas.js | MODIFY | scripts | D5: lib folds, seed-read wrapper |
| spec/scripts/lib/driver-io.js | MODIFY | scripts | Collision closure (review it-3): drop `genesis-driver.js` from the writeOut comment's list of scripts carrying their own writer — D3 makes it a consumer |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | D7: version + description changelog |
| tests/surfaces-lib.test.js | CREATE | tests | AC-20260908-02-1, AC-20260908-02-2, AC-20260908-02-3 |
| tests/genesis/genesis-driver.test.js | MODIFY | tests | AC-20260908-02-4, AC-20260908-02-5, AC-20260908-02-6 (tag existing placement tests; add the dead-child pin if absent) |
| tests/design-atlas.test.js | MODIFY | tests | AC-20260908-02-7 (tag the existing surfaces/seed-journey tests) |
| size-baseline.json | MODIFY | other | D8: rewritten by `--update` at build's last step |

Orchestrator duty (D8): run `node scripts/size-ratchet.js --root . --update` after the last
worker returns, before the final gate.

## Contracts

```js
// spec/scripts/lib/surfaces.js
parseSurfaceLines(block: string): Array<{ labels: string[], edge: [string, string] | null }>
//   'a -> b'  → { labels: ['a','b'], edge: ['a','b'] }
//   'home'    → { labels: ['home'], edge: null }
//   '# note', '', 'bad label!' → dropped (a label matches /^[\w][\w-]*$/)
parseSeedJourneys(text: string | null): Map<kebab, { persona: string, labels: string[], edges: [string,string][] }>
//   null → empty Map; HTML comments stripped first; `### <kebab>` opens a journey; first non-blank line is the persona
parseSurfaces(roadmapDir): { nodes: Map<label, { brief: absolutePath }>, edges: [string,string][] }
//   first declaring brief wins per label (design-atlas fold); missing dir → empty
parseSurfacesPlacement(roadmapDir): Map<label, string[]>
//   every declaring brief file name, once per file, in sorted file order (genesis D4 fold); missing dir → empty Map
```

## Behavior

`genesis-driver.js`'s `die()` keeps writing `genesis-driver: <msg>` followed by a newline via
the wrapper. `runChild` from lib exits 2 on a signal-killed or never-spawned child with the
label the caller passes as its fourth argument; genesis passes the same labels it passes today.
Nothing about argument parsing, marks, or ledger rows changes.

## Acceptance Criteria

- **AC-20260908-02-1**: WHEN `parseSurfaceLines` receives `"home\na -> b\n# c\nbad label!\n"`
  THE SYSTEM SHALL return `[{labels:['home'],edge:null},{labels:['a','b'],edge:['a','b']}]` →
  test in tests/surfaces-lib.test.js
- **AC-20260908-02-2**: WHEN `parseSeedJourneys` receives a seed with `### onboarding`, persona
  line `New user`, and a surfaces block `home -> plan\nplan` THE SYSTEM SHALL return a Map with
  `onboarding → {persona:'New user', labels:['home','plan'], edges:[['home','plan']]}`, and WHEN
  it receives `null` THE SYSTEM SHALL return an empty Map → test in tests/surfaces-lib.test.js
- **AC-20260908-02-3**: WHEN two roadmap briefs `01.md` and `02.md` both declare `home` and
  only `02.md` declares `plan` THE SYSTEM SHALL return from `parseSurfaces` a `home` node whose
  `brief` ends with `01.md` and from `parseSurfacesPlacement` `home → ['01.md','02.md']`,
  `plan → ['02.md']` → test in tests/surfaces-lib.test.js
- **AC-20260908-02-4**: WHEN `genesis-driver.js` refuses with `die()` THE SYSTEM SHALL CONTINUE
  TO write `genesis-driver: <message>` terminated by exactly one newline to stderr and exit 2 →
  existing refusal test in tests/genesis/genesis-driver.test.js, tagged
- **AC-20260908-02-5**: WHEN a child `genesis-driver.js` spawns dies by signal THE SYSTEM SHALL
  CONTINUE TO exit 2 with stderr containing `died without an exit code` → test in
  tests/genesis/genesis-driver.test.js (add if no existing test covers it)
- **AC-20260908-02-6**: WHEN a seed journey label is declared by no roadmap brief, or by two
  briefs, THE SYSTEM SHALL CONTINUE TO report the genesis placement check as `unplaced` or
  double-placed exactly as before → existing placement tests in
  tests/genesis/genesis-driver.test.js, tagged
- **AC-20260908-02-7**: WHEN `design-atlas.js` builds from roadmap surfaces blocks and seed
  journeys THE SYSTEM SHALL CONTINUE TO produce the same nodes, edges, and journey sections →
  existing tests in tests/design-atlas.test.js, tagged

## Assumptions (escalation triggers)

- A1: The extraction is behavior-neutral — **executed 2026-09-08 in a discarded worktree**:
  the exact D1–D5 edit (−165 lines across the two drivers, +3,693-byte lib) ran the full suite
  at 1288 tests / 1284 pass / 3 fail, the 2 failures being the sanctioned `[env: CHROME_BIN]`
  render tests and the third `tests/review/review-driver.test.js` AC-20260820-07-14, which
  passes in isolation (14/14) and is unrelated to these files. Diff preserved at
  `/tmp/claude-1000/-home-jj-projects-claude-plugins/9bacf2a4-6e3d-4cd2-9397-bfcb5da56d57/scratchpad/dedupe-spike.diff`
  for reference only; workers write from this spec. **if false:** a red genesis or atlas test
  names the diverged fold — STOP and adjudicate against D1's two-fold contract.
- A2: No test pins genesis's driver-specific dead-child remedy (`re-run \`node …
  genesis-driver.js --root …\``) — **executed**: `grep -rn "died without an exit code\|re-run
  \`node" tests/genesis tests/design-atlas.test.js` returned nothing. **if false:** keep the
  remedy by passing a sharper `what` label; never restore the local copy.
- A3: `parseSeedJourneysLocal` and `parseSurfacesPlacementLocal` are referenced nowhere outside
  `genesis-driver.js` — **executed**: repo grep found only the two comment mentions of
  atlas's `parseSeedJourneys` in genesis tests, which stay true under D2. **if false:** the
  colliding pin is updated in place and retagged, never weakened.

## Rationale

The four largest scripts carry twenty to thirty percent comment lines, much of it spec history,
and two of them each re-implement helpers that already live in `spec/scripts/lib`. This spec
takes the two duplications the spike proved safe. It deliberately does not sweep comments
(spec 20260902/01's narration gate already holds the code group at zero narration; what remains
is mechanism prose that the size ratchet now prices) and does not touch the review or build
drivers, which already sit on lib.

The two-fold contract in D1 is the finding that made a spike worth running: the copies looked
identical and were not. A single shared `parseSurfaces` would have silently changed genesis's
double-placement detection to first-wins. Fragile: `parseSurfacesPlacement` returns file
*names* while `parseSurfaces` returns absolute *paths* in `brief`; both are preserved because
their consumers format them differently.

Version target 7.106.0 follows the sibling series 20260907/05–09 which spent 7.101–7.105.

Collision-closure at lock (literals `parseSeedJourneysLocal`, `parseSurfacesPlacementLocal`): four
hits — both in `spec/scripts/genesis-driver.js` (a File Plan row) and their mirrors under
`.claude/worktrees/spec-04-kit-canon-family/`, waived as another session's checkout. Paths leg
`executes` hits (the genesis and atlas tests plus `tests/consistency/genesis-doctrine.test.js`,
`retired-flags.test.js`, `design-shell.test.js`, the mocks fixtures) are the tests that spawn the
two drivers; the spike ran that whole set green on the same edit, so no fixture repair is planned.

Build departures (folded from the deviations sidecar at close, both one-offs). D7's version
target 7.106.0 was already spent by sibling specs — the repo base was 7.117.0 — so the bump
landed on 7.118.0, the next free number D7's own fallback authorises. D8 expected a net shrink,
but the tests layer grew (the AC-20260908-02-5 signal-killed-child pin plus the AC tags), so
`size-ratchet.js --update` refused until ceilings were raised through the script's own
`--raise ... --cite` route; five raises landed across the range, all citing this spec, because
the ratchet counts tracked files only and the two new files were still untracked when the
build's `--update` ran — `tests/design-atlas.test.js`, `tests/genesis/genesis-driver.test.js`
and the `tests` tree in the checkpoint commit, then the `spec/scripts/lib` tree and the `tests`
tree again once the checkpoint tracked them. No baseline file was ever hand-edited.

## Canonical Delta

docs/canonical/scripts.md — add under the lib inventory: `lib/surfaces.js` is the one parser
of the ```surfaces grammar; `design-atlas.js` and `genesis-driver.js` are folds over it
(first-brief-wins with edges, every-brief placement without). `genesis-driver.js` uses
`lib/driver-io.js` for its writer and child runner like every other driver.
