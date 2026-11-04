'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT } = require('../helpers')


// specs/20260820/04-entrypoint-conformance.md: every executable under spec/scripts/ (minus lib/)
// and spec/workflows/ has a spec/entrypoints.json row, every declared entry point really invokes
// its script (spec-paths key, quoted path, or hooks.json command), and every invocation site is
// declared. The checker below is pure functions over a root; the tests run it on the live repo.


function isExecutableName(_name) {
  return true
}

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return []
  let out = []
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const st = fs.statSync(full)
    if (st.isDirectory()) out = out.concat(walkFiles(full))
    else if (st.isFile()) out.push(full)
  }
  return out
}

function scanExecutables(root) {
  const out = []
  const scriptsRoot = path.join(root, 'spec/scripts')
  const libRoot = path.join(root, 'spec/scripts/lib')
  for (const full of walkFiles(scriptsRoot)) {
    if (full === libRoot || full.startsWith(libRoot + path.sep)) continue
    if (!isExecutableName(path.basename(full))) continue
    out.push(path.relative(root, full).split(path.sep).join('/'))
  }
  for (const full of walkFiles(path.join(root, 'spec/workflows'))) {
    if (!isExecutableName(path.basename(full))) continue
    out.push(path.relative(root, full).split(path.sep).join('/'))
  }
  return out.sort()
}

function readManifest(root) {
  return JSON.parse(fs.readFileSync(path.join(root, 'spec/entrypoints.json'), 'utf8'))
}

function isExecutableDomainPath(p) {
  if (/^spec\/scripts\/lib\//.test(p)) return false
  if (/^spec\/scripts\//.test(p) || /^spec\/workflows\//.test(p)) {
    return isExecutableName(p.split('/').pop())
  }
  return false
}

// A3: spec/bin/spec-paths's case table, shape `  <key>) echo "$ROOT/<relpath>" ;;` with
// variable inner whitespace (verified) — key -> repo-relative script path.
function specPathsKeyMap(root) {
  const src = fs.readFileSync(path.join(root, 'spec/bin/spec-paths'), 'utf8')
  const re = /^\s*([a-z0-9-]+)\)\s+echo "\$ROOT\/([^"]+)"\s*;;/gm
  const map = {}
  let m
  while ((m = re.exec(src)) !== null) map[m[1]] = 'spec/' + m[2]
  return map
}

function checkKeyReachability(root) {
  const keyMap = specPathsKeyMap(root)
  const inventory = new Set(scanExecutables(root))
  const violations = []
  for (const [key, target] of Object.entries(keyMap)) {
    if (!/^spec\/(scripts|workflows)\//.test(target)) continue
    if (!inventory.has(target)) {
      violations.push('spec-paths key "' + key + '" resolves to ' + target +
        ', which is not in the executable inventory (missing from disk, or excluded by the ' +
        'scan rules) — the key is a dead or unreachable reference')
    }
  }
  return violations
}

function collectHookCommandStrings(node, out) {
  if (Array.isArray(node)) {
    for (const item of node) collectHookCommandStrings(item, out)
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'command' && typeof v === 'string') out.push(v)
      else collectHookCommandStrings(v, out)
    }
  }
  return out
}

function scriptPathsFromCommand(cmd) {
  const re = /\/(scripts|workflows)\/([^\s"'`]+)/g
  const out = []
  let m
  while ((m = re.exec(cmd)) !== null) out.push('spec/' + m[1] + '/' + m[2])
  return out
}

function parseHookScriptPaths(root) {
  const hooksPath = path.join(root, 'spec/hooks/hooks.json')
  if (!fs.existsSync(hooksPath)) return { ok: true, paths: new Set() }
  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(hooksPath, 'utf8'))
  } catch (e) {
    return { ok: false, error: 'spec/hooks/hooks.json is not valid JSON (' + e.message + ')' }
  }
  const paths = new Set()
  for (const cmd of collectHookCommandStrings(parsed, [])) {
    for (const p of scriptPathsFromCommand(cmd)) paths.add(p)
  }
  return { ok: true, paths }
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
    ['spec/doctrine/stages', ['.md']],
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

function stripCommentLines(src, ext) {
  const marker = ext === '.sh' ? '#' : '//'
  return src.split('\n').map((line) => {
    const idx = line.indexOf(marker)
    return idx === -1 ? line : line.slice(0, idx)
  }).join('\n')
}

// D9's declared invocation shape: an exact single/double-quoted literal, or the tail of a
// quoted path (a `/` immediately before the basename, a closing quote immediately after).
function matchesScriptInvocation(codeOnlySrc, basename) {
  const b = basename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp("'" + b + "'|\"" + b + '"|/' + b + "'|/" + b + '"').test(codeOnlySrc)
}

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
        const hookResult = parseHookScriptPaths(root)
        if (!hookResult.ok) {
          violations.push(script + ' -> ' + ep + ' (' + hookResult.error + ' — fail-closed, D10)')
          continue
        }
        ok = hookResult.paths.has(script)
      } else {
        const codeOnly = stripCommentLines(epSrc, path.extname(ep))
        const keys = Object.keys(keyMap).filter((k) => keyMap[k] === script)
        ok = matchesScriptInvocation(codeOnly, basename) ||
          keys.some((k) => new RegExp('spec-paths ' + k + '\\b').test(codeOnly))
      }
      if (!ok) violations.push(script + ' -> ' + ep + ' (no invocation literal for ' + basename + ' found in ' + ep + ')')
    }
  }
  return violations
}

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
  const hookResult = parseHookScriptPaths(root)
  if (!hookResult.ok) {
    violations.add(hookResult.error + ' — the hooks reverse-invocation check cannot run (fail-closed, D10)')
  } else {
    for (const scriptPath of hookResult.paths) {
      const entry = manifest[scriptPath]
      if (!entry) {
        violations.add(hooksRel + ' invokes ' + scriptPath + ' (parsed hooks.json command ' +
          'string) but the manifest has no entry for ' + scriptPath + ' at all — an ' +
          'invocation the manifest does not know about')
        continue
      }
      const declared = Array.isArray(entry.entryPoints) && entry.entryPoints.includes(hooksRel)
      if (!declared) {
        violations.add(hooksRel + ' invokes ' + scriptPath + ' (parsed hooks.json command ' +
          'string) but the manifest entry for ' + scriptPath + ' does not declare ' + hooksRel +
          ' as an entry point')
      }
    }
  }
  return [...violations]
}

test('AC-20260820-04-1: every executable in spec/scripts/*.js|*.sh and spec/workflows/*.js, excluding spec/scripts/lib/, has a spec/entrypoints.json entry', () => {
  const manifestPath = path.join(ROOT, 'spec/entrypoints.json')
  assert.ok(fs.existsSync(manifestPath),
    'spec/entrypoints.json does not exist — D1 requires one central manifest entry per ' +
    'executable in spec/scripts and spec/workflows; without it this repo has zero entry-point ' +
    'coverage and every script in scope is a silent, undetected orphan (the exact class this ' +
    'spec exists to close, third recurrence: env-preflight)')

  const executables = scanExecutables(ROOT)
  assert.ok(executables.includes('spec/workflows/wf-research.js'),
    'the inventory glob must include spec/workflows/*.js — a scan that misses wf-research.js ' +
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

  const manifest = readManifest(ROOT)
  assert.strictEqual(Object.keys(manifest).length, executables.length,
    'the manifest must have exactly one key per scanned executable (30 as seeded) — a mismatch ' +
    'means either the manifest carries a stale/duplicate key or the recursive D11 scan is ' +
    'finding files the manifest was never seeded to cover: manifest has ' +
    Object.keys(manifest).length + ', scan found ' + executables.length)
})

test('AC-20260820-04-1 / D11: every spec-paths key resolving under spec/scripts/ or spec/workflows/ resolves to a file the (recursive) executable inventory actually enumerates', () => {
  const manifestPath = path.join(ROOT, 'spec/entrypoints.json')
  assert.ok(fs.existsSync(manifestPath),
    'spec/entrypoints.json does not exist — the D11 belt-and-braces reachability leg needs the ' +
    'manifest seeded before it can be exercised against the live repo')
  const violations = checkKeyReachability(ROOT)
  assert.deepStrictEqual(violations, [],
    'a spec-paths key resolving under spec/scripts/ or spec/workflows/ to a file the recursive ' +
    'inventory scan does not enumerate means the key is dead, or the scan/domain-shape rules ' +
    'have diverged from reality — this is D11\'s independent reachability cross-check, kept ' +
    'deliberately separate from the shape-based checks above: ' + JSON.stringify(violations))
})

test('AC-20260907-01-13: spec/entrypoints.json lists spec/commands/plan.md as an entry point of spec/scripts/ac-matrix.js, and spec/scripts/spec-review-driver.js as an entry point of spec/scripts/ac-drift.js', () => {
  const manifest = readManifest(ROOT)
  const acMatrixRow = manifest['spec/scripts/ac-matrix.js']
  assert.ok(acMatrixRow && Array.isArray(acMatrixRow.entryPoints) && acMatrixRow.entryPoints.includes('spec/commands/plan.md'),
    'D8/D4: the spec/scripts/ac-matrix.js manifest row must declare spec/commands/plan.md as an ' +
    'entry point — the lock step now opens with the --lint run, and an undeclared invocation is ' +
    'exactly the "authored but never activated" class checkReverseInvocation exists to catch: ' +
    JSON.stringify(acMatrixRow))
  const acDriftRow = manifest['spec/scripts/ac-drift.js']
  assert.ok(acDriftRow && Array.isArray(acDriftRow.entryPoints) && acDriftRow.entryPoints.includes('spec/scripts/spec-review-driver.js'),
    'D8/D6: the spec/scripts/ac-drift.js manifest row must declare spec/scripts/spec-review-driver.js ' +
    'as an entry point — the CLOSE step now runs ac-drift.js via runChild, and an undeclared ' +
    'invocation is exactly the class checkReverseInvocation exists to catch: ' + JSON.stringify(acDriftRow))
})

test('AC-20260901-02-8 (was AC-20260820-04-5 / D10 / hole2): parseHookScriptPaths extracts exactly the six live hooks.json script paths (repo-relative, /scripts/-rooted today), proving the parse-based oracle actually fires against the real file', () => {
  const result = parseHookScriptPaths(ROOT)
  assert.strictEqual(result.ok, true,
    'the live spec/hooks/hooks.json must parse as valid JSON — a parse failure here would fail ' +
    'the whole hooks direction closed: ' + (result.error || ''))
  assert.deepStrictEqual([...result.paths].sort(), [
    'spec/scripts/block-cross-worktree-writes.sh',
    'spec/scripts/block-worker-git.sh',
    'spec/scripts/genesis-state-gate.sh',
    'spec/scripts/question-style-gate.js',
    'spec/scripts/spec-session-stamp.sh',
    'spec/scripts/spec-state-gate.sh'
  ],
    'the parse-based extraction must yield exactly these six repo-relative paths from the live ' +
    'file — spec-session-stamp.sh (D1) is the new third UserPromptSubmit arm; this is the executed ' +
    'proof that the oracle change (not a widened regex) actually resolves the measured D10 defect ' +
    '(the old raw-bytes regex returned zero matches here), and that the hole2 path-based extraction ' +
    '(covering /workflows/ too) still returns the correct live /scripts/-only set: ' +
    JSON.stringify([...result.paths].sort()))
})

test('AC-20260820-04-6 (carrying forward AC-20260905-04-8): the live repo, scanned in both inventory directions and both invocation directions, reports zero violations — the green pin every future drift turns red', () => {
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

  const reachabilityViolations = checkKeyReachability(ROOT)
  assert.deepStrictEqual(reachabilityViolations, [],
    'a live spec-paths key resolving under spec/scripts/ or spec/workflows/ to a file the ' +
    'inventory scan cannot see (D11\'s independent reachability leg) means either the key is ' +
    'dead or the scan/domain-shape logic has silently diverged from reality: ' +
    JSON.stringify(reachabilityViolations))
})
