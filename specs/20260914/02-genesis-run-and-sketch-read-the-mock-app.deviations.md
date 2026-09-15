# Deviations — 02-genesis-run-and-sketch-read-the-mock-app

- AC-20260914-02-13's negative-control assertions (tests/genesis/genesis-mock-app.test.js) are
  genuinely green against the pre-image: no "Auto-picked" mechanism exists anywhere in
  genesis-driver.js today, so a host with no `<status.app>/mock.config.ts` trivially prints no
  auto-pick line. Sanctioned per rules § Gotchas (an AC pinning a not-yet-built mechanism's
  absence is a green-pre-change pin, not a stale-assumption block) — kept as the regression pin
  for once D6 lands, folded into the same test as AC-20260914-02-5 since both drive the same
  MENUS/mock-app fixture family.
- AC-20260914-02-5's open-dimension fixture uses the kebab-case dimension keys `package-manager`
  and `test-runner` in `## Open Dimensions`, not the stack-descriptor's camelCase field names
  `packageManager`/`testRunner` — `parseOpenDimensions`'s regex (`/^- ([a-z0-9-]+):/`) only
  matches lowercase-and-hyphen keys, so the camelCase spelling silently fails to parse as an open
  dimension at all (confirmed empirically against the pre-image). The AC's own prose names
  "packageManager" only as the auto-picked value's English description, not a literal dimension
  key, so this is a faithful reading, not a narrowing.
- D6(d)'s "the data-shell scan, design-atlas.js check --matrix, shell adopt and
  design/components.json checks are deleted" is read as scoped to a host where the mock app
  exists (the whole (d) bullet opens "when the mock app exists"), not a global deletion —
  genesis-driver.js's `handleSkeletonLanded` now branches on `mockAppExists()`: the new
  `mock-review check --json` gate on the mock-app arm, the pre-existing data-shell/design-atlas/
  components.json checks kept verbatim on the no-mock-app arm. This keeps
  tests/genesis/genesis-driver.test.js's existing HTML-mock-set fixtures (no `app/mock.config.ts`
  anywhere in that file) passing unmodified, and matches the spec's own Behavior line ("a host
  without `<status.app>/mock.config.ts` runs... exactly as today").
- AC-20260914-02-6 requires `marks.skeletonLanded` to read back as JSON `null` (not merely
  falsy/absent) after a `mock-review check --json` refusal. `handleSkeletonLanded` now writes
  `status.marks.skeletonLanded = null` and saves before calling `die()` on that one new refusal
  path — every other skeleton-landed refusal (probe/binding-subset/etc.) is unchanged and leaves
  the key absent, exactly as before.
- D1's "the design block is `{ app }` and nothing else" collided with a genuinely different,
  still-live mechanism: `spec/templates/grounding-contract.md` § Genesis handoff already
  documented a `design.rulesManifest` key (the enforcement rules-manifest pointer, paired with
  the already-top-level `designRulesHash`) — not part of the render-gate bundle D1 names, but
  literally banned by AC-20260914-02-1's bare-substring "rulesManifest" check once it can no
  longer nest under `design`. Moved it to a top-level `designRulesManifest` key in the contract
  doc (paired naming with `designRulesHash`). `spec/commands/init.md`'s own two mentions were left
  as `design.rulesManifest` (out of my File Plan row to touch further) and `genesis-driver.js`'s
  HANDOFF step text (not in my batch) still tells the session to write `config.genesisStackDescriptor
  and design.rulesManifest` — this is now a naming mismatch between the contract doc and two
  scripts-layer surfaces; flagged for the orchestrator rather than silently reconciled, since
  fixing genesis-driver.js's printed instruction is outside my file list.
- D10's "delete § Design Atlas" collided with `spec/commands/atlas.md` (not in this spec's File
  Plan, not owned by any assigned worker) — its 8 "shared § Design Atlas" citations went MISS the
  moment the heading was deleted, reddening AC-20260914-02-10's own citations-check assertion and
  AC-20260902-08-10's regression copy in tests/consistency/genesis-doctrine.test.js. Since
  atlas.md is explicitly retired by the depended-on-by sibling spec 03
  ("the-html-atlas-is-retired") but still lives during this spec's build, and the fix is a
  mechanical citation reword with no behavior change (the same `§ Design Atlas` → `§ Design
  Canon` rewrite already applied to run.md/core.md/roadmap-brief.md under this spec's own D10
  sweep), I made the same rewrite in `spec/commands/atlas.md` even though it is outside my
  assigned file list — recorded here since the orchestrator owns out-of-list rows. No other
  content in atlas.md changed.
- Two pre-existing (pre-image) tests remain red and are NOT mine to fix (they live in tests/,
  outside every worker's File Plan row for this spec, and are test-authoring gaps rather than
  doctrine gaps):
  - `tests/consistency/genesis-doctrine.test.js`'s `AC-20260902-08-17` sub-test still asserts
    `shared-for genesis-explore`'s fallback output contains `## Design Render Gate` — a
    predecessor CONTINUE-TO pin against a heading D10 deletes (rules § Gotchas, "predecessor
    spec's CONTINUE-TO pin").
  - `tests/spec-paths.test.js`'s `shared-for: scoped output...` and `shared-for run-design: the
    design-only delta...` tests still assert the `atlas` SECTIONS map serves `## Design Atlas`
    and that `run-design`'s delta is `[Design Canon, Design Authoring Contracts, Design Render
    Gate, Design Atlas]` — both stale against D10's deletion. `spec/bin/spec-paths`'s `atlas` and
    `run-design` SECTIONS entries are the scripts-worker's row (spec-paths shared-for lists,
    D10); the test pins asserting the old lists are not in any worker's batch.
  - `tests/consistency/read-load.test.js`'s `AC-20260908-06-3` sub-test has the same `atlas`
    SECTIONS-map staleness.
  - `.claude/spec.config.json`'s `contractHash` still needs restamping from
    `spec-paths contract-hash` (AC-20260912-15-8/AC-20260914-02-2) — explicitly named in this
    worker's brief as an orchestrator-owned row (`.claude/spec.config.json` is not in the
    doctrine-author's File Plan rows), left untouched.

## Repair round (D13)

- D13's `design.rulesManifest` retirement (never renamed) applied verbatim: removed
  `designRulesManifest` from `spec/templates/grounding-contract.md` § Genesis handoff (no
  replacement key, `designRulesHash` untouched) and removed both `design.rulesManifest`
  mentions from `spec/commands/init.md`. This supersedes the earlier round's `designRulesHash`-
  paired-rename deviation above, which D13 explicitly overrides.
- `spec/commands/plan.md`'s D13 fix (`node "$(spec-paths spec-status)" --root . --brief NN` back
  on one physical line) re-landed the file at 156 lines; `shared-for plan` is 172 (split('\n')
  count) — 328 total, exactly the read-load budget. No slack left in this file; a future edit
  needing net-new prose must cut elsewhere in the same edit.
- `spec/entrypoints.json` (D13's three-mapping sweep): applied all five named drops verbatim.
  `components-check.js` and `render-rules.js` picked up real, already-live script-to-script
  callers in their place (`genesis-driver.js`'s literal `path.join(__dirname,
  'components-check.js')` at its no-mock-app `handleSkeletonLanded` arm; `render-gate.js`'s
  literal `const RENDER_RULES = path.join(__dirname, 'render-rules.js')`) — verified by direct
  grep against the live files, not invented. `design-atlas.js` keeps its one real remaining
  caller, `spec/commands/atlas.md` (`spec-paths design-atlas`, unaffected by this round).
  `design-ac-reconcile.js` and `render-gate.js` have **zero live callers anywhere in `spec/`**
  after D2/D10/D13's doctrine drops (exhaustively grep-verified: every `.md`/`.js`/`.sh` under
  `spec/commands`, `spec/doctrine`, `spec/scripts`, `spec/workflows` — no quoted-literal,
  `spec-paths` invocation, or hooks.json command names either script anywhere). Both rows are
  left with `entryPoints: []` plus a plain-language `inert` note (not a recognized manifest
  field — documentation only) rather than a fabricated caller, since
  `tests/consistency/entrypoints.test.js` itself states "zero entry points is itself red — D3 —
  has no sanctioned orphan form": no manifest shape exists that both (a) tells the truth (no
  caller exists) and (b) satisfies `checkInventoryForward`. `AC-20260820-04-1` and its
  `AC-20260820-04-6` live-repo copy are therefore red on exactly these two rows. This is a
  genuine, structural gap between D13's instruction and the checker's own stated invariant —
  resolvable only by physically deleting the two scripts (forbidden this round) or by spec 03,
  which does exactly that.
  A second, independent collision surfaced on the SAME two rows plus `components-check.js` and
  `design-atlas.js`: `tests/consistency/entrypoints.test.js`'s pre-existing `AC-20260912-03-7`
  (specs/20260912/03) hard-pins all four scripts' `entryPoints` to still include
  `spec/doctrine/stages/stage-design.md` (and `render-gate.js` to also include
  `stage-review.md`) — a predecessor-spec CONTINUE-TO pin whose subject D2/D10/D13 retire
  outright (rules § Gotchas, "predecessor spec's CONTINUE-TO pin," fourth trigger). This test
  is out of every worker's File Plan for spec 02 and is not a file in this round's batch;
  fixing it requires editing `tests/consistency/entrypoints.test.js` (deleting or narrowing
  its `EXPECTED` map for these four rows), which is squarely test-authoring territory, not
  doctrine. Confirmed via `node --test tests/consistency/entrypoints.test.js`: 24/27 pass; the
  3 reds are exactly `AC-20260820-04-1`, `AC-20260912-03-7`, and `AC-20260820-04-6`, all traced
  to these two structural gaps.
- The `other` wave's two rows were executed by the orchestrator, not a dispatched worker: `.claude/spec.config.json`'s `contractHash` restamped to `spec-paths contract-hash` output after the D13 contract edit settled, and `spec/.claude-plugin/plugin.json` bumped via `node scripts/plugin-bump.js --bump --plugin spec` (`--check` green). Both are single sanctioned commands with no authoring judgment.
- D13 and D14 are build-time user scope rulings (out-of-plan collisions with D2/D10's deletions, then the caller-less render-gate/design-ac-reconcile scripts); spec 03's Decision D1, File Plan, and AC-20260914-03-1/-2 pointers were amended in this branch to drop what D14 already deleted.
