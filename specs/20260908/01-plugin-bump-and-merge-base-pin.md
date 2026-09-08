---
date: 2026-09-08
status: superseded
superseded_by: direct fix on 2026-09-08 — scope was four host files, below the pipeline-entry bar (core § Pipeline Entry); kept as the design record for scripts/plugin-bump.js
tier: standard
area: plugin-versioning
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: n/a
open_markers: 0
---

# Plugin bump script and merge-base version pin

## Goal

Specs in this repo stop naming a plugin version number. Today every spec that changes the
`spec` plugin carries a Decision row with a literal target ("bump to 7.98.0") plus a prose
ledger of which sibling spec claims which number; the ledger is stale the moment any sibling
merges, and the only check that a bump happened at all is a reviewer reading prose. After this
lands, a host script derives the next minor and rotates the changelog, and a gate test proves
against the merge base that a change under a plugin directory came with a higher version.
Done means: `node scripts/plugin-bump.js --check` is green in the gate, a spec branch that
edits `spec/**` without a bump goes red with a remedy line, and the pipeline rules tell
planners to cite the script instead of a number.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | `scripts/plugin-bump.js --check [--base <ref>] [--root <dir>]` is the deterministic pin: for every plugin in `.claude-plugin/marketplace.json`, if `git diff --name-only <base> HEAD -- <source>/` lists any path other than `<source>/.claude-plugin/plugin.json`, the manifest `version` at HEAD must compare strictly greater, numerically per component, than the manifest `version` at `<base>` (read via `git show <base>:<path>`). Exit 0 green; exit 1 red with one line per offending plugin naming the plugin, both versions, and the remedy command (AC-20260908-01-1, AC-20260908-01-2, AC-20260908-01-3, AC-20260908-01-4) | The host rule "behavior change ⇒ bump" was enforced by a reviewer reading prose; core § Rule Enforcement calls that a strict downgrade when a script can check it. Rejected: a plugin-side review leg — see D7. |
| D2 | `scripts/plugin-bump.js --bump --plugin <name> --changelog "<paragraph>" [--root <dir>] [--dry-run]` rewrites `<source>/.claude-plugin/plugin.json`: `version` → minor+1, patch 0; the `description`'s `Changelog (last 3): ` run gains `<new> — <paragraph>` at its head (a trailing `.` appended when the paragraph lacks one), the previous two entries follow, the oldest is dropped, so exactly three remain; the file is written as `JSON.stringify(manifest, null, 2) + '\n'`; the new version is printed on stdout (AC-20260908-01-6, AC-20260908-01-7) | The number and the rotation are mechanical; only the paragraph is prose. Rejected: workers editing the JSON by hand — that is how a fourth changelog entry and a stale number reach the tree. |
| D3 | Rule scope is "any change under a marketplace plugin directory except its own manifest", not "behavior change": a comment-only edit under `spec/` also owes a bump; a `description`-only manifest edit owes none (AC-20260908-01-3) | A script cannot tell a behavior change from a chore, and specs here already reason "nothing under `spec/` changes → no bump" (specs/20260907/02 D6). Rejected: a path allowlist of "non-behavior" files — a new hole per entry. |
| D4 | Base derivation for `--check`: `--base <ref>` when given; else `git merge-base HEAD main`; else `git merge-base HEAD origin/main`; none resolvable → exit 2 naming `git fetch origin main:main` as the remedy, never exit 0 (AC-20260908-01-5) | The gate has no sanctioned skips (pipeline rules § Test Rules); an unresolvable base is a broken checkout, not a pass. This repo has no CI workflows (A1), so `main` is present wherever the gate runs. |
| D5 | Pipeline rules `.claude/rules/spec-pipeline.md` § Planning's version-bump bullet says: a plugin.json File Plan row cites `node scripts/plugin-bump.js --bump --plugin <name> --changelog "<paragraph>"` and names no version literal and no sibling claims; § Review Checks' bump line gains "pinned by `scripts/plugin-bump.js --check` in the gate". `.claude/rules/conventions/doctrine.md`'s bump bullet cites the script the same way `[no-ac: prose grounding — regexes over prose are not tests; AC-20260908-01-1 is the mechanism]` | One binding home per rule (core § Doctrine Authoring): the script is the rule, the prose points at it. |
| D6 | No plugin.json bump in this spec: no path under `spec/`, `git/`, or `style/` changes `[no-ac: the absence of a bump is not a testable surface; AC-20260908-01-1 run on this repo proves the rule is satisfied]` | Version discipline binds plugin behavior; host scripts, tests and rules are not the plugin. |
| D7 | The check ships as a host gate test under core § Rule Enforcement, NOT as a plugin review leg or standing guard. Admission bar (core § Incident Policy), filled from `node "$(spec-paths fleet-reader)" --json` on 2026-09-08: Materiality **0** (`escapes.byClass` = `{unclassed: 3}`, `escapes.incidents` = 0 — no version class exists in any ledger); Generality **0** ledger-recorded members (the re-targets in specs/20260907/04, 05, 06, 08 were plan-time edits, never ledger rows). Two of five fields unfillable → the guard proposal is rejected. Reopen condition: `escapes.byClass` reports a version-bump class with count ≥ 3 `[no-ac: a rejection has no surface]` | Doctrine forbids a plugin guard the ledger has not earned, and forbids a host-specific fork (this repo's manifest path) inside plugin scripts (core § Host Grounding). The host gate is the sanctioned route for a host rule. |
| D8 | The nine `specs/20260907/*` siblings are not edited here. A queued follow-up (spec-queue, `--after-spec` this spec) drops the version literals and sibling-claim prose from the sibling Decision rows still `status: hardened` when it runs, replacing them with the D2 command; `04` (implementing) and `08` (re-targeted on another machine, uncommitted) are excluded `[no-ac: spec prose]` | Editing hardened siblings now collides with in-flight branches and with uncommitted edits elsewhere; after this lands the literal is inert (the worker runs `--bump`) and the cleanup is noise removal. |
| D9 | `--bump` refuses (exit 2, nothing written) a manifest whose `description` has no `Changelog (last 3): ` run — today `git` and `style` — naming the remedy: add the run, or bump by hand and let `--check` verify. It also refuses an empty or missing `--changelog`, and a `--plugin` name absent from marketplace.json (AC-20260908-01-8) | The repo convention is "description is the changelog surface" (pipeline rules § Planning); a silent version-only bump would ship a behavior change with no changelog. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| scripts/plugin-bump.js | CREATE | scripts | D1–D4, D9: `--check` (merge-base version pin over marketplace plugins) and `--bump` (next minor + changelog rotation); header per Worker Rules, exit codes 0/1/2 |
| tests/consistency/plugin-bump.test.js | CREATE | tests | AC-20260908-01-1, AC-20260908-01-2, AC-20260908-01-3, AC-20260908-01-4, AC-20260908-01-5, AC-20260908-01-6, AC-20260908-01-7, AC-20260908-01-8 |
| .claude/rules/spec-pipeline.md | MODIFY | other | D5: § Planning bump bullet cites the script and bans version literals/sibling claims in Decisions; § Review Checks bump line points at `--check` |
| .claude/rules/conventions/doctrine.md | MODIFY | other | D5: the bump bullet cites `scripts/plugin-bump.js --bump` |

## Contracts

```
scripts/plugin-bump.js  (Node built-ins only: fs, path, child_process)

  --check [--base <ref>] [--root <dir>]
      root defaults to process.cwd(); reads <root>/.claude-plugin/marketplace.json
      (plugins[].name, plugins[].source — source is "./<dir>").
      base: --base | merge-base(HEAD, main) | merge-base(HEAD, origin/main) | exit 2
      per plugin: changed = git diff --name-only <base> HEAD -- <dir>/   minus <dir>/.claude-plugin/plugin.json
                  changed empty → "✅ <name> <version> (no change under <dir>/)"
                  else headV = JSON.parse(read(<dir>/.claude-plugin/plugin.json)).version
                       baseV = JSON.parse(git show <base>:<dir>/.claude-plugin/plugin.json).version
                               (manifest absent at base → baseV = 0.0.0)
                       cmp(headV, baseV) > 0 numerically per component → "✅ <name> <baseV> → <headV>"
                       else → "❌ <name>: <dir>/ changed since <base7> but version is <headV> (base <baseV>) —
                               remedy: node scripts/plugin-bump.js --bump --plugin <name> --changelog \"<paragraph>\"
                               (behind the base? merge or rebase onto <base7> first)"
      exit 0 = every plugin green · 1 = at least one ❌ line · 2 = usage, unreadable marketplace/manifest,
      non-semver version, or unresolvable base ("remedy: git fetch origin main:main or pass --base <ref>")

  --bump --plugin <name> --changelog "<paragraph>" [--root <dir>] [--dry-run]
      next = MAJOR.(MINOR+1).0
      description = head + "Changelog (last 3): " + next + " — " + paragraph(+".") + " " + entry[0] + " " + entry[1]
        where entries = tail.split(/(?=\b\d+\.\d+\.\d+ — )/) trimmed; entries.length must be 3 before the bump
      write JSON.stringify(manifest, null, 2) + "\n"   (byte-identical round trip verified on the real manifest)
      stdout: the new version, one line. --dry-run: same stdout, no write.
      exit 0 = written (or dry-run) · 2 = no "Changelog (last 3): " run, empty --changelog, unknown --plugin,
      non-semver version, or unreadable manifest (message names the remedy; nothing written)
```

## Behavior

- **Gate wiring.** `tests/consistency/plugin-bump.test.js` executes `node scripts/plugin-bump.js
  --check` at the repo root once (AC-1). Because it lives in the gate, the pin runs at build's
  final gate, review's `gate` and `suite` legs, and `npm test` — wired where the class occurs.
  Every other test in that file runs the script against a synthetic host in `tmpdir()` built
  with `gitRepo()`: a marketplace with one plugin, a manifest at a version, a `main` branch, a
  feature branch with an edit under the plugin directory.
- **The stale-sibling case.** Branch A bumps 7.102.0 → 7.103.0 and merges. Branch B, cut
  earlier, still reads 7.102.0 and edited `spec/**`. After B rebases onto main, `--check` sees
  base 7.103.0, HEAD 7.102.0 → red with the "behind the base" remedy. Before the rebase, B's
  base is the old merge-base, and its own bump to 7.103.0 reads green; the number collision then
  surfaces as a plugin.json merge conflict, which git already reports — no second oracle for
  "free" is built (D1 rationale).
- **Bump flow for a spec.** The plugin.json File Plan row reads "D<n>: bump via `node
  scripts/plugin-bump.js --bump --plugin spec --changelog "<paragraph>"`". The doctrine worker
  runs it; no number appears in the spec. A `--dry-run` prints what the number will be.
- **Manifest-only edits** (description typo, changelog wording) owe no bump: the manifest path
  is excluded from the changed set (D3).
- **Refusals** print one stderr line starting `plugin-bump: ` naming the remedy and exit 2
  without touching the manifest (D4, D9).

## Acceptance Criteria

- **AC-20260908-01-1**: WHEN `node scripts/plugin-bump.js --check` runs with cwd at this
  repo's root on the committed checkout THE SYSTEM SHALL exit 0 and print one `✅` line per
  marketplace plugin (`spec`, `git`, `style`) → test "the repo's own plugins satisfy the
  merge-base version rule" in `tests/consistency/plugin-bump.test.js`
- **AC-20260908-01-2**: WHEN a synthetic host's feature branch changes `spec/x.js` and leaves
  `spec/.claude-plugin/plugin.json` at the base version THE SYSTEM SHALL exit 1 and print a
  `❌ spec:` line containing both versions and the literal substring `--bump --plugin spec`
  (e.g. base `7.1.0`, HEAD `7.1.0` → exit 1; base `7.9.0`, HEAD `7.11.0` → exit 0 — the
  comparator is numeric, `7.11.0 > 7.9.0`) → tests "an unbumped change under a plugin
  directory is red with the bump remedy" and "the comparator ranks 7.11.0 above 7.9.0" in
  `tests/consistency/plugin-bump.test.js`
- **AC-20260908-01-3**: WHEN nothing under a plugin directory except its own manifest changed
  between base and HEAD THE SYSTEM SHALL exit 0 regardless of version (HEAD equal to `main` →
  exit 0; a `description`-only edit at the same version → exit 0) → tests "no change under the
  plugin directory owes no bump" and "a manifest-only edit owes no bump" in
  `tests/consistency/plugin-bump.test.js`
- **AC-20260908-01-4**: WHEN HEAD's version is numerically lower than the base's and a path
  under the plugin directory changed (base `7.3.0`, HEAD `7.2.0`) THE SYSTEM SHALL exit 1 and
  the `❌` line SHALL contain the substring `rebase onto` → test "a branch behind a bumped base
  is red with the rebase remedy" in `tests/consistency/plugin-bump.test.js`
- **AC-20260908-01-5**: WHEN neither `--base` is given nor `main` nor `origin/main` resolves
  (a synthetic repo whose only branch is `trunk`) THE SYSTEM SHALL exit 2 and print a stderr
  line containing `git fetch origin main:main`; WHEN `--base trunk` is given on that same repo
  THE SYSTEM SHALL run the check against `trunk` and exit 0 or 1 by the rule → tests "an
  unresolvable base is a refusal, never a pass" and "--base overrides the derivation" in
  `tests/consistency/plugin-bump.test.js`
- **AC-20260908-01-6**: WHEN `--bump --plugin spec --changelog "adds X"` runs on a manifest
  at `7.102.0` whose description carries `Changelog (last 3): 7.102.0 — a. 7.101.0 — b.
  7.100.0 — c.` THE SYSTEM SHALL rewrite it to `version` `7.103.0`, description tail
  `Changelog (last 3): 7.103.0 — adds X. 7.102.0 — a. 7.101.0 — b.`, print `7.103.0` on
  stdout, and the file bytes SHALL equal `JSON.stringify(JSON.parse(file), null, 2) + '\n'`
  (`7.9.3` → `7.10.0` for the patch-reset case) → tests "bump advances the minor, resets the
  patch, and rotates the changelog to three entries" and "the rewritten manifest is
  byte-stable under a JSON round trip" in `tests/consistency/plugin-bump.test.js`
- **AC-20260908-01-7**: WHEN `--bump … --dry-run` runs THE SYSTEM SHALL print the next
  version on stdout, exit 0, and leave the manifest bytes unchanged → test "--dry-run prints
  the next version and writes nothing" in `tests/consistency/plugin-bump.test.js`
- **AC-20260908-01-8**: WHEN `--bump` targets a manifest without a `Changelog (last 3): ` run,
  or `--changelog` is empty or missing, or `--plugin` names a plugin absent from
  marketplace.json THE SYSTEM SHALL exit 2, print a stderr line starting `plugin-bump: ` that
  names a remedy, and leave the manifest bytes unchanged → test "bump refusals name the remedy
  and write nothing" in `tests/consistency/plugin-bump.test.js`

## Assumptions (escalation triggers)

- A1: `main` resolves in every checkout where the gate runs — executed 2026-09-08: `ls
  .github/workflows` → no such directory (no CI, so no shallow clones); `git merge-base HEAD
  main` → `59a2ded`; `git show 59a2ded:spec/.claude-plugin/plugin.json` → version `7.100.0`.
  — **if false** (CI added with a shallow checkout): `--check` exits 2 red in CI; the fix is
  `fetch-depth: 0` or `git fetch origin main:main` in the workflow, never a pass on
  unresolvable.
- A2: The real manifest round-trips byte-identically through `JSON.stringify(m, null, 2) +
  '\n'` — executed: `roundtrip identical: true` (3462 bytes both sides). — **if false** on
  some manifest: the worker formats to that manifest's existing style and returns `blocked`
  naming the byte diff.
- A3: The changelog run splits into exactly three entries at `/(?=\b\d+\.\d+\.\d+ — )/` and
  re-joins identically — executed on the real manifest: entries `7.102.0`, `7.101.0`,
  `7.100.0`; `reconstruct identical: true`. — **if false** (a paragraph containing a bare
  `N.N.N — `): the split over-counts; `--bump` refuses (entries ≠ 3) and the paragraph is
  reworded.
- A4: Falsifiability — executed on a scratch git host (main at 7.1.0, branch editing
  `spec/x.js`): no bump → `{"verdict":"RED"}`; bump to 7.2.0 → `GREEN`; on `main` → `GREEN`;
  this repo (HEAD 7.102.0, base 7.100.0, 11 changed paths under `spec/`) → `GREEN`. — **if
  false** at build (the authored script disagrees with the spike): the spike logic in this
  spec's Contracts is the contract; the script is wrong.
- A5: No exhaustive live-file pin enumerates host `scripts/*` — executed: `tests/consistency/
  entrypoints.test.js` pins `spec/scripts` and `spec/workflows` only. — **if false**: update the
  pin in place and retag with AC-20260908-01-1, never weaken.
- A6: `.claude-plugin/marketplace.json` lists `spec → ./spec`, `git → ./git`, `style →
  ./style`; only `spec`'s description carries the changelog marker (`grep -c` on git → 0). —
  **if false**: D9's refusal set changes; nothing else does.
- A7: `tests/helpers.js` exports `gitRepo(dir, opts)` (creates `main`, one commit) and
  `tmpdir(prefix)`; `runNode` prefixes `SPEC/` so the tests spawn `process.execPath` with
  `ROOT/scripts/plugin-bump.js` directly — **if false**: the test worker reads the helper
  first and adapts; never adds a helper to the plugin.

## Rationale

The report that triggered this spec claimed "the review's version-bump check does not exist".
It exists as prose: pipeline rules § Review Checks marks a bump-less behavior change hard, and
§ Gotchas already says the build bumps to the next free number and treats the spec's literal
as a target. What did not exist was a mechanism. `tests/consistency/plugin-version.test.js`
pins shape, a fixed 7.11.0 floor and the three-entry changelog — it is green when a bump is
skipped or a shipped number is reused. So nine specs carried literal targets and a hand-kept
ledger of sibling claims that went stale on every merge (05/06 were re-targeted in commit
59a2ded; 04 and 08 again on another machine).

Two design forks fell to doctrine, not taste. First, where the derivation lives: the plugin's
build driver cannot know this repo's manifest path without a host-specific fork inside a
plugin script, which core § Host Grounding forbids — so the script is a host script under
`scripts/`, the same home as `spec-patterns.sh`. Second, whether the check is a plugin review
leg: core § Incident Policy admits a standing guard only on a third ledger-recorded recurrence
with all five bar fields filled. The fleet reader shows no version class at all (Materiality 0,
Generality 0), because every re-target was a plan-time edit that no ledger records. A guard
proposal therefore fails; the deterministic check ships instead as a host gate test under
core § Rule Enforcement, which needs no bar — it mechanizes a rule the host already declares.
If a version class ever reaches three in `escapes.byClass`, D7's reopen condition names the
query.

Fragile points: the check compares against `main`, so a chained sibling series on one branch
is measured per branch, not per spec — a second behavior change on a branch that already
bumped once passes mechanically and is left to the reviewer's prose check (the judgment
residue core § Rule Enforcement keeps with the reviewer). The rule is also stricter than
"behavior change": any edit under a plugin directory owes a bump (D3), which is cheap and is
how this repo already reasons.

Collision closure at lock (`--literal "Version bump discipline" --literal "version-bump"`):
the paths leg names no test that executes a planned file; the literals leg hits
`.claude/rules/spec-pipeline.md` (in the File Plan) and three tests —
`tests/consistency/plugin-version.test.js`, `tests/fleet-reader/doctrine-pins.test.js`,
`tests/git/commit-escape-check.test.js` — each of which mentions "version-bump" only inside a
comment or an assert message on a per-spec version floor; none asserts the bullet's wording.
All three are **waived**: no fixture repair is owed.

No regression pin is written: no existing script or test is modified. `plugin-version.test.js`
keeps its form and keeps running; the `--check` pin is additive beside it. The § Gotchas entry
about literal targets stays true and harmless until a review close prunes it.

## Canonical Delta

`docs/canonical/doctrine-governance.md`, the **Version discipline** bullet becomes:

- **Version discipline:** every change under a marketplace plugin directory bumps that
  plugin's semver via `node scripts/plugin-bump.js --bump --plugin <name> --changelog
  "<paragraph>"`, which derives the next minor and rotates `plugin.json`'s `description`
  changelog to its last three entries. Specs cite the command, never a version number.
  `node scripts/plugin-bump.js --check` runs in the gate and is red when a plugin directory
  changed since the merge base without a higher version.
