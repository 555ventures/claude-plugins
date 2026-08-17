#!/usr/bin/env node
// Deterministic state-machine driver for /spec:design.
//
// WHY: the design stage's process shape (which phase you are in, what artifacts must exist
// before the next step, what to do now) is deterministic — paying a judgment-priced session to
// re-read 400 lines of phase prose every invocation, and to re-infer "where was I" on resume,
// was the stage's largest fixed cost. This driver owns the state machine: it inspects the
// on-disk state (spec frontmatter, the .design/ sidecar, progress marks), decides the CURRENT
// step, and prints ONLY that step's instructions. The session executes the step, records
// progress with --mark, and re-runs the driver. Instructions arrive incrementally (~40 lines a
// step instead of a ~440-line prefix), and re-entry is correct by construction — the driver
// refuses to print a later step until the earlier step's artifacts verifiably exist.
//
// What stays with the model: ALL taste (skeleton authoring, fork adjudication, visual review,
// iteration rulings). The driver never reads mockups, never judges design, never edits.
//
// CONTRACT:
//   spec-design-driver <spec.md>                 -> print current state + step instructions
//   spec-design-driver <spec.md> --mark <mark>   -> record progress, then print the next step
//     marks: author-green [--run-id <wf id>] | fidelity-reviewed | round-green | approved
//   spec-design-driver <spec.md> --state         -> print the state name only (scripting)
//
// 2026-08-10 (specs/20260810/01-design-path-model-placement.md D6): the config-gated VISUAL
// state (`visual-done` mark) and the advisory vision-review block (`vision-reviewed` mark) are
// RETIRED, replaced by one post-gate FIDELITY_REVIEW state (`fidelity-reviewed` mark) that fires
// whenever the host has any render path (design.screenshot OR design.command) — a legacy
// sidecar's existing `visual-done` mark still satisfies it (resume compat). D3/D5: the driver
// also runs components-check.js advisory (warn, never block) against design/components.json if
// present, and the AUTHOR step's printed args gain `componentManifestPath`.
//
// 2026-08-13 (specs/20260813/05-workflow-correctness-repairs.md D1/D2): the design gate is no
// longer the raw, unsubstituted `config.gateCommand` (a host gate composing a `{testDirs}`-style
// leg could never pass — guaranteed gate-exhausted). It is resolved leg-by-leg: split on
// top-nesting-level `&&` only (parens/quotes protect nested `&&`; unbalanced input passes through
// unsplit rather than risk mis-splitting a subshell/quoted host gate), drop any leg still carrying
// an unresolved `{placeholder}` token and log the drop, rejoin the survivors. The optional
// `design.gateCommand` config key bypasses this whole derivation, verbatim. Zero surviving legs
// (or no gateCommand at all) resolve to the literal sentinel `__UNGATED__`, never an empty
// string; the AUTHOR step's printed instructions route a wf-design `complete-ungated` return
// straight to `/spec:review` stating the absent verification, never the `author-green` mark.
// Exit codes: 0 = step printed; 2 = precondition failure (wrong status, no design block, bad args).
// State lives in <spec>.design/design-state.json + the artifacts themselves. Deleting the
// sidecar resets to the start of the design stage (the spec is never touched by this script).

'use strict'
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { readConfigStrict } = require('./lib/host-config')

function die(msg) { process.stderr.write('spec-design-driver: ' + msg + '\n'); process.exit(2) }

const argv = process.argv.slice(2)
const specPath = argv[0]
if (!specPath || specPath.startsWith('--')) die('usage: spec-design-driver <spec.md> [--mark <m>] [--run-id <id>] [--state]')
if (!fs.existsSync(specPath)) die('spec not found: ' + specPath)

const flag = (name) => { const i = argv.indexOf(name); return i > -1 ? (argv[i + 1] || true) : null }
const MARK = flag('--mark')
const RUN_ID = flag('--run-id')
const STATE_ONLY = argv.includes('--state')

// ---- read the world ----------------------------------------------------------------------------
const spec = fs.readFileSync(specPath, 'utf8')
const fmMatch = /^---\n([\s\S]*?)\n---/.exec(spec)
const fm = fmMatch ? fmMatch[1] : ''
const fmVal = (k) => { const m = new RegExp('^' + k + ':\\s*(.+)$', 'm').exec(fm); if (!m) return ''; const v = m[1].trim(); const q = /^(["'])([\s\S]*)\1$/.exec(v); return q ? q[2] : v }

const status = fmVal('status')
const designFlag = fmVal('design')
const designed = fmVal('designed')
const designSource = fmVal('design_source')

const repoRoot = (() => {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', cwd: path.dirname(path.resolve(specPath)) })
  return r.status === 0 ? r.stdout.trim() : process.cwd()
})()
let config
try { config = readConfigStrict(repoRoot) } catch (e) { die(e.message + ' — run /spec:init first') }
// Legacy key mapping (shared § Design Canon)
const design = config.design || (config.storybook ? { tool: 'storybook', command: config.storybookCommand, storyFormat: 'CSF3 stories' } : null)
if (!design) die('host config declares no design block (nor legacy storybook keys) — the design stage does not apply to this repo; STOP')

const PLUGIN = path.resolve(__dirname, '..')

// ---- component vocabulary registry (D3/D5) — advisory only, never blocks the driver -------------
const componentManifestPath = fs.existsSync(path.join(repoRoot, 'design/components.json'))
  ? 'design/components.json' : ''
let componentManifestWarning = ''
if (componentManifestPath) {
  const r = spawnSync(process.execPath,
    [path.join(PLUGIN, 'scripts/components-check.js'), path.join(repoRoot, componentManifestPath)], { encoding: 'utf8' })
  if (r.status === 1) {
    componentManifestWarning = '⚠ component manifest advisory (' + componentManifestPath +
      ' — components-check found issues, never blocks the driver):\n' + (r.stdout + r.stderr).trim() + '\n\n'
  }
}

const sidecar = specPath.replace(/\.md$/, '.design')
const inSidecar = (f) => path.join(sidecar, f)
const exists = (f) => fs.existsSync(inSidecar(f))
const stateFile = inSidecar('design-state.json')
let marks = {}
try { marks = JSON.parse(fs.readFileSync(stateFile, 'utf8')) } catch { marks = {} }

// A design_source that is not a URL is a LOCAL handoff source: a single HTML file or a directory
// of exported screens (+ optional per-screen *.prompt.md notes), resolved against the repo root.
if (designSource && !/^https?:\/\//i.test(designSource) && designSource.includes(',')) {
  die('design_source must be a SINGLE path — point it at the bundle directory (e.g. design/mocks). ' +
    'Which surfaces/regions a spec uses is declared by its skeleton bindings (regionRef), not the source pointer.')
}
const localSource = designSource && !/^https?:\/\//i.test(designSource)
  ? path.resolve(repoRoot, designSource) : null
if (localSource && !fs.existsSync(localSource)) {
  die('design_source is a local path but ' + localSource + ' does not exist — fix the frontmatter or restore the handoff bundle')
}

// ---- coverage ledger -----------------------------------------------------------------------------
// A design source outlives any one spec: briefs bind REGIONS of its screens, and later briefs
// inherit the remainder. The ledger records which regions each spec claimed — the industry
// status-matrix pattern — at <repoRoot>/.claude/design-coverage.json, keyed by design_source.
// It survives the sidecar deletion at reconcile (that is the point).
const ledgerPath = path.join(repoRoot, '.claude/design-coverage.json')
function readLedger() {
  try { return JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) } catch { return { sources: {} } }
}
// Every region a skeleton binds: regionRef/regionRefs ("<surface>#<region>", bare = root) plus
// the legacy whole-surface bindings (sliceRef → that surface's root).
function boundRegionRefs(skDoc, extractDoc) {
  const refs = new Set()
  const surfaces = (extractDoc && extractDoc.surfaces) || []
  for (const sk of (skDoc && skDoc.skeletons) || []) {
    for (const r of [sk.regionRef, ...(Array.isArray(sk.regionRefs) ? sk.regionRefs : [])]) {
      if (typeof r === 'string' && r) refs.add(r.includes('#') ? r : r + '#root')
    }
    if (typeof sk.sliceRef === 'string' && sk.sliceRef) {
      const surf = surfaces.find(s => sk.sliceRef === s.sliceFile || sk.sliceRef.endsWith('/' + s.sliceFile))
      if (surf) refs.add(surf.id + '#root')
    }
  }
  return [...refs].sort()
}
function recordCoverage() {
  if (!designSource) return
  const skDoc = (() => { try { return JSON.parse(fs.readFileSync(inSidecar('skeletons.json'), 'utf8')) } catch { return null } })()
  const extractDoc = (() => { try { return JSON.parse(fs.readFileSync(inSidecar('extract.json'), 'utf8')) } catch { return null } })()
  const refs = boundRegionRefs(skDoc, extractDoc)
  if (!refs.length) return
  const ledger = readLedger()
  if (!ledger.sources || typeof ledger.sources !== 'object') ledger.sources = {}
  const entry = ledger.sources[designSource] || (ledger.sources[designSource] = { regions: {} })
  const specRel = path.relative(repoRoot, path.resolve(specPath))
  for (const r of refs) entry.regions[r] = { spec: specRel, at: new Date().toISOString().slice(0, 10) }
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true })
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + '\n')
  process.stdout.write('[spec-design-driver] coverage ledger: recorded ' + refs.length + ' bound region(s) → ' + ledgerPath + '\n')
}

// ---- record a mark (validated against the artifacts, then fall through to print next step) ------
if (MARK) {
  const valid = ['author-green', 'fidelity-reviewed', 'round-green', 'approved']
  if (!valid.includes(MARK)) die('unknown mark "' + MARK + '" (' + valid.join(' | ') + ')')
  // The mock fidelity gate is FAIL-CLOSED on the marks that assert "this round's code is right":
  // when a mock is bound (extract.json has fidelity data), strings/order/layout are verified
  // against the authored files before the mark is accepted. Divergence needs an evidence-gated
  // deltas.json row — the check itself validates the evidence, so the refusal is mechanical.
  if ((MARK === 'author-green' || MARK === 'round-green') && exists('extract.json')) {
    // maxBuffer: a divergent surface emits one line per finding and easily clears Node's 1MB
    // default, which kills the child mid-run (status null, ENOBUFS) — the refusal list is the
    // whole point of the gate, so it must not be the thing that gets truncated away.
    const r = spawnSync(process.execPath,
      [path.join(PLUGIN, 'scripts/fidelity-check.js'), sidecar, '--repo-root', repoRoot],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    if (r.status === 1) {
      die('mock fidelity gate FAILED — mark "' + MARK + '" refused:\n' + (r.stdout + r.stderr).trim() +
        '\nFix the divergences (dispatch Sonnet with the list above), or record a verified delta in ' +
        inSidecar('deltas.json') + ', then re-run this mark.')
    }
    // Anything that is not a clean exit 0 refuses the mark. Comparing against specific non-zero
    // values let `status: null` — what spawnSync returns when the child is killed by a signal,
    // fails to spawn, or overflows maxBuffer — satisfy neither arm and fall through to a written
    // mark: a design round approved by a gate that never delivered a verdict. Fail closed on
    // absence of evidence, exactly as the FAIL-CLOSED comment above promises.
    // (Review of specs/20260816/01-gate-baseline-reconcile.md, 2026-08-17 — same class as that
    // spec's own `--gate` fail-open; measured accepting the mark on 6 of 6 overflowing runs.)
    if (r.status !== 0) {
      const cause = r.status === null
        ? (r.signal ? 'killed by ' + r.signal : (r.error && r.error.code) || 'no exit code')
        : 'exit ' + r.status
      die('fidelity-check could not run (' + cause + ') — mark "' + MARK + '" refused: ' +
        (r.stdout + r.stderr).trim() +
        '\nRe-run `node "$(spec-paths fidelity-check)" ' + sidecar + ' --repo-root ' + repoRoot +
        '` directly to see the real failure, then re-run this mark.')
    }
  }
  fs.mkdirSync(sidecar, { recursive: true })
  if (MARK === 'round-green') {
    marks.rounds = (marks.rounds || 0) + 1
  } else {
    marks[MARK] = true
    if (MARK === 'author-green' && RUN_ID) marks.runId = RUN_ID
  }
  fs.writeFileSync(stateFile, JSON.stringify(marks, null, 2) + '\n')
  // approval is when the bound regions become durable fact — the sidecar dies at reconcile,
  // the ledger is what later briefs read to inherit the remainder of the design source
  if (MARK === 'approved') recordCoverage()
}

// ---- derive the current state (artifact-verified, never trust marks alone) ----------------------
function skeletonsValid() {
  if (!exists('skeletons.json')) return false
  const r = spawnSync(process.execPath, [path.join(PLUGIN, 'scripts/skeletons-check.js'), inSidecar('skeletons.json')], { encoding: 'utf8' })
  return { ok: r.status === 0, out: (r.stdout + r.stderr).trim() }
}

let state, detail = ''
if (designed) state = 'DONE'
else if (status !== 'hardened') state = 'BLOCKED'
else if (designSource && !exists('extract.json')) state = 'FETCH_EXTRACT'
else {
  const sk = exists('skeletons.json') ? skeletonsValid() : false
  if (!sk) state = 'SKELETONS'
  else if (!sk.ok) { state = 'SKELETONS_INVALID'; detail = sk.out }
  else if (!marks['author-green']) state = 'AUTHOR'
  else if ((design.screenshot || design.command) && !marks['fidelity-reviewed'] && !marks['visual-done']) state = 'FIDELITY_REVIEW'
  else if (!marks.approved) state = 'ITERATE'
  else state = 'RECONCILE'
}

if (STATE_ONLY) { process.stdout.write(state + '\n'); process.exit(state === 'BLOCKED' ? 2 : 0) }

// ---- step fragments ------------------------------------------------------------------------------
const doctrinePath = design.doctrine || ''

// D1: per-leg gate resolution. `&&` only splits at top nesting level — inside balanced `(...)` or
// inside a quoted string it never splits; unbalanced parens/quotes fail closed by returning the
// whole command as one unsplit leg rather than risk mis-splitting a subshell/quoted host gate.
function splitTopLevelAnd(cmd) {
  const legs = []
  let depth = 0, quote = null, start = 0
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i]
    if (quote) { if (c === quote) quote = null; continue }
    if (c === '"' || c === "'") { quote = c; continue }
    if (c === '(') { depth++; continue }
    if (c === ')') { depth--; if (depth < 0) return [cmd]; continue }
    if (depth === 0 && c === '&' && cmd[i + 1] === '&') {
      legs.push(cmd.slice(start, i))
      i++
      start = i + 1
    }
  }
  if (depth !== 0 || quote) return [cmd]
  legs.push(cmd.slice(start))
  return legs.map((s) => s.trim()).filter(Boolean)
}
const UNGATED_GATE = '__UNGATED__'
// This driver never substitutes placeholders itself (build.md owns that recipe) — a leg still
// carrying `{...}` after config.gateCommand is therefore unresolved-by-definition and gets dropped.
const droppedGateLegs = []
let gateCmd
if (design.gateCommand) {
  gateCmd = design.gateCommand // explicit override — bypasses leg-dropping entirely
} else if (!config.gateCommand) {
  gateCmd = UNGATED_GATE
} else {
  const survivingLegs = splitTopLevelAnd(config.gateCommand).filter((leg) => {
    if (/\{[^{}]+\}/.test(leg)) { droppedGateLegs.push(leg); return false }
    return true
  })
  gateCmd = survivingLegs.length ? survivingLegs.join(' && ') : UNGATED_GATE
}
const droppedGateLegsNote = droppedGateLegs.length
  ? droppedGateLegs.map((l) => 'dropped leg (unresolved placeholder): ' + l).join('\n') + '\n\n'
  : ''

const wfDesign = path.join(PLUGIN, 'workflows/wf-design.js')
const dcExtract = path.join(PLUGIN, 'scripts/dc-extract.js')
const skCheck = path.join(PLUGIN, 'scripts/skeletons-check.js')
const logPath = inSidecar('design-log.md')
const mockLine = designSource
  ? 'design_source: ' + designSource + (localSource ? ' (local handoff source)' : '')
  : 'no design_source — the no-mockup path (skeletons from doctrine + tokens + the spec ## UI section)'

// ---- bind-feasibility report ---------------------------------------------------------------------
// Everything that can refuse a bad binding is printed HERE, at extract time — before a warm
// expensive session authors skeletons against an infeasible contract (whole-screen granularity,
// copy locked in i18n catalogs the gate can't see, duplicate variant contracts). Mechanical read
// of extract.json + the coverage ledger + the host config; no model judgment.
function feasibilityReport() {
  let extractDoc
  try { extractDoc = JSON.parse(fs.readFileSync(inSidecar('extract.json'), 'utf8')) } catch { return '' }
  const surfs = extractDoc.surfaces || []
  if (!surfs.length || !surfs.some(s => Array.isArray(s.regions))) return ''
  const claimed = (readLedger().sources || {})[designSource]
  const claimedBy = (ref) => claimed && claimed.regions && claimed.regions[ref] ? claimed.regions[ref].spec : null
  const lines = ['## Bind feasibility (mechanical, from extract.json — read BEFORE authoring skeletons)']
  for (const s of surfs) {
    const counts = { copy: 0, template: 0, binding: 0, sample: 0 }
    for (const e of s.entries || []) counts[e.kind] = (counts[e.kind] || 0) + 1
    lines.push('surface ' + s.id + ': ' + counts.copy + ' copy / ' + counts.template + ' template / ' +
      counts.binding + ' binding / ' + counts.sample + ' sample; ' +
      ((s.literals && s.literals.colors) || []).length + ' palette literal(s)')
    const regions = s.regions || []
    const parentOf = new Map(regions.map(r => [r.id, r.parent]))
    const depthOf = (id) => { let d = 0, c = parentOf.get(id); while (c) { d++; c = parentOf.get(c) } return d }
    const subtreeCopy = (id) => (s.entries || []).filter(e => {
      if (e.kind !== 'copy') return false
      let c = e.region
      while (c !== undefined && c !== null) { if (c === id) return true; c = parentOf.get(c) ?? null }
      return false
    }).length
    for (const r of regions) {
      if (r.id === 'root') continue
      const d = depthOf(r.id)
      if (d > 2) continue // deep annotation anchors — bindable, but noise in a summary
      const ref = s.id + '#' + r.id
      const claim = claimedBy(ref)
      lines.push('  ' + '  '.repeat(d - 1) + ref + ' [' + r.source + '] ' + subtreeCopy(r.id) + ' copy' +
        (claim ? '  ⛔ CLAIMED by ' + claim : ''))
    }
  }
  for (const v of extractDoc.variantProposals || []) {
    lines.push('variant proposal: ' + v.surface + ' ≈ ' + v.of + ' (' + Math.round(v.overlap * 100) +
      '% copy overlap) — confirm as a theme/breakpoint contract, do NOT bind it as a second string contract')
  }
  const catalogs = (config.design && config.design.copyCatalogs) || []
  if (catalogs.length) {
    lines.push('copy catalogs: ' + catalogs.join(', ') + ' — mock copy passes the gate as catalog VALUES')
  } else {
    const g = spawnSync('git', ['grep', '-l', '--untracked', '-E', 'paraglide|inlang|i18next|react-intl|next-intl|lingui',
      '--', 'package.json', '**/package.json'], { encoding: 'utf8', cwd: repoRoot })
    if (g.status === 0 && g.stdout.trim()) {
      lines.push('⚠ i18n stack detected (' + g.stdout.trim().split('\n')[0] + ') but design.copyCatalogs is NOT declared — ' +
        'the fidelity gate would demand literals the host lint forbids. Declare design.copyCatalogs ' +
        '(e.g. ["app/messages/en.json"]) in .claude/spec.config.json BEFORE binding regions.')
    }
  }
  return lines.join('\n') + '\n\n'
}

// Mock path vs no-mock path: with a mock bound, the SLICE is the binding authority for structure,
// copy, order, and layout, and the skeleton shrinks to a BINDING MAP (no tree — a tree would be a
// paraphrase of the slice, the exact fidelity hole + token cost this contract removes). With no
// mock there is no external truth: the skeleton IS the design and carries the full tree.
const SKELETON_SHAPE_MOCK = `4. Write ${sidecar}/skeletons.json — per bound REGION a BINDING MAP (judgment only; NO tree): { id,
   decision: author|bind, componentPath, catalogEntryPath, bind{component,from,propBindings},
   regionRef: "<surfaceId>#<regionId>" (REQUIRED on author entries — bind ONLY the regions this
   spec builds, from the feasibility list above; binding a region covers its subtree; regionRefs[]
   when one component spans several. The region's slice file is the binding authority for
   structure, element order, copy, and layout — never restate or paraphrase those here),
   tokenMap{<mock literal>: <repo token ROLE>} covering the region's styling values (the
   extract's per-surface literal harvest is the palette to cover), imports[], props[], states[],
   mockRef{state:fixture}, tokens[closed allowlist], shared, usedBy, containment, coherenceGroup,
   waveOrder } plus top-level {schemaVersion, source:{sha256}, tokenForks[]}. Every tokenMap
   value is a ROLE, never a literal.
   The driver checks each bound region FAIL-CLOSED at author-green/round-green, by string CLASS:
   copy = verbatim in your files OR as a VALUE in a declared copy catalog (design.copyCatalogs —
   the i18n home; catalog key order never matters); template = its static segments survive;
   sample (sc-for rows) = present in the pass (catalog-entry fixtures are the home); binding ({{ expr }})
   = renders from a prop, never grepped. Unbound regions are notes, tracked by the coverage
   ledger for later briefs. Confirm each variantProposal: a theme/breakpoint variant becomes a
   token-pair / responsive obligation on the SAME skeletons, never a second string contract.
   A deliberate divergence needs a ${sidecar}/deltas.json row {surfaceId, kind: string|order|layout,
   target, sliceQuote, proof} whose sliceQuote is verified verbatim against the slice and whose
   proof names a mechanical impossibility (failing build output, absent token/primitive, a
   grounded rule id) — taste is NOT a valid proof; with a mock bound, taste yields to the mock
   (shared § mock supremacy). Route every proposed row through the Fable retainer (same agent,
   SendMessage) before writing it — the retainer adjudicates the proof, this session records it.`
const SKELETON_SHAPE_NOMOCK = `4. Write ${sidecar}/skeletons.json — per surface: { id, decision: author|bind, componentPath,
   catalogEntryPath, bind{component,from,propBindings}, imports[], tree[{el,slot,children,bind,
   style:{property: tokenROLE}}], props[], states[], mockRef{state:fixture}, tokens[closed
   allowlist], shared, usedBy, containment, coherenceGroup, waveOrder } plus top-level
   {schemaVersion, source:{sha256}, tokenForks[]}. Every style value is a ROLE, never a literal.`

const STEPS = {
  BLOCKED: () => `Spec status is "${status || '<missing>'}" — /spec:design requires status: hardened.
${designed ? 'designed: is already set — a re-design; confirm with the user before deleting it.' : 'Run /spec:plan first.'}`,

  FETCH_EXTRACT: () => localSource ? `## Step: deterministic extract of the local design source (no fetch — it is already on disk)
${mockLine}

1. Run: node ${dcExtract} --bundle ${localSource} ${sidecar}/
   (one surface per HTML file; <x-dc> blocks slice as usual; *.prompt.md / *.md files are indexed
   as notes for the skeleton step. Non-zero exit → STOP with the stderr; never author from a
   partial extract.)
2. Re-run this driver.` : `## Step: fetch the mockup + deterministic extract
${mockLine}

1. Parse projectId (segment after /p/) and file (?file=<name>, URL-decoded) from design_source.
2. Delegate the fetch to a one-shot Sonnet Agent (top-level, NOT the workflow — top-level agents
   inherit session MCP): it loads DesignSync (ToolSearch select:DesignSync), get_file's the
   .dc.html READ-ONLY, writes the markup to a SCRATCHPAD path (never under specs/), and returns
   only {path, sha256, bytes}. 256 KiB cap; DesignSync unavailable / unreachable / over cap →
   STOP (suggest /design-login). The markup never enters this session.
3. Run: node ${dcExtract} <scratchpad markup path> ${sidecar}/
   Non-zero exit → fall back ONCE to a one-shot Sonnet agent writing the same extract.json +
   slice-*.html by hand; if that fails too, STOP with the stderr. Never author from a partial extract.
4. Re-run this driver.`,

  SKELETONS: () => `${designSource ? feasibilityReport() : ''}## Step: author skeletons.json (${designSource
    ? 'grounded transcription — Sonnet session; Fable retainer at judgment points only'
    : 'the taste concentration — expensive model, warm'})
${mockLine}

1. Dispatch a Haiku match-first pass (Agent {model:"haiku"}, report-only): planned surfaces
   (spec ## UI) × catalog/source roots → a match-map (bind: existing component + import path +
   prop-bindings | net-new), an on-disk inventory (skip done work), per-slice file sizes, and
   the base-barrel report (which overlay primitives exist to import; nearest-match for absent ones).
2. Warm inputs to read yourself: ${designSource ? sidecar + '/extract.json (regions + classed entries + literal harvest + props + variantProposals + notes[] — read each note file), the slice files of the regions you plan to bind (region slices, not whole screens), ' : ''}token files +
   the design doctrine${doctrinePath ? ' (' + doctrinePath + ')' : ''}, the spec ## UI section, the match-map.
3. Resolve BEFORE emitting skeletons (batch, never mid-authoring)${designSource
    ? ' — these are the Fable-retainer judgment points (Agent {model:"fable"}, Opus fallback; SendMessage the SAME agent rather than re-spawning), not decided inline by the transcribing session'
    : ''}: token forks alias-first
   (new-role → extend after the near-match dedup check; same role/different value = fork →
   AskUserQuestion local-exception vs token-change); doctrine tensions by the ruling's grounding
   (taste → mock wins silently; grounded → snap value to constraint, ask only if irreconcilable);
   confirm each match-map bind against its slice${designSource ? ' — component-boundary/reuse calls against the existing catalog, and any blocked/ambiguous binding, are exactly these judgment points' : ''}. Absent base primitive → AskUserQuestion
   author-as-foundation vs near-match reuse (default-author when no near-match).
${designSource ? SKELETON_SHAPE_MOCK : SKELETON_SHAPE_NOMOCK}
   coherenceGroup/waveOrder are session-side scratch for building the workflow groups arg.
5. Validate: node ${skCheck} ${sidecar}/skeletons.json — fix and re-run until clean.
6. Re-run this driver. You write NO framework code in this step.`,

  SKELETONS_INVALID: () => `## Step: fix skeletons.json — structural check failed
${detail}

Fix the listed entries in ${sidecar}/skeletons.json (the plan, not the code), re-run
node ${skCheck} ${sidecar}/skeletons.json until clean, then re-run this driver.`,

  AUTHOR: () => `## Step: expand skeletons via wf-design (one gated run; Sonnet workers)
Build the groups arg from skeletons.json coherenceGroup/waveOrder: array of WAVES, each wave an
array of BATCHES {id, agentType, kind: foundation|implement|stories, files:[{path,action}]}.
Wave 1 = foundation (one batch: types+schemas+mocks) [+ shared-atom batch only if a real
usedBy≥2 atom exists]; next wave = one implement batch PER coherence group (its components AND
their catalog entries); final wave = the living showcase entry as its own stories batch. Even a
single batch is [[{...}]]. Unsure → more waves (serial), never a fatter wave.

Invoke Workflow {scriptPath: "${wfDesign}", args: {stage: "author",
  specPath: "${specPath}", skeletonPath: "${sidecar}/skeletons.json", groups: <built above>,
  tokenPaths: [<from doctrine doc>], designDoctrinePath: "${doctrinePath}",
  componentManifestPath: "${componentManifestPath}",
  agentMap: <config agentMap>, doctrinePaths: {<host agent name: .claude/agents/<name>.md>},
  gate: {command: "${gateCmd}"}, pipelineRulesPath: "${config.pipelineRules || ''}"}}
args = real JSON object; paths/ids/enums only — no prose.

Returns: complete → checkpoint-commit, then run:  spec-design-driver ${specPath} --mark author-green --run-id <runId>
${designSource ? '(the mark runs the mock fidelity gate — strings/order/layout vs extract.json — FAIL-CLOSED;\na refusal lists the divergences to fix or delta with evidence)\n' : ''}complete-ungated → the gate resolved to ${UNGATED_GATE} — verification is absent. Checkpoint-commit,
then route straight to /spec:review ${specPath} stating plainly that this round shipped with zero
deterministic verification. NEVER run --mark author-green for this return — that mark is a green
claim this run did not earn.
blocked → resolve within the skeleton's intent (write the ruling to the on-disk plan: the
skeleton entry / tokenForks / token file / spec Decisions) or AskUserQuestion for a genuine
fork — build it from the return's own \`blocked.options[].consequence\` (each option's
description: what it costs / what happens) and \`blocked.recommendation\` (the option to
present first, labeled "(Recommended)") rather than re-deriving them; then re-invoke the same
Workflow with resumeFromRunId. Anything else (gate-exhausted / out-of-scope) → read the
failures, fix on disk (dispatch Sonnet), re-invoke. A green author is "structural
(skeleton-expanded) — NOT visually approved."`,

  FIDELITY_REVIEW: () => {
    const shot = design.screenshot
      ? 'the host screenshot command: ' + design.screenshot
      : 'a catalog instance the USER runs (ask them; the catalog command is theirs, never yours)'
    return `## Step: exit fidelity review (one expensive-seat consult after the gate, before iteration — judgment, never a fail-closed verdict)
Scope: first pass covers everything this spec landed; any re-review covers ONLY changed entries
+ the showcase.
${designSource && exists('extract.json') ? `Mock-bound — the design source is the ground truth: compare RENDER vs MOCK, region by region.
1. Screenshot each bound region's rendered catalog entry via ${shot}.
2. Screenshot the matching bound mock slice(s): ${sidecar}/slice-*.html (or, if the mock cannot
   be rendered in this environment, review the region SLICES (markup) instead — say so in the log).
3. Dispatch ONE vision-capable consult (Agent {model:"fable"}, Opus fallback) with both sets of
   images: compare render vs mock REGION BY REGION and return a divergence list keyed by regionRef
   — judge only what the deterministic gate cannot see (copy/order/layout are already verified):
   structure & element order, spacing rhythm, size hierarchy, color-ROLE usage (the tokenMap
   applied, incl. dark/mobile variant obligations), alignment, empty/error/long-string states,
   showcase coherence.` : `No mock bound — critique the render against skeletons + doctrine.
1. Screenshot the catalog entries via ${shot}.
2. Read the images and critique for real against ${sidecar}/skeletons.json and the design
   doctrine${doctrinePath ? ' (' + doctrinePath + ')' : ''}: structure & element order, spacing
   rhythm, size hierarchy, color-ROLE usage, alignment, empty/error/long-string states, showcase
   coherence.`}
The divergence/critique list is NOT applied here and is NEVER a fail-closed verdict — it becomes
the first round's notes in the human catalog loop next (a ruling, then a fix or an evidence-gated
${sidecar}/deltas.json row; the consult's opinion alone is never sufficient evidence — shared §
mock supremacy). It never writes ${sidecar}/deltas.json itself.
Then:  spec-design-driver ${specPath} --mark fidelity-reviewed`
  },

  ITERATE: () => `## Step: human catalog loop (round ${(marks.rounds || 0) + 1}; cold between rounds by design)
Hand off with exactly this block (real values; the user runs the command — never launch it):
  🎨 **ready for review** — run: \`${design.command}\` (showcase first)
  🔗 <one navigation line per story/entry touched this round: WHERE to look, not just what.
     Lead with the catalog's searchable keyword in backticks — the string the user pastes into
     the catalog's search box, shaped for the preview host's search/deep-link affordances
     (Storybook: the Find-components input matches space-separated words, NOT slashed paths):
     emit the title's last segment + the story name as plain words (e.g. \`Showcase Chat Thread\`
     for Canon/Showcase → Chat Thread), never the slashed title or the export's camelCase. Then
     the deep link when the preview host supports one; deep links are mechanically derivable —
     derive them, never omit (Storybook: /?path=/story/<title-slug>--<export-slug> from the
     story title + export name). No search or deep links → the path within the catalog. A
     component landing inside an existing entry names its row/section.>
  🆕 <components added/changed this round>
  👀 <one line per component: what to look for>
AskUserQuestion: Approve / Iterate (notes via Other). Dismissed → STOP (state is on disk).

Iterate round protocol:
- Append every ruling to ${logPath} (one line each: note → ruling → files touched). The log is
  the loop's memory — the next round's judge reads it instead of a warm session remembering.
- ONE warm Sonnet iteration worker: first round spawn it (it reads canon once); later rounds
  SendMessage to the SAME worker with the round's notes batched per owning surface. Micro-edit
  exception: a one-line change with exact old/new strings → apply directly via Edit.
- A note demanding a data-shape change, or contradicting a locked Decision / the doctrine, is
  not a tweak: AskUserQuestion (doctrine: local exception recorded in spec Decisions, or
  doctrine change with older surfaces recorded as a known gap). Apply the ruling to the plan
  (skeleton entry / tokenForks / token file / Decisions) and re-expand affected surfaces.
- Dependent sweep before closing the round: for every user-visible string or prop changed this
  round, grep the OLD value across stories/tests/the showcase and fix stale references — a copy
  fix that leaves a play-function regex or test matcher behind kills that story/test silently.
- Gate (${gateCmd || 'host gate'}) + checkpoint-commit per round; every round ends green, then:
  spec-design-driver ${specPath} --mark round-green${designSource ? '\n  (the mark re-runs the mock fidelity gate FAIL-CLOSED — a regression this round refuses the mark)' : ''}
On Approve:  spec-design-driver ${specPath} --mark approved`,

  RECONCILE: () => `## Step: reconcile & promote (inline dispatches — no workflow boot)
1. Sonnet Agent (paths only): update the spec to approved reality — ONLY the UI section (final
   APIs + states), File Plan (landed files; CREATE rows stay listed), Contracts (shape changes),
   new Decisions rows for Phase-3 rulings. Never frontmatter/Goal/Rationale/ACs.
2. Haiku Agent structural re-read: every landed file in the File Plan; UI APIs match real
   props/states; edits nothing. Divergence → ONE Sonnet repair, re-verify; still divergent →
   surface to the user and STOP (cap 1).
3. Promote: generalizable taste rulings → the doctrine doc (keep it one page; prune as you
   promote); tokens stay in token files; one-offs stay in spec Decisions. Read ${logPath} for
   the rounds' rulings.${designSource ? ' Fold every ' + inSidecar('deltas.json') + ' row into a spec\n   Decisions row (target + sliceQuote + proof) — the sanctioned divergences must survive the\n   sidecar deletion below.' : ''}
4. AFTER the re-read verifies clean and BEFORE the final commit: rm -rf ${sidecar}/ and any
   leftover scratchpad .dc.html (the session owns this rm; reconcile folded the plan into the spec).
5. Set designed: <today> in frontmatter (status stays hardened). Final checkpoint-commit.
6. Report: components/entries landed, reuse-gate hits, fork rulings, rounds, spec deltas,
   doctrine promotions, workflow token spend. Next: /spec:build ${specPath}`,

  DONE: () => `designed: ${designed} is set — the design stage is complete for this spec.
Next: /spec:build ${specPath}. (Re-design: confirm with the user, remove designed:, delete any
${sidecar}/ leftovers, re-invoke.)`,
}

const designFlagNote = (designFlag === 'false' && state !== 'DONE' && state !== 'BLOCKED')
  ? 'NOTE: frontmatter says design: false — confirm intent with the user before proceeding.\n'
  : ''
process.stdout.write(`[spec-design-driver] state: ${state}  spec: ${specPath}\n` +
  `(re-run this driver after completing the step; it verifies artifacts and prints the next one)\n` +
  componentManifestWarning +
  droppedGateLegsNote +
  designFlagNote + '\n' +
  STEPS[state]() + '\n')
process.exit(state === 'BLOCKED' ? 2 : 0)
