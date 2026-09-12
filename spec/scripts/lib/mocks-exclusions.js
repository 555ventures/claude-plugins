'use strict'
// lib/mocks-exclusions.js — pure derivation of exclusion-row candidates from the three sources
// the pipeline already records: discovery non-goals, a client's "no" on an invented row, and a
// client's not-needed withdrawal, plus (specs/20260911/05-approval-is-bookkeeping.md D1) the one
// ledger-TEXT transform every caller shares: `materialize`. specs/20260910/05-what-the-journey-
// does-not-do.md D2, AC-20260910-05-2. This module never touches fs and never writes to disk —
// `materialize` takes and returns ledger TEXT (via lib/mocks-ledger.js's own parse/append/
// setStatus), so callers (mocks-driver.js's `ledger derive`/`client open`/`approved`,
// design-atlas.js's walk-page route) own the one file write.
//
//   deriveExclusions({ brief, notes, ledger, seedJourneys }) → { add, retire, reopen }
//     add     every derived { claim, source, screen, journey } entry whose `source` matches no
//             active (non-`overridden`) existing exclusion row's `note`, AND no `overridden` row
//             either — a source never seen before.
//     retire  every active (non-`overridden`) existing exclusion row (from `ledger`) whose
//             `note` matches no derived entry's `source` this run — its source decision was
//             undone.
//     reopen  every EXISTING `overridden` exclusion row whose `note` matches a derived entry's
//             `source` again this run — its source decision was reinstated (a non-goal line
//             re-added, an answer flipped back, a withdrawal un-done). The caller sets that
//             row's status back to `open` via its `id` rather than appending a duplicate row —
//             a row's identity is its `note` (see below), so the same source must never own two
//             rows.
//     brief         the genesis brief's raw text (`.claude/genesis/brief.md`), or null when it
//                   does not exist (A1) — a null brief simply yields no non-goal entries.
//     notes         design/mocks/notes.json, raw array.
//     ledger        parseLedger(...).assumptions — read for two reasons: (a) an invented-row "no"
//                   answer is only a source when the answered row's `tag` is "invented", and (b)
//                   idempotence — an entry whose `source` already appears as an existing
//                   exclusion row's `note` is omitted, so re-deriving only ever adds what is new.
//     seedJourneys  the {journeyName -> {labels, ...}} map lib/surfaces.js's parseSeedJourneys /
//                   design-atlas.js's parseSeedJourneys already return everywhere else in this
//                   codebase — used only to resolve a screen to the journey that declares it.
//
// Three sources (D2):
//   (a) every `## Non-goals` line of `brief` tagged `Later` or `Won't-this-time` — claim is the
//       line's own text (its tag stripped), source is `'non-goal: ' + claim` (the brief LINE,
//       never the tag — see the idempotence note below), screen/journey null (project-wide).
//   (b) every `kind: "question"` note answered `no` whose ledger row (by `ledgerId`) is tagged
//       `invented` — claim is `"not: " + row.claim`, screen is the note's own screen, journey is
//       whichever seed journey declares that screen.
//   (c) every client-origin note with `resolution: "withdrawn"` and `withdrawReason: "not-needed"`
//       — claim is the note's own text, screen/journey as (b).
//
// Does NOT: read or write files, decide `status` beyond the fixed add/retire/reopen shape above,
// know the D1 `note` grammar's exact string beyond composing `source` (materialize writes that
// string into the row's `note` cell verbatim), or dedupe entries against each other (a brief
// cannot both name and not name the same non-goal line twice, and the two note-derived sources
// key on distinct note ids).
//
// specs/20260911/05-approval-is-bookkeeping.md D1:
//   materialize({ text, brief, notes, seedJourneys, today }) → { text, total, added, retired, reopened }
//     Runs deriveExclusions over `text` (parsed), appends every `add` entry as a new `open`
//     exclusion row (id = nextExclusionId), sets every `reopen` row back to `open`, sets every
//     `retire` row to `overridden <today>` — verbatim the transform mocks-driver.js's own
//     `deriveAndAppendExclusions` performed before D1 moved it here. `today` is passed in, never
//     derived internally, so a caller (or a test) controls the dated `overridden` stamp. Returns
//     the resulting ledger `text` plus the same `{total, added, retired, reopened}` counts the
//     caller already prints. A client's `verdict: 'needed'` answer (D3) sets a row's `rejected`
//     cell to `client-needed`; deriveExclusions (below) never reopens or re-adds such a row even
//     when its source is still live in the brief — the client's answer is final.
//
// Exit codes: none — this is a library, not an executable.

const { parseLedger, appendAssumption, setStatus } = require('./mocks-ledger')

// Row-level split/escape, duplicated (not imported — mocks-ledger.js exports no per-cell writer
// beyond `setStatus`'s status/tag pair) so `setExclusionVerdict` below can rewrite an EXISTING
// row's `rejected` cell in place, which no exported function does. Byte-identical algorithm to
// mocks-ledger.js's own private splitRow/escapeCell — keep them in sync if that grammar changes.
function splitRow(line) {
  if (!/^\s*\|.*\|\s*$/.test(line)) return null
  const raw = line.trim().slice(1, -1)
  const cells = []
  let cur = ''
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (ch === '\\' && raw[i + 1] === '|') { cur += '|'; i++ } else if (ch === '|') { cells.push(cur.trim()); cur = '' } else cur += ch
  }
  cells.push(cur.trim())
  return cells
}
function escapeCell(s) { return String(s == null ? '' : s).replace(/\|/g, '\\|') }

const NON_GOALS_HEADING_RE = /^##\s*Non-goals\s*$/
const NON_GOAL_LINE_RE = /^-\s*(.+?)\s*—\s*(.+?)\s*$/
const NON_GOAL_TAGS = ["Later", "Won't-this-time"]

function nonGoalEntries(brief) {
  if (!brief) return []
  const lines = String(brief).split('\n')
  let inSection = false
  const out = []
  for (const line of lines) {
    if (NON_GOALS_HEADING_RE.test(line.trim())) { inSection = true; continue }
    if (inSection && /^##\s/.test(line.trim())) break
    if (!inSection) continue
    const m = NON_GOAL_LINE_RE.exec(line)
    if (!m) continue
    const [, claim, tag] = m
    if (!NON_GOAL_TAGS.includes(tag)) continue
    const trimmedClaim = claim.trim()
    out.push({ claim: trimmedClaim, source: 'non-goal: ' + trimmedClaim, screen: null, journey: null })
  }
  return out
}

function journeyForScreen(seedJourneys, screen) {
  if (!seedJourneys || screen == null) return null
  for (const [name, j] of seedJourneys) {
    if ((j && j.labels || []).includes(screen)) return name
  }
  return null
}

function invalidatedAnswerEntries(notes, ledger, seedJourneys) {
  const rows = ledger || []
  const out = []
  for (const n of (notes || [])) {
    if (n.kind !== 'question') continue
    if (!n.answer || n.answer.verdict !== 'no') continue
    const row = rows.find((r) => r.id === n.ledgerId)
    if (!row || row.tag !== 'invented') continue
    out.push({
      claim: 'not: ' + row.claim,
      source: 'answer: ' + n.id,
      screen: n.screen || null,
      journey: journeyForScreen(seedJourneys, n.screen),
    })
  }
  return out
}

function withdrawnNotNeededEntries(notes, seedJourneys) {
  const out = []
  for (const n of (notes || [])) {
    if (n.kind === 'question' || n.kind === 'walk') continue
    if (n.origin !== 'client') continue
    if (n.resolution !== 'withdrawn' || n.withdrawReason !== 'not-needed') continue
    out.push({
      claim: n.text || '',
      source: 'withdrawn: ' + n.id,
      screen: n.screen || null,
      journey: journeyForScreen(seedJourneys, n.screen),
    })
  }
  return out
}

// D2: idempotence — an entry whose `source` already appears as an ACTIVE existing exclusion
// row's `note` is omitted from `add`, so a session can re-run `ledger derive` freely. `retire`
// is every active existing exclusion row whose `note` matches no derived entry's `source` —
// its source decision was undone (a non-goal retagged `In` or deleted, an answer changed, a
// withdrawal reversed). A row's identity is its `note`, which is why source (a) carries the
// brief LINE, never the tag: a shared `non-goal: Later` key would make every non-goal after the
// first invisible to `add` forever (AC-20260910-05-12).
//
// A retired (`overridden`) row is inert, not gone (D4: the `note` cell is the audit trail) — so
// an `overridden` row's `note` must NOT suppress its source the way an active row's does, or a
// reinstated source (the brief line comes back, the answer flips, the withdrawal is undone)
// could never be derived again. Excluding `overridden` rows from `existingSources` outright
// would instead make every reinstatement look brand-new and append a second row sharing the
// first row's `note` — breaking the row-identity invariant above and, downstream, showing the
// same claim twice on the player's last screen (`lib/walk-page.js`'s `exclusionsForJourney`
// renders every exclusion row for a journey with no status filter). So a reinstated source is
// routed to `reopen` (the existing `overridden` row, for the caller to flip back to `open`)
// instead of `add`, keeping one row per `note` for the life of the ledger (AC-20260910-05-13).
function deriveExclusions(input) {
  const o = input || {}
  const existingExclusionRows = (o.ledger || []).filter((r) => r.kind === 'exclusion')
  // A ledger status cell is one fixed word plus an OPTIONAL date (`overridden 2026-09-11`) —
  // mocks-driver.js writes the dated form, so comparing the whole cell to the bare word silently
  // never matches and a retired row can never be revived. Compare the word.
  const statusWord = (r) => String(r.status || '').trim().split(/\s+/)[0]
  const activeRows = existingExclusionRows.filter((r) => statusWord(r) !== 'overridden')
  const activeSources = new Set(activeRows.map((r) => r.note))
  const overriddenByNote = new Map()
  for (const r of existingExclusionRows) {
    if (statusWord(r) === 'overridden') overriddenByNote.set(r.note, r)
  }
  const all = []
    .concat(nonGoalEntries(o.brief))
    .concat(invalidatedAnswerEntries(o.notes, o.ledger, o.seedJourneys))
    .concat(withdrawnNotNeededEntries(o.notes, o.seedJourneys))
  const add = all.filter((e) => !activeSources.has(e.source) && !overriddenByNote.has(e.source))
  // specs/20260911/05-approval-is-bookkeeping.md D1: a row the client answered "No — we need
  // this" carries `rejected: 'client-needed'` — that answer is final, so such a row is excluded
  // from `reopen` even when its source is still live in the brief this run (it is already kept
  // out of `add` above via `overriddenByNote`, so it simply vanishes from derivation entirely).
  const reopen = all
    .filter((e) => !activeSources.has(e.source) && overriddenByNote.has(e.source))
    .map((e) => overriddenByNote.get(e.source))
    .filter((r) => r.rejected !== 'client-needed')
  const derivedSources = new Set(all.map((e) => e.source))
  const retire = activeRows.filter((r) => !derivedSources.has(r.note))
  return { add, retire, reopen }
}

// specs/20260910/05 D4 (moved here verbatim by specs/20260911/05 D1): exclusion rows get their
// own "E<n>" prefix, same derivation shape as mocks-driver.js's own nextLedgerId for "P<n>".
function nextExclusionId(parsed) {
  let max = 0
  for (const a of parsed.assumptions) {
    const m = /^E(\d+)$/.exec(a.id)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return 'E' + (max + 1)
}

// specs/20260911/05-approval-is-bookkeeping.md D1 — see the header comment above for the full
// contract. `add` entries are appended as new `exclusion` rows (`status: open`); `retire` rows
// are set to `overridden <today>` via `setStatus` — NEVER deleted, the `note` cell is the audit
// trail; `reopen` rows are set back to `open` via `setStatus` on that SAME row/id — never
// appended as a new row, which would give one `note` two rows and duplicate the claim on the
// player's last screen. Re-running over unchanged inputs appends, retires and reopens nothing
// (deriveExclusions' own idempotence key, matched by `note`), so a second run's `text` is
// byte-identical to the first.
function materialize(input) {
  const o = input || {}
  let text = o.text
  let parsed = parseLedger(text)
  const { add, retire, reopen } = deriveExclusions({
    brief: o.brief, notes: o.notes, ledger: parsed.assumptions, seedJourneys: o.seedJourneys,
  })
  for (const e of add) {
    const id = nextExclusionId(parsed)
    text = appendAssumption(text, {
      id, step: 'CLIENT', kind: 'exclusion', claim: e.claim, tag: 'said-by-user',
      status: 'open', rejected: null, dependents: null, note: e.source,
    })
    parsed = parseLedger(text)
  }
  for (const row of reopen) {
    text = setStatus(text, row.id, 'open')
    parsed = parseLedger(text)
  }
  for (const row of retire) {
    text = setStatus(text, row.id, 'overridden ' + o.today)
    parsed = parseLedger(text)
  }
  const total = parsed.assumptions.filter((a) => a.kind === 'exclusion').length
  return { text, total, added: add.length, retired: retire.length, reopened: reopen.length }
}

// specs/20260911/05-approval-is-bookkeeping.md D3: the client's verdict on a SINGLE open
// exclusion row — `agree` sets `confirmed <today>` (setStatus already does this); `needed` sets
// `overridden <today>` AND stamps the row's own `rejected` cell `client-needed`, which
// `deriveExclusions` above reads to never reopen or re-add it. `setStatus` (mocks-ledger.js)
// rewrites only the status/tag cells, so a `needed` verdict rewrites the row directly here rather
// than widening that module for this one caller. Throws the same "no Assumptions row" error
// setStatus does when `id` is not found.
function setExclusionVerdict(text, id, verdict, today) {
  if (verdict !== 'agree' && verdict !== 'needed') throw new Error('verdict must be agree or needed')
  if (verdict === 'agree') return setStatus(text, id, 'confirmed ' + today)
  const lines = String(text).split('\n')
  for (let i = 0; i < lines.length; i++) {
    const cells = splitRow(lines[i])
    if (!cells || cells.length !== 9 || cells[0] !== id) continue
    cells[5] = 'overridden ' + today
    cells[6] = 'client-needed'
    lines[i] = '| ' + cells.map(escapeCell).join(' | ') + ' |'
    return lines.join('\n')
  }
  throw new Error('no Assumptions row with id "' + id + '" found')
}

module.exports = { deriveExclusions, materialize, setExclusionVerdict }
