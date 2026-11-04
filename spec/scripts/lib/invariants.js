'use strict'
// lib/invariants.js — exports `deriveInvariants(root, config)`, the authority for "a script the pipeline
// itself runs" (expire-tests.js's keep-clause set), DERIVED from the host's real command strings, hook
// commands and the pipeline's four entrypoints on every call — never a hand list, never stored on disk.
// Owner: specs/20260911/03-tests-expire-at-close.md.
//
// The universe is every code file (lib/file-shapes.js `isCodeFile`) under `root`, outside the skip dirs
// (`.git`, `node_modules`, `fixtures`, `__fixtures__`, `.claude/worktrees`) and outside the host's
// test-classified globs (`isTestClassified`) — a test file is never a
// root and never an edge target. Roots are every universe file whose basename is named in: the
// host config's `gateCommand`/`testCommand`/`postGateCommand`/`setupCommand`/`patternsScript`
// string values, every string found (recursively) inside `runtime`/`design`, every `provision`
// string in `testEnv[]`; every command string reachable (recursively) inside `.claude/
// settings.json`'s `hooks` key and every `hooks` key inside a `*/hooks/hooks.json` (0 or 1
// leading path segment — "depth <= 2"); and the four pipeline entrypoints `review-legs.js`,
// `spec-review-driver.js`, `spec-build-driver.js`, `verdict.js`, each added directly by basename
// when present, regardless of whether any command string names them. Edges are, per script:
// (1) a comment-stripped `require('./x')` / `import ... from './x'` resolved against the
// requiring file's own directory, trying `.js`/`.cjs`/`.mjs`/`.ts`/`/index.js` in that order for
// an extension-less specifier; (2) a comment-stripped `name.ext` substring (one of the five
// tracked extensions) resolved to every universe file sharing that basename. `scripts` is the
// transitive closure reachable from `roots` by repeatedly following edges — never a hand list.
//
// Launchers: every file under a `bin/`
// directory at depth <= 2 (`bin/*`, `*/bin/*`) is a launcher; every universe file whose basename a
// launcher's comment-stripped text names becomes a root, and `launchers` lists them (rel paths) so
// expire-tests.js can add each launcher's own basename to its keep-clause names.
//
// What this deliberately does NOT do: understand a shell/JS tokenizer precisely (comment
// stripping here is a documented approximation — `#.*` per bash line, `//...`/`/* ... */` for the
// rest — good enough to keep a stray comment from opening a false edge, but
// not a guarantee against every possible string/regex-literal edge case lib/scan-test-calls.js's
// full tokenizer handles); resolve an ambiguous multi-match basename to one "true" file (every
// match is added — false positives here only widen `kept`, never narrow it, matching the
// fail-safe stance); or read/write any file outside `root` (pure over the tree it is pointed at).
//
// Exit codes: n/a (library, not an entrypoint).

const fs = require('fs')
const path = require('path')
const { readConfig } = require('./host-config')
const { fileShapes, isTestClassified, isCodeFile } = require('./file-shapes')
const { walkFiles } = require('./walk-files')

const PIPELINE_ENTRYPOINTS = ['review-legs.js', 'spec-review-driver.js', 'spec-build-driver.js', 'verdict.js']

const { relPosix, readJsonSafe } = require('./util')

// The universe's walk and its skip set live in lib/walk-files.js — the one copy
// lib/scan-test-calls.js's `listTestFiles` shares, so the two can never disagree about which
// files exist (they once did: only one of them resolved symlinks).

// Recursively collects every string value found anywhere inside `value` (an object, array, or
// scalar) into `out` — the one traversal `runtime`/`design`/hook-command trees share.
function collectStrings(value, out) {
  if (value == null) return
  if (typeof value === 'string') { out.push(value); return }
  if (Array.isArray(value)) { for (const v of value) collectStrings(v, out); return }
  if (typeof value === 'object') { for (const k of Object.keys(value)) collectStrings(value[k], out) }
}

function configCommandStrings(config) {
  const cfg = config || {}
  const out = []
  for (const key of ['gateCommand', 'testCommand', 'postGateCommand', 'setupCommand', 'patternsScript', 'testCaseScanner', 'slowTestCommand']) {
    if (typeof cfg[key] === 'string') out.push(cfg[key])
  }
  collectStrings(cfg.runtime, out)
  collectStrings(cfg.design, out)
  if (Array.isArray(cfg.testEnv)) {
    for (const t of cfg.testEnv) {
      if (t && typeof t.provision === 'string') out.push(t.provision)
    }
  }
  return out
}


function hookCommandStrings(root, allFiles) {
  const out = []
  const settings = readJsonSafe(path.join(root, '.claude/settings.json'))
  if (settings && settings.hooks) collectStrings(settings.hooks, out)

  const hooksJsonRe = /^(?:[^/]+\/)?hooks\/hooks\.json$/
  for (const f of allFiles) {
    if (!hooksJsonRe.test(relPosix(root, f))) continue
    const parsed = readJsonSafe(f)
    if (parsed && parsed.hooks) collectStrings(parsed.hooks, out)
  }
  return out
}

// One `name.ext` token per match (one of the five tracked extensions) — greedy over path-safe
// characters so a leading `./`/`../`/absolute prefix rides along, but basename extraction below
// only ever cares about the final segment.
const NAME_EXT_RE = /[\w.\-/]+\.(?:js|mjs|cjs|ts|sh)\b/g

function basenamesIn(text, re = NAME_EXT_RE) {
  const out = []
  let m
  re.lastIndex = 0
  while ((m = re.exec(text))) out.push(path.basename(m[0]))
  return out
}

// Roots are named in host commands, so their extension set is the host's code extensions
// (a `python3 tools/run.py` gate script is a root); the edge walk keeps the JS-shaped regex.
function rootNameRe(shapes) {
  const exts = shapes.codeExtensions.map((e) => e.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp('[\\w.\\-/]+\\.(?:' + exts.join('|') + ')\\b', 'g')
}

// Documented approximation (see module header) — good enough to keep a stray comment from
// opening a false edge without a full tokenizer.
function stripComments(src, ext) {
  if (ext === '.sh') {
    return src.split('\n').map((line) => line.replace(/#.*/, '')).join('\n')
  }
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

const LAUNCHER_RE = /^(?:[^/]+\/)?bin\/[^/]+$/
const REQUIRE_RE = /require\(\s*(['"])(\.[^'"]+)\1\s*\)/g
const IMPORT_RE = /import\s+[^;'"]*?from\s+(['"])(\.[^'"]+)\1/g

function deriveInvariants(root, config) {
  const absRoot = path.resolve(root)
  const allFiles = walkFiles(absRoot)

  const cfg = config || {}
  const shapes = fileShapes(cfg)

  const universe = allFiles
    .map((f) => relPosix(absRoot, f))
    .filter((rel) => isCodeFile(rel, shapes) && !isTestClassified(rel, shapes))
    .sort()

  const universeByBasename = new Map()
  for (const rel of universe) {
    const base = path.posix.basename(rel)
    if (!universeByBasename.has(base)) universeByBasename.set(base, [])
    universeByBasename.get(base).push(rel)
  }
  const universeSet = new Set(universe)

  function resolveRelative(fromRelDir, spec) {
    const joined = path.posix.normalize(path.posix.join(fromRelDir, spec))
    const hasExt = /\.(js|cjs|mjs|ts)$/.test(joined)
    const candidates = hasExt ? [joined]
      : [joined + '.js', joined + '.cjs', joined + '.mjs', joined + '.ts', joined + '/index.js']
    for (const c of candidates) if (universeSet.has(c)) return c
    return null
  }

  function edgesOf(rel) {
    const abs = path.join(absRoot, rel)
    let src
    try {
      src = fs.readFileSync(abs, 'utf8')
    } catch {
      return []
    }
    const ext = path.extname(rel)
    const stripped = stripComments(src, ext)
    const out = new Set()
    const fromDir = path.posix.dirname(rel)

    let m
    REQUIRE_RE.lastIndex = 0
    while ((m = REQUIRE_RE.exec(stripped))) {
      const resolved = resolveRelative(fromDir, m[2])
      if (resolved && resolved !== rel) out.add(resolved)
    }
    IMPORT_RE.lastIndex = 0
    while ((m = IMPORT_RE.exec(stripped))) {
      const resolved = resolveRelative(fromDir, m[2])
      if (resolved && resolved !== rel) out.add(resolved)
    }
    for (const base of basenamesIn(stripped)) {
      const matches = universeByBasename.get(base)
      if (!matches) continue
      for (const rp of matches) if (rp !== rel) out.add(rp)
    }
    return [...out]
  }

  // ---- roots -----------------------------------------------------------------------------------
  const rootBasenames = new Set()
  const rootRe = rootNameRe(shapes)
  for (const s of configCommandStrings(cfg)) for (const b of basenamesIn(s, rootRe)) rootBasenames.add(b)
  for (const s of hookCommandStrings(absRoot, allFiles)) for (const b of basenamesIn(s, rootRe)) rootBasenames.add(b)
  for (const b of PIPELINE_ENTRYPOINTS) rootBasenames.add(b)

  // Launchers: any file under `bin/` or `*/bin/` (depth <= 2), outside skip dirs and test
  // globs. Every universe basename a launcher's text names becomes a root.
  const launchers = allFiles
    .map((f) => relPosix(absRoot, f))
    .filter((rel) => LAUNCHER_RE.test(rel) && !isTestClassified(rel, shapes))
    .sort()
  for (const rel of launchers) {
    let src
    try {
      src = fs.readFileSync(path.join(absRoot, rel), 'utf8')
    } catch {
      continue
    }
    const ext = path.extname(rel)
    const stripped = stripComments(src, ext === '.js' || ext === '.cjs' || ext === '.mjs' ? ext : '.sh')
    for (const b of basenamesIn(stripped, rootRe)) rootBasenames.add(b)
  }

  const roots = new Set()
  for (const base of rootBasenames) {
    const matches = universeByBasename.get(base)
    if (matches) for (const rp of matches) roots.add(rp)
  }

  // ---- transitive closure ------------------------------------------------------------------------
  const scripts = new Set(roots)
  const queue = [...roots]
  const edgeMap = {}
  while (queue.length) {
    const cur = queue.shift()
    const targets = edgesOf(cur)
    edgeMap[cur] = targets.slice().sort()
    for (const t of targets) {
      if (!scripts.has(t)) {
        scripts.add(t)
        queue.push(t)
      }
    }
  }

  return {
    roots: [...roots].sort(),
    scripts: [...scripts].sort(),
    edges: edgeMap,
    launchers,
  }
}

module.exports = { deriveInvariants }
