'use strict'
// lib/mocks-exclusions.js — pure derivation of exclusion-row candidates from the three sources
// the pipeline already records: discovery non-goals, a client's "no" on an invented row, and a
// client's not-needed withdrawal. specs/20260910/05-what-the-journey-does-not-do.md D2,
// AC-20260910-05-2. Callers (mocks-driver.js's `ledger derive`) own turning the returned entries
// into actual `exclusion`-kind rows via lib/mocks-ledger.js's appendAssumption — this module never
// touches fs, never assigns an id, and never writes anything.
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
// Does NOT: read or write files, assign an exclusion its `id`, decide `status`, know the D1 `note`
// grammar's exact string beyond composing `source` (the caller writes that string into the row's
// `note` cell verbatim), or dedupe entries against each other (a brief cannot both name and not
// name the same non-goal line twice, and the two note-derived sources key on distinct note ids).
//
// Exit codes: none — this is a library, not an executable.

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
  const reopen = all
    .filter((e) => !activeSources.has(e.source) && overriddenByNote.has(e.source))
    .map((e) => overriddenByNote.get(e.source))
  const derivedSources = new Set(all.map((e) => e.source))
  const retire = activeRows.filter((r) => !derivedSources.has(r.note))
  return { add, retire, reopen }
}

module.exports = { deriveExclusions }
