---
date: 2026-08-20
status: implementing
open_markers: 0
diff_base: cf10ce87c8c5f0a16b04c060130dd1da04beb38f
tier: standard
area: consistency-guards
design: false
breaking: false
depends_on: ["specs/20260820/03-review-observation-truth.md"]
depended_on_by: []
brief: n/a
---

# Entry-Point Conformance — every authored check declares who calls it, diffed against reality

## Goal

Close the "authored but never activated" class structurally (3rd recurrence — env-preflight
absent from review was the third instance; core § Incident Policy earns a deterministic
guard). Every executable script in `spec/scripts/` and `spec/workflows/` gets a manifest
entry declaring its entry points — the files that invoke it — and a conformance test diffs
those declarations against the repo's actual call sites in both directions on every
`npm test`. Done means: a script nothing invokes is a red test, a declared call site that
no longer invokes is a red test, an invocation the manifest doesn't know is a red test, and
a `spec-paths` key resolving to a deleted file is a red test — so the class fails loudly at
the diff that introduces it instead of surfacing as a host field report.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | One central manifest `spec/entrypoints.json`: an object keyed by repo-relative script path, one entry per executable in `spec/scripts/*.js`, `spec/scripts/*.sh`, and `spec/workflows/*.js` (`spec/scripts/lib/` excluded — modules, not entry points), each entry `{"entryPoints": ["<repo-relative file>", …]}` (AC-20260820-04-1) | Central file over per-script header lines: header edits would touch 30+ files (decomposition cap) including the frozen wf-*.js; a central registry cannot rot silently because AC-2..6 diff it against reality every test run — the v7 objection to registries was unverified rows, not centrality |
| D2 | Conformance test `tests/consistency/entrypoints.test.js` checks inventory both ways against the live repo: every executable matching D1's globs has a manifest entry, and every manifest key resolves to an existing file (AC-20260820-04-2) | The inventory diff is what makes deleting a script (roadmap briefs 08/10 delete wf-*.js) force a same-diff manifest update — loud, never silent |
| D3 | Forward check: every declared entry point exists and actually invokes its script — for `.md` entry points the literal `spec-paths <key>` (key resolved from `spec/bin/spec-paths`'s case table), for `hooks.json` a `/scripts/<basename>` occurrence, for script-to-script callers the script's basename; zero entry points is itself red — "authored but never activated" has no sanctioned form, an internal-only script lists its invoking script (AC-20260820-04-3, AC-20260820-04-4) | env-preflight's defect shape: had this existed, its entry list gaining review-legs.js in spec 03 would be pinned forever — deleting the call reds the suite the same commit |
| D4 | Reverse check: every `spec-paths <key>` occurrence under `spec/commands/`, `spec/doctrine/`, `spec/agents/`, `spec/templates/`, `git/commands/`, plus every `${CLAUDE_PLUGIN_ROOT}` script path in `spec/hooks/hooks.json`, must map to a manifest entry that declares that file (AC-20260820-04-5) | An invocation the manifest doesn't know means the manifest lies about coverage; the reverse direction is what keeps declarations honest without a human sweep |
| D5 | The checker logic lives in the test file as pure functions over an injectable root, exercised twice: against the live repo (green pin) and against `tmpdir()` fixture repos for each red case — missing entry, dangling key, declared-but-absent invocation, undeclared call site (AC-20260820-04-2..6) | House test style is behavioral-in-tmpdir; live-repo-only assertions would make the red paths unfalsifiable (the live repo is, by definition, green) |
| D6 | Non-goals, recorded: no `observed`-grammar declarations in the manifest (spec 03's executed pair test owns grammar liveness — prose grammar rows would be unverified registry rows, the exact v7 smell), and no dynamic-invocation detection (a call site grep cannot see is listed manually in `entryPoints`; the forward check then only verifies file existence for entries flagged `"dynamic": true`) [no-ac: scoping decision — the delivered surface is D1–D5's] | Keep the guard exactly as strong as what it can verify by execution; declared-but-unverifiable rows are what made registries rot |
| D7 | `spec/scripts/advisory-append.js` is DELETED, along with its `spec-paths advisory-append` case-table entry, its usage-line token, and `tests/advisory-append/advisory-append.test.js` — the guard's first catch, adjudicated by the user at build time 2026-08-20 (AC-20260820-04-6) | The script's sole producer was `wf-review`'s `smells` return; v7 deleted the review workflow and nothing has invoked the script since — a genuine orphan of exactly the class D3 declares red. Re-wiring it would restore a dropped feature (a design call, its own spec); an exempt marker would create the sanctioned-orphan form D3 rules out. Deletion is the only option that keeps the guard as strong as authored. Historical incident-header prose naming the file (tests/tracked-text-purity.test.js) is an incident record, not an invocation, and stays |
| D8 | The reverse check (D4) considers a `spec-paths <key>` occurrence only when the key resolves to a path inside D1's executable inventory (`spec/scripts/*.js|*.sh` minus `lib/`, `spec/workflows/*.js`); keys resolving to doctrine files, templates, or directories are not script invocations and raise nothing (AC-20260820-04-5) | Nine live keys (`shared`, `shared-design`, `shared-genesis`, `replay-corpus`, `template`, `feedback-template`, `templates`, `contract`, `workflows`) resolve to non-executables. D4 read literally would demand a manifest entry for `spec/doctrine/core.md`, and the only ways to satisfy it are to key non-executables (breaking D1) or to weaken the check — so D4's domain is D1's domain, made explicit here rather than left to the checker's author |
| D9 | The forward check's script-to-script grammar is A2's declared shape, not a bare basename: on a NON-comment line, the basename must appear as an exact-delimited quoted literal (`'<b>'`, `"<b>"`) or as the tail of a quoted path (`/<b>'`, `/<b>"`). Bare-substring matching is retired (AC-20260820-04-4) | A2 sanctioned a bare basename grep; measured at build close it is too weak in this comment-dense codebase — 8 of the 12 script-to-script edges carry comment mentions that satisfy the check on their own, including every review leg and `review-legs.js → env-preflight.js`, the exact edge whose absence was this spec's third recurrence. Executed proof: severing the real `ac-matrix.js` invocation while leaving its header comments intact left the suite 8/8 green. A false GREEN is the failure mode this spec exists to kill, so the grammar is narrowed to the invocation shape A2 itself names; `"dynamic": true` (D6) stays the escape hatch for a shape no grep can see |
| D10 | The reverse check's hooks.json grammar must match the repo's ACTUAL mandated quoting, `"\"${CLAUDE_PLUGIN_ROOT}\"/scripts/<basename>"` — the escaped quote between `}` and `/`. The shipped regex allowed only `}` + optional bare `"` + `/` and therefore matched NOTHING against the live file: the entire reverse-hooks direction had never fired, on a file that genuinely invokes four scripts. Fixture coverage for the hooks direction is added in the same edit (AC-20260820-04-5) | Found by adversarial sweep at build close 2026-08-20; executed: the regex returns zero matches against the live `spec/hooks/hooks.json` while four scripts are referenced. A declared check direction that is provably inert is the precise failure this spec exists to close — the guard had reproduced its own bug class internally. The missing fixture is why it shipped unexercised: AC-2..AC-5's fixtures covered spec-paths and script-to-script only |
| D11 | The executable inventory and D8's domain test must not be evadable by file placement or extension: the scan is recursive under `spec/scripts/` (excluding `spec/scripts/lib/`) and `spec/workflows/`, and admits extensionless files alongside `.js`/`.mjs`/`.cjs`/`.sh`. Additionally — and independently — every `spec-paths` case-table key whose target resolves under `spec/scripts/` or `spec/workflows/` MUST resolve to a file present in the inventory (AC-20260820-04-1) | Executed: a script at `spec/scripts/legs/ac-matrix.js`, reachable via a real `spec-paths` key and invoked from a command, is skipped by the inventory scan AND filtered out of the reverse check by the D8 shape test — invisible in all four directions at once, with the orphan class fully reopened and no red anywhere. The key-table cross-check is the belt-and-braces leg: it closes the case by reachability rather than by file shape, so a future placement the shape rule fails to anticipate still surfaces |
| D12 | Four residual false-green holes, found by adversarial sweep at build close, are ACCEPTED and recorded in § Known Gaps rather than closed. Successor trigger: when the script-to-script edge count grows materially past the 12 present today, replace per-edge declaration with a reachability model (AC-20260820-04-6) | None of the four lets an executable exist with zero callers undetected — the class that recurred three times and that this spec exists to close. Each is narrower: whether one already-declared edge is still real. Closing them costs either a false-red-generating grammar (gap 1 is prose and not statically decidable at all) or the reachability rewrite, which is a lateral trade today — it surrenders the rename detection this spec's Rationale deliberately chose, and this repo's zero-dependency rule leaves no JS parser, so script-to-script detection still bottoms out in text matching even under reachability. Recording the trigger as a number rather than as taste is what keeps the next session from re-deriving this |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/entrypoints.json | CREATE | other | D1: manifest seeded from the repo's actual call sites at build time (post-03 reality, including review-legs.js → env-preflight.js) |
| tests/consistency/entrypoints.test.js | CREATE | tests | AC-20260820-04-1, AC-20260820-04-2, AC-20260820-04-3, AC-20260820-04-4, AC-20260820-04-5, AC-20260820-04-6 |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | Version bump target 7.8.0 (next free at build time) + description changelog |
| spec/scripts/advisory-append.js | DELETE | scripts | D7: orphaned since v7 deleted its `wf-review` producer — the guard's first catch |
| tests/advisory-append/advisory-append.test.js | DELETE | tests | D7: the deleted script's test suite. **Expected review finding, waive:** `ac-matrix.js`'s `missing-test-file` check asserts existence for every `tests`-layer row regardless of action, so a DELETE row is a HARD finding by construction (`uncovered=0 oracle=0`, the coverage matrix itself is clean). The row is correctly classified — retagging it `other` to dodge the check would be gaming it. Upstream fix belongs in `ac-matrix.js` (skip DELETE rows), outside this spec's File Plan |
| spec/bin/spec-paths | MODIFY | scripts | D7: drop the `advisory-append` case entry and its usage-line token |

## Contracts

```
// spec/entrypoints.json
{
  "spec/scripts/env-preflight.js": {
    "entryPoints": [
      "spec/commands/build.md",
      "spec/commands/design.md",
      "spec/commands/doctor.md",
      "spec/scripts/review-legs.js"
    ]
  },
  "spec/workflows/wf-panel.js": {
    "entryPoints": ["spec/commands/genesis-architect.md", "spec/commands/genesis-design.md", "spec/commands/design.md"]
  },
  // … one entry per executable; optional "dynamic": true per entry suppresses the
  // invocation-literal check (file-existence check remains)
}
```

Scan surfaces (closed set, D3/D4): scripts inventory = `spec/scripts/*.{js,sh}` +
`spec/workflows/*.js` minus `spec/scripts/lib/`; call-site corpus = `spec/commands/*.md`,
`spec/doctrine/*.md`, `spec/agents/*.md`, `spec/templates/*`, `git/commands/*.md`,
`spec/hooks/hooks.json`, `spec/scripts/*.{js,sh}`, `spec/workflows/*.js`,
`spec/bin/spec-paths`.

## Behavior

- Deleting a script without touching the manifest → inventory check red (dangling key).
- Deleting an invocation (e.g. brief 08 removing a wf-panel call from design.md) without
  updating the manifest → forward check red on that entry point.
- Adding a script without a manifest entry → inventory check red; adding it with
  `"entryPoints": []` → forward check red (no sanctioned orphan form).
- Renaming a `spec-paths` key or its target → dangling-key or reverse check red.
- The manifest is data about the plugin, not host-facing: no host contract, no
  grounding-contract edit, no config key.

## Acceptance Criteria

- **AC-20260820-04-1**: WHEN `npm test` runs in this repo THE SYSTEM SHALL find a
  `spec/entrypoints.json` entry for every executable in `spec/scripts/*.js|*.sh` and
  `spec/workflows/*.js` excluding `spec/scripts/lib/` (literal: `spec/workflows/wf-panel.js`
  present; `spec/scripts/lib/host-config.js` absent) → live-repo test in
  tests/consistency/entrypoints.test.js
- **AC-20260820-04-2**: WHEN a fixture repo's manifest keys a script file that does not
  exist THE SYSTEM SHALL fail naming the dangling key (literal:
  `"spec/scripts/deleted.js"` in manifest, file absent → assertion failure message contains
  `deleted.js`) → fixture test
- **AC-20260820-04-3**: WHEN a fixture repo contains an executable script whose manifest
  entry is missing, or present with an empty `entryPoints` array, THE SYSTEM SHALL fail
  naming the orphan script → fixture test
- **AC-20260820-04-4**: WHEN a fixture manifest declares an entry point that exists but no
  longer contains the invocation literal for that script THE SYSTEM SHALL fail naming the
  entry-point file and the script (literal: `review.md` declared for `env-preflight.js`
  with the `spec-paths env-preflight` line removed → failure names both) → fixture test
- **AC-20260820-04-5**: WHEN a fixture corpus file invokes `spec-paths <key>` for a script
  whose manifest entry does not declare that file THE SYSTEM SHALL fail naming the
  undeclared call site → fixture test
- **AC-20260820-04-6**: WHEN the live repo is scanned THE SYSTEM SHALL CONTINUE TO pass
  with the manifest as seeded — the green pin that makes every future drift a red diff →
  live-repo test in tests/consistency/entrypoints.test.js

## Assumptions (escalation triggers)

- A1: commands reference scripts only via `spec-paths <key>` (conventions/doctrine.md
  rule: never a literal plugin path) and hooks via `${CLAUDE_PLUGIN_ROOT}` paths in
  hooks.json — the two grep grammars cover all markdown/hook call sites (**the hook grammar was FALSIFIED at build close — see D10**) — **if false**
  (a literal-path invocation is found at build): add that grammar to the forward check,
  record the deviation.
- A2: script-to-script invocations use `path.join(scriptDir|__dirname, '<basename>')` with
  a literal basename (verified in review-legs.js 2026-08-20) — basename grep suffices —
  **if false** (a dynamically-assembled script name): mark that entry `"dynamic": true`
  per D6. **FALSIFIED at build close 2026-08-20** — the shape held for every edge, but the
  *matching rule* derived from it (bare basename) did not: see D9.
- A3: `spec/bin/spec-paths`'s case table is parseable with a line regex
  (`^\s*<key>\)\s+echo "\$ROOT/<relpath>"` shape, verified 2026-08-20) — **if false:**
  the test execs `spec-paths <key>` per key instead (slower, same truth).
- A4: seeding the manifest at build time from post-03 reality means 04 builds after 03
  lands (`depends_on` ordering) — **if false** (03 blocked): seed from current reality
  minus the review-legs entry and note the follow-up edit in 03's File Plan is already
  covered by its own diff plus this test going red — STOP and re-order instead.

## Known Gaps (residual, accepted at build close — D12)

Four false-green holes this guard deliberately does not close. All were found by an
adversarial sweep on 2026-08-20, after the first green gate; each was verified by an
executed repro against a scratch tree. They are accepted because **none of them lets an
executable exist with zero callers undetected** — every one concerns whether a single
already-declared edge is still real, which is strictly narrower than the class that
recurred three times.

1. **Prose satisfies a command's forward check.** A `.md` entry point passes on any
   `spec-paths <key>` mention, including a sentence stating the command *no longer* runs
   it. Not statically decidable: command files are prose, and "run X" and "no longer run
   X" are both mentions; a stricter grammar reds legitimate phrasings the corpus already
   uses (`Run \`spec-paths design-atlas\``). The reverse direction still catches the
   inverse (an undeclared call site).
2. **`"dynamic": true` launders an orphan.** D6's escape hatch suppresses the invocation
   check and constrains nothing about the declared entry point's relation to the script.
   Zero live entries use it; a diff adding one is the review signal.
3. **No reverse leg for script-to-script.** The reverse direction covers `spec-paths` keys
   and `hooks.json` only, so a genuinely new undeclared script-to-script call raises
   nothing and that edge is never protected by the forward check — it can later be severed
   silently. This is the original recurrence shape, one hop removed, and the most serious
   of the four.
4. **A quoted basename inside a prose string still matches.** D9's grammar accepts
   `'<basename>'` anywhere on a non-comment line, including inside a message string.
   Constructible but not live: all 12 script-to-script edges match on a genuine invocation
   line (13 matching lines total, every one an invocation).

**Successor trigger (numeric, not taste).** The accepted design is per-edge bookkeeping,
which pays only while the script-to-script edge count stays small. There are **12** today.
Materially past a dozen, the correct move is to stop declaring edges and assert
**reachability** — every executable reachable from a known entry surface — which closes
gaps 3 and 4 as a side effect and removes the two-direction bookkeeping entirely. It was
wrong to do today for two reasons worth carrying forward: reachability no longer reddens on
a *moved* call site, and this spec's Rationale deliberately wanted renames to trip the
guard; and the zero-dependency rule leaves no JS parser, so script-to-script detection still
bottoms out in text matching even under reachability.

## Rationale

This is the M1 mechanism from the 2026-08-20 root-cause session: the pipeline's checks
carried an undeclared coverage obligation, and each miss (env-preflight was the third)
was fixed at instance level with nothing owning the class. The v7 redesign deleted guard
registries because their rows were prose nobody verified; this manifest differs in the
only way that matters — every row is diffed against executed reality both directions on
every `npm test`, so it can only fail loudly or be deliberately edited, never rot. The
workflows directory is deliberately in scope: roadmap briefs 08/10 delete `wf-*.js` files
and their command invocations, the largest upcoming rewrite of exactly the surface this
guard watches — a scripts-only scope would let the class's biggest future instance pass
silently (agent-verified sequencing input, 2026-08-20). Known accepted cost: the forward
check pins literal invocation strings, so renames trip it — that is the point (a rename
IS a coverage-affecting event), and the fix is a same-diff manifest edit. Per-script
header declarations were rejected for decomposition (30+ file rows) and for touching
frozen workflow scripts outside a design-family spec. Grammar/liveness declarations were
rejected here (D6) because spec 03's executed pair test owns that plane with execution
rather than prose. No post-July-2026 industry source shows this exact declared-vs-actual
entry-point diff — adjacent evidence (dead-code detection, contract testing) supports it;
we are slightly ahead of practice, sized to three File Plan rows.

## Canonical Delta

None — no docs/canonical/ in this repo; plugin.json description carries the changelog.
