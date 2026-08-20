'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync, execFileSync } = require('node:child_process')
const { ROOT } = require('../helpers')

// specs/20260820/01-autopilot-removal.md (2026-08-20, landed c6e62c1): D1 deleted
// autopilot/** and tests/autopilot/** outright ("git history is the archive; an in-repo
// 'parked' copy invites resurrection"), and D4 deleted every SDK-import/typebox carve-out
// that used to sanction the daemon's dependency — the dependency-free invariant is now
// absolute, with no footnoted exception anywhere in § Review Checks, § Worker Rules, or
// gate-scripts.md. These pins guard that end state:
//   - AC-20260820-01-3: zero tracked references to the SDK package outside specs/** (D5:
//     history is never rewritten, so specs/** stays exempt).
//   - AC-20260820-01-4: no autopilot/ directory anywhere in the tracked tree or on disk.
//   - a structural pin (no AC — see its own test body) generalizes D4's rationale ("a pin
//     makes silent re-import impossible") from the one dead package to ANY third-party
//     import, per JJ's 2026-08-20 ruling after a consultation brief.
// Do not weaken any of these assertions to make a future change pass — tighten the change
// instead. What this file deliberately does NOT catch:
//   - vendored third-party source committed as plain files behind relative (`./`-prefixed)
//     requires — no such vendoring is tracked today, and this file only classifies
//     non-relative specifiers.
//   - install instructions in markdown prose (e.g. "npm install X") — prose is not scanned.
//   - runtime package-manager invocations from scripts (`npm install`, `npx X`) — a script
//     that shells out to a package manager at run time carries no static import specifier
//     for this pin to see.

function gitGrepFiles(pattern) {
  const r = spawnSync('git', ['-C', ROOT, 'grep', '-l', '--fixed-strings', pattern], { encoding: 'utf8' })
  if (r.status === 1) return [] // git grep exit 1 means "no matches", not an error
  if (r.status !== 0) {
    throw new Error('git grep failed (status ' + r.status + '): ' + (r.stderr || r.stdout))
  }
  return r.stdout.split('\n').map((l) => l.trim()).filter(Boolean)
}

// The forbidden package name is assembled from fragments at runtime, deliberately: the
// test below greps every tracked file for this exact string, and this file is itself
// tracked. A literal copy of the whole name anywhere in this file's source — including a
// test title or an assert message — would make the pin match itself and never go green.
// This mirrors tests/tracked-text-purity.test.js's resolution of the identical hazard (it
// spells the banned raw NUL byte as the escape '\x00' rather than emitting the byte), and
// for the same reason that pin refuses an allowlist: an exemption for this file's own path
// would fail silent if the fragments were ever rejoined back into a literal by a future
// edit, whereas keeping the name un-literal here keeps the pin honest about itself. Cost:
// a plain-text sweep for the whole package name will no longer surface this file — the
// AC id and the "dependency-free" filename are how a reader finds it instead.
const SDK_SCOPE = '@anthropic-ai'
const SDK_NAME = 'claude-agent-sdk'
const SDK_SPECIFIER = SDK_SCOPE + '/' + SDK_NAME

test('AC-20260820-01-3: no tracked file outside specs/** references the ' + SDK_SPECIFIER + ' package', () => {
  const hits = gitGrepFiles(SDK_SPECIFIER)
  const live = hits.filter((f) => !f.startsWith('specs/'))
  assert.deepStrictEqual(live, [],
    'a tracked reference to ' + SDK_SPECIFIER + ' outside specs/** means the dead daemon\'s ' +
    'dependency has resurfaced — or a fresh one was silently added — now that D4 has deleted ' +
    'every carve-out that used to sanction it: every non-history hit is a re-import the ' +
    'dependency-free invariant exists to prevent: ' + JSON.stringify(live))
})

test('AC-20260820-01-4: the repo root contains no autopilot directory', () => {
  const tracked = execFileSync('git', ['-C', ROOT, 'ls-files', '--', 'autopilot'], { encoding: 'utf8' })
    .split('\n').filter(Boolean)
  assert.deepStrictEqual(tracked, [],
    'a tracked path under autopilot/ means the daemon was archived rather than deleted — D1 ' +
    'explicitly rejects moving it to attic/, since git history is the intended archive and an ' +
    'in-repo copy keeps every SDK carve-out alive: ' + JSON.stringify(tracked))
  assert.strictEqual(fs.existsSync(path.join(ROOT, 'autopilot')), false,
    'an autopilot/ directory is still present at the repo root — listing the root must show it ' +
    'gone entirely (not merely untracked, e.g. a stray autopilot/node_modules leftover), or a ' +
    'dead copy keeps inviting resurrection')
})

test('no AC (generalization of D4, ruled in by JJ 2026-08-20 after a consultation brief): no tracked source declares or imports any non-builtin package', () => {
  const tracked = execFileSync('git', ['-C', ROOT, 'ls-files'], { encoding: 'utf8' })
    .split('\n').filter(Boolean)
  assert.ok(tracked.length > 0,
    'git ls-files returned zero tracked files — this pin scanned nothing, and a green verdict ' +
    'over an empty scan would be vacuous; run the suite from a git checkout of the repo')

  // 1) node_modules/ is never a tracked path segment — a vendored install would resurrect
  // exactly the class of dependency D4 removed the carve-outs for.
  const vendored = tracked.filter((f) => f.split('/').includes('node_modules'))
  assert.deepStrictEqual(vendored, [],
    'a tracked path contains a node_modules/ segment — a vendored dependency tree has been ' +
    'committed, which reintroduces third-party code D4 deleted every carve-out to forbid, ' +
    'whether or not any file explicitly requires() it: ' + JSON.stringify(vendored))

  // 2) every tracked package.json (there may be more than one someday) must declare zero
  // dependencies of any kind. Parsed via JSON, not text-grepped for "dependencies" — a
  // grep would false-positive on tests/design-driver.test.js, whose source text contains a
  // literal `dependencies: {...}` object written out to a *temp* fixture at test run time,
  // never committed as a tracked package.json.
  const packageJsons = tracked.filter((f) => path.basename(f) === 'package.json')
  const depKeys = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
  const declaredDeps = []
  for (const rel of packageJsons) {
    const parsed = JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'))
    for (const key of depKeys) {
      if (parsed[key] && Object.keys(parsed[key]).length > 0) {
        declaredDeps.push(rel + ':' + key + '=' + JSON.stringify(Object.keys(parsed[key])))
      }
    }
  }
  assert.deepStrictEqual(declaredDeps, [],
    'a tracked package.json declares a dependency — the repo\'s "zero dependencies, node: ' +
    'built-ins only" invariant (the same invariant D4 made absolute for the SDK package) has ' +
    'been broken by a manifest entry, which npm install would silently materialize into a ' +
    'real node_modules/ tree on the next install: ' + JSON.stringify(declaredDeps))

  // 3) no import specifier anywhere in tracked JS resolves outside node:'s builtin set.
  // Matched on the call form require(...) / import(...) only — a loose `from '...'`
  // matcher false-positives on ordinary English inside assert-message strings (verified:
  // spec/scripts/ci-query.js and tests/review/verdict.test.js both contain the substring
  // "from '" or 'from "' inside prose, not an import).
  const sourceFiles = tracked.filter((f) => /\.(js|mjs|cjs)$/.test(f))
  const specifierRe = /\b(?:require|import)\s*\(\s*['"]([^'"]+)['"]/g
  const { isBuiltin } = require('node:module')
  const offenders = []
  for (const rel of sourceFiles) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8')
    let m
    while ((m = specifierRe.exec(src)) !== null) {
      const spec = m[1]
      if (spec.startsWith('.') || spec.startsWith('/')) continue // relative/absolute, not a package
      if (!isBuiltin(spec)) offenders.push(rel + ': ' + spec)
    }
  }
  assert.deepStrictEqual(offenders, [],
    'a tracked .js/.mjs/.cjs file requires or imports a specifier that is not a node: builtin ' +
    '— this is a third-party dependency imported without ever being declared in a ' +
    'package.json, which is exactly the silent-re-import D4\'s pin was written to make ' +
    'impossible, generalized past the one dead SDK package name: ' + JSON.stringify(offenders))
})
