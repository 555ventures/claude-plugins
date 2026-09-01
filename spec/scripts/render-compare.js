#!/usr/bin/env node
'use strict'
// render-compare.js --mock <mock.json> --comp <comp.json> --width <viewport px> [--json]
//
// WHY: specs/20260824/01-render-gate.md (2026-08-24, ADR-0002) — the render gate's comparison
// half. Two prax/salon-os spikes measured that a NAIVE mock<->component diff (raw textContent,
// raw position deltas, a bare screenshot) false-positives on every correct render: painted-case
// text differs from textContent (`4h`->`4H`), absolutely-positioned chips reorder harmlessly,
// data-positioned chart chips shift by design, and static mock controls legitimately render as
// real links. This script is the one place those measured exclusions and tolerances live, so
// render-gate.js's per-cell loop (and any future consumer) gets the same verdict from the same
// two inventory documents every time — deterministic, order-preserving, and standalone: it reads
// nothing but its own --mock/--comp files (D14), never touches design/, never launches a browser.
//
// What this deliberately does NOT do: compute or diff pixels (D7 — no screenshot input exists to
// diff); apply a per-host tolerance override (D4 — the geometry thresholds below are the measured
// zero-false-positive floors from two hosts, not a knob); read `name` (aria-label) for matching —
// it is a display facet only, never compared.
//
// Match (D2/D3): the ORDER sequence is each side's own entries with outOfFlow:false and
// srOnly:false, matched by LCS over painted `text` (document order preserved); the "out of
// order" remainder of that same multiset intersection prints one `order` finding per instance.
// Every other entry (outOfFlow:true or srOnly:true, either side) is matched by text multiset
// presence only, independent of position, and is exempt from the order check (D3). A matched
// pair's `text` is identical on both sides by construction.
//
// GEOMETRY (D4): dx = |mx-cx|/width, dw = |mw-cw|/width, dh = |mh-ch|/max(mh,ch); a pair is
// GEOMETRY-eligible only when neither side is fixed/sticky, neither side is srOnly, and neither
// side is dataPositioned (D3) — a pair differing on `fixed` is caught by the `positioning`
// finding instead (D5) and never double-counted here. Thresholds dx>1%, dw>1%, dh>15% are the
// measured floors (Decisions D4); `dyRel` is computed for `--json` only and never a finding
// (prax D9: it is poisoned by unbound-region height).
//
// The fixed-pair GEOMETRY exemption is a KNOWN, MEASURED blind spot — kept deliberately
// (re-litigated 2026-08-31, salon-os 候補選択): a docked CTA at 116px against the mock's 260px
// and a fixed soft-NG overlay's mis-sized controls passed 18/18 cells across three capture runs
// with both boxes sitting in the inventories; a human caught it by eye. Admitting dw/dh for
// both-fixed pairs was tried against every retained salon-os inventory pair the same day and
// REJECTED on the numbers: 516 dw / 130 dh findings over the accepted (human-approved) corpus —
// headers filling their bar where the mock's title hugs, buttons legitimately full-width where
// the mock caps them, text-wrap inflating dh — against ~30 on the known-defective run, with no
// separating threshold on any axis. Fixed chrome (headers, docked bars, overlays, tab bars) is
// where mock-vs-component structural liberty concentrates; its size stays human-reviewed
// (Storybook look), not gated. Reopen only with a corpus that separates.
//
// Auto-excuse (D6): a matched pair whose mock role is `button` or `text` and whose component
// role is `link` prints one veto line and is not a `role` finding — every other role mismatch
// is.
//
// Exit codes: 0 = clean (every count but matched/excused is 0) · 1 = findings · 2 = usage or an
// unreadable/unparsable --mock/--comp file (stderr names the file).

const fs = require('fs')

function die(msg) {
  process.stderr.write('render-compare: ' + msg + '\n')
  process.exit(2)
}

// D14's Worker-Rules-mandated synchronous writer: console.log() + process.exit() truncates a
// large payload at the 64 KiB pipe buffer while still exiting 0 (this repo's own 2026-08-23
// spec-status.js incident) — every print-then-exit site routes through this instead.
function writeOut(str) {
  const buf = Buffer.from(str, 'utf8')
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

const argv = process.argv.slice(2)
function flagVal(name) {
  const i = argv.indexOf('--' + name)
  return i > -1 ? argv[i + 1] : undefined
}
const mockPath = flagVal('mock')
const compPath = flagVal('comp')
const widthRaw = flagVal('width')
const asJson = argv.includes('--json')

if (!mockPath || !compPath || !widthRaw) {
  die('usage: render-compare.js --mock <mock.json> --comp <comp.json> --width <viewport px> [--json]')
}
const width = Number(widthRaw)
if (!Number.isFinite(width) || width <= 0) die('--width must be a positive number, got ' + JSON.stringify(widthRaw))

function readInventory(label, p) {
  let raw
  try {
    raw = fs.readFileSync(p, 'utf8')
  } catch (e) {
    die('--' + label + ' ' + p + ' is not readable (' + e.message + ') — pass a real inventory JSON path')
  }
  let doc
  try {
    doc = JSON.parse(raw)
  } catch (e) {
    die('--' + label + ' ' + p + ' is not valid JSON (' + e.message + ') — the capture command must write a parsable inventory')
  }
  if (!doc || !Array.isArray(doc.entries)) {
    die('--' + label + ' ' + p + ' has no entries array — not a render-inventory.browser.js document')
  }
  return doc
}
const mockDoc = readInventory('mock', mockPath)
const compDoc = readInventory('comp', compPath)

// ---- grouping (D2/D3): each side's own outOfFlow/srOnly flags decide its own group -------------
function isOrderSeq(e) { return e.outOfFlow !== true && e.srOnly !== true }
const mockOrder = mockDoc.entries.filter(isOrderSeq)
const compOrder = compDoc.entries.filter(isOrderSeq)
const mockOther = mockDoc.entries.filter((e) => !isOrderSeq(e))
const compOther = compDoc.entries.filter((e) => !isOrderSeq(e))

// ---- LCS over the ORDER sequence's painted text --------------------------------------------------
// Classic O(n*m) DP + greedy left-to-right backtrack. Ties are broken deterministically (prefer
// advancing the mock pointer) so identical inputs always produce the identical alignment — the
// determinism Behavior demands.
function lcsAlign(mockList, compList) {
  const m = mockList.length
  const n = compList.length
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = mockList[i].text === compList[j].text
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const pairs = []
  const usedMock = new Array(m).fill(false)
  const usedComp = new Array(n).fill(false)
  let i = 0, j = 0
  while (i < m && j < n) {
    if (mockList[i].text === compList[j].text) {
      pairs.push({ mock: mockList[i], comp: compList[j] })
      usedMock[i] = true
      usedComp[j] = true
      i++; j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++
    } else {
      j++
    }
  }
  return { pairs, usedMock, usedComp }
}
const { pairs: lcsPairs, usedMock: orderUsedMock, usedComp: orderUsedComp } = lcsAlign(mockOrder, compOrder)
const orderLeftoverMock = mockOrder.filter((_, idx) => !orderUsedMock[idx])
const orderLeftoverComp = compOrder.filter((_, idx) => !orderUsedComp[idx])

// ---- multiset-by-text matching for leftovers and for the "other" (outOfFlow/srOnly) group ------
// Greedy first-available pairing by exact text — position never participates (D3).
function multisetMatch(mockList, compList) {
  const byText = new Map()
  compList.forEach((e, idx) => {
    if (!byText.has(e.text)) byText.set(e.text, [])
    byText.get(e.text).push(idx)
  })
  const usedComp = new Set()
  const pairs = []
  const missing = []
  for (const e of mockList) {
    const bucket = byText.get(e.text)
    let hitIdx = null
    if (bucket) {
      for (const idx of bucket) {
        if (!usedComp.has(idx)) { hitIdx = idx; break }
      }
    }
    if (hitIdx === null) {
      missing.push(e)
    } else {
      usedComp.add(hitIdx)
      pairs.push({ mock: e, comp: compList[hitIdx] })
    }
  }
  const extra = compList.filter((_, idx) => !usedComp.has(idx))
  return { pairs, missing, extra }
}
const orderLeftover = multisetMatch(orderLeftoverMock, orderLeftoverComp)
const otherMatch = multisetMatch(mockOther, compOther)

// The `order` finding: present on both sides (multiset) but only reachable out of the LCS order —
// exactly orderLeftover's matched pairs (D14: count = present-both - LCS pairs).
const orderFindingPairs = orderLeftover.pairs

const missingEntries = [...orderLeftover.missing, ...otherMatch.missing]
const extraEntries = [...orderLeftover.extra, ...otherMatch.extra]

// Every matched pair, from every group, sorted into document order (mock's own `i`) so the
// per-pair role/positioning/geometry passes below are deterministic run to run.
const allPairs = [...lcsPairs, ...orderLeftover.pairs, ...otherMatch.pairs]
  .sort((a, b) => (a.mock.i ?? 0) - (b.mock.i ?? 0))

// ---- findings ------------------------------------------------------------------------------------
const findingLines = []
const excusedLines = []
let roleCount = 0
let positioningCount = 0
let geometryCount = 0
let excusedCount = 0

for (const e of missingEntries) findingLines.push('text-missing "' + e.text + '"')
for (const e of extraEntries) findingLines.push('text-extra "' + e.text + '"')
for (const p of orderFindingPairs) findingLines.push('order "' + p.mock.text + '"')

// D6: role divergence — auto-excuse static->link, everything else a role finding.
for (const p of allPairs) {
  if (p.mock.role === p.comp.role) continue
  const isStaticToLink = (p.mock.role === 'button' || p.mock.role === 'text') && p.comp.role === 'link'
  if (isStaticToLink) {
    excusedCount++
    excusedLines.push('📌 Auto-picked static→link excused: "' + p.mock.text +
      '" — a static mock control renders as a real link (veto: draw it as a link in the mock, ' +
      'or mark it data-contract="none")')
  } else {
    roleCount++
    findingLines.push('role "' + p.mock.text + '" (mock ' + p.mock.role + ', component ' + p.comp.role + ')')
  }
}

// D5: fixed-flag class change — excluded from GEOMETRY below, never double-counted.
for (const p of allPairs) {
  if (p.mock.fixed === p.comp.fixed) continue
  positioningCount++
  const dir = p.mock.fixed ? '(mock fixed, component in-flow)' : '(mock in-flow, component fixed)'
  findingLines.push('positioning "' + p.mock.text + '" ' + dir)
}

// D3/D4: GEOMETRY — eligible pairs only, one line per axis over its threshold.
const geometryPairsJson = []
let dyRelBaseline = null
for (const p of allPairs) {
  const eligible = p.mock.fixed !== true && p.comp.fixed !== true &&
    p.mock.srOnly !== true && p.comp.srOnly !== true &&
    p.mock.dataPositioned !== true && p.comp.dataPositioned !== true
  const mb = p.mock.box, cb = p.comp.box
  const dx = Math.abs(mb.x - cb.x) / width
  const dw = Math.abs(mb.w - cb.w) / width
  const denom = Math.max(mb.h, cb.h)
  const dh = denom > 0 ? Math.abs(mb.h - cb.h) / denom : 0
  // dyRel: y-drift RELATIVE to the first GEOMETRY-eligible matched pair (the baseline every
  // subsequent pair's own drift is measured against) — computed for --json only, never a
  // finding at any value (prax D9: absolute y is poisoned by unbound-region height upstream).
  let dyRel = null
  if (eligible) {
    if (!geometryPairsJson.length) dyRelBaseline = { my: mb.y, cy: cb.y }
    dyRel = (mb.y - dyRelBaseline.my) - (cb.y - dyRelBaseline.cy)
    geometryPairsJson.push({ text: p.mock.text, dx, dw, dh, dyRel })
  }
  if (!eligible) continue
  if (dx > 0.01) {
    geometryCount++
    findingLines.push('geometry dx ' + (dx * 100).toFixed(2) + '% "' + p.mock.text + '" (' + mb.x + 'px → ' + cb.x + 'px)')
  }
  if (dw > 0.01) {
    geometryCount++
    findingLines.push('geometry dw ' + (dw * 100).toFixed(2) + '% "' + p.mock.text + '" (' + mb.w + 'px → ' + cb.w + 'px)')
  }
  if (dh > 0.15) {
    geometryCount++
    findingLines.push('geometry dh ' + (dh * 100).toFixed(1) + '% "' + p.mock.text + '" (' + mb.h + 'px → ' + cb.h + 'px)')
  }
}

const matchedCount = allPairs.length
const missingCount = missingEntries.length
const extraCount = extraEntries.length
const orderCount = orderFindingPairs.length

// The summary key set is the machine contract Contracts locks (D14, D18): the aggregate field is
// spelled `geometry=<n>`, and every finding LINE reads `geometry dx/dw/dh …` verbatim. A caller
// asking "did any geometry finding fire" must probe the finding-line form (`geometry ` at line
// start), never the bare word anywhere in stdout — a clean run's `geometry=0` is not a finding.
const summary = 'matched=' + matchedCount + ' missing=' + missingCount + ' extra=' + extraCount +
  ' order=' + orderCount + ' role=' + roleCount + ' positioning=' + positioningCount +
  ' geometry=' + geometryCount + ' excused=' + excusedCount

const exitCode = (missingCount || extraCount || orderCount || roleCount || positioningCount || geometryCount) ? 1 : 0

if (asJson) {
  writeOut(JSON.stringify({
    findings: findingLines, excused: excusedLines,
    counts: {
      matched: matchedCount, missing: missingCount, extra: extraCount, order: orderCount,
      role: roleCount, positioning: positioningCount, geometry: geometryCount, excused: excusedCount,
    },
    geometryPairs: geometryPairsJson,
    exit: exitCode,
  }))
} else {
  const out = [...findingLines, ...excusedLines, summary].join('\n')
  writeOut(out)
}
process.exit(exitCode)
