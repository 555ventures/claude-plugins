'use strict'
// lib/report.js — the one end-of-command report, in the fixed order:
// **outcome** · bullets · 📌 pins · ⚠️ warns · 🚫 blocks · 📦 artifacts · 📋 queued · Next:
// render({outcome, bullets, pins, warns, blocks, artifacts, queued, next}) → string. No CLI.

const SECTIONS = [
  ['bullets', '- '],
  ['pins', '📌 '],
  ['warns', '⚠️ '],
  ['blocks', '🚫 '],
  ['artifacts', '📦 '],
  ['queued', '📋 '],
]

const list = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]).map(String).map((s) => s.trim()).filter(Boolean)

// An item that already starts with the section's emoji is not prefixed twice.
function line(prefix, item) {
  const mark = prefix.trim()
  return mark !== '-' && item.startsWith(mark) ? item : prefix + item
}

function render({ outcome, bullets, pins, warns, blocks, artifacts, queued, next } = {}) {
  if (!outcome) throw new Error('report: outcome is required')
  const out = [`**${String(outcome).trim()}**`]
  const all = { bullets, pins, warns, blocks, artifacts, queued }
  for (const [key, prefix] of SECTIONS) {
    const items = list(all[key])
    if (!items.length) continue
    out.push('')
    for (const item of items) out.push(line(prefix, item))
  }
  // A Next: line never ends in a question mark.
  const n = String(next || 'nothing needs you — all done').trim().replace(/\?+$/, '')
  out.push('', `Next: ${n}`)
  return out.join('\n') + '\n'
}

module.exports = { render }
