#!/usr/bin/env node
'use strict'
// fake-service.js — usage: node fake-service.js --port <n> --token <t> [--port-file <path>]
// Throwaway stand-in for the walkthrough service (docs/roadmap/29-walkthrough-integration.md):
// the four contract calls under /v1, plus the two writes only the service's own page makes
// (a note, a journey approval) and one gray page that draws a wireframe round.
// What this deliberately does NOT do: persist anything (memory only), authenticate people,
// render the real json-render catalog, or validate a spec beyond root/children integrity.
// Exit codes: 0 on SIGTERM · 2 usage.

const http = require('http')
const fs = require('fs')

const API_VERSION = 1
const argv = process.argv.slice(2)
function flag(name) {
  const i = argv.indexOf(name)
  return i === -1 ? null : argv[i + 1]
}
const port = Number(flag('--port') || 0)
const token = flag('--token')
const portFile = flag('--port-file')
if (!token) {
  process.stderr.write('fake-service: --token is required — remedy: pass --token <t>\n')
  process.exit(2)
}

// project -> { rounds: [{n, kind, status, journeys, screens, images}], notes: [], approvals: [] }
const projects = new Map()
function project(id) {
  if (!projects.has(id)) projects.set(id, { rounds: [], notes: [], approvals: [] })
  return projects.get(id)
}

function send(res, code, body, type) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
  res.writeHead(code, { 'content-type': type || 'application/json', 'content-length': payload.length })
  res.end(payload)
}
function refuse(res, code, error, detail) {
  send(res, code, { error, detail: detail || null, apiVersion: API_VERSION })
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}
function specIssues(spec) {
  const issues = []
  if (!spec || typeof spec !== 'object' || typeof spec.root !== 'string' || !spec.elements) return ['not a spec']
  if (!spec.elements[spec.root]) issues.push('root_not_found:' + spec.root)
  for (const [key, el] of Object.entries(spec.elements)) {
    for (const child of el.children || []) {
      if (!spec.elements[child]) issues.push('missing_child:' + key + '>' + child)
    }
  }
  return issues
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47])

async function handle(req, res) {
  const url = new URL(req.url, 'http://x')
  const parts = url.pathname.split('/').filter(Boolean)

  // The page and its two writes carry no bearer token: a real service signs people in instead.
  if (parts[0] === 'walk') return page(req, res, parts, url)

  if (parts[0] !== 'v' + API_VERSION) {
    return refuse(res, 404, 'unknown-api-version', 'this service speaks v' + API_VERSION)
  }
  if (req.headers.authorization !== 'Bearer ' + token) return refuse(res, 401, 'bad-token')
  if (parts.length === 1 && req.method === 'GET') return send(res, 200, { apiVersion: API_VERSION })
  if (parts[1] !== 'projects' || !parts[2]) return refuse(res, 404, 'no-such-route')
  const p = project(parts[2])

  // push-round
  if (parts[3] === 'rounds' && parts.length === 4 && req.method === 'POST') {
    let body
    try { body = JSON.parse((await readBody(req)).toString('utf8')) } catch (e) { return refuse(res, 400, 'bad-json') }
    if (body.kind !== 'wireframe' && body.kind !== 'screenshots') return refuse(res, 400, 'bad-kind', body.kind)
    if (!Array.isArray(body.screens) || body.screens.length === 0) return refuse(res, 400, 'no-screens')
    if (body.kind === 'wireframe') {
      for (const s of body.screens) {
        const issues = specIssues(s.spec)
        if (issues.length) return refuse(res, 400, 'bad-spec', s.name + ': ' + issues.join(', '))
      }
    }
    const n = p.rounds.length + 1
    p.rounds.push({
      n, kind: body.kind, status: 'open', journeys: body.journeys || [],
      screens: body.screens.map((s) => ({ name: s.name, state: s.state || 'default', spec: s.spec || null, width: s.width || null })),
      images: {},
    })
    return send(res, 201, { round: n, kind: body.kind, screens: body.screens.length })
  }

  // push-round, second leg: one PNG per request, raw bytes
  if (parts[3] === 'rounds' && parts[5] === 'images' && req.method === 'PUT') {
    const round = p.rounds[Number(parts[4]) - 1]
    if (!round) return refuse(res, 404, 'no-such-round', parts[4])
    if (round.kind !== 'screenshots') return refuse(res, 409, 'not-a-screenshot-round')
    const key = decodeURIComponent(parts[6] || '')
    if (!round.screens.some((s) => imageKey(s) === key)) return refuse(res, 404, 'screen-not-in-round', key)
    const bytes = await readBody(req)
    if (!bytes.subarray(0, 4).equals(PNG_MAGIC)) return refuse(res, 400, 'not-a-png', key)
    round.images[key] = bytes
    return send(res, 200, { stored: key, bytes: bytes.length })
  }

  // mark-round
  if (parts[3] === 'rounds' && parts[5] === 'mark' && req.method === 'POST') {
    const round = p.rounds[Number(parts[4]) - 1]
    if (!round) return refuse(res, 404, 'no-such-round', parts[4])
    const body = JSON.parse((await readBody(req)).toString('utf8') || '{}')
    if (!['open', 'answered', 'closed'].includes(body.status)) return refuse(res, 400, 'bad-status', body.status)
    round.status = body.status
    return send(res, 200, { round: round.n, status: round.status })
  }

  // pull-notes
  if (parts[3] === 'notes' && req.method === 'GET') {
    const round = url.searchParams.get('round')
    const notes = p.notes.filter((n) => !round || String(n.round) === round)
    return send(res, 200, { apiVersion: API_VERSION, notes })
  }

  // pull-approvals
  if (parts[3] === 'approvals' && req.method === 'GET') {
    return send(res, 200, { apiVersion: API_VERSION, approvals: p.approvals })
  }

  return refuse(res, 404, 'no-such-route')
}

function imageKey(s) {
  return s.name + '--' + s.state + (s.width ? '--' + s.width : '')
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

// Gray by construction: every element is a box carrying its node id; no colour, no product CSS.
function drawElement(spec, key) {
  const el = spec.elements[key]
  const label = el.props && (el.props.label || el.props.title || el.props.text || el.props.content)
  const kids = (el.children || []).map((k) => drawElement(spec, k)).join('')
  return '<div class="n n-' + esc(el.type) + '" data-node="' + esc(key) + '">' +
    '<span class="t">' + esc(el.type) + (label ? ' · ' + esc(typeof label === 'string' ? label : JSON.stringify(label)) : '') + '</span>' + kids + '</div>'
}

async function page(req, res, parts, url) {
  const p = project(parts[1] || '')
  // The page's own two writes (never part of the plugin's contract).
  if (parts[2] === 'notes' && req.method === 'POST') {
    const b = JSON.parse((await readBody(req)).toString('utf8'))
    const note = {
      id: 'n' + (p.notes.length + 1), round: b.round, screen: b.screen, state: b.state || 'default',
      anchor: b.anchor || null, text: b.text, author: b.author || 'client', at: new Date().toISOString(),
    }
    p.notes.push(note)
    return send(res, 201, note)
  }
  if (parts[2] === 'approvals' && req.method === 'POST') {
    const b = JSON.parse((await readBody(req)).toString('utf8'))
    const approval = { journey: b.journey, by: b.by || 'client', round: b.round, beats: b.beats, at: new Date().toISOString() }
    p.approvals.push(approval)
    return send(res, 201, approval)
  }
  if (parts[2] === 'images') {
    const round = p.rounds[Number(parts[3]) - 1]
    const bytes = round && round.images[decodeURIComponent(parts[4] || '')]
    return bytes ? send(res, 200, bytes, 'image/png') : send(res, 404, 'no image', 'text/plain')
  }
  const round = p.rounds[p.rounds.length - 1]
  if (!round) return send(res, 200, '<p>No round pushed yet.</p>', 'text/html; charset=utf-8')
  const screens = round.screens.map((s) => {
    const body = round.kind === 'wireframe'
      ? drawElement(s.spec, s.spec.root)
      : '<img alt="' + esc(s.name) + '" src="/walk/' + esc(parts[1]) + '/images/' + round.n + '/' + encodeURIComponent(imageKey(s)) + '">'
    return '<section data-screen="' + esc(s.name) + '" data-state="' + esc(s.state) + '"><h2>' + esc(s.name) +
      (s.state !== 'default' ? ' @' + esc(s.state) : '') + '</h2><div class="frame">' + body + '</div></section>'
  }).join('')
  const journeys = round.journeys.map((j) =>
    '<li><b>' + esc(j.id) + '</b> <code>' + esc(j.beats) + '</code><ol>' +
    j.steps.map((st) => '<li>' + esc(st.beat) + ' <i>→ ' + esc(st.screen) + '</i></li>').join('') +
    '</ol><button data-approve="' + esc(j.id) + '" data-beats="' + esc(j.beats) + '">This is my story</button></li>').join('')
  const notes = p.notes.filter((n) => n.round === round.n).map((n) =>
    '<li><code>' + esc(n.screen) + (n.anchor ? ' · ' + esc(JSON.stringify(n.anchor)) : ' · screen note') + '</code> ' + esc(n.text) + '</li>').join('')
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>walkthrough spike</title>
<style>
body{font:14px/1.4 system-ui;margin:0;padding:16px;background:#f4f4f4;color:#222}
main{display:grid;grid-template-columns:minmax(0,2fr) minmax(260px,1fr);gap:24px;align-items:start}
@media(max-width:800px){main{grid-template-columns:1fr}}
.frame{background:#fff;border:1px solid #bbb;padding:12px}
.frame img{max-width:100%;display:block}
.n{border:1px solid #999;margin:6px 0;padding:6px;background:#fafafa;cursor:pointer}
.n:hover{outline:2px solid #444}.n.sel{outline:2px solid #000;background:#e6e6e6}
.t{font-size:11px;color:#555;display:block}
aside{position:sticky;top:16px;background:#fff;border:1px solid #bbb;padding:12px}
textarea{width:100%;box-sizing:border-box;min-height:64px}
</style>
<h1>Round ${round.n} · ${esc(round.kind)} · ${esc(round.status)}</h1>
<main><div>${screens}</div>
<aside><h3>Journeys</h3><ul>${journeys}</ul>
<h3>Add a note</h3><p id="target">Whole screen: click a box or a picture to anchor.</p>
<textarea id="text"></textarea><button id="save">Save note</button>
<h3>Notes this round</h3><ul>${notes || '<li>none yet</li>'}</ul></aside></main>
<script>
var target = { screen: ${JSON.stringify(round.screens[0].name)}, state: ${JSON.stringify(round.screens[0].state)}, anchor: null }
function show(){ document.getElementById('target').textContent = target.screen + ' · ' + (target.anchor ? JSON.stringify(target.anchor) : 'screen note') }
document.addEventListener('click', function (e) {
  var sec = e.target.closest('section'); if (!sec) return
  var node = e.target.closest('[data-node]'), img = e.target.closest('img')
  document.querySelectorAll('.sel').forEach(function (x) { x.classList.remove('sel') })
  target = { screen: sec.dataset.screen, state: sec.dataset.state, anchor: null }
  if (node) { node.classList.add('sel'); target.anchor = { node: node.dataset.node } }
  else if (img) { var r = img.getBoundingClientRect(); target.anchor = { x: +((e.clientX - r.left) / r.width).toFixed(4), y: +((e.clientY - r.top) / r.height).toFixed(4) } }
  show()
})
function post(path, body){ return fetch('/walk/${esc(parts[1])}/' + path, { method: 'POST', body: JSON.stringify(body) }).then(function (r) { if (r.ok) location.reload() }) }
document.getElementById('save').onclick = function () {
  var text = document.getElementById('text').value.trim(); if (!text) return
  post('notes', { round: ${round.n}, screen: target.screen, state: target.state, anchor: target.anchor, text: text })
}
document.querySelectorAll('[data-approve]').forEach(function (b) {
  b.onclick = function () { post('approvals', { journey: b.dataset.approve, round: ${round.n}, beats: b.dataset.beats }) }
})
</script>`
  return send(res, 200, html, 'text/html; charset=utf-8')
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => refuse(res, 500, 'crashed', String(e && e.message)))
})
server.listen(port, '127.0.0.1', () => {
  const actual = server.address().port
  if (portFile) fs.writeFileSync(portFile, String(actual))
  process.stdout.write('fake-service listening on http://127.0.0.1:' + actual + '\n')
})
process.on('SIGTERM', () => server.close(() => process.exit(0)))
