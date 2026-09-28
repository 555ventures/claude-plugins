// spec/templates/proto-overlay.js
//
// Copied into the prototype worktree at `--mark opened`, beside spec/templates/proto-stable-id.js
// — never imported by the plugin itself; the host's own dev entry imports it behind its dev flag
// (specs/20260928/01-the-prototype-command-and-the-pin-overlay.md D6/D7, AC-20260928-01-9 (id),
// AC-20260928-01-8 (send path)). The literal token __PROTO_PINS_URL__ below is replaced with
// `http://127.0.0.1:<pinsPort>` by the driver when it copies this file at OPEN.
//
// Renders inside a closed shadow root and adds no attribute to the host's own elements — this
// module must never leave a trace a later build could read back. Alt+click opens a small panel
// (note, who — remembered in localStorage, a behaviour|look toggle defaulting to behaviour) for
// the clicked element, or a screen note when it carries no fiber; pins queue locally and "Send N
// pins" POSTs the batch to the baked pins URL, clearing the queue only on a 2xx answer and
// keeping it, with the server's message, on anything else — acting on the server's answer, never
// the request (Gotchas). Deliberately exempt from TDD as pure UI (D7's own rationale) — the send
// path's server-side contract is pinned in tests/prototype/pins-server.test.js instead.
//
// Exit codes: n/a — this is a browser module, never invoked as a CLI.

import { stableIdFor, locFor } from './proto-stable-id.js'

const PINS_URL = '__PROTO_PINS_URL__'
const WHO_STORAGE_KEY = 'proto-pin-who'

let pinQueue = []
let host = null
let shadow = null
let panelEl = null
let markLayer = null
let queueBarEl = null

function currentScreen() {
  return location.pathname
}

function currentState() {
  return new URLSearchParams(location.search).get('proto') || 'default'
}

function rememberedWho() {
  try {
    return localStorage.getItem(WHO_STORAGE_KEY) || ''
  } catch (e) {
    return ''
  }
}

function rememberWho(value) {
  try {
    localStorage.setItem(WHO_STORAGE_KEY, value)
  } catch (e) {
    // localStorage unavailable — the who field just stops persisting across reloads
  }
}

const OVERLAY_CSS = `
  .proto-marks { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000; }
  .proto-outline { position: absolute; outline: 2px solid #f43f5e; border-radius: 2px; }
  .proto-panel { position: fixed; right: 16px; bottom: 56px; width: 260px; background: #111827;
    color: #f9fafb; font: 12px/1.4 -apple-system, sans-serif; padding: 12px; border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,.4); }
  .proto-panel.proto-hidden { display: none; }
  .proto-panel textarea { width: 100%; min-height: 56px; margin: 6px 0; box-sizing: border-box; }
  .proto-panel input { width: 100%; margin: 4px 0; box-sizing: border-box; }
  .proto-panel button { margin: 4px 4px 0 0; }
  .proto-kind button[data-active="true"] { font-weight: 700; text-decoration: underline; }
  .proto-queue-bar { position: fixed; left: 16px; bottom: 16px; background: #111827; color: #f9fafb;
    font: 12px -apple-system, sans-serif; padding: 8px 12px; border-radius: 8px; display: flex;
    gap: 8px; align-items: center; }
`

function ensureHost() {
  if (host) return
  host = document.createElement('div')
  ;(document.body || document.documentElement).appendChild(host)
  shadow = host.attachShadow({ mode: 'closed' })
  const style = document.createElement('style')
  style.textContent = OVERLAY_CSS
  shadow.appendChild(style)
  markLayer = document.createElement('div')
  markLayer.className = 'proto-marks'
  shadow.appendChild(markLayer)
  panelEl = document.createElement('div')
  panelEl.className = 'proto-panel proto-hidden'
  shadow.appendChild(panelEl)
  queueBarEl = document.createElement('div')
  queueBarEl.className = 'proto-queue-bar'
  shadow.appendChild(queueBarEl)
  renderQueueBar()
}

function closePanel() {
  panelEl.classList.add('proto-hidden')
  panelEl.innerHTML = ''
}

function openPanel(anchor) {
  panelEl.innerHTML = ''
  panelEl.classList.remove('proto-hidden')

  const title = document.createElement('div')
  title.textContent = anchor ? 'Pin' : 'Screen note'
  panelEl.appendChild(title)

  let kind = 'behaviour'
  const kindRow = document.createElement('div')
  kindRow.className = 'proto-kind'
  const behaviourBtn = document.createElement('button')
  behaviourBtn.type = 'button'
  behaviourBtn.textContent = 'behaviour'
  const lookBtn = document.createElement('button')
  lookBtn.type = 'button'
  lookBtn.textContent = 'look'
  function paintKind() {
    behaviourBtn.dataset.active = String(kind === 'behaviour')
    lookBtn.dataset.active = String(kind === 'look')
  }
  behaviourBtn.onclick = () => { kind = 'behaviour'; paintKind() }
  lookBtn.onclick = () => { kind = 'look'; paintKind() }
  paintKind()
  kindRow.appendChild(behaviourBtn)
  kindRow.appendChild(lookBtn)
  panelEl.appendChild(kindRow)

  const noteArea = document.createElement('textarea')
  noteArea.placeholder = 'note'
  panelEl.appendChild(noteArea)

  const whoInput = document.createElement('input')
  whoInput.placeholder = 'who'
  whoInput.value = rememberedWho()
  panelEl.appendChild(whoInput)

  const addBtn = document.createElement('button')
  addBtn.type = 'button'
  addBtn.textContent = 'Add pin'
  addBtn.onclick = () => {
    rememberWho(whoInput.value)
    pinQueue.push({
      screen: currentScreen(),
      state: currentState(),
      anchor: anchor || null,
      note: noteArea.value,
      who: whoInput.value,
      kind,
    })
    closePanel()
    renderQueueBar()
  }
  panelEl.appendChild(addBtn)

  const cancelBtn = document.createElement('button')
  cancelBtn.type = 'button'
  cancelBtn.textContent = 'Cancel'
  cancelBtn.onclick = closePanel
  panelEl.appendChild(cancelBtn)
}

function renderQueueBar() {
  queueBarEl.innerHTML = ''
  const count = document.createElement('span')
  count.textContent = pinQueue.length + ' pin(s) queued'
  queueBarEl.appendChild(count)

  const noteBtn = document.createElement('button')
  noteBtn.type = 'button'
  noteBtn.textContent = 'screen note'
  noteBtn.onclick = () => openPanel(null)
  queueBarEl.appendChild(noteBtn)

  const sendBtn = document.createElement('button')
  sendBtn.type = 'button'
  sendBtn.textContent = 'Send ' + pinQueue.length + ' pins'
  sendBtn.disabled = pinQueue.length === 0
  sendBtn.onclick = sendPins
  queueBarEl.appendChild(sendBtn)

  const status = document.createElement('span')
  status.className = 'proto-status'
  queueBarEl.appendChild(status)
}

function setStatus(text) {
  const status = queueBarEl.querySelector('.proto-status')
  if (status) status.textContent = text
}

async function sendPins() {
  const batch = pinQueue.slice()
  let res
  try {
    res = await fetch(PINS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    })
  } catch (e) {
    // never touch the local queue on a network failure — act on the server's answer, not the
    // request; there is no answer here, so nothing is cleared
    setStatus('send failed — ' + e.message)
    return
  }
  if (res.ok) {
    // 2xx: the server accepted the whole batch — only now is it safe to clear the local queue
    pinQueue = []
    setStatus('sent')
  } else {
    let message = 'server refused (' + res.status + ')'
    try {
      const body = await res.json()
      if (body && body.error) message = body.error
    } catch (e) {
      // non-JSON error body — keep the generic status message
    }
    setStatus(message)
  }
  renderQueueBar()
}

function outline(el) {
  const rect = el.getBoundingClientRect && el.getBoundingClientRect()
  if (!rect) return
  const box = document.createElement('div')
  box.className = 'proto-outline'
  box.style.left = rect.left + 'px'
  box.style.top = rect.top + 'px'
  box.style.width = rect.width + 'px'
  box.style.height = rect.height + 'px'
  markLayer.appendChild(box)
  setTimeout(() => box.remove(), 1500)
}

function onAltClick(event) {
  if (!event.altKey) return
  event.preventDefault()
  event.stopPropagation()
  ensureHost()
  const target = event.target
  const id = stableIdFor(target)
  const anchor = id ? { id, loc: locFor(target) } : null
  outline(target)
  openPanel(anchor)
}

function init() {
  ensureHost()
  document.addEventListener('click', onAltClick, true)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
