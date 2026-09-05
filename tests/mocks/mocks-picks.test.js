'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { openStop, decideStop, consumeStop, pending, validatePicks } = require('../../spec/scripts/lib/mocks-picks')

// specs/20260905/01-picks-on-the-atlas-page.md D1, AC-20260905-01-1, AC-20260905-01-2: the sole
// reader/writer of design/mocks/picks.json plus its pure stop transforms (openStop, decideStop,
// consumeStop, pending, validatePicks).

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/

function pickCandidates() {
  return [
    { group: 'a', label: 'x', path: 'shapes/a.html' },
    { group: 'b', label: 'x', path: 'shapes/b.html' },
  ]
}

test('AC-20260905-01-1: openStop assigns P001-style ids with open/null defaults and supersedes the earlier stop sharing its key', () => {
  const r1 = openStop([], { kind: 'pick', key: 'shape-picked', title: 'pick a shape', candidates: pickCandidates() })
  assert.strictEqual(r1.stop.id, 'P001',
    'the first stop opened against an empty document must be assigned id P001 — spec 02\'s stop open links back to a stop by this exact id scheme')
  assert.strictEqual(r1.stop.status, 'open',
    'a freshly opened stop must start status open, or the served atlas would never list it under "Waiting for your look"')
  assert.strictEqual(r1.stop.decision, null, 'a freshly opened stop must carry decision:null until the page decides it')
  assert.strictEqual(r1.stop.url, null, 'url defaults to null when opened via the lib — only spec 02\'s stop open fills it')
  assert.match(r1.stop.openedAt, ISO_RE, 'openedAt must be an ISO timestamp so pending() can sort stops by recency')

  const r2 = openStop(r1.stops, { kind: 'pick', key: 'shape-picked', title: 'pick a shape again', candidates: pickCandidates() })
  assert.strictEqual(r2.stop.id, 'P002', 'a second stop must be assigned the next P00N id')
  const supersededP001 = r2.stops.find((s) => s.id === 'P001')
  assert.ok(supersededP001, 'the original stop must remain in the returned array, marked superseded — never deleted')
  assert.strictEqual(supersededP001.status, 'superseded',
    'openStop must supersede the earlier open stop sharing the same key, or a redraw after a change decision would leave two live blocks for the same section')
})

test('AC-20260905-01-1: decideStop on an open pick stop records the decision with note:null and an empty previous', () => {
  const { stops } = openStop([], { kind: 'pick', key: 'shape-picked', title: 'pick a shape', candidates: pickCandidates() })
  const r = decideStop(stops, 'P001', { verdict: 'pick', pick: 'b', by: 'jj' })
  assert.strictEqual(r.stop.status, 'decided', 'a successful decideStop must move the stop from open to decided')
  assert.strictEqual(r.stop.decision.pick, 'b', 'the recorded decision must carry the pick that was posted')
  assert.strictEqual(r.stop.decision.note, null,
    'an omitted why-line must record as note:null — the why-line is optional and may arrive on a later re-decide (D1)')
  assert.deepStrictEqual(r.stop.previous, [], 'the first decision on a stop must leave previous empty — nothing has been replaced yet')
})

test('AC-20260905-01-1: decideStop refuses a pick that is not among the candidate groups, naming the real targets', () => {
  const { stops } = openStop([], { kind: 'pick', key: 'shape-picked', title: 'pick a shape', candidates: pickCandidates() })
  assert.throws(() => decideStop(stops, 'P001', { verdict: 'pick', pick: 'z', by: 'jj' }),
    /a,\s*b/,
    'a pick outside the declared groups must throw naming the real targets (a, b) — a silent no-op would leave the author thinking their pick was recorded')
})

test('AC-20260905-01-1: decideStop refuses a verdict not allowed by the stop\'s kind, naming the kind', () => {
  const { stops } = openStop([], { kind: 'pick', key: 'shape-picked', title: 'pick a shape', candidates: pickCandidates() })
  assert.throws(() => decideStop(stops, 'P001', { verdict: 'approve', by: 'jj' }),
    /pick/,
    'an approve verdict on a pick stop must throw naming the stop\'s kind (pick) — pick stops take only pick|change per D1')
})

test('AC-20260905-01-1: decideStop on a decided stop replaces the decision and pushes the earlier one onto previous', () => {
  let { stops } = openStop([], { kind: 'pick', key: 'shape-picked', title: 'pick a shape', candidates: pickCandidates() })
  ;({ stops } = decideStop(stops, 'P001', { verdict: 'pick', pick: 'b', by: 'jj' }))
  const r = decideStop(stops, 'P001', { verdict: 'pick', pick: 'a', note: 'reads faster', by: 'jj' })
  assert.strictEqual(r.stop.decision.pick, 'a', 're-deciding a decided stop must overwrite pick with the new choice')
  assert.strictEqual(r.stop.decision.note, 'reads faster', 're-deciding must record the why-line arriving on the second look')
  assert.strictEqual(r.stop.previous.length, 1,
    'the earlier decision must be preserved under previous, or the session loses the record of what the user changed their mind about')
  assert.strictEqual(r.stop.previous[0].pick, 'b',
    'the previous entry must hold the exact earlier decision (pick b), not a blanked or default record')
})

test('AC-20260905-01-1: consumeStop moves a decided stop to consumed and throws on an open stop', () => {
  let { stops } = openStop([], { kind: 'pick', key: 'consume-key', title: 'x', candidates: pickCandidates() })
  assert.throws(() => consumeStop(stops, 'P001'), Error,
    'consumeStop must refuse an open stop — only a decided stop is ready for the driver to consume')
  ;({ stops } = decideStop(stops, 'P001', { verdict: 'pick', pick: 'a', by: 'jj' }))
  const r = consumeStop(stops, 'P001')
  assert.strictEqual(r.stop.status, 'consumed',
    'consumeStop must move a decided stop to consumed so the page answers 409 on any further decision')
})

test('AC-20260905-01-1: decideStop refuses a consumed stop as "already consumed" and a superseded stop as "superseded"', () => {
  let { stops } = openStop([], { kind: 'pick', key: 'shape-picked', title: 'pick a shape', candidates: pickCandidates() })
  ;({ stops } = openStop(stops, { kind: 'pick', key: 'shape-picked', title: 'pick a shape again', candidates: pickCandidates() }))
  ;({ stops } = decideStop(stops, 'P002', { verdict: 'pick', pick: 'a', by: 'jj' }))
  ;({ stops } = consumeStop(stops, 'P002'))
  assert.throws(() => decideStop(stops, 'P002', { verdict: 'pick', pick: 'a', by: 'jj' }),
    /already consumed/,
    'deciding a consumed stop must throw the exact phrase "already consumed" D1 names, so a stale page reload gets an unambiguous refusal')
  assert.throws(() => decideStop(stops, 'P001', { verdict: 'pick', pick: 'a', by: 'jj' }),
    /superseded/,
    'deciding a superseded stop must throw "superseded" — a redraw already replaced it with a fresh stop under the same key')
})

test('AC-20260905-01-1: pending lists open stops before decided stops, each sorted newest first', () => {
  const base = { key: 'k', title: 't', question: null, url: null, decision: null, previous: [], candidates: pickCandidates() }
  const stops = [
    { ...base, id: 'P001', kind: 'pick', status: 'open', openedAt: '2026-01-01T00:00:00.000Z' },
    { ...base, id: 'P002', kind: 'pick', status: 'open', openedAt: '2026-01-03T00:00:00.000Z' },
    { ...base, id: 'P003', kind: 'pick', status: 'decided', openedAt: '2026-01-02T00:00:00.000Z',
      decision: { verdict: 'pick', pick: 'a', note: null, by: 'jj', at: '2026-01-02T01:00:00.000Z' } },
    { ...base, id: 'P004', kind: 'pick', status: 'decided', openedAt: '2026-01-04T00:00:00.000Z',
      decision: { verdict: 'pick', pick: 'a', note: null, by: 'jj', at: '2026-01-04T01:00:00.000Z' } },
    { ...base, id: 'P005', kind: 'pick', status: 'superseded', openedAt: '2026-01-05T00:00:00.000Z' },
    { ...base, id: 'P006', kind: 'pick', status: 'consumed', openedAt: '2026-01-06T00:00:00.000Z' },
  ]
  const { open, decided } = pending(stops)
  assert.deepStrictEqual(open.map((s) => s.id), ['P002', 'P001'],
    'open stops must sort newest openedAt first — the served atlas must show the most recent look stop at the top of its list')
  assert.deepStrictEqual(decided.map((s) => s.id), ['P004', 'P003'], 'decided stops must also sort newest openedAt first')
  assert.ok(!open.some((s) => ['P005', 'P006'].includes(s.id)) && !decided.some((s) => ['P005', 'P006'].includes(s.id)),
    'pending must exclude superseded and consumed stops entirely from both lists')
})

test('AC-20260905-01-2: decideStop refuses an empty-note change, naming note; a non-empty note records it', () => {
  const { stops } = openStop([], { kind: 'approve', key: 'journey-approved:j', title: 'approve journey j',
    candidates: [{ group: null, label: 'a', path: 'mocks/a.html' }] })
  assert.throws(() => decideStop(stops, 'P001', { verdict: 'change', note: '', by: 'jj' }),
    /note/,
    'a change decision with an empty note must throw naming "note" — a blank note would silently record with nothing for the driver to act on')
  const r = decideStop(stops, 'P001', { verdict: 'change', note: 'too dense', by: 'jj' })
  assert.strictEqual(r.stop.decision.note, 'too dense', 'a non-empty note on a change decision must be recorded verbatim')
  assert.strictEqual(r.stop.decision.verdict, 'change', 'the recorded verdict must be change')
})

test('AC-20260905-01-2: validatePicks returns one error each for a malformed id, kind, status, empty candidates, a pick stop with a null-group candidate, an approve stop with a non-null group, and a duplicate id', () => {
  const template = {
    kind: 'pick', key: 'k', title: 't', question: null,
    candidates: [{ group: 'a', label: 'l', path: 'p.html' }],
    url: null, openedAt: '2026-01-01T00:00:00.000Z', status: 'open', decision: null, previous: [],
  }
  const stops = [
    { ...template, id: 'X1' },
    { ...template, id: 'P901', kind: 'maybe' },
    { ...template, id: 'P902', status: 'done' },
    { ...template, id: 'P903', candidates: [] },
    { ...template, id: 'P904', kind: 'pick', candidates: [{ group: null, label: 'l', path: 'p.html' }] },
    { ...template, id: 'P905', kind: 'approve', candidates: [{ group: 'x', label: 'l', path: 'p.html' }] },
    { ...template, id: 'P906' },
    { ...template, id: 'P906' },
  ]
  const { errors } = validatePicks(stops)
  assert.strictEqual(errors.length, 7,
    'seven distinct problems must produce exactly seven errors — the duplicate id counted once, mirroring mocks-notes.js\'s own convention: got ' + JSON.stringify(errors))
  const joined = errors.join('\n')
  for (const needle of ['X1', 'P901', 'P902', 'P903', 'P904', 'P905', 'P906']) {
    assert.ok(joined.includes(needle),
      'the error list must name the offending stop id "' + needle + '" so an author can find which stop is malformed: got ' + JSON.stringify(errors))
  }
})

test('AC-20260905-01-2: validatePicks returns exactly one error naming key for a stop with an empty key', () => {
  const stop = {
    id: 'P901', kind: 'pick', key: '', title: 't', question: null,
    candidates: [{ group: 'a', label: 'l', path: 'p.html' }],
    url: null, openedAt: '2026-01-01T00:00:00.000Z', status: 'open', decision: null, previous: [],
  }
  const { errors } = validatePicks([stop])
  assert.strictEqual(errors.length, 1,
    'an otherwise-valid stop with only an empty key must yield exactly one error, not zero (the field going unchecked) or more than one: got ' + JSON.stringify(errors))
  assert.ok(errors[0].includes('key'),
    'the single error must mention "key" so an author can tell which field is empty: got ' + JSON.stringify(errors))
})
