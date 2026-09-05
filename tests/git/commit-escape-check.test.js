'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('../helpers')

// specs/20260904/01-commit-time-escape-coverage.md: AC-20260904-01-2, -11, -12, -13.
// commit.md's step 3 still runs the retired git-blame/jq heuristic and spec/entrypoints.json
// has no commit-coverage.js entry yet (D1/D8) — AC-2/AC-11 are TDD red until those land.
// AC-13 pins two SHALL-CONTINUE-TO phrases already present in commit.md today (D8 rewrites
// step 3 around them, never removes them); AC-12 is a version-bump floor.

function extractSection(md, heading) {
  const start = md.indexOf(heading)
  if (start === -1) return null
  const rest = md.slice(start + heading.length)
  const next = rest.search(/\n## /)
  return next === -1 ? rest : rest.slice(0, next)
}

test('AC-20260904-01-2: spec/entrypoints.json holds a spec/scripts/commit-coverage.js entry whose entryPoints is exactly [git/commands/commit.md]', () => {
  const manifest = JSON.parse(read('spec/entrypoints.json'))
  const entry = manifest['spec/scripts/commit-coverage.js']
  assert.ok(entry,
    'D1: spec/entrypoints.json must carry a key "spec/scripts/commit-coverage.js" — a missing entry means the reverse entrypoint-conformance check has no manifest row for the new script, and it silently reads as an orphan or an undocumented entry point')
  assert.deepStrictEqual(entry.entryPoints, ['git/commands/commit.md'],
    'D1: the entryPoints array must contain exactly ["git/commands/commit.md"] — commit.md\'s step 3 is the script\'s sole entry point, and any other value misdocuments who calls it')
})

test('AC-20260904-01-11: git/commands/commit.md step 3 runs commit-coverage.js against --commit HEAD, offers on its offer field, never blocks, and no longer mentions git blame or jq; rule 7 names the fix-typed gate', () => {
  const md = read('git/commands/commit.md')
  const step3 = extractSection(md, '## Step 3')
  assert.ok(step3, 'D8: git/commands/commit.md must still have a "## Step 3" section for the escape check to live in')
  assert.match(step3, /spec-paths commit-coverage/,
    'D8: step 3 must invoke the script through `spec-paths commit-coverage`, the same resolution route every other bundled script uses (§ Risk Tiers, spec-paths)')
  assert.match(step3, /--commit HEAD/,
    'D8: step 3 must pass --commit HEAD — the commit mode is the offer\'s oracle for the commit just made')
  assert.match(step3, /offer/,
    'D8: step 3 must key its AskUserQuestion off the script\'s own `offer` field, never a re-derived heuristic')
  assert.match(step3, /never blocks/,
    'D8: step 3 must state that a non-zero script exit never blocks the commit — the escape check is advisory only')
  assert.ok(!/git blame/.test(md),
    'D8: the retired git-blame heuristic must be gone from commit.md entirely — File Plan membership plus a review row replaces it (D3)')
  assert.ok(!/\bjq\b/.test(md),
    'D8: the retired jq ledger lookup must be gone from commit.md entirely — commit-coverage.js itself reads the ledger now')

  const ruleMatch = md.match(/^7\. .*$/m)
  assert.ok(ruleMatch, 'commit.md must still number rule 7 in its NON-NEGOTIABLE RULES list')
  assert.match(ruleMatch[0], /fix-typed subject/,
    'D8: rule 7 must name the fix-typed-subject gate explicitly, not just "fix-shaped message" — this is the exact D2 vocabulary the rewritten step 3 uses')
})

test('AC-20260904-01-12: both git/.claude-plugin/plugin.json and spec/.claude-plugin/plugin.json declare a strict MAJOR.MINOR.PATCH version, each bumped past its pre-spec baseline', () => {
  const gitManifest = JSON.parse(read('git/.claude-plugin/plugin.json'))
  const specManifest = JSON.parse(read('spec/.claude-plugin/plugin.json'))
  const semver = /^\d+\.\d+\.\d+$/
  assert.match(gitManifest.version, semver,
    'D9: git/.claude-plugin/plugin.json\'s version must be a strict MAJOR.MINOR.PATCH string: got ' + JSON.stringify(gitManifest.version))
  assert.match(specManifest.version, semver,
    'D9: spec/.claude-plugin/plugin.json\'s version must be a strict MAJOR.MINOR.PATCH string: got ' + JSON.stringify(specManifest.version))
  assert.notStrictEqual(gitManifest.version, '1.2.0',
    'D9: this spec changes git/commands/commit.md\'s behavior (step 3 rewritten) — the git plugin\'s version must move past its pre-spec 1.2.0 baseline, or the version-bump discipline (§ Planning) was skipped')
  assert.notStrictEqual(specManifest.version, '7.77.1',
    'D9: this spec ships spec/scripts/commit-coverage.js, a spec-paths key, and an entrypoints.json row — the spec plugin\'s version must move past its pre-spec 7.77.1 baseline, or the version-bump discipline (§ Planning) was skipped')
})

test('AC-20260904-01-13: git/commands/commit.md SHALL CONTINUE TO say the escape offer never blocks the commit and to forbid touching worktrees', () => {
  const md = read('git/commands/commit.md')
  const step3 = extractSection(md, '## Step 3')
  assert.ok(step3, 'commit.md must still have a "## Step 3" section')
  assert.match(step3, /never blocking the commit/,
    'D10: the "never blocking the commit" phrase must survive D8\'s rewrite of step 3 — this spec only changes HOW the offer is derived, never whether it can block')
  assert.match(md, /Never touch worktrees/,
    'D10: the "Never touch worktrees" rule must survive untouched — this spec never edits the worktree-safety rule')
})
