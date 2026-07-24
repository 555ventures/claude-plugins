#!/usr/bin/env node
// Deterministic structural guard for `skeletons.json` — the load-bearing artifact of /spec:design.
//
// WHY this exists: skeletons.json is model-authored, deeply nested (a per-surface `tree` AST with
// per-node `style` maps), and is then EXPANDED by parallel Sonnet workers that transcribe it without
// re-deriving anything. The workflow's `groups` arg gets a paranoid nested validator (validateGroups
// in wf-design.js) precisely because a model hand-builds it; skeletons.json is the FAR bigger
// model-authored artifact and deserves the same trust-boundary check. But the workflow runs in a
// sandbox with no filesystem access — it only receives the skeletons PATH — so the guard cannot live
// there. The /spec:design session runs THIS script in Phase 1, right after authoring skeletons.json
// and before dispatching any worker, so a malformed plan fails loud at the producer instead of making
// N parallel Sonnet workers improvise or return `blocked` at Sonnet cost.
//
// It checks STRUCTURE only (shape a worker would choke on) and the one contract the altitude fix added:
// every `tree` node `style` VALUE (and every `tokenMap` value on the mock path) must be a token role,
// never a literal (#hex / 12px / rgb(...)) — a literal there is exactly the re-derivation the skeleton
// exists to prevent. Author entries come in two shapes: mock-bound (`sliceRef` set — the slice is the
// structural/copy authority, NO tree allowed, optional `tokenMap`) and no-mock (`tree` required — the
// skeleton IS the design). It does NOT judge taste,
// token correctness, or visual fidelity. It reports EVERY problem (like a linter), then exits non-zero.
//
// CONTRACT: `node skeletons-check.js <skeletons.json>`. Clean → prints a one-line summary, exits 0.
// Any structural problem → prints each as `skeletons[i].field: …`, exits 1.

'use strict'
const fs = require('fs')

const errs = []
function err(where, msg) { errs.push(where + ': ' + msg) }

const file = process.argv[2]
if (!file) { process.stderr.write('skeletons-check: usage: skeletons-check <skeletons.json>\n'); process.exit(1) }

let doc
try {
  doc = JSON.parse(fs.readFileSync(file, 'utf8'))
} catch (e) {
  process.stderr.write('skeletons-check: cannot read/parse ' + file + ': ' + e.message + '\n')
  process.exit(1)
}

const isStr = v => typeof v === 'string' && v.length > 0
const isArr = Array.isArray
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v)

// A token role is a non-empty string that is NOT a raw value. We reject anything that reads as a
// literal — that is the altitude-fix contract: styling on a node is a ROLE the canon resolves, not a
// baked value copied off the slice. Shapes rejected:
//   hex (#fff), anything leading with a digit or dot (12px, .5rem, 0.5rem, 50%, 1em, -2px),
//   functional values (rgb()/hsl()/oklch()/var()/calc()/clamp()...), unit-suffixed numbers,
//   and bare CSS color keywords ('red' is a value; a semantic role never names a raw color).
// A role that merely CONTAINS a unit word ('spacing-px') is a role, not a literal.
const CSS_COLOR_KEYWORDS = new Set([
  'black', 'white', 'red', 'green', 'blue', 'yellow', 'orange', 'purple', 'pink',
  'gray', 'grey', 'brown', 'cyan', 'magenta', 'transparent', 'currentcolor', 'inherit',
])
function roleProblem(v) {
  if (typeof v !== 'string' || v.length === 0) return 'not a string'
  const s = v.trim()
  const literal =
    /^#[0-9a-fA-F]{3,8}$/.test(s) ||
    /^-?[.\d]/.test(s) ||
    /^(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color|var|calc|clamp|min|max|url)\(/i.test(s) ||
    CSS_COLOR_KEYWORDS.has(s.toLowerCase())
  if (literal) return 'looks like a literal (' + JSON.stringify(v) + ') — style values must be token ROLES, never baked values'
  return null
}

if (!isObj(doc)) {
  process.stderr.write('skeletons-check: top level is not an object\n')
  process.exit(1)
}
if (doc.schemaVersion !== undefined && typeof doc.schemaVersion !== 'number') err('schemaVersion', 'present but not a number')
if (doc.source !== undefined && !(isObj(doc.source) && isStr(doc.source.sha256))) err('source', 'present but missing a string source.sha256')
if (doc.tokenForks !== undefined && !isArr(doc.tokenForks)) err('tokenForks', 'present but not an array')

const skeletons = doc.skeletons
if (!isArr(skeletons) || skeletons.length === 0) {
  process.stderr.write('skeletons-check: `skeletons` is not a non-empty array — nothing to expand\n')
  process.exit(1)
}

function checkNode(where, n) {
  if (!isObj(n)) { err(where, 'tree node is not an object'); return }
  if (!isStr(n.el)) err(where, 'tree node has no string `el`')
  if (n.style !== undefined) {
    if (!isObj(n.style)) err(where + '.style', 'present but not a { property: tokenRole } object')
    else for (const [prop, val] of Object.entries(n.style)) {
      const p = roleProblem(val)
      if (p) err(where + '.style.' + prop, p)
    }
  }
  if (n.children !== undefined) {
    if (!isArr(n.children)) err(where + '.children', 'present but not an array')
    else n.children.forEach((c, k) => checkNode(where + '.children[' + k + ']', c))
  }
}

const ids = new Set() // a Set, not {} — an id named 'constructor' must not hit Object.prototype
skeletons.forEach((s, i) => {
  const at = 'skeletons[' + i + ']'
  if (!isObj(s)) { err(at, 'not an object'); return }
  if (!isStr(s.id)) err(at + '.id', 'missing or not a non-empty string')
  else { if (ids.has(s.id)) err(at + '.id', 'duplicate id "' + s.id + '"'); ids.add(s.id) }
  if (s.decision !== 'author' && s.decision !== 'bind') {
    err(at + '.decision', 'must be "author" or "bind" (got ' + JSON.stringify(s.decision) + ')')
    return // can't validate the branch-specific shape without a valid decision
  }
  if (s.decision === 'bind') {
    if (!isObj(s.bind) || !isStr(s.bind.component) || !isStr(s.bind.from)) {
      err(at + '.bind', 'decision="bind" needs bind.{component,from} as non-empty strings')
    }
    // A half-converted entry (bind decision, author payload) makes a worker author a component
    // the bind decision said not to — reject the contradiction at the producer.
    if (s.tree !== undefined) err(at + '.tree', 'decision="bind" must not carry a tree — a bind imports an existing component')
    if (s.componentPath !== undefined) err(at + '.componentPath', 'decision="bind" writes no new component file — remove componentPath (catalogEntryPath is where the catalog entry lands)')
  } else { // author — two shapes, split by region/slice binding (mock-bound vs no-mock)
    if (!isStr(s.componentPath)) err(at + '.componentPath', 'decision="author" needs a string componentPath')
    // Mock-bound = regionRef ("<surfaceId>#<regionId>", bare surface = root) or regionRefs[],
    // or the legacy whole-surface sliceRef. Validate ref shape at the producer — fidelity-check
    // later fails loud on a ref the extract does not know, but a malformed ref should never
    // reach the workers.
    const REF_RE = /^[^#\s]+(#[^#\s]+)?$/
    const refs = []
    if (s.regionRef !== undefined) {
      if (!isStr(s.regionRef) || !REF_RE.test(s.regionRef)) err(at + '.regionRef', 'must be "<surfaceId>#<regionId>" (got ' + JSON.stringify(s.regionRef) + ')')
      else refs.push(s.regionRef)
    }
    if (s.regionRefs !== undefined) {
      if (!isArr(s.regionRefs) || s.regionRefs.length === 0) err(at + '.regionRefs', 'present but not a non-empty array')
      else s.regionRefs.forEach((r, k) => {
        if (!isStr(r) || !REF_RE.test(r)) err(at + '.regionRefs[' + k + ']', 'must be "<surfaceId>#<regionId>" (got ' + JSON.stringify(r) + ')')
        else refs.push(r)
      })
    }
    if (refs.length > 0 || isStr(s.sliceRef)) {
      // Mock-bound: the SLICE is the binding authority for structure/copy/order/layout; the
      // skeleton carries only judgment (token mapping, props, states). A tree here is exactly
      // the paraphrase hop the binding-map contract exists to kill — reject it at the producer.
      if (s.tree !== undefined) err(at + '.tree', 'a mock-bound author entry (regionRef/sliceRef set) must not carry a tree — the slice is the structural authority; a tree is a paraphrase of it')
      if (s.tokenMap !== undefined) {
        if (!isObj(s.tokenMap)) err(at + '.tokenMap', 'present but not a { mockValue: tokenRole } object')
        else for (const [mockVal, role] of Object.entries(s.tokenMap)) {
          const p = roleProblem(role)
          if (p) err(at + '.tokenMap[' + JSON.stringify(mockVal) + ']', p)
        }
      }
    } else {
      if (!isArr(s.tree) || s.tree.length === 0) err(at + '.tree', 'decision="author" without a regionRef/sliceRef needs a non-empty tree (no-mock path: the skeleton IS the design)')
      else s.tree.forEach((n, k) => checkNode(at + '.tree[' + k + ']', n))
    }
    if (!isArr(s.states) || s.states.length === 0) err(at + '.states', 'decision="author" needs a non-empty states array')
    if (!isArr(s.tokens) || s.tokens.length === 0) err(at + '.tokens', 'decision="author" needs a NON-EMPTY tokens allowlist (an empty allowlist would forbid every style role the surface emits)')
  }
})

if (errs.length) {
  process.stderr.write('skeletons-check: ' + errs.length + ' problem(s) in ' + file + ':\n')
  for (const e of errs) process.stderr.write('  - ' + e + '\n')
  process.exit(1)
}

process.stdout.write('skeletons-check: ' + skeletons.length + ' skeleton(s) OK → ' + file + '\n')
