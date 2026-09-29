#!/usr/bin/env node
'use strict'
// run.js — usage: node run.js [--keep]
// Walks one real journey through the four calls against fake-service.js in a temp host, and
// prints one line per thing learned. --keep leaves the service running with a round pushed
// and prints the page URL to look at.
// What this deliberately does NOT do: assert like a test suite — it is a spike, and a
// surprising line in the output is the result.
// Exit codes: 0 every probe behaved as written · 1 a probe surprised.

const fs = require('fs')
const os = require('os')
const path = require('path')
const zlib = require('zlib')
const { spawn } = require('child_process')
const surfaces = require('../../../spec/scripts/lib/surfaces.js')
const client = require('./client.js')

const keep = process.argv.includes('--keep')
const TOKEN = 'spike-token'
let surprises = 0
function line(ok, text) {
  if (!ok) surprises++
  process.stdout.write((ok ? '✅ ' : '❌ ') + text + '\n')
}

const SEED = `## Journeys

### owner-onboarding
Mika (clinic owner) is invited, confirms her roster, and ends at the brief.
1. "I open the invitation" -> owner-intro
2. "I check who is on my team" -> roster-confirm
3. "I see nobody is listed yet" -> roster-confirm@empty
4. "I read what happens next" -> reciprocity-brief
`

function screenSpec(title, rows, next) {
  const elements = {
    page: { type: 'Stack', props: { gap: 'md' }, children: ['head', 'body', 'next'] },
    head: { type: 'Heading', props: { text: title }, children: [] },
    body: { type: 'Card', props: { title: 'Details' }, children: rows.map((_, i) => 'row' + i) },
    next: { type: 'Button', props: { label: next ? 'Continue' : 'Done' }, children: [] },
  }
  rows.forEach((r, i) => { elements['row' + i] = { type: 'Text', props: { content: r }, children: [] } })
  if (next) elements.next.on = { press: { action: 'navigate', params: { to: next } } }
  return { root: 'page', elements }
}

// A valid 1x1 gray PNG, built here so the spike carries no binary file.
function tinyPng() {
  const crcTable = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crcTable[n] = c >>> 0
  }
  const crc = (buf) => {
    let c = 0xffffffff
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(td))
    return Buffer.concat([len, td, sum])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.from([0, 0x99]))), chunk('IEND', Buffer.alloc(0)),
  ])
}

function makeHost(walkthrough) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'walk-spike-'))
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify(walkthrough ? { walkthrough } : {}, null, 2))
  return dir
}

async function startService() {
  const portFile = path.join(os.tmpdir(), 'walk-spike-port-' + process.pid)
  try { fs.unlinkSync(portFile) } catch (e) { /* first run */ }
  const child = spawn(process.execPath, [path.join(__dirname, 'fake-service.js'), '--port', keep ? '4790' : '0', '--token', TOKEN, '--port-file', portFile],
    { stdio: ['ignore', 'ignore', 'inherit'] })
  for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await new Promise((r) => setTimeout(r, 50))
  return { child, base: 'http://127.0.0.1:' + fs.readFileSync(portFile, 'utf8') }
}

async function refused(fn) {
  try { await fn(); return null } catch (e) { return e }
}

async function main() {
  const { child, base } = await startService()
  try {
    const j = surfaces.parseSeedJourneys(SEED).get('owner-onboarding')
    const beats = surfaces.beatHash(j.beats)
    const journeyFile = [{ id: 'owner-onboarding', beats, steps: j.beats.map((b) => ({ beat: b.beat, screen: b.screen, state: b.state || null })) }]
    line(j.beats.length === 4, 'seed parsed by the plugin\'s own parser: ' + j.beats.length + ' beats, story hash ' + beats)

    // 1. A host that does not use the service.
    const bare = makeHost(null)
    const skipped = await client.pushRound(bare, { kind: 'wireframe', screens: [] })
    line(skipped.skipped === true && !fs.existsSync(path.join(bare, 'design')), 'host with no walkthrough block: push is a silent skip, nothing written, no request made')

    // 2. A host that does.
    process.env.WALK_SPIKE_TOKEN = TOKEN
    const host = makeHost({ baseUrl: base, project: 'hearwell', tokenEnv: 'WALK_SPIKE_TOKEN' })
    const wire = {
      kind: 'wireframe', journeys: journeyFile,
      screens: [
        { name: 'owner-intro', spec: screenSpec('You are invited', ['Hearwell Clinic', 'Invited by Dr. Sato'], 'roster-confirm') },
        { name: 'roster-confirm', spec: screenSpec('Your team', ['Aiko Tanaka · audiologist', 'Ren · front desk'], 'reciprocity-brief') },
        { name: 'roster-confirm', state: 'empty', spec: screenSpec('Your team', ['Nobody is listed yet'], 'reciprocity-brief') },
        { name: 'reciprocity-brief', spec: screenSpec('What happens next', ['We ask each person three questions'], null) },
      ],
    }
    const pushed = await client.pushRound(host, wire)
    line(pushed.round === 1, 'wireframe round pushed in ONE request: 4 screens, round ' + pushed.round +
      ', payload ' + Buffer.byteLength(JSON.stringify(wire)) + ' bytes')

    // 3. The client acts on the page (the page's own writes, outside the contract).
    const say = (route, body) => fetch(base + '/walk/hearwell/' + route, { method: 'POST', body: JSON.stringify(body) })
    await say('notes', { round: 1, screen: 'roster-confirm', anchor: { node: 'row1' }, text: 'Ren has a surname: Ito' })
    await say('notes', { round: 1, screen: 'owner-intro', anchor: null, text: 'Too formal for our clinic' })
    await say('approvals', { journey: 'owner-onboarding', round: 1, beats })

    const notes = await client.pullNotes(host, 1)
    const appr = await client.pullApprovals(host, 1)
    const dir = path.join(host, 'design/rounds/1')
    line(notes.notes.length === 2 && fs.existsSync(path.join(dir, 'notes.json')), 'notes pulled to a file: ' + notes.notes.length +
      ' (1 anchored to node ' + JSON.stringify(notes.notes[0].anchor) + ', 1 screen note with anchor ' + JSON.stringify(notes.notes[1].anchor) + ')')
    line(appr.approvals[0].beats === beats, 'approval pulled to a file and its story hash equals the seed\'s: ' + appr.approvals[0].beats)

    // 4. The seed changes after the client approved.
    const j2 = surfaces.parseSeedJourneys(SEED.replace('I read what happens next', 'I read what we will ask')).get('owner-onboarding')
    line(surfaces.beatHash(j2.beats) !== appr.approvals[0].beats, 'one edited sentence makes the pulled approval stale by hash alone (' +
      surfaces.beatHash(j2.beats) + ' ≠ ' + appr.approvals[0].beats + ')')

    const marked = await client.markRound(host, 1, 'answered')
    line(marked.status === 'answered', 'round marked: ' + marked.status)

    // 5. Screenshot round.
    const png = path.join(host, 'shot.png')
    fs.writeFileSync(png, tinyPng())
    const shots = await client.pushRound(host, {
      kind: 'screenshots', journeys: journeyFile,
      screens: [{ name: 'owner-intro', width: 390, file: png }, { name: 'owner-intro', width: 1280, file: png }],
    })
    line(shots.round === 2, 'screenshot round pushed: 1 manifest request + 1 request PER picture (2 widths of one screen), round ' + shots.round)
    await say('notes', { round: 2, screen: 'owner-intro', anchor: { x: 0.25, y: 0.6 }, text: 'This button is hard to see' })
    const n2 = await client.pullNotes(host, 2)
    line(n2.notes.length === 1 && n2.notes[0].anchor.x === 0.25, 'picture note pulled with a position as a share of the picture, not pixels: ' + JSON.stringify(n2.notes[0].anchor))
    line(!('width' in n2.notes[0]), 'GAP: a picture note does not say WHICH WIDTH it was placed on — the note record needs it when a screen has two pictures')

    // 6. Refusals.
    const bad = await refused(() => client.pushRound(host, { kind: 'wireframe', screens: [{ name: 'x', spec: { root: 'a', elements: { a: { type: 'Stack', props: {}, children: ['gone'] } } } }] }))
    line(bad && bad.code === 'bad-spec', 'a spec with a missing child is refused by the service: ' + (bad && bad.message))
    process.env.WALK_SPIKE_TOKEN = 'wrong'
    const tok = await refused(() => client.pullNotes(host, 1))
    line(tok && tok.code === 'bad-token', 'a wrong token is refused, remedy printed: ' + (tok && tok.remedy))
    delete process.env.WALK_SPIKE_TOKEN
    const none = await refused(() => client.pullNotes(host, 1))
    line(none && none.code === 'no-token', 'an empty token env var is refused BEFORE any request: ' + (none && none.remedy))
    process.env.WALK_SPIKE_TOKEN = TOKEN
    const down = makeHost({ baseUrl: 'http://127.0.0.1:9', project: 'hearwell', tokenEnv: 'WALK_SPIKE_TOKEN' })
    const un = await refused(() => client.pullNotes(down, 1))
    line(un && un.code === 'unreachable', 'a service that is not running is one plain refusal, not a crash: ' + (un && un.message))
    const v2 = await fetch(base + '/v2/projects/hearwell/notes', { headers: { authorization: 'Bearer ' + TOKEN } })
    const v2body = await v2.json()
    line(v2.status === 404 && v2body.error === 'unknown-api-version', 'a request under another version prefix is refused by name: ' + v2body.error)

    process.stdout.write('\nfiles the pulls left in the host:\n')
    for (const n of fs.readdirSync(path.join(host, 'design/rounds'))) {
      for (const f of fs.readdirSync(path.join(host, 'design/rounds', n))) process.stdout.write('  design/rounds/' + n + '/' + f + '\n')
    }
    process.stdout.write('\n--- design/rounds/1/notes.json\n' + fs.readFileSync(path.join(dir, 'notes.json'), 'utf8'))

    if (keep) {
      await client.pushRound(host, wire)
      process.stdout.write('\n🎨 page: ' + base + '/walk/hearwell\n')
      return
    }
  } finally {
    if (!keep) child.kill('SIGTERM')
  }
}

main().then(() => { if (!keep) process.exit(surprises ? 1 : 0) }).catch((e) => {
  process.stderr.write('run.js crashed: ' + (e && e.stack || e) + '\n')
  process.exit(1)
})
