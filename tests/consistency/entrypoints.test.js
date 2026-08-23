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
//
// D8 (orchestrator ruling, same day): the reverse check (checkReverseInvocation) narrows to
// spec-paths keys resolving inside D1's executable-inventory glob shape — eight live keys
// (shared, shared-design, shared-genesis, replay-corpus, template, templates, contract,
// workflows) resolve to doctrine files, templates, or directories, and D4 read literally
// demanded an unsatisfiable manifest entry for each. (specs/20260823/01-release-legs.md D10,
// 2026-08-23, retired the ninth — `feedback-template` — along with its dead /intake consumer;
// this is a comment-accuracy update only, the shape check below never enumerated keys by name.)
//
// D9 (orchestrator ruling, same day — A2 FALSIFIED): the forward check's script-to-script
// grammar was bare-substring matching over the whole file, comments included. Measured false
// GREEN: severing the real `path.join(scriptDir, 'ac-matrix.js')` call in review-legs.js while
// leaving its header comment's plain-text mentions of "ac-matrix.js" intact left the suite 8/8
// green. 8 of the then-12 live script-to-script edges — every review-legs.js leg (ac-matrix.js,
// ci-query.js, env-preflight.js, promise-sweep.js, scope-reconcile.js, smoke.sh) plus
// spec-design-driver.js -> components-check.js and manifest-check.sh -> smoke.sh — had a
// comment-only mention sufficient to hold the check green on its own, INCLUDING
// review-legs.js -> env-preflight.js: the exact edge whose absence was this spec's third
// recurrence. The guard was blind on its own motivating case. checkForwardInvocation's
// script-to-script branch now strips comment lines and requires D9's declared shape (an
// exact-delimited quoted literal, or the tail of a quoted path) on what remains — see
// stripCommentLines/matchesScriptInvocation below for the grammar and its false-RED bias.
//
// D10 (orchestrator ruling, adversarial sweep at build close 2026-08-20 — A1's hook grammar
// FALSIFIED, then REDIRECTED to an oracle change): the reverse-hooks regex was
// `CLAUDE_PLUGIN_ROOT\}"?\/scripts\/...` — `}` then an OPTIONAL BARE `"` then `/`. The live
// spec/hooks/hooks.json's raw bytes are `\"${CLAUDE_PLUGIN_ROOT}\"/scripts/<basename>` (a JSON
// string escaping its own embedded quote) — the backslash between `}` and `"` was unaccounted
// for. Executed proof: the old regex returned zero matches against the live file, which
// genuinely references four scripts (spec-state-gate.sh, genesis-state-gate.sh,
// question-style-gate.js, block-cross-worktree-writes.sh) — the whole reverse-hooks direction
// had never fired, and shipped unexercised because no fixture anywhere in this file covers the
// hooks corpus. A first fix widened the regex to accept the escaped-quote form; the orchestrator
// then REDIRECTED away from that fix, on the reasoning that hooks.json is JSON — text with
// STRUCTURE — and a regex over its raw bytes is the wrong oracle regardless of how carefully it
// is widened: it buys exactly one more evasion (this quoting style) until the next one appears.
// The fix actually shipped is an ORACLE CHANGE, not a wider pattern: parseHookScriptPaths
// below JSON.parses the file and walks the parsed tree collecting every string under a
// `command` key, wherever it nests; by the time a command string is in hand, JSON's own
// escaping is already resolved (`\"` is plain `"`), so a single generic extraction ("whatever
// directly follows /scripts/ or /workflows/, up to the next whitespace or quote character") is
// quoting-agnostic — escaped-double-quote, single-quoted, and unquoted forms all collapse to
// the identical plain string and are handled identically, with no per-style branch. A parse
// failure is fail-closed (a violation naming the file and the JSON error), never a silent skip
// and never a fallback to regex. The hooks FORWARD branch (previously
// `epSrc.includes('/scripts/' + basename)`) was checked by the same executed sweep and did NOT
// share the original regex defect — the substring `/scripts/<basename>` was present verbatim in
// the raw file regardless of what preceded the `/`, so it already matched all four live
// basenames — but it is now on the same parse-based oracle as the reverse direction for the same
// durability reason, rather than left as the one remaining raw-bytes match in the file.
// (Renamed parseHookScriptBasenames -> parseHookScriptPaths at the 2026-08-20b hole2 fix: the
// function now returns full repo-relative paths across BOTH /scripts/ and /workflows/, not bare
// basenames confined to /scripts/ — see the D10/hole2 note near its definition below.)
//
// D11 (orchestrator ruling, same sweep): `scanExecutables` was non-recursive and `.js`/`.sh`-
// only, and `isExecutableDomainPath` mirrored the same shape — the two agreed perfectly, so a
// script placed one directory deeper or saved without a recognized extension was invisible to
// BOTH the inventory scan and the D8 domain filter at once: no manifest-orphan red, no
// reverse-invocation red. Executed repro: `spec/scripts/legs/ac-matrix.js`, reachable via a
// real spec-paths key and invoked from a command markdown file, with manifest `{}`, made every
// one of checkInventoryForward/checkInventoryReverse/checkForwardInvocation/
// checkReverseInvocation return `[]`. scanExecutables is now a recursive walk under
// spec/scripts/ (still excluding spec/scripts/lib/) and spec/workflows/, admitting every file
// regardless of extension (see the isExecutableName fix note below dated 2026-08-20b — an
// extension allowlist was itself found to be a fifth, unlisted evasion after this D11 fix
// shipped); isExecutableDomainPath is kept in exact shape-agreement (same isExecutableName
// test, same lib/ exclusion, same two root prefixes) — a divergence between the two is
// exactly how this hole opened. checkKeyReachability is the
// independent belt-and-braces leg D11 also requires: every spec-paths key resolving under
// spec/scripts/ or spec/workflows/ must resolve to a file the (now-recursive) inventory scan
// actually enumerates, closing the class by REACHABILITY rather than by re-deriving the same
// shape rule, so a future placement the shape rule fails to anticipate still surfaces.
// Recursion adds zero files against the live repo (spec/scripts/ holds only flat .js/.sh plus
// lib/; spec/workflows/ only flat .js) — verified by listing both trees before this edit.
//
// KNOWN GAPS (accepted at build close 2026-08-20, D12 — adversarial sweep, same day as
// D9-D11): four residual false-green holes deliberately left open. None lets an executable
// exist with zero callers undetected — the class this guard exists to close — so each was
// accepted rather than fixed. Read this before adding a fifth epicycle to the checker.
//
// CORRECTION (2026-08-20b, adversarial review with executed repros): D12's premise above —
// "none lets an executable exist with zero callers undetected" — was itself FALSIFIED. Two
// holes, neither one of the four listed below, did exactly that or its D4 mirror-image, and
// both are now fixed (not accepted) as of this correction:
//   - D11's own claim ("not evadable by ... extension") was false: isExecutableName's
//     extension allowlist left spec/scripts/orphan-helper.py (zero callers) invisible to the
//     inventory scan — executed repro, scoped suite AND full npm test both green. Fixed:
//     isExecutableName now admits every file; see its definition above.
//   - D4/AC-20260820-04-5's claim ("every ${CLAUDE_PLUGIN_ROOT} script path in hooks.json must
//     map to a manifest entry") was false in two compounding ways: the extraction regex only
//     ever matched /scripts/, so a hook invoking a /workflows/ script raised nothing in either
//     direction; and the reverse loop silently `continue`d past a hook-invoked path with no
//     matching manifest entry at all instead of reporting a violation. Fixed: extraction now
//     covers both roots and matches by full repo-relative path (scriptPathsFromCommand,
//     parseHookScriptPaths), and a hook path absent from the manifest is a violation, never a
//     skip.
// The four gaps below were re-verified still narrower than the recurrence class after this
// correction and remain accepted.
//
// 1. A command .md entry point satisfies the forward check on ANY prose mention of
//    `spec-paths <key>`, including a sentence stating the command NO LONGER runs it. Not
//    closable statically: command files are prose, and "run X" and "no longer run X" are
//    both mentions. The reverse direction still catches the inverse case (an undeclared call
//    site).
// 2. `"dynamic": true` (D6) suppresses the invocation check entirely and nothing constrains
//    the declared entry point's relation to the script, so it can launder a true orphan.
//    Zero live entries use it; a diff adding one is the review signal.
// 3. The reverse direction covers spec-paths keys and hooks.json only — there is NO reverse
//    leg for script-to-script invocation. A genuinely new undeclared script-to-script call
//    raises nothing, so that edge is never protected by the forward check and can later be
//    severed silently. This is the original recurrence shape, one hop removed.
// 4. D9's grammar matches a quoted basename anywhere on a non-comment line, including inside
//    a prose string literal. Constructible but not currently live: all 12 script-to-script
//    edges match on a genuine invocation line.
//
// SUCCESSOR TRIGGER: the accepted design is per-edge bookkeeping, which pays only while the
// script-to-script edge count stays small — 12 today. If that count grows materially past a
// dozen, the correct fix is to stop declaring edges and assert REACHABILITY instead — every
// executable reachable from a known entry surface — which closes gaps 3 and 4 as a side
// effect and removes the two-direction bookkeeping entirely. Trade that makes it wrong to do
// today: reachability no longer reddens on a MOVED call site, and this spec's Rationale
// deliberately wanted renames to trip the guard. Holds either way: this repo's zero-
// dependency rule means there is no JS parser available, so script-to-script detection still
// bottoms out in text matching even under reachability.

// ---------------------------------------------------------------------------
// Checker logic (D5): pure functions over an injectable repo root.
// ---------------------------------------------------------------------------

// D11-hole1 (fix 2026-08-20b, adversarial review executed repro): admits EVERY file — no
// extension allowlist at all. The prior allowlist ('' | .js/.mjs/.cjs/.sh) was itself the hole:
// creating spec/scripts/orphan-helper.py (nothing calls it) left the scoped 33/33 suite AND the
// full npm test green, because '.py' fails the allowlist and the file is simply never scanned —
// contradicting D11's own claim ("not evadable by ... extension") and D12's premise ("none of
// the four [known gaps] lets an executable exist with zero callers undetected": this was a
// FIFTH, unlisted hole that does exactly that). Same repro for spec/scripts/orphan-helper.bash.
// Domain narrowing (spec/scripts/ minus lib/, spec/workflows/) is already done by the caller's
// directory walk, so this function no longer needs to look at the name at all — an extension
// check here can only ever be a new evasion surface, never a legitimate filter, given both live
// trees are flat and hold only executables plus lib/ (verified by listing on disk 2026-08-20).
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

// D1/D11 inventory: every file (recursive) under spec/scripts/ (excluding spec/scripts/lib/,
// modules not entry points) and spec/workflows/, whose name matches isExecutableName. Recursive
// on purpose — D11: a script placed one directory deeper than the live tree's current flat
// layout must not fall out of scope silently.
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

// D8: whether a resolved path falls inside D1's executable-inventory glob shape
// (spec/scripts/*.js|*.sh minus lib/, spec/workflows/*.js). Deliberately a SHAPE test, not
// `scanExecutables(root).includes(p)` — eight live spec-paths keys (shared, shared-design,
// shared-genesis, replay-corpus, template, templates, contract, workflows) resolve to doctrine
// files, templates, or directories (specs/20260823/01-release-legs.md D10 retired the ninth,
// `feedback-template`, comment-accuracy only), and D4 read literally would demand an
// unsatisfiable manifest entry for each. Using the on-disk listing instead of the glob shape
// would also open a hole the shape test closes for free: a spec-paths key whose target matches
// the glob shape but was deleted from disk (a stale case-table row) still counts as in-domain
// here, so a corpus call site referencing it still surfaces as a reverse-invocation violation
// naming the missing script — it is not silently swallowed just because scanExecutables can no
// longer see the file. (checkInventoryReverse below is the separate, unrelated check for a
// manifest key that itself resolves to a missing file — the two checks stay orthogonal.)
// D11: kept in EXACT shape-agreement with scanExecutables (same isExecutableName test, same
// lib/ exclusion, same two recursive root prefixes) — a divergence between this function and
// scanExecutables is precisely how the D11 hole opened (a script invisible to one but not the
// other, or invisible to both at once).
function isExecutableDomainPath(p) {
  if (/^spec\/scripts\/lib\//.test(p)) return false
  if (/^spec\/scripts\//.test(p) || /^spec\/workflows\//.test(p)) {
    return isExecutableName(p.split('/').pop())
  }
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

// D11 belt-and-braces (independent of scanExecutables/isExecutableDomainPath): every
// spec-paths key resolving under spec/scripts/ or spec/workflows/ must resolve to a file
// scanExecutables actually enumerates. This closes the same class of hole D11's recursion +
// extension fix closes, but by REACHABILITY against the real inventory rather than by
// re-deriving the same shape rule a second time — a future placement or naming convention the
// shape rule fails to anticipate (and so wrongly excludes from the inventory) still surfaces
// here as long as the spec-paths key itself resolves under one of the two script roots.
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

// D10: recursively collect every string value found under a key literally named "command",
// wherever it nests in the parsed hooks.json tree — generic on purpose, so a reshaping of the
// hooks.json structure (a nested group, a new event) does not require touching this walk.
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

// D10/hole2 (fix 2026-08-20b, adversarial review executed repro): once a command string is in
// hand, JSON's own escaping is already resolved — `\"` is plain `"` — so a single generic
// extraction is quoting-agnostic: escaped-double-quote, single-quoted, and unquoted
// `${CLAUDE_PLUGIN_ROOT}` forms all collapse to the identical plain string here. Now covers BOTH
// script roots (/scripts/ and /workflows/), returning the REPO-RELATIVE PATH ('spec/scripts/<x>'
// or 'spec/workflows/<x>'), not a bare basename — matching by path rather than basename means the
// two roots can never collide. The prior /scripts/-only regex was the hole: a hook command
// invoking "${CLAUDE_PLUGIN_ROOT}"/workflows/wf-panel.js was never seen by this extraction at
// all, so adding that live command to hooks.json left the scoped suite green — an undeclared,
// invisible call site to an in-inventory executable.
function scriptPathsFromCommand(cmd) {
  const re = /\/(scripts|workflows)\/([^\s"'`]+)/g
  const out = []
  let m
  while ((m = re.exec(cmd)) !== null) out.push('spec/' + m[1] + '/' + m[2])
  return out
}

// D10's oracle: JSON.parse spec/hooks/hooks.json (never a regex over its raw bytes) and return
// the set of repo-relative script paths its command strings genuinely invoke, across both
// /scripts/ and /workflows/ (hole2 fix, 2026-08-20b). A missing hooks.json is simply "no hooks
// corpus to check" (`ok: true`, empty set) — unaffected fixtures without a hooks.json continue to
// see no hooks-direction findings. A PRESENT but invalid-JSON hooks.json is fail-closed
// (`ok: false`): the caller must surface this as a violation naming the file and the parse error,
// never silently skip the hooks direction and never fall back to a regex scan.
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

// D9 (retires A2's bare-basename grammar — A2 FALSIFIED at build close 2026-08-20, measured):
// a script-to-script caller's basename must appear, on a NON-comment line, as an
// exact-delimited quoted literal ('<b>', "<b>") or as the tail of a quoted path (/<b>', /<b>").
// Executed proof that bare-substring matching is a false-GREEN generator: severing the real
// `path.join(scriptDir, 'ac-matrix.js')` invocation in review-legs.js while leaving its header
// comment's three plain-text mentions of "ac-matrix.js" untouched left the suite 8/8 GREEN.
// 8 of the then-12 live script-to-script edges (every review-legs.js leg — ac-matrix.js,
// ci-query.js, env-preflight.js, promise-sweep.js, scope-reconcile.js, smoke.sh — plus
// spec-design-driver.js -> components-check.js and manifest-check.sh -> smoke.sh) had a
// comment-only mention sufficient to hold the check green on its own, INCLUDING
// review-legs.js -> env-preflight.js — the exact edge whose absence was this spec's third
// recurrence; the guard was blind on its own motivating case. Comment stripping below
// deliberately biases toward a false RED over a false GREEN (D9's own instruction): a `//`
// (.js) or `#` (.sh) starts a comment for the rest of its line, trailing same-line comments
// included; no block-comment or in-string awareness is attempted, so a basename genuinely
// present only inside a `/* */` block or a string that itself contains `//`/`#` is treated as
// noise (an over-strip, costs nothing but a `"dynamic": true` escape hatch per D6) rather than
// as a false invocation match (an under-strip, the wrong-direction failure this spec exists to
// close).
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

// D3/AC-4: every declared entry point exists and actually invokes its script. `.md` entry
// points need the literal `spec-paths <key>`; a `hooks.json` entry point needs the script's
// basename among D10's parse-based hook-command extraction (parseHookScriptPaths); a
// script-to-script caller needs D9's quoted-literal shape on a non-comment line. An entry
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
        // D10/hole2: parse-based oracle, not a raw-bytes match — see parseHookScriptPaths.
        // Matched by full repo-relative path (not basename) so /scripts/ and /workflows/
        // entries sharing a basename can never collide (fix 2026-08-20b).
        const hookResult = parseHookScriptPaths(root)
        if (!hookResult.ok) {
          violations.push(script + ' -> ' + ep + ' (' + hookResult.error + ' — fail-closed, D10)')
          continue
        }
        ok = hookResult.paths.has(script)
      } else {
        ok = matchesScriptInvocation(stripCommentLines(epSrc, path.extname(ep)), basename)
      }
      if (!ok) violations.push(script + ' -> ' + ep + ' (no invocation literal for ' + basename + ' found in ' + ep + ')')
    }
  }
  return violations
}

// D4/AC-5: every `spec-paths <key>` occurrence in the call-site corpus, plus every script
// basename D10's parse-based extraction finds in hooks.json's command strings, must map to a
// manifest entry that declares the calling file.
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
  // D10/hole2 (fix 2026-08-20b): parse-based oracle, not a raw-bytes regex — see
  // parseHookScriptPaths. A present but invalid-JSON hooks.json fails closed (a violation
  // naming the file), never a silent skip. Matched by full repo-relative path across BOTH
  // /scripts/ and /workflows/ (the prior /scripts/-only extraction made a hook invoking a
  // /workflows/ script invisible here). A hook-invoked path with NO manifest entry at all is
  // now a violation naming the file and the path — the prior code silently `continue`d past
  // this case (a hook naming an undeclared, even nonexistent, script raised nothing).
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

test('AC-20260820-04-5 / D10 / hole2: parseHookScriptPaths extracts exactly the four live hooks.json script paths (repo-relative, /scripts/-rooted today), proving the parse-based oracle actually fires against the real file', () => {
  const result = parseHookScriptPaths(ROOT)
  assert.strictEqual(result.ok, true,
    'the live spec/hooks/hooks.json must parse as valid JSON — a parse failure here would fail ' +
    'the whole hooks direction closed: ' + (result.error || ''))
  assert.deepStrictEqual([...result.paths].sort(), [
    'spec/scripts/block-cross-worktree-writes.sh',
    'spec/scripts/genesis-state-gate.sh',
    'spec/scripts/question-style-gate.js',
    'spec/scripts/spec-state-gate.sh'
  ],
    'the parse-based extraction must yield exactly these four repo-relative paths from the live ' +
    'file — this is the executed proof that the oracle change (not a widened regex) actually ' +
    'resolves the measured D10 defect (the old raw-bytes regex returned zero matches here), and ' +
    'that the hole2 path-based extraction (covering /workflows/ too) still returns the correct ' +
    'live /scripts/-only set unchanged: ' + JSON.stringify([...result.paths].sort()))
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

  const reachabilityViolations = checkKeyReachability(ROOT)
  assert.deepStrictEqual(reachabilityViolations, [],
    'a live spec-paths key resolving under spec/scripts/ or spec/workflows/ to a file the ' +
    'inventory scan cannot see (D11\'s independent reachability leg) means either the key is ' +
    'dead or the scan/domain-shape logic has silently diverged from reality: ' +
    JSON.stringify(reachabilityViolations))
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

test('AC-20260820-04-4 / D9: a script-to-script caller mentioning the basename ONLY in a comment fails — a comment is not an invocation', () => {
  const root = tmpdir('entrypoints-ac4-d9-comment')
  writeTree(root, {
    'spec/scripts/ac-matrix.js': '#!/usr/bin/env node\n',
    'spec/bin/spec-paths': '#!/usr/bin/env bash\nset -u\nROOT="$(pwd)"\ncase "${1:-root}" in\nesac\n',
    // the only mention of ac-matrix.js is a plain-text header comment, exactly the shape
    // that held the live suite green while the real invocation was severed (D9's proof)
    'spec/scripts/review-legs.js':
      '#!/usr/bin/env node\n' +
      '// The leg scripts (scope-reconcile.js, smoke.sh, ci-query.js, ac-matrix.js) are reused as-is.\n' +
      'const path = require("path")\n' +
      'const target = path.join(__dirname, "renamed-away.js") // no real ac-matrix.js call left\n',
    'spec/entrypoints.json': JSON.stringify({
      'spec/scripts/ac-matrix.js': { entryPoints: ['spec/scripts/review-legs.js'] }
    })
  })
  const violations = checkForwardInvocation(root)
  assert.strictEqual(violations.length, 1,
    'a comment-only mention of ac-matrix.js must NOT satisfy the forward check — this is the ' +
    'measured false-GREEN shape D9 closes (severing the real review-legs.js -> ac-matrix.js ' +
    'call while leaving the header comment intact left the live suite green): ' + JSON.stringify(violations))
  assert.match(violations[0], /review-legs\.js/,
    'the violation must name the entry-point file: ' + violations[0])
  assert.match(violations[0], /ac-matrix\.js/,
    'the violation must name the script: ' + violations[0])
})

test('AC-20260820-04-4 / D9: a script-to-script caller mentioning the basename only inside a prose/error-message string fails — a string literal is not an invocation', () => {
  const root = tmpdir('entrypoints-ac4-d9-prose')
  writeTree(root, {
    'spec/scripts/env-preflight.js': '#!/usr/bin/env node\n',
    'spec/bin/spec-paths': '#!/usr/bin/env bash\nset -u\nROOT="$(pwd)"\ncase "${1:-root}" in\nesac\n',
    // "env-preflight.js" appears only as prose inside an error-message template literal —
    // no quote/path-tail delimits it as an invocation per D9's grammar
    'spec/scripts/review-legs.js':
      '#!/usr/bin/env node\n' +
      'const detail = "boom"\n' +
      'console.error(`review-legs.js: environment not provisioned — env-preflight.js failed before any leg could run:\\n${detail}`)\n',
    'spec/entrypoints.json': JSON.stringify({
      'spec/scripts/env-preflight.js': { entryPoints: ['spec/scripts/review-legs.js'] }
    })
  })
  const violations = checkForwardInvocation(root)
  assert.strictEqual(violations.length, 1,
    'a bare prose mention of env-preflight.js inside a template-literal error message must NOT ' +
    'satisfy the forward check — this is the exact edge (review-legs.js -> env-preflight.js) ' +
    'whose absence was this spec\'s third recurrence, and D9 exists precisely so this shape ' +
    'cannot hide it again: ' + JSON.stringify(violations))
  assert.match(violations[0], /env-preflight\.js/,
    'the violation must name the script: ' + violations[0])
})

test('AC-20260820-04-4 / D9: a genuine path.join quoted-literal call and a genuine bash quoted-path call both pass the forward check', () => {
  const root = tmpdir('entrypoints-ac4-d9-genuine')
  writeTree(root, {
    'spec/scripts/ac-matrix.js': '#!/usr/bin/env node\n',
    'spec/scripts/smoke.sh': '#!/usr/bin/env bash\nset -u\n',
    'spec/bin/spec-paths': '#!/usr/bin/env bash\nset -u\nROOT="$(pwd)"\ncase "${1:-root}" in\nesac\n',
    'spec/scripts/review-legs.js':
      '#!/usr/bin/env node\n' +
      'const path = require("path")\n' +
      "const acr = path.join(__dirname, 'ac-matrix.js') // genuine quoted-literal invocation\n",
    'spec/scripts/manifest-check.sh':
      '#!/usr/bin/env bash\n' +
      'set -u\n' +
      'PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"\n' +
      'OUT=$(bash "$PLUGIN_ROOT/scripts/smoke.sh" 2>&1)\n',
    'spec/entrypoints.json': JSON.stringify({
      'spec/scripts/ac-matrix.js': { entryPoints: ['spec/scripts/review-legs.js'] },
      'spec/scripts/smoke.sh': { entryPoints: ['spec/scripts/manifest-check.sh'] }
    })
  })
  const violations = checkForwardInvocation(root)
  assert.deepStrictEqual(violations, [],
    'a genuine path.join(scriptDir, \'ac-matrix.js\') call and a genuine bash ' +
    '"$PLUGIN_ROOT/scripts/smoke.sh" call must both satisfy D9\'s quoted-literal / ' +
    'quoted-path-tail grammar — narrowing away the false-GREEN comment/prose shapes must not ' +
    'also reject the real invocation forms A2 verified: ' + JSON.stringify(violations))
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

// ---------------------------------------------------------------------------
// D10: hooks.json direction fixtures (both were previously unexercised by any fixture here).
// ---------------------------------------------------------------------------

test('AC-20260820-04-5 / D10: hooks.json written in the repo\'s live escaped-quote style invoking an undeclared script raises a reverse-invocation violation', () => {
  const root = tmpdir('entrypoints-ac5-d10-reverse')
  const hooksObj = {
    hooks: {
      UserPromptSubmit: [
        { hooks: [{ type: 'command', command: '"${CLAUDE_PLUGIN_ROOT}"/scripts/widget.sh' }] }
      ]
    }
  }
  writeTree(root, {
    'spec/scripts/widget.sh': '#!/usr/bin/env bash\nset -u\n',
    'spec/bin/spec-paths': '#!/usr/bin/env bash\nset -u\nROOT="$(pwd)"\ncase "${1:-root}" in\nesac\n',
    'spec/hooks/hooks.json': JSON.stringify(hooksObj, null, 2),
    // manifest exists for widget.sh but never learned about hooks.json's call site
    'spec/entrypoints.json': JSON.stringify({
      'spec/scripts/widget.sh': { entryPoints: ['spec/commands/other.md'] }
    })
  })
  // sanity: prove the fixture is really written in the live escaped-quote byte shape (JSON.stringify
  // escapes the embedded `"` as `\"`, matching the repo's actual raw bytes) — without this check a
  // typo here would make the assertion below meaningless
  const raw = fs.readFileSync(path.join(root, 'spec/hooks/hooks.json'), 'utf8')
  assert.ok(raw.includes('\\"${CLAUDE_PLUGIN_ROOT}\\"/scripts/widget.sh'),
    'fixture setup bug: the written hooks.json does not contain the escaped-quote byte sequence ' +
    '(backslash, quote, slash) this test claims to exercise')

  const violations = checkReverseInvocation(root)
  assert.strictEqual(violations.length, 1,
    'D10: the parse-based oracle must recognize the repo\'s ACTUAL mandated escaped-quote form ' +
    '— before the fix a raw-bytes regex returned ZERO matches against a file that genuinely ' +
    'invokes a script, exactly the measured live-repo defect (the whole reverse-hooks direction ' +
    'had never fired): ' + JSON.stringify(violations))
  assert.match(violations[0], /spec\/hooks\/hooks\.json/,
    'the violation must name hooks.json as the undeclared call site: ' + violations[0])
  assert.match(violations[0], /widget\.sh/,
    'the violation must name the invoked script: ' + violations[0])
})

test('AC-20260820-04-5 / D10: hooks.json using quoting styles OTHER than the live escaped-double-quote form (single-quoted, unquoted) are still recognized correctly — the parse-based oracle does not care about quoting', () => {
  const root = tmpdir('entrypoints-ac5-d10-quoting')
  const hooksObj = {
    hooks: {
      UserPromptSubmit: [
        { hooks: [{ type: 'command', command: "bash '${CLAUDE_PLUGIN_ROOT}'/scripts/single-quoted.sh" }] },
        { hooks: [{ type: 'command', command: 'bash ${CLAUDE_PLUGIN_ROOT}/scripts/unquoted.sh' }] }
      ]
    }
  }
  writeTree(root, {
    'spec/scripts/single-quoted.sh': '#!/usr/bin/env bash\nset -u\n',
    'spec/scripts/unquoted.sh': '#!/usr/bin/env bash\nset -u\n',
    'spec/bin/spec-paths': '#!/usr/bin/env bash\nset -u\nROOT="$(pwd)"\ncase "${1:-root}" in\nesac\n',
    'spec/hooks/hooks.json': JSON.stringify(hooksObj, null, 2),
    // both scripts have a manifest entry, but neither declares hooks.json — resolving the
    // basename to its full manifest key needs SOME existing entry to match against, so this
    // isolates exactly what's under test (quoting-agnostic extraction), not a second orphan
    'spec/entrypoints.json': JSON.stringify({
      'spec/scripts/single-quoted.sh': { entryPoints: ['spec/commands/other.md'] },
      'spec/scripts/unquoted.sh': { entryPoints: ['spec/commands/other.md'] }
    })
  })
  const violations = checkReverseInvocation(root)
  assert.strictEqual(violations.length, 2,
    'both the single-quoted and the fully unquoted command forms must be recognized as genuine ' +
    'hooks invocations — this is the pin a mere widened regex cannot satisfy (it only ever ' +
    'anticipates the quoting styles its author thought of), which is the whole point of moving ' +
    'the oracle to JSON.parse + structural extraction instead: ' + JSON.stringify(violations))
  assert.ok(violations.some((v) => v.includes('single-quoted.sh')),
    'the single-quoted command\'s invocation must be recognized: ' + JSON.stringify(violations))
  assert.ok(violations.some((v) => v.includes('unquoted.sh')),
    'the fully unquoted command\'s invocation must be recognized: ' + JSON.stringify(violations))
})

test('AC-20260820-04-5 / D10: a present but invalid-JSON hooks.json fails closed — a reverse-invocation violation naming the file, never a silent skip', () => {
  const root = tmpdir('entrypoints-ac5-d10-invalid-json')
  writeTree(root, {
    'spec/bin/spec-paths': '#!/usr/bin/env bash\nset -u\nROOT="$(pwd)"\ncase "${1:-root}" in\nesac\n',
    'spec/hooks/hooks.json': '{ this is not valid JSON ]',
    'spec/entrypoints.json': JSON.stringify({})
  })
  const violations = checkReverseInvocation(root)
  assert.strictEqual(violations.length, 1,
    'a present-but-invalid-JSON hooks.json must fail CLOSED (a red violation), never silently ' +
    'skip the hooks direction and never fall back to a regex scan of the broken file: ' +
    JSON.stringify(violations))
  assert.match(violations[0], /spec\/hooks\/hooks\.json/,
    'the fail-closed violation must name the file: ' + violations[0])
  assert.match(violations[0], /not valid JSON/,
    'the fail-closed violation must say the file is not valid JSON, not fail silently or with an ' +
    'unrelated message: ' + violations[0])
})

test('AC-20260820-04-4 / D10: a manifest declaring hooks.json as an entry point for a script hooks.json does not actually invoke raises a forward-invocation violation', () => {
  const root = tmpdir('entrypoints-ac4-d10-forward')
  const hooksObj = {
    hooks: {
      PreToolUse: [
        { matcher: 'Write', hooks: [{ type: 'command', command: '"${CLAUDE_PLUGIN_ROOT}"/scripts/other.sh' }] }
      ]
    }
  }
  writeTree(root, {
    'spec/scripts/widget.sh': '#!/usr/bin/env bash\nset -u\n', // never mentioned in hooks.json below
    'spec/bin/spec-paths': '#!/usr/bin/env bash\nset -u\nROOT="$(pwd)"\ncase "${1:-root}" in\nesac\n',
    'spec/hooks/hooks.json': JSON.stringify(hooksObj, null, 2),
    'spec/entrypoints.json': JSON.stringify({
      'spec/scripts/widget.sh': { entryPoints: ['spec/hooks/hooks.json'] }
    })
  })
  const violations = checkForwardInvocation(root)
  assert.strictEqual(violations.length, 1,
    'a manifest declaring hooks.json as an entry point for widget.sh, when hooks.json actually ' +
    'invokes a DIFFERENT script (other.sh), must fail — this is the forward-direction half of ' +
    'the missing hooks fixture coverage D10 closes: ' + JSON.stringify(violations))
  assert.match(violations[0], /widget\.sh/,
    'the violation must name the script: ' + violations[0])
  assert.match(violations[0], /hooks\.json/,
    'the violation must name the entry-point file: ' + violations[0])
})

// ---------------------------------------------------------------------------
// hole2 (adversarial review, executed repro 2026-08-20b): the reverse-hooks direction failed
// OPEN in two compounding ways — the extraction regex only ever matched /scripts/, and the
// reverse loop silently `continue`d past a hook-invoked path with no matching manifest entry.
// ---------------------------------------------------------------------------

test('AC-20260820-04-5 / hole2: a hooks.json command invoking an undeclared /workflows/ script raises a reverse-invocation violation', () => {
  const root = tmpdir('entrypoints-hole2-workflows-reverse')
  const hooksObj = {
    hooks: {
      UserPromptSubmit: [
        { hooks: [{ type: 'command', command: '"${CLAUDE_PLUGIN_ROOT}"/workflows/wf-panel.js' }] }
      ]
    }
  }
  writeTree(root, {
    'spec/workflows/wf-panel.js': '// workflow\n',
    'spec/bin/spec-paths': '#!/usr/bin/env bash\nset -u\nROOT="$(pwd)"\ncase "${1:-root}" in\nesac\n',
    'spec/hooks/hooks.json': JSON.stringify(hooksObj, null, 2),
    // wf-panel.js has a manifest entry, but it never learned about hooks.json's call site — the
    // live executed repro was adding this exact command to the real hooks.json, which left the
    // scoped suite green because scriptBasenamesFromCommand's regex only ever matched /scripts/
    'spec/entrypoints.json': JSON.stringify({
      'spec/workflows/wf-panel.js': { entryPoints: ['spec/commands/design.md'] }
    })
  })
  const violations = checkReverseInvocation(root)
  assert.strictEqual(violations.length, 1,
    'a hooks.json command invoking a /workflows/ script must be seen by the reverse-invocation ' +
    'check exactly like a /scripts/ command is — before the fix, the /scripts/-only extraction ' +
    'regex made this call site entirely invisible in both directions: ' + JSON.stringify(violations))
  assert.match(violations[0], /spec\/hooks\/hooks\.json/,
    'the violation must name hooks.json as the undeclared call site: ' + violations[0])
  assert.match(violations[0], /wf-panel\.js/,
    'the violation must name the invoked workflow script: ' + violations[0])
})

test('AC-20260820-04-5 / hole2: a hooks.json command invoking a /scripts/ path with NO manifest entry at all raises a reverse-invocation violation naming the file, not a silent skip', () => {
  const root = tmpdir('entrypoints-hole2-ghost-script')
  const hooksObj = {
    hooks: {
      UserPromptSubmit: [
        { hooks: [{ type: 'command', command: '"${CLAUDE_PLUGIN_ROOT}"/scripts/ghost-script.sh' }] }
      ]
    }
  }
  writeTree(root, {
    // ghost-script.sh does not exist on disk and has no manifest entry at all — the pre-fix
    // reverse loop did `Object.keys(manifest).find(...); if (!script) continue`, silently
    // skipping exactly this case instead of reporting it
    'spec/bin/spec-paths': '#!/usr/bin/env bash\nset -u\nROOT="$(pwd)"\ncase "${1:-root}" in\nesac\n',
    'spec/hooks/hooks.json': JSON.stringify(hooksObj, null, 2),
    'spec/entrypoints.json': JSON.stringify({})
  })
  const violations = checkReverseInvocation(root)
  assert.strictEqual(violations.length, 1,
    'a hooks.json command naming a script with zero manifest coverage must be reported, never ' +
    'silently skipped — this is the "an invocation the manifest doesn\'t know about" red ' +
    'condition D4/AC-20260820-04-5 requires, and the pre-fix code satisfied it with a bare ' +
    '`continue`: ' + JSON.stringify(violations))
  assert.match(violations[0], /spec\/hooks\/hooks\.json/,
    'the violation must name hooks.json as the call site: ' + violations[0])
  assert.match(violations[0], /ghost-script\.sh/,
    'the violation must name the undeclared, unmanifested script: ' + violations[0])
})

// ---------------------------------------------------------------------------
// D11: recursive scan + extensionless admission + the independent reachability leg.
// ---------------------------------------------------------------------------

test('AC-20260820-04-1 / D11: a script placed in a spec/scripts/<subdir>/, reachable via a spec-paths key and invoked from a command markdown file, is caught by both inventory-forward and reverse-invocation against an empty manifest', () => {
  const root = tmpdir('entrypoints-ac1-d11-subdir')
  writeTree(root, {
    'spec/scripts/legs/ac-matrix.js': '#!/usr/bin/env node\n',
    'spec/bin/spec-paths':
      '#!/usr/bin/env bash\nset -u\nROOT="$(pwd)"\ncase "${1:-root}" in\n' +
      '  ac-matrix)  echo "$ROOT/scripts/legs/ac-matrix.js" ;;\n' +
      'esac\n',
    'spec/commands/review.md': '# Review\n\nRun `node "$(spec-paths ac-matrix)" --root .` here.\n',
    'spec/entrypoints.json': JSON.stringify({})
  })
  const orphans = checkInventoryForward(root)
  assert.deepStrictEqual(orphans, ['spec/scripts/legs/ac-matrix.js (no manifest entry)'],
    'D11: a script one directory deeper than the flat layout must still be enumerated by the ' +
    'recursive scan and flagged as an orphan — before the fix, this exact repro (a script under ' +
    'spec/scripts/legs/) was invisible to the inventory scan entirely: ' + JSON.stringify(orphans))

  const reverseViolations = checkReverseInvocation(root)
  assert.strictEqual(reverseViolations.length, 1,
    'D11: review.md\'s `spec-paths ac-matrix` call, resolving to a subdirectory script, must ' +
    'still be recognized as in-domain by isExecutableDomainPath (kept in shape-agreement with ' +
    'the recursive scan) and flagged as an undeclared call site — before the fix the D8 domain ' +
    'filter and the inventory scan agreed on the WRONG shape and both missed it: ' +
    JSON.stringify(reverseViolations))
  assert.match(reverseViolations[0], /legs\/ac-matrix\.js/,
    'the violation must name the subdirectory script: ' + reverseViolations[0])
})

test('AC-20260820-04-3 / D11: an extensionless executable and a .mjs executable are both caught by inventory-forward as orphans', () => {
  const root = tmpdir('entrypoints-ac3-d11-ext')
  writeTree(root, {
    'spec/scripts/orphan-noext': '#!/usr/bin/env node\n',
    'spec/scripts/orphan.mjs': '#!/usr/bin/env node\nexport {}\n',
    'spec/entrypoints.json': JSON.stringify({})
  })
  const orphans = checkInventoryForward(root)
  assert.deepStrictEqual(orphans.slice().sort(), [
    'spec/scripts/orphan-noext (no manifest entry)',
    'spec/scripts/orphan.mjs (no manifest entry)'
  ].sort(),
    'D11: a script saved without an extension, or as .mjs, must not evade the inventory scan by ' +
    'file naming alone — before the fix only .js/.sh were admitted and both of these files were ' +
    'invisible to it: ' + JSON.stringify(orphans))
})

// ---------------------------------------------------------------------------
// hole1 (adversarial review, executed repro 2026-08-20b): the extension allowlist itself was
// the evasion. A non-allowlisted extension (.py) is a strictly stronger repro than D11's
// extensionless/.mjs cases above — it proves isExecutableName no longer filters by extension AT
// ALL, not merely that it grew a slightly wider allowlist.
// ---------------------------------------------------------------------------

test('AC-20260820-04-3 / hole1: an orphan script with a non-allowlisted extension (.py) under spec/scripts/ is caught by inventory-forward, not silently skipped by an extension allowlist', () => {
  const root = tmpdir('entrypoints-hole1-ext-allowlist')
  writeTree(root, {
    // nothing calls this file — the executed live-repo repro was spec/scripts/orphan-helper.py,
    // which the pre-fix isExecutableName ('' | .js/.mjs/.cjs/.sh) rejected outright, leaving
    // both the scoped suite and the full npm test green with a genuine zero-caller orphan on disk
    'spec/scripts/orphan-helper.py': '#!/usr/bin/env python3\n',
    'spec/entrypoints.json': JSON.stringify({})
  })
  const orphans = checkInventoryForward(root)
  assert.deepStrictEqual(orphans, ['spec/scripts/orphan-helper.py (no manifest entry)'],
    'a .py file under spec/scripts/ must be enumerated by the inventory scan and flagged as an ' +
    'orphan exactly like a .js or .sh file would be — an extension allowlist here is a pure ' +
    'evasion surface, since domain narrowing (spec/scripts/ minus lib/, spec/workflows/) is ' +
    'already done by directory, not by file naming: ' + JSON.stringify(orphans))
})

test('AC-20260820-04-1 / D11: checkKeyReachability fails naming a spec-paths key whose target does not exist on disk', () => {
  const root = tmpdir('entrypoints-ac1-d11-reachability')
  writeTree(root, {
    'spec/bin/spec-paths':
      '#!/usr/bin/env bash\nset -u\nROOT="$(pwd)"\ncase "${1:-root}" in\n' +
      '  ghost)  echo "$ROOT/scripts/ghost.js" ;;\n' +
      'esac\n',
    'spec/entrypoints.json': JSON.stringify({})
    // spec/scripts/ghost.js deliberately does not exist on disk
  })
  const violations = checkKeyReachability(root)
  assert.strictEqual(violations.length, 1,
    'a spec-paths key resolving under spec/scripts/ to a file absent from the executable ' +
    'inventory (here: absent from disk entirely) must be caught by the independent D11 ' +
    'reachability leg — this check is deliberately separate from, and does not depend on, the ' +
    'shape-based inventory/domain checks above: ' + JSON.stringify(violations))
  assert.match(violations[0], /ghost/,
    'the violation must name the dead key or its target so a reader can find and fix the stale ' +
    'spec-paths case-table row: ' + violations[0])
})
