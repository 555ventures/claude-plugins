#!/usr/bin/env node
'use strict'
// render-gate.js (--spec <spec.md> | --mocks <mock>…) [--root <dir>] [--out <dir>] [--json] [--no-boot]
//
// WHY: specs/20260824/01-render-gate.md (ADR-0002) — the render gate's driver. Two
// host spikes measured that fidelity between a mock and its built component can only be
// judged AT THE RENDER (painted text, in-flow order, bound-region geometry) — never from source
// diffing. This script is the one place that judgment runs mechanically: it derives the host's
// (mock x component) matrix from `design/targets.json` and the mock's own declared states,
// serves the mock side itself (D8 — so `../tokens.css` resolves without a host obligation),
// drives the host's OWN `design.render.capture` command per cell (D1 — the plugin never
// launches a browser, never names a tool), diffs each pair with render-compare.js, and reports
// a sentinel-terminated verdict `/spec:review` (or any script consumer) can trust without
// reading prose.
//
// specs/20260824/04-render-rules.md (D5): when the host config declares
// `design.rulesManifest`, every COMPONENT inventory (never the mock side, in --spec mode) is
// also run through render-rules.js after comparison — a rule finding prints under its cell
// (`rule <id> <kind> …`) and fails the gate exactly like a fidelity finding. No manifest
// declared prints one line (`rules: no design.rulesManifest declared — skipped`) and changes
// nothing else. The new `--mocks <mock>…` mode captures mock(s) only — no --spec, no ledger
// read, no component URL, no comparison — so /spec:sketch's exit can run the same rules over a
// brief's mocks before any component exists to compare against.
//
// What this deliberately does NOT do: compute or diff pixels (D7 — the capture contract this
// script issues has no screenshot flag, ever); pick a per-host geometry tolerance (D4's
// thresholds live in render-compare.js only); touch a process it did not itself spawn (D13's
// "a process it did not start is never touched" — the boot lifecycle below tracks its OWN child
// only); read anything outside the host's declared render config, targets.json, the resolved
// mock file(s), and the coverage ledger's own claims (--spec mode only — --mocks mode reads no
// ledger); interpret a renderCheck itself (render-rules.js owns that reading, this script only
// shells out to it per cell and folds its findings into its own output).
//
// Exit codes: 0 = pass (__RENDER_GATE_PASS__) · 1 = findings, including any unbound-state and
// any render-rules finding (__RENDER_GATE_FAIL__) · 2 = precondition failure (missing
// design.render, targets.json, design_source/--mocks file, ledger claim in --spec mode, a
// malformed design.rulesManifest per render-rules.js's own exit 2, or neither/both of --spec and
// --mocks given — stderr names the remedy) · 3 = capture-family failure (a capture command
// exiting non-zero, an unparsable inventory or render-rules --json payload, or a readiness
// timeout — stderr names the failed command/config key; never a pass and never printed alongside
// either sentinel).

const fs = require('fs')
const path = require('path')
const http = require('http')
const { spawn, spawnSync } = require('child_process')
const { readConfig, CONFIG_RELPATH } = require('./lib/host-config')
const { fmBlock, fmValue } = require('./lib/frontmatter')

const RENDER_COMPARE = path.join(__dirname, 'render-compare.js')
const RENDER_INVENTORY = path.join(__dirname, 'render-inventory.browser.js')
const RENDER_RULES = path.join(__dirname, 'render-rules.js')

function die(code, msg) {
  process.stderr.write('render-gate: ' + msg + '\n')
  process.exit(code)
}

// A script that prints a payload and exits routes through a synchronous writer — see
// spec/scripts/lib/driver-io.js for the 64 KiB pipe-truncation mechanism this avoids.
function writeOut(str) {
  const buf = Buffer.from(str + '\n', 'utf8')
  let off = 0
  while (off < buf.length) {
    try {
      off += fs.writeSync(1, buf, off, buf.length - off)
    } catch (e) {
      if (e.code === 'EAGAIN') continue
      throw e
    }
  }
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)) }

// ---- args ----------------------------------------------------------------------------------------
const argv = process.argv.slice(2)
function flagVal(name) {
  const i = argv.indexOf(name)
  return i > -1 ? argv[i + 1] : undefined
}
// D5: --mocks is a variable-arity flag — this repo's Worker Rules ban an arg-parsing library, so a
// repeated `--flag value` pair per mock (never a bare multi-token tail) is the hand-rolled shape.
function flagVals(name) {
  const out = []
  for (let i = 0; i < argv.length; i++) if (argv[i] === name) out.push(argv[i + 1])
  return out
}
const specPath = flagVal('--spec')
const mocksArgVals = flagVals('--mocks')
if (!specPath && !mocksArgVals.length) {
  die(2, 'usage: render-gate.js (--spec <spec.md> | --mocks <mock>…) [--root <dir>] [--out <dir>] [--json] [--no-boot]')
}
if (specPath && mocksArgVals.length) {
  die(2, 'render-gate.js takes exactly one of --spec or --mocks, not both')
}
const mode = specPath ? 'spec' : 'mocks'
const root = path.resolve(flagVal('--root') || process.cwd())
const asJson = argv.includes('--json')
const noBoot = argv.includes('--no-boot')
const outFlag = flagVal('--out')

let designSource = null
if (mode === 'spec') {
  if (!fs.existsSync(specPath)) die(2, 'spec not found: ' + specPath + ' — pass --spec <path to a spec.md>')
  const specText = fs.readFileSync(specPath, 'utf8')
  const fm = fmBlock(specText)
  designSource = fmValue(fm, 'design_source')
}

// ---- preconditions (exit 2, remedy named) ---------------------------------------------------------
const config = readConfig(root)
const renderConfig = config.design && config.design.render
if (!renderConfig || typeof renderConfig.capture !== 'string' || !renderConfig.capture.trim() ||
    typeof renderConfig.url !== 'string' || !renderConfig.url.trim()) {
  die(2, 'no usable design.render block in ' + path.join(root, CONFIG_RELPATH) + ' — declare ' +
    'design.render.capture and design.render.url (see spec/templates/grounding-contract.md) ' +
    '— this is the same precondition /spec:design stops on at preflight')
}

const targetsPath = path.join(root, 'design/targets.json')
let targets
try {
  targets = JSON.parse(fs.readFileSync(targetsPath, 'utf8'))
} catch (e) {
  die(2, 'design/targets.json is missing or unparsable at ' + targetsPath + ' (' + e.message + ') — ' +
    'copy it from the design-targets.json template (spec-paths templates) and declare themes[]/viewports[]')
}
if (!Array.isArray(targets.themes) || !targets.themes.length ||
    !Array.isArray(targets.viewports) || !targets.viewports.length) {
  die(2, 'design/targets.json at ' + targetsPath + ' must declare non-empty themes[] and ' +
    'viewports[] arrays — copy design-targets.json (the template) as a starting point')
}

// D5: --mocks mode takes its mock file list straight from argv — no design_source frontmatter to
// resolve, since there is no spec.
let mockFiles
if (mode === 'spec') {
  if (!designSource || !designSource.trim()) {
    die(2, specPath + ' frontmatter has no design_source — the render gate needs a mock file or a ' +
      'directory of mock files under design/')
  }
  const designSourceAbs = path.resolve(root, designSource)
  if (!fs.existsSync(designSourceAbs)) {
    die(2, 'design_source ' + designSource + ' does not exist under ' + root + ' — fix the spec ' +
      'frontmatter or restore the mock')
  }
  if (fs.statSync(designSourceAbs).isDirectory()) {
    mockFiles = fs.readdirSync(designSourceAbs).filter((f) => f.endsWith('.html')).sort()
      .map((f) => path.join(designSourceAbs, f))
  } else {
    mockFiles = [designSourceAbs]
  }
  if (!mockFiles.length) {
    die(2, 'design_source ' + designSource + ' resolves to a directory with no .html mock files under ' + root)
  }
} else {
  mockFiles = mocksArgVals.map((m) => path.resolve(root, m))
  for (const p of mockFiles) {
    if (!fs.existsSync(p)) die(2, '--mocks ' + p + ' does not exist under ' + root + ' — pass a real mock file path')
  }
}

const LABEL_RE = /data-screen-label\s*=\s*"([^"]+)"/
const STATE_BTN_RE = /data-state-btn\s*=\s*"([^"]+)"/g

function extractStates(html) {
  const seen = []
  let m
  STATE_BTN_RE.lastIndex = 0
  while ((m = STATE_BTN_RE.exec(html)) !== null) {
    if (!seen.includes(m[1])) seen.push(m[1])
  }
  return seen
}

const designDir = path.join(root, 'design')
// D5: --mocks mode reads no ledger at all — there is no component side to bind states to, so a
// coverage-ledger claim is not a precondition (Contracts: "no ledger read").
let ledger = null
if (mode === 'spec') {
  try { ledger = JSON.parse(fs.readFileSync(path.join(root, '.claude/design-coverage.json'), 'utf8')) } catch { /* handled below */ }
}

const mocks = mockFiles.map((absPath) => {
  const html = fs.readFileSync(absPath, 'utf8')
  const label = (LABEL_RE.exec(html) || [])[1]
  if (!label) {
    die(2, absPath + ' has no data-screen-label root — every mock the render gate walks needs one ' +
      '(see render-inventory.browser.js\'s entry rules)')
  }
  const rootRelPath = path.relative(root, absPath).split(path.sep).join('/')
  const designRelPath = path.relative(designDir, absPath).split(path.sep).join('/')
  let stories = {}
  if (mode === 'spec') {
    const claim = ledger && ledger.sources && ledger.sources[rootRelPath] &&
      ledger.sources[rootRelPath].regions && ledger.sources[rootRelPath].regions[label]
    if (!claim) {
      die(2, 'no coverage-ledger claim for ' + rootRelPath + ' region "' + label + '" in ' +
        path.join(root, '.claude/design-coverage.json') + ' — bind this surface (with its story ' +
        'ids) before running the render gate')
    }
    stories = (claim.stories && typeof claim.stories === 'object') ? claim.stories : {}
  }
  const rawStates = extractStates(html)
  const states = rawStates.length
    ? rawStates.map((name) => ({ name, captureArg: name }))
    : [{ name: 'default', captureArg: '-' }]
  return { absPath, label, rootRelPath, designRelPath, states, stories }
})

// ---- D11/D10: bound vs unbound states, cell derivation --------------------------------------------
// D5: --mocks mode has no stories to bind against (mock.stories is always {}), so the
// unbound-state gate below is --spec-mode-only — every declared state is captured directly.
const unboundFindings = []
const cells = []
for (const mock of mocks) {
  if (mode === 'spec') {
    const unbound = mock.states.filter((s) => mock.stories[s.name] === undefined)
    if (unbound.length) {
      for (const s of unbound) unboundFindings.push('unbound-state "' + mock.label + '" "' + s.name + '"')
      continue // D10: no capture for the WHOLE surface, not just its unbound state(s)
    }
  }
  for (const state of mock.states) {
    for (const theme of targets.themes) {
      for (const viewport of targets.viewports) {
        cells.push({ mock, state, theme, viewport })
      }
    }
  }
}

// ---- --out (default: session scratchpad, else <root>/.claude/spec-runs/render/<spec-stem>/) -------
const specStem = mode === 'spec' ? path.basename(specPath, '.md') : 'mocks'
const outDir = outFlag
  ? path.resolve(outFlag)
  : (process.env.CLAUDE_SCRATCHPAD || path.join(root, '.claude/spec-runs/render', specStem))
fs.mkdirSync(outDir, { recursive: true })

function viewportLabel(vp) { return vp.name || (vp.width + 'x' + vp.height) }

function substituteUrl(template, { story, theme, width, height, state }) {
  return template
    .replace(/\{story\}/g, story)
    .replace(/\{theme\}/g, theme)
    .replace(/\{width\}/g, String(width))
    .replace(/\{height\}/g, String(height))
    .replace(/\{state\}/g, state)
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
}
function contentTypeFor(p) { return MIME[path.extname(p).toLowerCase()] || 'application/octet-stream' }

// D8: the plugin serves the host's design/ directory itself so a mock's own `../tokens.css`
// resolves — the one Node http obligation this gate takes on instead of asking the host for it.
function startMockServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let urlPath
      try { urlPath = decodeURIComponent((req.url || '/').split('?')[0]) } catch { urlPath = '/' }
      if (urlPath.includes('..')) { res.writeHead(400); res.end(); return }
      const filePath = path.join(designDir, urlPath)
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return }
        res.writeHead(200, { 'Content-Type': contentTypeFor(filePath) })
        res.end(data)
      })
    })
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

// ---- D13: readiness/boot lifecycle -----------------------------------------------------------------
// Mirrors smoke.sh's own boot/ready contract. `bootChild` is module-scoped so the process-exit
// handler below can kill exactly (and only) the process THIS run started, on every exit path —
// success, a findings FAIL, a precondition die(), or a capture/readiness die() alike.
let bootChild = null
process.on('exit', () => {
  if (bootChild && bootChild.pid && !bootChild.killed) {
    try { process.kill(-bootChild.pid, 'SIGTERM') } catch { try { process.kill(bootChild.pid, 'SIGTERM') } catch { /* already dead */ } }
  }
})

function probeReady(cmd) {
  const r = spawnSync('bash', ['-c', cmd], { cwd: root, stdio: 'ignore' })
  return r.status === 0
}

async function ensureReady() {
  if (!renderConfig.ready) return // Behavior: neither ready nor boot declared -> assume up
  if (probeReady(renderConfig.ready)) return
  if (renderConfig.boot && !noBoot) {
    bootChild = spawn('bash', ['-c', renderConfig.boot], { cwd: root, detached: true, stdio: 'ignore' })
    bootChild.unref()
  }
  const timeoutMs = (Number(renderConfig.readyTimeout) || 120) * 1000
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (probeReady(renderConfig.ready)) return
    await sleep(2000)
  }
  die(3, 'design.render.ready never passed within ' + (timeoutMs / 1000) + 's — the render server ' +
    'never came up; check design.render.boot\'s own output, or raise design.render.readyTimeout')
}

// ---- capture ------------------------------------------------------------------------------------
// ASYNC, never spawnSync: this process also runs the D8 mock HTTP server in-process, and
// spawnSync blocks the whole event loop for the capture child's entire lifetime — starving the
// server of every connection a capture makes against it (measured: every `--url`/tokens.css fetch
// in the capture child timed out at 0, and the run itself paid each fetch's own timeout serially).
// spawn() + a Promise keeps the event loop free to service the server while the child runs.
function runCapture(url, width, height, theme, stateArg, outPath) {
  return new Promise((resolve) => {
    const parts = renderConfig.capture.trim().split(/\s+/)
    const [prog, ...baseArgs] = parts
    const args = [...baseArgs, '--url', url, '--width', String(width), '--height', String(height),
      '--theme', theme, '--state', stateArg, '--script', RENDER_INVENTORY, '--out', outPath]
    const cmdLine = [prog, ...args].join(' ')
    let child
    try {
      child = spawn(prog, args, { cwd: root })
    } catch (e) {
      resolve({ ok: false, message: 'capture command failed to spawn: ' + cmdLine + ' (' + e.message + ')' })
      return
    }
    let stderr = ''
    child.stderr.on('data', (d) => { stderr += d })
    child.on('error', (e) => {
      resolve({ ok: false, message: 'capture command died without an exit code: ' + cmdLine + ' (' + e.message + ')' })
    })
    child.on('close', (code, signal) => {
      if (code === null) {
        resolve({ ok: false, message: 'capture command died without an exit code: ' + cmdLine + ' (signal ' + signal + ')' })
        return
      }
      if (code !== 0) {
        resolve({ ok: false, message: 'capture command failed: ' + cmdLine + ' exit ' + code + (stderr.trim() ? '\n' + stderr.trim() : '') })
        return
      }
      try {
        JSON.parse(fs.readFileSync(outPath, 'utf8'))
      } catch (e) {
        resolve({ ok: false, message: 'capture wrote a missing/unparsable inventory at ' + outPath + ' (' + e.message + ') for: ' + cmdLine })
        return
      }
      resolve({ ok: true })
    })
  })
}

// ---- D5 (specs/20260824/04-render-rules.md): render-rules.js pass over one inventory ------------
// Shelled out exactly like runCompare() below — this script never interprets a renderCheck itself,
// it only hands render-rules.js a single inventory (D2: cta-count is "counted per inventory", so
// one call per cell keeps that arithmetic scoped correctly) and folds the findings it returns into
// this cell's own report. render-rules.js's own exit 2 (a malformed manifest — an unknown
// renderCheck.kind) is a precondition problem discovered late, not a findings run, so it maps to
// this script's own exit 2 rather than 1 or 3.
function runRules(inventoryPaths, rulesManifestAbs, tokensAbs) {
  const args = [RENDER_RULES, '--rules', rulesManifestAbs]
  for (const p of inventoryPaths) args.push('--inventory', p)
  args.push('--tokens', tokensAbs, '--json')
  const r = spawnSync(process.execPath, args, { encoding: 'utf8' })
  if (r.status === 2) {
    die(2, 'render-rules.js rejected ' + rulesManifestAbs + ': ' + (r.stdout + r.stderr).trim() +
      ' — fix the manifest (spec-paths templates has design-rules.json) and re-run')
  }
  try {
    return JSON.parse(r.stdout)
  } catch (e) {
    die(3, 'render-rules.js produced unparsable --json output for ' + rulesManifestAbs + ' (' + e.message + ')')
  }
}

function runCompare(mockOut, compOut, width) {
  const r = spawnSync(process.execPath, [RENDER_COMPARE, '--mock', mockOut, '--comp', compOut,
    '--width', String(width), '--json'], { encoding: 'utf8' })
  if (r.status === 2) {
    die(3, 'render-compare.js could not read its own generated inventories (' + mockOut + ', ' +
      compOut + '): ' + (r.stderr || r.stdout).trim())
  }
  try {
    return JSON.parse(r.stdout)
  } catch (e) {
    die(3, 'render-compare.js produced unparsable --json output for ' + mockOut + ' vs ' + compOut +
      ' (' + e.message + ')')
  }
}

// ---- main ---------------------------------------------------------------------------------------
// D5: design.rulesManifest resolution is shared by both modes — a declared manifest is run per
// cell over the COMPONENT inventory in --spec mode (never the mock side) or the mock inventory
// itself in --mocks mode (there is no other side); an absent manifest prints the one skip line
// and changes nothing else.
async function main() {
  const cellReports = []
  const excusedSeen = new Set()
  const excusedLines = []
  const rulesManifestRel = config.design && config.design.rulesManifest
  const rulesManifestAbs = rulesManifestRel ? path.join(root, rulesManifestRel) : null
  const tokensAbs = path.join(designDir, 'tokens.css')

  if (cells.length) {
    const server = await startMockServer()
    const port = server.address().port
    await ensureReady()

    for (const cell of cells) {
      const vpLabel = viewportLabel(cell.viewport)
      const base = cell.mock.label + '.' + cell.state.name + '.' + cell.theme + '.' + vpLabel
      const mockOut = path.join(outDir, base + '.mock.json')

      const mockUrl = 'http://127.0.0.1:' + port + '/' + cell.mock.designRelPath
      const mockResult = await runCapture(mockUrl, cell.viewport.width, cell.viewport.height, cell.theme, cell.state.captureArg, mockOut)
      if (!mockResult.ok) die(3, mockResult.message)

      if (mode === 'mocks') {
        let ruleFindings = []
        let rulePass = true
        if (rulesManifestAbs) {
          const rr = runRules([mockOut], rulesManifestAbs, tokensAbs)
          ruleFindings = rr.findings || []
          rulePass = rr.exit === 0
        }
        cellReports.push({
          label: cell.mock.label, state: cell.state.name, theme: cell.theme, viewport: vpLabel,
          findings: ruleFindings, counts: {}, pass: rulePass,
        })
        continue
      }

      const compOut = path.join(outDir, base + '.comp.json')
      const story = cell.mock.stories[cell.state.name]
      const compUrl = substituteUrl(renderConfig.url,
        { story, theme: cell.theme, width: cell.viewport.width, height: cell.viewport.height, state: cell.state.name })
      const compResult = await runCapture(compUrl, cell.viewport.width, cell.viewport.height, cell.theme, cell.state.captureArg, compOut)
      if (!compResult.ok) die(3, compResult.message)

      const cmp = runCompare(mockOut, compOut, cell.viewport.width)
      fs.writeFileSync(path.join(outDir, base + '.compare.json'), JSON.stringify(cmp))

      for (const line of cmp.excused || []) {
        if (!excusedSeen.has(line)) { excusedSeen.add(line); excusedLines.push(line) }
      }

      let ruleFindings = []
      let rulePass = true
      if (rulesManifestAbs) {
        const rr = runRules([compOut], rulesManifestAbs, tokensAbs)
        ruleFindings = rr.findings || []
        rulePass = rr.exit === 0
      }

      cellReports.push({
        label: cell.mock.label, state: cell.state.name, theme: cell.theme, viewport: vpLabel,
        findings: [...(cmp.findings || []), ...ruleFindings], counts: cmp.counts || {},
        pass: cmp.exit === 0 && rulePass,
      })
    }
    server.close()
  }

  const anyUnbound = unboundFindings.length > 0
  const anyDirtyCell = cellReports.some((c) => !c.pass)
  const exitCode = (anyUnbound || anyDirtyCell) ? 1 : 0
  const rulesSkipLine = rulesManifestRel ? null : 'rules: no design.rulesManifest declared — skipped'

  if (asJson) {
    writeOut(JSON.stringify({
      cells: cellReports, unboundStates: unboundFindings, excused: excusedLines,
      rulesDeclared: !!rulesManifestRel, exit: exitCode,
    }))
    process.exit(exitCode)
  }

  const lines = []
  for (const c of cellReports) {
    const counts = c.counts
    const summary = mode === 'spec'
      ? ': matched=' + (counts.matched || 0) + ' missing=' + (counts.missing || 0) +
        ' extra=' + (counts.extra || 0) + ' order=' + (counts.order || 0) + ' role=' + (counts.role || 0) +
        ' positioning=' + (counts.positioning || 0) + ' geometry=' + (counts.geometry || 0) +
        ' excused=' + (counts.excused || 0)
      : ''
    lines.push((c.pass ? '✅' : '❌') + ' ' + c.label + ' ' + c.state + ' ' + c.theme + ' ' + c.viewport + summary)
  }
  for (const f of unboundFindings) lines.push(f)
  for (const c of cellReports) for (const f of c.findings) lines.push(f)
  for (const e of excusedLines) lines.push(e)
  if (rulesSkipLine) lines.push(rulesSkipLine)
  lines.push(exitCode === 0 ? '__RENDER_GATE_PASS__' : '__RENDER_GATE_FAIL__')
  writeOut(lines.join('\n'))
  process.exit(exitCode)
}

main().catch((e) => {
  process.stderr.write('render-gate: ' + (e && e.stack ? e.stack : String(e)) + '\n')
  process.exit(3)
})
