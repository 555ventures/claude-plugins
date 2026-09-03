'use strict'
// lib/mocks-ledger.js — pure text-in/text-out parser, gate, counts, and row writer for the
// mocks provenance ledger (design/mocks/ledger.md). specs/20260902/06-mocks-provenance-
// ledger.md D1-D4, AC-20260902-06-1..5. Callers own all file I/O; this module never touches
// fs. The grammar, the blocking rule, and the counts-line shape are the spec's Contracts
// block verbatim — do not add fields or reorder columns without a new AC.
//
// Grammar (D1): two header-driven markdown tables.
//   Assumptions:      | id | step | kind | claim | tag | status | rejected | dependents | note |
//   Misunderstandings: | id | what | step | cost | note |
// Enum cells are exactly one fixed word: kind product|process, tag said-by-user|ratified-
// doc|inferred|invented, status (open|confirmed|overridden|decided) with an optional trailing
// ISO date — `decided` is restricted to process rows. Free text lives only in claim/rejected/
// note/what/cost; a literal pipe inside a cell is written `\|` and read back as `|`.
//
// Does NOT: read or write files, know about design/mocks/status.json or any driver state
// machine (spec 07), validate `step` against the enumerated list of stage names (any
// `^[A-Z][A-Z-]*$` token parses), or dedupe/normalize rows beyond flagging duplicate ids as
// an Err.
//
// Exit codes: none — this is a library, not an executable.

const ASSUMPTIONS_HEADER = ['id', 'step', 'kind', 'claim', 'tag', 'status', 'rejected', 'dependents', 'note']
const CATCHES_HEADER = ['id', 'what', 'step', 'cost', 'note']

const KINDS = ['product', 'process']
const TAGS = ['said-by-user', 'ratified-doc', 'inferred', 'invented']
const STATUS_WORDS = ['open', 'confirmed', 'overridden', 'decided']

const ID_RE = /^[A-Z]+\d+[a-z]?$/
const STEP_RE = /^[A-Z][A-Z-]*$/
const CATCH_ID_RE = /^M\d+$/
const STATUS_RE = /^(open|confirmed|overridden|decided)(?: (\d{4}-\d{2}-\d{2}))?$/

// Splits a markdown table row on unescaped `|`, trims each cell, and unescapes `\|` -> `|`.
// Returns null if the row does not look like a pipe row at all.
function splitRow(line) {
  if (!/^\s*\|.*\|\s*$/.test(line)) return null
  const raw = line.trim().slice(1, -1) // drop leading/trailing pipe
  const cells = []
  let cur = ''
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (ch === '\\' && raw[i + 1] === '|') {
      cur += '|'
      i++
    } else if (ch === '|') {
      cells.push(cur.trim())
      cur = ''
    } else {
      cur += ch
    }
  }
  cells.push(cur.trim())
  return cells
}

function escapeCell(s) {
  return String(s == null ? '' : s).replace(/\|/g, '\\|')
}

// Finds the header row (by cell NAMES, not position) and returns {headerLine, dataStart} or
// null. Scans from `from` to the end of `lines`.
function findHeader(lines, from, header) {
  for (let i = from; i < lines.length; i++) {
    const cells = splitRow(lines[i])
    if (cells && cells.length === header.length && header.every((h, j) => cells[j] === h)) {
      // next non-blank line is expected to be the `| - | - | ... |` separator row; skip it if present
      let start = i + 1
      const sep = splitRow(lines[start] || '')
      if (sep && sep.every((c) => /^-+$/.test(c))) start++
      return { headerIndex: i, dataStart: start }
    }
  }
  return null
}

function parseAssumptionRow(cells, lineNo, seenIds, errors) {
  const [id, step, kind, claim, tag, status, rejected, dependents, note] = cells
  if (!ID_RE.test(id)) {
    errors.push({ id: id || null, line: lineNo, column: 'id', message: `id "${id}" does not match ^[A-Z]+\\d+[a-z]?$` })
  } else if (seenIds.has(id)) {
    const firstLine = seenIds.get(id)
    errors.push({ id, line: [firstLine, lineNo], column: 'id', message: `duplicate id "${id}" on lines ${firstLine} and ${lineNo}` })
  } else {
    seenIds.set(id, lineNo)
  }
  if (!STEP_RE.test(step)) {
    errors.push({ id, line: lineNo, column: 'step', message: `step "${step}" does not match ^[A-Z][A-Z-]*$` })
  }
  if (!KINDS.includes(kind)) {
    errors.push({ id, line: lineNo, column: 'kind', message: `kind "${kind}" — allowed: ${KINDS.join('|')}` })
  }
  if (!TAGS.includes(tag)) {
    errors.push({ id, line: lineNo, column: 'tag', message: `tag "${tag}" — allowed: ${TAGS.join('|')}` })
  }
  const statusMatch = STATUS_RE.exec(status)
  if (!statusMatch) {
    errors.push({ id, line: lineNo, column: 'status', message: `status "${status}" — allowed: (${STATUS_WORDS.join('|')}) with an optional YYYY-MM-DD` })
  } else if (statusMatch[1] === 'decided' && kind === 'product') {
    errors.push({ id, line: lineNo, column: 'status', message: '"decided" status is restricted to process rows' })
  }
  return {
    id,
    step,
    kind,
    claim,
    tag,
    status: statusMatch ? statusMatch[1] : status,
    statusDate: statusMatch && statusMatch[2] ? statusMatch[2] : null,
    rejected,
    dependents,
    note,
    line: lineNo,
  }
}

function parseCatchRow(cells, lineNo, seenIds, errors) {
  const [id, what, step, cost, note] = cells
  if (!CATCH_ID_RE.test(id)) {
    errors.push({ id: id || null, line: lineNo, column: 'id', message: `catch id "${id}" does not match ^M\\d+$` })
  } else if (seenIds.has(id)) {
    const firstLine = seenIds.get(id)
    errors.push({ id, line: [firstLine, lineNo], column: 'id', message: `duplicate id "${id}" on lines ${firstLine} and ${lineNo}` })
  } else {
    seenIds.set(id, lineNo)
  }
  return { id, what, step, cost, note, line: lineNo }
}

function parseLedger(text) {
  const lines = String(text == null ? '' : text).split('\n')
  const errors = []

  const aHeader = findHeader(lines, 0, ASSUMPTIONS_HEADER)
  if (!aHeader) {
    errors.push({ id: null, line: null, column: null, message: 'no Assumptions table header found' })
  }
  const cHeader = findHeader(lines, 0, CATCHES_HEADER)
  if (!cHeader) {
    errors.push({ id: null, line: null, column: null, message: 'no Misunderstandings table header found' })
  }

  const assumptions = []
  const catches = []

  if (aHeader) {
    const seen = new Map()
    for (let i = aHeader.dataStart; i < lines.length; i++) {
      const line = lines[i]
      if (line.trim() === '') break
      const cells = splitRow(line)
      if (!cells) break
      if (cells.length !== ASSUMPTIONS_HEADER.length) {
        errors.push({ id: cells[0] || null, line: i + 1, column: null, message: `row has ${cells.length} cells, expected ${ASSUMPTIONS_HEADER.length}` })
        continue
      }
      assumptions.push(parseAssumptionRow(cells, i + 1, seen, errors))
    }
  }

  if (cHeader) {
    const seen = new Map()
    for (let i = cHeader.dataStart; i < lines.length; i++) {
      const line = lines[i]
      if (line.trim() === '') break
      const cells = splitRow(line)
      if (!cells) break
      if (cells.length !== CATCHES_HEADER.length) {
        errors.push({ id: cells[0] || null, line: i + 1, column: null, message: `row has ${cells.length} cells, expected ${CATCHES_HEADER.length}` })
        continue
      }
      catches.push(parseCatchRow(cells, i + 1, seen, errors))
    }
  }

  return { assumptions, catches, errors }
}

// D2: a ledger is blocked when a product row is invented (status !== overridden) or
// inferred+open. ratified-doc rows and every process row never block.
function gateVerdict(ledger) {
  if (!ledger || !Array.isArray(ledger.errors) || ledger.errors.length > 0) {
    return { open: false, blocking: [], errors: (ledger && ledger.errors) || [] }
  }
  const blocking = []
  for (const row of ledger.assumptions) {
    if (row.kind !== 'product') continue
    if (row.tag === 'invented' && row.status !== 'overridden') {
      blocking.push({ id: row.id, tag: row.tag, status: row.status })
    } else if (row.tag === 'inferred' && row.status === 'open') {
      blocking.push({ id: row.id, tag: row.tag, status: row.status })
    }
  }
  return { open: blocking.length === 0, blocking, errors: [] }
}

// D3: the one fixed counts-line shape.
function countsLine(ledger) {
  let said = 0
  let ratified = 0
  let inferred = 0
  let inferredOpen = 0
  let invented = 0
  let inventedOpen = 0
  let process = 0
  for (const row of ledger.assumptions) {
    if (row.kind === 'process') {
      process++
      continue
    }
    if (row.tag === 'said-by-user') said++
    else if (row.tag === 'ratified-doc') ratified++
    else if (row.tag === 'inferred') {
      inferred++
      if (row.status === 'open') inferredOpen++
    } else if (row.tag === 'invented') {
      invented++
      if (row.status === 'open') inventedOpen++
    }
  }
  const catches = ledger.catches.length
  return `📒 ledger: ${said} said-by-user · ${ratified} ratified-doc · ${inferred} inferred (${inferredOpen} open) · ${invented} invented (${inventedOpen} open) · ${process} process · ${catches} catches`
}

function validateAssumptionInput(row) {
  const errors = []
  const seen = new Map()
  if (!ID_RE.test(row.id || '')) errors.push(`id "${row.id}" does not match ^[A-Z]+\\d+[a-z]?$`)
  if (!STEP_RE.test(row.step || '')) errors.push(`step "${row.step}" does not match ^[A-Z][A-Z-]*$`)
  if (!KINDS.includes(row.kind)) errors.push(`kind "${row.kind}" — allowed: ${KINDS.join('|')}`)
  if (!TAGS.includes(row.tag)) errors.push(`tag "${row.tag}" — allowed: ${TAGS.join('|')}`)
  const statusText = row.statusDate ? `${row.status} ${row.statusDate}` : String(row.status)
  const statusMatch = STATUS_RE.exec(statusText)
  if (!statusMatch) errors.push(`status "${statusText}" — allowed: (${STATUS_WORDS.join('|')}) with an optional YYYY-MM-DD`)
  else if (statusMatch[1] === 'decided' && row.kind === 'product') errors.push('"decided" status is restricted to process rows')
  if (errors.length > 0) throw new Error(errors[0])
  void seen
  return statusText
}

// D4: appendAssumption writes one new Assumptions row before the blank line that ends the
// table (i.e. right after the last data row, or right after the separator row if the table
// is empty). Throws on a row that fails the grammar — never writes a bad row.
function appendAssumption(text, row) {
  const statusText = validateAssumptionInput(row)
  const lines = String(text).split('\n')
  const aHeader = findHeader(lines, 0, ASSUMPTIONS_HEADER)
  if (!aHeader) throw new Error('no Assumptions table header found')
  let insertAt = aHeader.dataStart
  for (let i = aHeader.dataStart; i < lines.length; i++) {
    if (lines[i].trim() === '') break
    if (!splitRow(lines[i])) break
    insertAt = i + 1
  }
  const cells = [
    row.id, row.step, row.kind, row.claim, row.tag, statusText,
    row.rejected == null || row.rejected === '' ? '-' : row.rejected,
    row.dependents == null || row.dependents === '' ? '-' : row.dependents,
    row.note == null || row.note === '' ? '-' : row.note,
  ].map(escapeCell)
  const newLine = `| ${cells.join(' | ')} |`
  lines.splice(insertAt, 0, newLine)
  return lines.join('\n')
}

function validateCatchInput(row) {
  if (!CATCH_ID_RE.test(row.id || '')) throw new Error(`catch id "${row.id}" does not match ^M\\d+$`)
}

// D4: appendCatch — same shape, the Misunderstandings table.
function appendCatch(text, row) {
  validateCatchInput(row)
  const lines = String(text).split('\n')
  const cHeader = findHeader(lines, 0, CATCHES_HEADER)
  if (!cHeader) throw new Error('no Misunderstandings table header found')
  let insertAt = cHeader.dataStart
  for (let i = cHeader.dataStart; i < lines.length; i++) {
    if (lines[i].trim() === '') break
    if (!splitRow(lines[i])) break
    insertAt = i + 1
  }
  const cells = [row.id, row.what, row.step, row.cost, row.note == null || row.note === '' ? '-' : row.note].map(escapeCell)
  const newLine = `| ${cells.join(' | ')} |`
  lines.splice(insertAt, 0, newLine)
  return lines.join('\n')
}

// D4: setStatus rewrites only the addressed row's status cell (and tag cell, when given) —
// every other byte in the text stays identical.
function setStatus(text, id, status, tag) {
  const lines = String(text).split('\n')
  const aHeader = findHeader(lines, 0, ASSUMPTIONS_HEADER)
  if (!aHeader) throw new Error('no Assumptions table header found')
  for (let i = aHeader.dataStart; i < lines.length; i++) {
    if (lines[i].trim() === '') break
    const cells = splitRow(lines[i])
    if (!cells) break
    if (cells.length !== ASSUMPTIONS_HEADER.length) continue
    if (cells[0] !== id) continue
    cells[5] = status
    if (tag) cells[4] = tag
    const escaped = cells.map(escapeCell)
    lines[i] = `| ${escaped.join(' | ')} |`
    return lines.join('\n')
  }
  throw new Error(`no Assumptions row with id "${id}" found`)
}

module.exports = { parseLedger, gateVerdict, countsLine, appendAssumption, appendCatch, setStatus }
