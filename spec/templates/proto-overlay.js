// proto-overlay.js — dev-only pin overlay for a /spec:prototype worktree. ES module, no dependencies.
//
// prototype.js copies this file into the worktree beside the host's dev entry with PIN_ENDPOINT
// baked in; the entry imports it behind a dev flag, e.g.
//   if (import.meta.env.DEV) import('./proto-overlay.js')
// Alt+click any element: a note panel opens (behaviour | look toggle). Pins queue locally with
// numbered badges; "Send N pins" POSTs {pins:[{kind, route, selector, note}]} to PIN_ENDPOINT/pin
// and clears the queue only on a 2xx. Everything lives in a closed shadow root: no attribute is
// ever added to the host's own elements.

const PIN_ENDPOINT = '__PIN_ENDPOINT__'

const STYLE = `
  .marks { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000; }
  .outline { position: absolute; outline: 2px solid #f43f5e; border-radius: 2px; }
  .badge { position: absolute; min-width: 18px; height: 18px; padding: 0 4px; background: #f43f5e;
    color: #fff; font: 700 11px/18px sans-serif; text-align: center; border-radius: 9px; transform: translate(-50%, -50%); }
  .panel, .bar { position: fixed; z-index: 2147483001; background: #111827; color: #f9fafb;
    font: 12px/1.4 sans-serif; padding: 10px 12px; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,.4); }
  .panel { right: 16px; bottom: 56px; width: min(260px, calc(100vw - 32px)); }
  .bar { left: 16px; bottom: 16px; display: flex; gap: 8px; align-items: center; }
  .panel[hidden] { display: none; }
  .panel textarea { width: 100%; min-height: 56px; margin: 6px 0; box-sizing: border-box; }
  .panel button[aria-pressed="true"] { font-weight: 700; text-decoration: underline; }
`

const queue = [] // { kind, route, selector, note, el }
let shadow, marks, panel, bar, status

// A selector a later session can find again: data-testid, then id, else a short tag path.
function selectorFor(el) {
  const parts = []
  for (let n = el; n && n.nodeType === 1 && n !== document.body && parts.length < 4; n = n.parentElement) {
    const t = n.getAttribute('data-testid')
    if (t) { parts.unshift(`[data-testid="${t}"]`); break }
    if (n.id) { parts.unshift('#' + CSS_escape(n.id)); break }
    const same = n.parentElement ? [...n.parentElement.children].filter((c) => c.tagName === n.tagName) : [n]
    parts.unshift(n.tagName.toLowerCase() + (same.length > 1 ? `:nth-of-type(${same.indexOf(n) + 1})` : ''))
  }
  return parts.join(' > ')
}
const CSS_escape = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s)

function mk(tag, props = {}, ...kids) {
  const e = Object.assign(document.createElement(tag), props)
  e.append(...kids)
  return e
}

function mount() {
  const host = mk('div')
  document.body.append(host)
  shadow = host.attachShadow({ mode: 'closed' })
  marks = mk('div', { className: 'marks' })
  panel = mk('div', { className: 'panel', hidden: true })
  bar = mk('div', { className: 'bar' })
  shadow.append(mk('style', { textContent: STYLE }), marks, panel, bar)
  renderBar()
}

function renderBar() {
  status = mk('span')
  const send = mk('button', { textContent: `Send ${queue.length} pins`, disabled: !queue.length, onclick: sendPins })
  bar.replaceChildren(mk('span', { textContent: `${queue.length} pin(s) queued` }), send, status)
}

function renderBadges() {
  marks.querySelectorAll('.badge').forEach((b) => b.remove())
  queue.forEach((p, i) => {
    const r = p.el.getBoundingClientRect()
    marks.append(mk('div', { className: 'badge', textContent: String(i + 1), style: `left:${r.left}px;top:${r.top}px` }))
  })
}

function openPanel(el) {
  let kind = 'behaviour'
  const toggles = ['behaviour', 'look'].map((k) => mk('button', { type: 'button', textContent: k, onclick: () => { kind = k; paint() } }))
  const paint = () => toggles.forEach((b) => b.setAttribute('aria-pressed', String(b.textContent === kind)))
  const note = mk('textarea', { placeholder: 'what should happen here?' })
  const add = mk('button', {
    type: 'button', textContent: 'Add pin',
    onclick: () => {
      if (!note.value.trim()) return
      queue.push({ kind, route: location.pathname, selector: selectorFor(el), note: note.value.trim(), el })
      panel.hidden = true
      renderBar()
      renderBadges()
    },
  })
  const cancel = mk('button', { type: 'button', textContent: 'Cancel', onclick: () => { panel.hidden = true } })
  paint()
  panel.replaceChildren(mk('div', { textContent: 'Pin: ' + selectorFor(el) }), mk('div', {}, ...toggles), note, add, cancel)
  panel.hidden = false
  note.focus()
}

async function sendPins() {
  const pins = queue.map(({ kind, route, selector, note }) => ({ kind, route, selector, note }))
  let res
  try {
    res = await fetch(PIN_ENDPOINT + '/pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pins }) })
  } catch (e) {
    status.textContent = 'send failed — ' + e.message // nothing was answered, so nothing is cleared
    return
  }
  if (res.ok) {
    queue.length = 0
    renderBar()
    renderBadges()
    status.textContent = 'sent'
    return
  }
  let msg = await res.text().catch(() => '')
  try { msg = JSON.parse(msg).error || msg } catch { /* plain text */ }
  status.textContent = msg || `server refused (${res.status})`
}

function onClick(event) {
  if (!event.altKey) return
  event.preventDefault()
  event.stopPropagation()
  const el = event.target
  const r = el.getBoundingClientRect()
  const box = mk('div', { className: 'outline', style: `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px` })
  marks.append(box)
  setTimeout(() => box.remove(), 1500)
  openPanel(el)
}

function init() {
  mount()
  document.addEventListener('click', onClick, true)
  addEventListener('scroll', renderBadges, true)
  addEventListener('resize', renderBadges)
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
else init()
