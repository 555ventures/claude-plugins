'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const fx = require('./wireframe-fixtures')

// specs/20261002/01-the-wireframe-command-runs-over-the-service.md — AC-20261002-01-7 through
// AC-20261002-01-11 (D6-D9): the round push, the pulled worklist, the journey confirmation and the
// waiver, and the closing mark. Every service answer is scripted on tests/walkthrough/stub-service.js.

const A = 'aaaaaaaaaaaa'
const BOTH_CURRENT = { 'owner-onboarding': fx.H_OWNER, 'team-invite': fx.H_TEAM }
const LATE = '2026-10-02T04:30:00.000Z'

function lines(text) { return text.split('\n').filter((l) => l.trim() !== '') }
function posts(stub) { return stub.log().filter((l) => l.method === 'POST') }
function markPosts(stub) { return stub.log().filter((l) => l.method === 'POST' && l.url.endsWith('/mark')) }
function link(stub) { return stub.url + '/p/hearwell' }

// A service-mode host against a fresh stub. `drawn` lists the journeys recorded drawn (and not
// approved); `approved` lists those approved on the current story.
async function host(t, answers, opts = {}) {
  const stub = await fx.startStub(t, answers)
  const root = fx.makeRoot({ block: stub.url, rows: opts.rows })
  const hashes = { 'owner-onboarding': fx.H_OWNER, 'team-invite': fx.H_TEAM }
  const journeys = {}
  for (const j of opts.drawn || []) journeys[j] = fx.journeyEntry({ approved: null, beats: hashes[j] })
  for (const j of opts.approved || []) journeys[j] = fx.journeyEntry({ approved: LATE, beats: hashes[j] })
  Object.assign(journeys, opts.journeys || {})
  fx.writeStatus(root, { journeys, pushed: opts.pushed === undefined ? null : opts.pushed })
  if (opts.screens !== false) fx.writeScreens(root)
  if (opts.round) fx.writeRound(root, opts.round, opts.roundJourneys || BOTH_CURRENT)
  return { stub, root }
}

function assertClean(r, root, what) {
  assert.deepStrictEqual(fs.readdirSync(r.tmp), [], what + ': the TMPDIR directory must be empty afterwards — a round file left behind is a second copy of the story to keep in step')
  assert.ok(!(r.stdout + r.stderr).includes(fx.TOKEN), what + ': neither stdout nor stderr may contain the token — a leaked token is a leaked credential')
  for (const f of fx.filesUnder(root)) {
    assert.ok(!fs.readFileSync(f).includes(fx.TOKEN), what + ': no file under the host may contain the token (' + f + ') — the token is never written')
  }
}

// ---- AC-7 -----------------------------------------------------------------------------------

test('AC-20261002-01-7: round push sends one POST holding the drawn journey and its four screens in order, records the round and a 64-hex digest, prints the link, cleans TMPDIR and never exposes the token', async (t) => {
  const { stub, root } = await host(t, { [fx.KEY.push]: [fx.pushedAnswer(1), fx.pushedAnswer(2)] }, { drawn: ['owner-onboarding'] })
  const r = fx.runDriver(root, ['round', 'push'])
  assert.strictEqual(r.status, 0, 'a push of a drawn journey must be accepted: ' + r.stderr)
  const post = posts(stub)
  assert.strictEqual(post.length, 1, 'exactly one POST must be sent — the round is one request: ' + JSON.stringify(stub.log().map((l) => l.method + ' ' + l.url)))
  assert.strictEqual(post[0].url, '/v1/projects/hearwell/rounds', 'the POST must go to the project\'s rounds path')
  const body = post[0].json
  assert.strictEqual(body.round, 1, 'the first push must be round 1 — the client numbers it from the folders on disk')
  assert.strictEqual(body.kind, 'wireframe', 'the round must be a wireframe round')
  assert.strictEqual(body.journeys.length, 1, 'only the drawn journey may be in the round — team-invite is not drawn')
  const j = body.journeys[0]
  assert.deepStrictEqual([j.id, j.title, j.persona, j.beats], ['owner-onboarding', 'Owner onboarding', fx.PERSONA, fx.H_OWNER],
    'the journey must carry the seed\'s id, the derived title, the seed\'s persona and the story hash: ' + JSON.stringify(j))
  assert.ok(!('state' in j.steps[0]), 'a beat without a state must send no state key — an empty key fails the contract')
  assert.strictEqual(j.steps[2].state, 'empty', 'the third beat must carry state "empty"')
  assert.deepStrictEqual(body.screens.map((s) => [s.name, s.state || null]),
    [['owner-intro', null], ['reciprocity-brief', null], ['roster-confirm', null], ['roster-confirm', 'empty']],
    'screens must go out sorted by name, the stateless file first, then states ascending: ' + JSON.stringify(body.screens.map((s) => [s.name, s.state])))
  assert.ok(r.stdout.includes('pushed round 1 — open at ' + link(stub)), 'the pushed line must carry the link: ' + r.stdout)
  const pushed = fx.readStatus(root).pushed
  assert.strictEqual(pushed.round, 1, 'status.pushed.round must record the round the client numbered')
  assert.match(pushed.digest, /^[0-9a-f]{64}$/, 'status.pushed.digest must be the 64-hex digest of the round')
  assertClean(r, root, 'first push')

  const again = fx.runDriver(root, ['round', 'push'])
  assert.strictEqual(again.status, 0, 'an idle re-push must exit 0: ' + again.stderr)
  assert.ok(lines(again.stdout).some((l) => l.startsWith('round 1 already carries this content — nothing sent')), 'an unchanged round must say it was already sent: ' + again.stdout)
  assert.strictEqual(posts(stub).length, 1, 'an unchanged round must send no second POST — identical rounds must not stack on the client\'s page')
  assertClean(again, root, 'idle re-push')

  fx.editScreen(root, 'owner-intro.json', (spec) => { spec.elements.title.props.text = 'You are invited to Hearwell today' })
  const changed = fx.runDriver(root, ['round', 'push'])
  assert.strictEqual(changed.status, 0, 'a changed screen must be pushed: ' + changed.stderr)
  assert.strictEqual(posts(stub).length, 2, 'a changed round must send a second POST')
  assert.strictEqual(posts(stub)[1].json.round, 2, 'the changed round must be numbered 2')
  assertClean(changed, root, 'changed push')

  fx.editScreen(root, 'owner-intro.json', (spec) => { spec.elements.title.props = { txet: 'x' } })
  const bad = fx.runDriver(root, ['round', 'push'])
  assert.strictEqual(bad.status, 2, 'a screen edited into an invalid shape after the mark must refuse at push: ' + bad.stdout)
  assert.ok(bad.stderr.includes('unknown-prop') && bad.stderr.includes('txet'), 'the refusal must name unknown-prop and txet: ' + bad.stderr)
  assert.strictEqual(stub.log().filter((l) => l.method === 'POST').length, 2, 'a refused push must send no request')
  assertClean(bad, root, 'refused push')
})

test('AC-20261002-01-7: a 401 bad-token answer exits 2 with the client\'s refusal line, leaves pushed unchanged and leaks nothing', async (t) => {
  const { root } = await host(t, { [fx.KEY.push]: [{ status: 401, body: { error: 'bad-token', detail: 'revoked', apiVersion: 1 } }] }, { drawn: ['owner-onboarding'] })
  const r = fx.runDriver(root, ['round', 'push'])
  assert.strictEqual(r.status, 2, 'a service refusal must surface as exit 2: ' + r.stdout)
  assert.ok(r.stderr.includes('walkthrough: bad-token'), 'the child\'s stderr must be relayed unchanged so the session sees the client\'s refusal: ' + r.stderr)
  assert.strictEqual(fx.readStatus(root).pushed, null, 'a refused push must leave status.pushed untouched')
  assertClean(r, root, '401 push')
})

test('AC-20261002-01-7: round push with no journey drawn refuses naming that', async (t) => {
  const { stub, root } = await host(t, {})
  const r = fx.runDriver(root, ['round', 'push'])
  assert.strictEqual(r.status, 2, 'there is nothing to send, so the push must refuse: ' + r.stdout)
  assert.ok(r.stderr.includes('no journey is drawn yet'), 'the refusal must say no journey is drawn yet: ' + r.stderr)
  assert.deepStrictEqual(stub.log(), [], 'a refused push must send no request')
  assertClean(r, root, 'empty push')
})

// ---- AC-8 -----------------------------------------------------------------------------------

const N1_TEXT = 'Make this button bigger.'
const N2_TEXT = 'A step is missing: I also pick my clinic.'
const PICKED = 'Yes, that is my team'
const n1 = (over) => fx.note('n1', { text: N1_TEXT, pickedText: PICKED, ...over })
const n2 = () => fx.note('n2', { screen: null, text: N2_TEXT })
const n3 = () => fx.note('n3', { status: 'answered' })

async function pull(t, { notes, journeys = [], approvals, noRound = false }) {
  const { stub, root } = await host(t, {
    [fx.KEY.notes]: [fx.notesAnswer(notes, journeys)],
    [fx.KEY.approvals]: [fx.approvalsAnswer(approvals || [])],
  }, { round: noRound ? 0 : 2, drawn: ['owner-onboarding'] })
  const r = fx.runDriver(root, ['round', 'pull'])
  return { r, stub, root, out: lines(r.stdout).map((l) => l.replace(/\s+$/, '')) }
}

test('AC-20261002-01-8: round pull writes both files, requests notes and approvals, and prints exactly the six worklist lines', async (t) => {
  const { r, stub, root, out } = await pull(t, { notes: [n1(), n2(), n3()], approvals: [fx.approval('owner-onboarding', { who: 'Mika' })] })
  assert.strictEqual(r.status, 0, 'a pull against an existing round must succeed: ' + r.stderr)
  const urls = stub.log().map((l) => l.url.split('?')[0])
  assert.ok(urls.includes('/v1/projects/hearwell/notes') && urls.includes('/v1/projects/hearwell/approvals'), 'both the notes and the approvals must be requested: ' + JSON.stringify(urls))
  assert.ok(fs.existsSync(path.join(fx.roundDir(root, 2), 'notes.json')) && fs.existsSync(path.join(fx.roundDir(root, 2), 'approvals.json')), 'both pulled files must be written under design/rounds/2/ — the marks read them, not the network')
  assert.deepStrictEqual(out, [
    'round 2 — 2 notes waiting for an answer',
    '  n1 [roster-confirm] "Make this button bigger." (on: "Yes, that is my team")',
    '  n2 [project] "A step is missing: I also pick my clinic."',
    'journeys:',
    '  owner-onboarding — confirmed by Mika (story 08363cd98ef8)',
    '  team-invite — not confirmed',
  ], 'the worklist must be exactly the six contract lines — the session acts on them literally: ' + r.stdout)
})

test('AC-20261002-01-8: a note\'s text is its last thread entry\'s, answered notes are not counted, and a note with a state names it', async (t) => {
  const thread = [1, 2, 3].map((i) => ({ by: i === 2 ? 'session' : 'client', text: i === 3 ? 'Still too small.' : 'entry ' + i, at: '2026-10-02T05:0' + i + ':00Z' }))
  const a = await pull(t, { notes: [n1({ thread }), fx.note('n2', { status: 'answered' })] })
  assert.ok(a.out.includes('round 2 — 1 note waiting for an answer'), 'one waiting note must read "1 note" in the singular: ' + a.r.stdout)
  assert.ok(a.out.includes('  n1 [roster-confirm] "Still too small." (on: "Yes, that is my team")'), 'a reopened note is waiting on the client\'s LAST words, not their first: ' + a.r.stdout)

  const s = await pull(t, { notes: [n1({ state: 'empty' })] })
  assert.ok(s.out.some((l) => l.startsWith('  n1 [roster-confirm@empty]')), 'a note carrying a state must print screen@state: ' + s.r.stdout)
})

test('AC-20261002-01-8: a waiting journey thread counts as a note and prints under the story tag; nothing waiting prints a zero count followed directly by the journeys header', async (t) => {
  const th = fx.journeyThread('team-invite', 'open', ['first words', 'Where do I pick my clinic?'])
  const waiting = await pull(t, { notes: [], journeys: [th] })
  assert.ok(waiting.out.includes('round 2 — 1 note waiting for an answer'), 'an open journey thread is one waiting item: ' + waiting.r.stdout)
  assert.ok(waiting.out.includes('  team-invite [story] "Where do I pick my clinic?"'), 'the thread prints its last entry under [story]: ' + waiting.r.stdout)

  const none = await pull(t, { notes: [n1({ status: 'answered' })] })
  assert.strictEqual(none.out[0], 'round 2 — 0 notes waiting for an answer', 'nothing waiting must print a zero count, plural: ' + none.r.stdout)
  assert.strictEqual(none.out[1], 'journeys:', 'the journeys header must follow the zero count directly: ' + none.r.stdout)
})

test('AC-20261002-01-8: confirmation reads the pulled approvals — a missing who falls back to "the client", any approval on the current story confirms, and an older one alone prints the stale hash', async (t) => {
  const noWho = await pull(t, { notes: [], approvals: [fx.approval('owner-onboarding')] })
  assert.ok(noWho.out.includes('  owner-onboarding — confirmed by the client (story 08363cd98ef8)'), 'an approval without who reads "the client": ' + noWho.r.stdout)

  const two = await pull(t, { notes: [], approvals: [fx.approval('owner-onboarding', { beats: A }), fx.approval('owner-onboarding', { by: 'owner', who: 'Dana' })] })
  const line = two.out.find((l) => l.includes('owner-onboarding')) || ''
  assert.ok(line.includes('— confirmed by') && !line.includes('older'), 'ANY approval on the current story confirms the journey, whatever order they arrive in: ' + two.r.stdout)

  const old = await pull(t, { notes: [], approvals: [fx.approval('owner-onboarding', { beats: A })] })
  assert.ok(old.out.includes('  owner-onboarding — confirmed an older story (aaaaaaaaaaaa, now 08363cd98ef8)'), 'a confirmation on an older story must name both hashes: ' + old.r.stdout)
})

test('AC-20261002-01-8: round pull with no round on disk refuses naming round push', async (t) => {
  const { r } = await pull(t, { notes: [], noRound: true })
  assert.strictEqual(r.status, 2, 'there is no round to pull for, so the pull must refuse: ' + r.stdout)
  assert.ok(r.stderr.includes('round push'), 'the refusal must name its remedy, round push: ' + r.stderr)
})

// ---- AC-9 -----------------------------------------------------------------------------------

const APPROVE = ['--mark', 'journey-approved', '--journey', 'owner-onboarding']

test('AC-20261002-01-9: journey-approved refuses in order — not drawn, nothing sent, the service shows another story, not confirmed, confirmed on an older story', async (t) => {
  const notDrawn = await host(t, {}, { journeys: { 'owner-onboarding': fx.journeyEntry({ drawn: null, approved: null }) } })
  let r = fx.runDriver(notDrawn.root, APPROVE)
  assert.strictEqual(r.status, 2, 'an undrawn journey must refuse')
  assert.ok(r.stderr.includes('is not drawn yet'), 'the refusal must say the journey is not drawn yet: ' + r.stderr)

  const unsent = await host(t, {}, { drawn: ['owner-onboarding'] })
  r = fx.runDriver(unsent.root, APPROVE)
  assert.strictEqual(r.status, 2, 'a journey never pushed must refuse')
  assert.ok(r.stderr.includes('nothing has been sent'), 'the refusal must say nothing has been sent: ' + r.stderr)

  const stale = await host(t, {}, { drawn: ['owner-onboarding'], pushed: { round: 2, digest: fx.DIGEST }, round: 2, roundJourneys: { 'owner-onboarding': A } })
  r = fx.runDriver(stale.root, APPROVE)
  assert.strictEqual(r.status, 2, 'a round that shows another story hash must refuse')
  assert.ok(r.stderr.includes('does not show the current story') && r.stderr.includes('round push'), 'the refusal must say the service does not show the current story and name round push: ' + r.stderr)

  const none = await host(t, { [fx.KEY.approvals]: [fx.approvalsAnswer([])] }, { drawn: ['owner-onboarding'], pushed: { round: 2, digest: fx.DIGEST }, round: 2 })
  r = fx.runDriver(none.root, APPROVE)
  assert.strictEqual(r.status, 2, 'no approval on the service must refuse')
  assert.ok(r.stderr.includes('is not confirmed yet') && r.stderr.includes(link(none.stub)) && r.stderr.includes('--waive --reason'),
    'the refusal must say not confirmed yet, carry the link and offer the waiver: ' + r.stderr)

  const old = await host(t, { [fx.KEY.approvals]: [fx.approvalsAnswer([fx.approval('owner-onboarding', { beats: A })])] }, { drawn: ['owner-onboarding'], pushed: { round: 2, digest: fx.DIGEST }, round: 2 })
  r = fx.runDriver(old.root, APPROVE)
  assert.strictEqual(r.status, 2, 'an approval on an older story must refuse')
  assert.ok(r.stderr.includes('was confirmed on an older story (aaaaaaaaaaaa, now 08363cd98ef8)'), 'the refusal must name both hashes: ' + r.stderr)
})

test('AC-20261002-01-9: a confirmation on the current story is recorded with who confirmed it, and an open note never blocks it', async (t) => {
  for (const [by, word] of [['client', 'client'], ['owner', 'owner']]) {
    const { stub, root } = await host(t, { [fx.KEY.approvals]: [fx.approvalsAnswer([fx.approval('owner-onboarding', { by })])] },
      { drawn: ['owner-onboarding'], pushed: { round: 2, digest: fx.DIGEST }, round: 2 })
    fx.writeNotesFile(root, 2, [fx.note('n1')])
    const r = fx.runDriver(root, APPROVE)
    assert.strictEqual(r.status, 0, 'a confirmation on the current story must be accepted even with an open note — notes block the final mark, never a confirmation: ' + r.stderr)
    assert.ok(r.stdout.includes('✅ journey-approved recorded for owner-onboarding (confirmed by the ' + word + ')'), 'the success sentence must say who confirmed: ' + r.stdout)
    const entry = fx.readStatus(root).journeys['owner-onboarding']
    assert.ok(entry.by === by && entry.beats === fx.H_OWNER, 'the entry must store by "' + by + '" and the current hash: ' + JSON.stringify(entry))
    assert.ok(stub.log().some((l) => l.method === 'GET' && l.url.startsWith('/v1/projects/hearwell/approvals')), 'the approvals must have been pulled from the service, not trusted from disk')
  }
})

// ---- AC-10 ----------------------------------------------------------------------------------

test('AC-20261002-01-10: a waiver with a reason is recorded without sending anything, and a missing or blank reason or an undrawn journey refuses', async (t) => {
  const { stub, root } = await host(t, {}, { drawn: ['team-invite'] })
  const ok = fx.runDriver(root, ['--mark', 'journey-approved', '--journey', 'team-invite', '--waive', '--reason', 'client on leave'])
  assert.strictEqual(ok.status, 0, 'a waiver with a reason must be accepted for a drawn journey with nothing pushed: ' + ok.stderr)
  assert.ok(ok.stdout.includes('✅ journey-approved recorded for team-invite (waived: client on leave)'), 'the success sentence must carry the reason: ' + ok.stdout)
  const entry = fx.readStatus(root).journeys['team-invite']
  assert.ok(entry.by === 'waived' && entry.reason === 'client on leave' && entry.beats === fx.H_TEAM, 'the entry must record waived, the reason and the current hash: ' + JSON.stringify(entry))
  assert.deepStrictEqual(stub.log(), [], 'a waiver must send no request — it is the escape for a client who is not there')

  for (const extra of [[], ['--reason', '  ']]) {
    const fresh = await host(t, {}, { drawn: ['team-invite'] })
    const r = fx.runDriver(fresh.root, ['--mark', 'journey-approved', '--journey', 'team-invite', '--waive', ...extra])
    assert.strictEqual(r.status, 2, '--waive without a real reason must refuse — an unexplained waiver is not a record: ' + r.stdout)
    assert.ok(r.stderr.includes('--waive needs --reason'), 'the refusal must say --waive needs --reason: ' + r.stderr)
  }

  const undrawn = await host(t, {})
  const r = fx.runDriver(undrawn.root, ['--mark', 'journey-approved', '--journey', 'team-invite', '--waive', '--reason', 'x'])
  assert.strictEqual(r.status, 2, 'a waiver on an undrawn journey must refuse')
  assert.ok(r.stderr.includes('is not drawn yet'), 'the refusal must say the journey is not drawn yet: ' + r.stderr)
})

// ---- AC-11 ----------------------------------------------------------------------------------

const approvedBoth = { approved: ['owner-onboarding', 'team-invite'], pushed: { round: 2, digest: fx.DIGEST }, round: 2 }
const done = (id, status, ...texts) => fx.note(id, { status, text: texts[0] || 'text ' + id, thread: (texts.length ? texts : ['text ' + id]).map((x, i) => ({ by: i ? 'session' : 'client', text: x, at: '2026-10-02T05:0' + i + ':00Z' })) })
const CLOSE = ['--mark', 'approved']

function exclusionRows(root) {
  return fx.readLedger(root).split('\n').filter((l) => /\|\s*exclusion\s*\|/.test(l))
    .map((l) => l.replace(/^\s*\|\s*/, '').replace(/\s*\|\s*$/, '').split(/\s*\|\s*/))
}

test('AC-20261002-01-11: the final mark refuses while a note or journey thread waits for an answer, sending no mark request and recording nothing', async (t) => {
  const open = await host(t, { [fx.KEY.notes]: [fx.notesAnswer([done('n1', 'answered'), fx.note('n2', { screen: null, status: 'open' })])] }, approvedBoth)
  let r = fx.runDriver(open.root, CLOSE)
  assert.strictEqual(r.status, 2, 'an open note must hold the final mark — "answered" does not, "open" does: ' + r.stdout)
  assert.ok(r.stderr.includes('n2 [project] is waiting for an answer'), 'the refusal must name the waiting note: ' + r.stderr)
  assert.strictEqual(markPosts(open.stub).length, 0, 'no mark request may be sent while something waits')
  assert.strictEqual(fx.readStatus(open.root).marks.approved, null, 'marks.approved must stay null')

  const thread = await host(t, { [fx.KEY.notes]: [fx.notesAnswer([], [fx.journeyThread('team-invite', 'open', ['Where do I pick my clinic?'])])] }, approvedBoth)
  r = fx.runDriver(thread.root, CLOSE)
  assert.strictEqual(r.status, 2, 'an open journey thread must hold the final mark too')
  assert.ok(r.stderr.includes('team-invite [story] is waiting for an answer'), 'the refusal must name the waiting journey thread: ' + r.stderr)

  const gated = await host(t, { [fx.KEY.notes]: [fx.notesAnswer([])] }, { ...approvedBoth, rows: [fx.BLOCKING_ROW] })
  const ledgerBefore = fx.readLedger(gated.root)
  r = fx.runDriver(gated.root, CLOSE)
  assert.strictEqual(r.status, 2, 'an open ledger row must refuse the final mark even when nothing waits')
  assert.ok(r.stderr.includes('A1'), 'the refusal must name the ledger row: ' + r.stderr)
  assert.strictEqual(markPosts(gated.stub).length, 0, 'the round must not be closed over a refused gate')
  assert.strictEqual(fx.readLedger(gated.root), ledgerBefore, 'a refused mark must add no ledger row')
})

test('AC-20261002-01-11: with nothing waiting the final mark closes the round, records the end, writes one exclusion row per deferred item exactly once, and a reopen-and-reapprove cycle closes again without a duplicate', async (t) => {
  const answers = {
    [fx.KEY.notes]: [fx.notesAnswer(
      [done('n1', 'answered'), done('n2', 'approved'), done('n4', 'deferred', 'Add a dark mode later.', 'Noted for later.')],
      [fx.journeyThread('team-invite', 'deferred', ['Staff invites can wait.', 'Understood.'])])],
    [fx.KEY.approvals]: [fx.approvalsAnswer([fx.approval('owner-onboarding')])],
    [fx.KEY.mark(2)]: [fx.markedAnswer(2)],
  }
  const { stub, root } = await host(t, answers, approvedBoth)
  const r = fx.runDriver(root, CLOSE)
  assert.strictEqual(r.status, 0, 'a wireframe with nothing waiting must close: ' + r.stderr)
  const mark = markPosts(stub)
  assert.ok(mark.length === 1 && mark[0].url === '/v1/projects/hearwell/rounds/2/mark' && JSON.stringify(mark[0].json) === '{"status":"closed"}', 'the round must be closed with {"status":"closed"} on round 2: ' + JSON.stringify(mark))
  assert.ok(r.stdout.includes('✅ approved recorded'), 'the success sentence must print: ' + r.stdout)
  assert.strictEqual(fx.runDriver(root, ['--state']).stdout.trim(), 'APPROVED', 'the state must be APPROVED after the final mark')
  const rows = exclusionRows(root)
  assert.strictEqual(rows.length, 2, 'exactly two exclusion rows must exist, one per deferred item (n4 and the team-invite thread): ' + fx.readLedger(root))
  const n4 = rows.find((c) => c[8] === 'deferred: n4')
  assert.ok(n4 && n4[0] === 'X1' && n4[1] === 'APPROVED' && n4[3] === 'Add a dark mode later.' && n4[4] === 'said-by-user' && /^confirmed /.test(n4[5]),
    'the n4 row must be X1, step APPROVED, claim the FIRST thread entry, tag said-by-user, status confirmed <date>: ' + JSON.stringify(n4))
  assert.ok(rows.some((c) => c[8] === 'deferred: team-invite'), 'the journey thread must get its own row noted "deferred: team-invite": ' + JSON.stringify(rows))

  assert.strictEqual(fx.runDriver(root, ['--reopen', 'journey:owner-onboarding']).status, 0, 'test setup requires the reopen to be accepted')
  const reapprove = fx.runDriver(root, APPROVE)
  assert.strictEqual(reapprove.status, 0, 'the reopened journey must be re-approvable on the client\'s standing confirmation: ' + reapprove.stderr)
  const again = fx.runDriver(root, CLOSE)
  assert.strictEqual(again.status, 0, 'the second final mark must be accepted: ' + again.stderr)
  assert.strictEqual(markPosts(stub).length, 2, 'the second final mark must close the round again — a reopen voids the first close')
  assert.strictEqual(exclusionRows(root).filter((c) => c[8] === 'deferred: n4').length, 1, 'a deferred note must never get a second exclusion row')
  assert.strictEqual(exclusionRows(root).length, 2, 'no further exclusion row may appear on the second close')
})

test('AC-20261002-01-11: a failed close, an unconfirmed journey and an all-waived wireframe with no rounds each end as specified', async (t) => {
  const failing = await host(t, { [fx.KEY.notes]: [fx.notesAnswer([])], [fx.KEY.mark(2)]: [{ status: 500, body: { error: 'server-error', detail: 'x', apiVersion: 1 } }] }, approvedBoth)
  let r = fx.runDriver(failing.root, CLOSE)
  assert.strictEqual(r.status, 2, 'a failed close must refuse — a finished stage over an open round is the state this ordering exists to prevent: ' + r.stdout)
  assert.strictEqual(fx.readStatus(failing.root).marks.approved, null, 'marks.approved must stay unset after a failed close')

  const unconfirmed = await host(t, {}, { approved: ['owner-onboarding'], drawn: ['team-invite'], pushed: { round: 2, digest: fx.DIGEST }, round: 2 })
  r = fx.runDriver(unconfirmed.root, CLOSE)
  assert.strictEqual(r.status, 2, 'a journey not confirmed must refuse the final mark')
  assert.ok(r.stderr.includes('journey "team-invite" is not confirmed'), 'the refusal must name the unconfirmed journey: ' + r.stderr)
  assert.deepStrictEqual(unconfirmed.stub.log(), [], 'the journey check comes first, so nothing may be sent')

  const waived = await host(t, {}, {
    journeys: {
      'owner-onboarding': fx.journeyEntry({ approved: LATE, by: 'waived', reason: 'client on leave' }),
      'team-invite': fx.journeyEntry({ approved: LATE, beats: fx.H_TEAM, by: 'waived', reason: 'client on leave' }),
    },
  })
  assert.ok(!fs.existsSync(path.join(waived.root, 'design/rounds')), 'test setup requires a host with no design/rounds/')
  r = fx.runDriver(waived.root, CLOSE)
  assert.strictEqual(r.status, 0, 'every journey waived with no round must close without any request: ' + r.stderr)
  assert.deepStrictEqual(waived.stub.log(), [], 'with no round there is nothing to pull or close, so no request may be sent')
})
