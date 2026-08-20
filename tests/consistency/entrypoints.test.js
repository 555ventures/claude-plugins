'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT, tmpdir } = require('../helpers')

// specs/20260820/04-entrypoint-conformance.md (2026-08-20): the "authored but never
// activated" class has now recurred three times (env-preflight, absent from review, was the
// third — 03-review-observation-truth.md closed that instance). D5 locks the checker logic
// INTO this test file as pure functions over an injectable root — no separate script file —
// exercised against the live repo (green pins, AC-1/AC-6) and against tmpdir() fixtures for
// each red case (AC-2..AC-5). spec/entrypoints.json does not exist on disk yet; the live-repo
// tests below are TDD red until a later worker in this build seeds it (D1, A4). Never weaken
// these assertions to make them pass early — the manifest must actually be seeded and correct.

// ---------------------------------------------------------------------------
// Checker logic (D5): pure functions over an injectable repo root.
// ---------------------------------------------------------------------------

// D1 inventory: spec/scripts/*.js|*.sh + spec/workflows/*.js, excluding spec/scripts/lib/
// (a plain non-recursive listing already excludes lib/ — it is a subdirectory, never a file).
function scanExecutables(root) {
  const dirs = [
    { rel: 'spec/scripts', exts: ['.js', '.sh'] },
    { rel: 'spec/workflows', exts: ['.js'] }
  ]
  const out = []
  for (const { rel, exts } of dirs) {
    const dir = path.join(root, rel)
    if (!fs.existsSync(dir)) continue
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name)
      if (!fs.statSync(full).isFile()) continue
      if (exts.includes(path.extname(name))) out.push(rel + '/' + name)
    }
  }
  return out.sort()
}

function readManifest(root) {
  return JSON.parse(fs.readFileSync(path.join(root, 'spec/entrypoints.json'), 'utf8'))
}

// D8: whether a resolved path falls inside D1's executable-inventory glob shape
// (spec/scripts/*.js|*.sh minus lib/, spec/workflows/*.js). Deliberately a SHAPE test, not
// `scanExecutables(root).includes(p)` — nine live spec-paths keys (shared, shared-design,
// shared-genesis, replay-corpus, template, feedback-template, templates, contract, workflows)
// resolve to doctrine files, templates, or directories, and D4 read literally would demand an
// unsatisfiable manifest entry for each. Using the on-disk listing instead of the glob shape
// would also open a hole the shape test closes for free: a spec-paths key whose target matches
// the glob shape but was deleted from disk (a stale case-table row) still counts as in-domain
// here, so a corpus call site referencing it still surfaces as a reverse-invocation violation
// naming the missing script — it is not silently swallowed just because scanExecutables can no
// longer see the file. (checkInventoryReverse below is the separate, unrelated check for a
// manifest key that itself resolves to a missing file — the two checks stay orthogonal.)
function isExecutableDomainPath(p) {
  if (/^spec\/scripts\/lib\//.test(p)) return false
  if (/^spec\/scripts\/[^/]+\.(js|sh)$/.test(p)) return true
  if (/^spec\/workflows\/[^/]+\.js$/.test(p)) return true
  return false
}

// A3: spec/bin/spec-paths's case table, shape `  <key>) echo "$ROOT/<relpath>" ;;` with
// variable inner whitespace (verified 2026-08-20) — key -> repo-relative script path.
function specPathsKeyMap(root) {
  const src = fs.readFileSync(path.join(root, 'spec/bin/spec-paths'), 'utf8')
  const re = /^\s*([a-z0-9-]+)\)\s+echo "\$ROOT\/([^"]+)"\s*;;/gm
  const map = {}
  let m
  while ((m = re.exec(src)) !== null) map[m[1]] = 'spec/' + m[2]
  return map
}

// Non-recursive single-level listing of a call-site corpus directory (the Contracts "Scan
// surfaces" closed set, D3/D4).
function listFiles(dir, exts) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((name) => {
    const full = path.join(dir, name)
    return fs.statSync(full).isFile() && (!exts || exts.includes(path.extname(name)))
  })
}

function corpusFiles(root) {
  const surfaces = [
    ['spec/commands', ['.md']],
    ['spec/doctrine', ['.md']],
    ['spec/agents', ['.md']],
    ['spec/templates', null],
    ['git/commands', ['.md']],
    ['spec/scripts', ['.js', '.sh']],
    ['spec/workflows', ['.js']]
  ]
  const out = []
  for (const [rel, exts] of surfaces) {
    for (const name of listFiles(path.join(root, rel), exts)) out.push(rel + '/' + name)
  }
  const specPathsRel = 'spec/bin/spec-paths'
  if (fs.existsSync(path.join(root, specPathsRel))) out.push(specPathsRel)
  return out
}

// D1/AC-1/AC-3 direction: every executable has a manifest entry with a non-empty entryPoints
// array ("zero entry points is itself red" — D3 — has no sanctioned orphan form).
function checkInventoryForward(root) {
  const manifest = readManifest(root)
  const executables = scanExecutables(root)
  const orphans = []
  for (const script of executables) {
    const entry = manifest[script]
    if (!entry) { orphans.push(script + ' (no manifest entry)'); continue }
    if (!Array.isArray(entry.entryPoints) || entry.entryPoints.length === 0) {
      orphans.push(script + ' (entryPoints is empty)')
    }
  }
  return orphans
}

// D2/AC-2 direction: every manifest key resolves to an existing file (dangling key).
function checkInventoryReverse(root) {
  const manifest = readManifest(root)
  const dangling = []
  for (const key of Object.keys(manifest)) {
    if (!fs.existsSync(path.join(root, key))) dangling.push(key)
  }
  return dangling
}

// D3/AC-4: every declared entry point exists and actually invokes its script. `.md` entry
// points need the literal `spec-paths <key>`; a `hooks.json` entry point needs a
// `/scripts/<basename>` occurrence; a script-to-script caller needs the basename. An entry
// flagged `"dynamic": true` (D6) still needs the entry-point file to exist, but skips the
// invocation-literal check (a call site grep cannot see).
function checkForwardInvocation(root) {
  const manifest = readManifest(root)
  const keyMap = specPathsKeyMap(root)
  const violations = []
  for (const [script, entry] of Object.entries(manifest)) {
    const eps = Array.isArray(entry.entryPoints) ? entry.entryPoints : []
    for (const ep of eps) {
      const epPath = path.join(root, ep)
      if (!fs.existsSync(epPath)) {
        violations.push(script + ' -> ' + ep + ' (entry-point file does not exist)')
        continue
      }
      if (entry.dynamic) continue
      const epSrc = fs.readFileSync(epPath, 'utf8')
      const basename = path.basename(script)
      let ok
      if (ep.endsWith('.md')) {
        const keys = Object.keys(keyMap).filter((k) => keyMap[k] === script)
        ok = keys.some((k) => new RegExp('spec-paths ' + k + '\\b').test(epSrc))
      } else if (path.basename(ep) === 'hooks.json') {
        ok = epSrc.includes('/scripts/' + basename)
      } else {
        ok = epSrc.includes(basename)
      }
      if (!ok) violations.push(script + ' -> ' + ep + ' (no invocation literal for ' + basename + ' found in ' + ep + ')')
    }
  }
  return violations
}

// D4/AC-5: every `spec-paths <key>` occurrence in the call-site corpus, plus every
// `${CLAUDE_PLUGIN_ROOT}/scripts/<basename>` occurrence in hooks.json, must map to a manifest
// entry that declares the calling file.
function checkReverseInvocation(root) {
  const manifest = readManifest(root)
  const keyMap = specPathsKeyMap(root)
  const violations = new Set()
  for (const file of corpusFiles(root)) {
    const src = fs.readFileSync(path.join(root, file), 'utf8')
    const re = /spec-paths ([a-zA-Z0-9-]+)/g
    let m
    while ((m = re.exec(src)) !== null) {
      const script = keyMap[m[1]]
      if (!script) continue
      if (!isExecutableDomainPath(script)) continue // D8: doctrine/template/directory keys raise nothing
      const entry = manifest[script]
      const declared = !!entry && Array.isArray(entry.entryPoints) && entry.entryPoints.includes(file)
      if (!declared) {
        violations.add(file + ' invokes ' + script + ' via `spec-paths ' + m[1] +
          '` but the manifest entry for ' + script + ' does not declare ' + file + ' as an entry point')
      }
    }
  }
  const hooksRel = 'spec/hooks/hooks.json'
  const hooksPath = path.join(root, hooksRel)
  if (fs.existsSync(hooksPath)) {
    const hooksSrc = fs.readFileSync(hooksPath, 'utf8')
    const re2 = /CLAUDE_PLUGIN_ROOT\}"?\/scripts\/([\w.-]+\.(?:js|sh))/g
    let m2
    while ((m2 = re2.exec(hooksSrc)) !== null) {
      const basename = m2[1]
      const script = Object.keys(manifest).find((s) => s.startsWith('spec/scripts/') && path.basename(s) === basename)
      if (!script) continue
      const entry = manifest[script]
      const declared = !!entry && Array.isArray(entry.entryPoints) && entry.entryPoints.includes(hooksRel)
      if (!declared) {
        violations.add(hooksRel + ' invokes ' + script + ' via ${CLAUDE_PLUGIN_ROOT}/scripts/' + basename +
          ' but the manifest entry for ' + script + ' does not declare ' + hooksRel + ' as an entry point')
      }
    }
  }
  return [...violations]
}

function writeTree(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content)
  }
}

// ---------------------------------------------------------------------------
// AC-20260820-04-1 / AC-20260820-04-6: live-repo pins.
// ---------------------------------------------------------------------------

test('AC-20260820-04-1: every executable in spec/scripts/*.js|*.sh and spec/workflows/*.js, excluding spec/scripts/lib/, has a spec/entrypoints.json entry', () => {
  const manifestPath = path.join(ROOT, 'spec/entrypoints.json')
  assert.ok(fs.existsSync(manifestPath),
    'spec/entrypoints.json does not exist — D1 requires one central manifest entry per ' +
    'executable in spec/scripts and spec/workflows; without it this repo has zero entry-point ' +
    'coverage and every script in scope is a silent, undetected orphan (the exact class this ' +
    'spec exists to close, third recurrence: env-preflight)')

  const executables = scanExecutables(ROOT)
  assert.ok(executables.includes('spec/workflows/wf-panel.js'),
    'the inventory glob must include spec/workflows/*.js — a scan that misses wf-panel.js ' +
    'would leave the design/enforce workflow family entirely uncovered by this guard, the ' +
    'largest upcoming rewrite this spec is deliberately sized to watch')
  assert.ok(!executables.includes('spec/scripts/lib/host-config.js'),
    'the inventory glob must exclude spec/scripts/lib/ — lib/ holds shared modules, not entry ' +
    'points; including host-config.js would demand a manifest row for a file nothing directly ' +
    'invokes, forcing an unenforceable entry list')

  const orphans = checkInventoryForward(ROOT)
  assert.deepStrictEqual(orphans, [],
    'every executable in spec/scripts and spec/workflows (minus lib/) must have a manifest ' +
    'entry with at least one declared entry point — an orphan here means a script exists that ' +
    'the manifest never accounts for, silently reopening the "authored but never activated" ' +
    'class: ' + JSON.stringify(orphans))
})

test('AC-20260820-04-6: the live repo, scanned in both inventory directions and both invocation directions, reports zero violations — the green pin every future drift turns red', () => {
  const manifestPath = path.join(ROOT, 'spec/entrypoints.json')
  assert.ok(fs.existsSync(manifestPath),
    'spec/entrypoints.json does not exist — the comprehensive live-repo green pin cannot run ' +
    'until the manifest is seeded from post-03 reality (D1, A4); every check below is ' +
    'unfalsifiable while the file is absent')

  const forwardOrphans = checkInventoryForward(ROOT)
  assert.deepStrictEqual(forwardOrphans, [],
    'an executable missing from (or empty in) the seeded manifest means the seeding step ' +
    'itself is incomplete against the live repo: ' + JSON.stringify(forwardOrphans))

  const dangling = checkInventoryReverse(ROOT)
  assert.deepStrictEqual(dangling, [],
    'a manifest key resolving to a file that does not exist on disk means the seeded manifest ' +
    'documents a script that was already deleted, or the key was mistyped: ' + JSON.stringify(dangling))

  const forwardViolations = checkForwardInvocation(ROOT)
  assert.deepStrictEqual(forwardViolations, [],
    'a declared entry point that does not actually invoke its script means the manifest ' +
    'overclaims coverage it cannot back with an executed grep — every future rename or deleted ' +
    'call site must land here as a red diff, never silently: ' + JSON.stringify(forwardViolations))

  const reverseViolations = checkReverseInvocation(ROOT)
  assert.deepStrictEqual(reverseViolations, [],
    'a `spec-paths <key>` or hooks.json call site the manifest does not know about means the ' +
    'manifest is incomplete in the direction that matters most — an invocation nobody declared: ' +
    JSON.stringify(reverseViolations))
})

// ---------------------------------------------------------------------------
// AC-20260820-04-2: dangling manifest key (fixture).
// ---------------------------------------------------------------------------

test('AC-20260820-04-2: a manifest key naming a script file that does not exist on disk fails naming the dangling key', () => {
  const root = tmpdir('entrypoints-ac2')
  writeTree(root, {
    'spec/scripts/real.js': '#!/usr/bin/env node\n',
    'spec/entrypoints.json': JSON.stringify({
      'spec/scripts/real.js': { entryPoints: ['spec/commands/a.md'] },
      'spec/scripts/deleted.js': { entryPoints: ['spec/commands/a.md'] }
    })
  })
  const dangling = checkInventoryReverse(root)
  assert.deepStrictEqual(dangling, ['spec/scripts/deleted.js'],
    'a manifest key pointing at a deleted script must be reported by exact key name — a ' +
    'reader who deleted spec/scripts/deleted.js and forgot the manifest gets no signal ' +
    'otherwise, and the dangling row rots forever: ' + JSON.stringify(dangling))
})

// ---------------------------------------------------------------------------
// AC-20260820-04-3: orphan script — missing entry, and empty entryPoints (fixture).
// ---------------------------------------------------------------------------

test('AC-20260820-04-3 (missing entry): an executable script with no manifest entry at all fails naming the orphan script', () => {
  const root = tmpdir('entrypoints-ac3a')
  writeTree(root, {
    'spec/scripts/orphan.js': '#!/usr/bin/env node\n',
    'spec/entrypoints.json': JSON.stringify({})
  })
  const orphans = checkInventoryForward(root)
  assert.deepStrictEqual(orphans, ['spec/scripts/orphan.js (no manifest entry)'],
    'a script with zero manifest coverage must be reported by name — this is the exact defect ' +
    'shape (env-preflight, third recurrence) the manifest exists to catch at the diff that ' +
    'introduces it: ' + JSON.stringify(orphans))
})

test('AC-20260820-04-3 (empty entryPoints): an executable script whose manifest entry has an empty entryPoints array fails naming the orphan script', () => {
  const root = tmpdir('entrypoints-ac3b')
  writeTree(root, {
    'spec/scripts/orphan.js': '#!/usr/bin/env node\n',
    'spec/entrypoints.json': JSON.stringify({ 'spec/scripts/orphan.js': { entryPoints: [] } })
  })
  const orphans = checkInventoryForward(root)
  assert.deepStrictEqual(orphans, ['spec/scripts/orphan.js (entryPoints is empty)'],
    'an empty entryPoints array is not a sanctioned way to declare an orphan (D3: "zero entry ' +
    'points is itself red") — treating it as satisfied coverage would let a script ship with a ' +
    'manifest row that declares nothing and still reads as green: ' + JSON.stringify(orphans))
})

// ---------------------------------------------------------------------------
// AC-20260820-04-4: declared entry point that no longer invokes the script (fixture).
// ---------------------------------------------------------------------------

test('AC-20260820-04-4: a declared entry point whose spec-paths invocation literal was removed fails naming both the entry-point file and the script', () => {
  const root = tmpdir('entrypoints-ac4')
  writeTree(root, {
    'spec/scripts/env-preflight.js': '#!/usr/bin/env node\n',
    'spec/bin/spec-paths': '#!/usr/bin/env bash\nset -u\nROOT="$(pwd)"\ncase "${1:-root}" in\n  env-preflight)  echo "$ROOT/scripts/env-preflight.js" ;;\nesac\n',
    'spec/commands/review.md': '# Review\n\nRun the preflight step before continuing.\n', // the `spec-paths env-preflight` line has been removed
    'spec/entrypoints.json': JSON.stringify({
      'spec/scripts/env-preflight.js': { entryPoints: ['spec/commands/review.md'] }
    })
  })
  const violations = checkForwardInvocation(root)
  assert.strictEqual(violations.length, 1,
    'exactly one forward-invocation violation is expected once the invocation literal is ' +
    'removed while the manifest still declares the entry point: ' + JSON.stringify(violations))
  assert.match(violations[0], /review\.md/,
    'the violation must name the entry-point file (review.md) — without it a reader cannot ' +
    'tell which of possibly many declared entry points went stale: ' + violations[0])
  assert.match(violations[0], /env-preflight\.js/,
    'the violation must name the script (env-preflight.js) — without it a reader cannot tell ' +
    'which manifest row to look at: ' + violations[0])
})

// ---------------------------------------------------------------------------
// AC-20260820-04-5: undeclared call site (fixture).
// ---------------------------------------------------------------------------

test('AC-20260820-04-5: a corpus file invoking spec-paths for a script whose manifest entry does not declare that file fails naming the undeclared call site', () => {
  const root = tmpdir('entrypoints-ac5')
  writeTree(root, {
    'spec/scripts/widget.js': '#!/usr/bin/env node\n',
    'spec/bin/spec-paths': '#!/usr/bin/env bash\nset -u\nROOT="$(pwd)"\ncase "${1:-root}" in\n  widget)  echo "$ROOT/scripts/widget.js" ;;\nesac\n',
    'spec/commands/build.md': '# Build\n\nRun `node "$(spec-paths widget)" --root .` here.\n',
    // manifest exists for the script but never learned about build.md's call site
    'spec/entrypoints.json': JSON.stringify({
      'spec/scripts/widget.js': { entryPoints: ['spec/commands/other.md'] }
    })
  })
  const violations = checkReverseInvocation(root)
  assert.strictEqual(violations.length, 1,
    'exactly one reverse-invocation violation is expected for the one undeclared spec-paths ' +
    'call site: ' + JSON.stringify(violations))
  assert.match(violations[0], /spec\/commands\/build\.md/,
    'the violation must name the undeclared call site (spec/commands/build.md) — without it ' +
    'the manifest\'s lie about coverage ("nothing calls this that I don\'t know about") is ' +
    'invisible to a reader: ' + violations[0])
  assert.match(violations[0], /widget\.js/,
    'the violation must name the invoked script (widget.js) so a reader knows which manifest ' +
    'entry to fix: ' + violations[0])
})

test('AC-20260820-04-5 / D8: a spec-paths key resolving to a non-executable (a doctrine file) raises no reverse-invocation violation, while a sibling undeclared executable-key invocation still does', () => {
  const root = tmpdir('entrypoints-ac5-d8')
  writeTree(root, {
    'spec/scripts/widget.js': '#!/usr/bin/env node\n',
    'spec/doctrine/core.md': '## Something\n\ncontent\n',
    'spec/bin/spec-paths':
      '#!/usr/bin/env bash\nset -u\nROOT="$(pwd)"\ncase "${1:-root}" in\n' +
      '  widget)  echo "$ROOT/scripts/widget.js" ;;\n' +
      '  shared)  echo "$ROOT/doctrine/core.md" ;;\n' +
      'esac\n',
    'spec/commands/build.md':
      '# Build\n\nRead `spec-paths shared` for doctrine, then run ' +
      '`node "$(spec-paths widget)" --root .` here.\n',
    // manifest never learned about build.md for widget.js, and (per D1) carries no entry at
    // all for spec/doctrine/core.md — a non-executable can never be a manifest key
    'spec/entrypoints.json': JSON.stringify({
      'spec/scripts/widget.js': { entryPoints: ['spec/commands/other.md'] }
    })
  })
  const violations = checkReverseInvocation(root)
  assert.strictEqual(violations.length, 1,
    'D8 narrows the reverse check to spec-paths keys resolving inside D1\'s executable ' +
    'inventory — `spec-paths shared` (resolving to spec/doctrine/core.md) must raise nothing, ' +
    'so the only violation expected is the sibling undeclared widget.js call site; a second ' +
    'violation here means the doctrine key was not filtered out: ' + JSON.stringify(violations))
  assert.ok(!violations.some((v) => v.includes('core.md') || v.includes('doctrine')),
    'no violation may name spec/doctrine/core.md or reference doctrine at all — D4 read ' +
    'literally would demand a manifest entry for a doctrine file, which is unsatisfiable under ' +
    'D1 (the manifest keys executables only): ' + JSON.stringify(violations))
  assert.match(violations[0], /widget\.js/,
    'the sibling undeclared executable-key invocation (widget) must still be caught — D8 ' +
    'narrows the domain the reverse check considers, it does not disable the check for keys ' +
    'that remain in-domain: ' + violations[0])
})
