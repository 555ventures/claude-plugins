'use strict'
// lib/report.js — the one end-of-command report, in the fixed order:
// **outcome** · bullets · 📌 pins · ⚠️ warns · 🚫 blocks · 📦 artifacts · 📋 queued · Next:
// render({outcome, bullets, pins, warns, blocks, artifacts, queued, next}) → string.
// CLI: node lib/report.js --slots <json file> → prints the rendered report (exit 2 on a bad file).

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
  // The Next is the caller's fact; a driver with nothing left says so. It never ends in a question mark.
  const n = String(next == null ? '' : next).trim().replace(/\?+$/, '')
  if (!n) throw new Error('report: next is required — say what is left')
  out.push('', `Next: ${n}`)
  return out.join('\n') + '\n'
}

module.exports = { render }

if (require.main === module) {
  const i = process.argv.indexOf('--slots')
  const file = i > 0 ? process.argv[i + 1] : null
  let slots = null
  try { slots = JSON.parse(require('fs').readFileSync(file, 'utf8')) } catch { /* reported below */ }
  if (!slots || !slots.outcome) {
    process.stderr.write('report: usage: report.js --slots <json file with at least {"outcome": "…"}>\n')
    process.exitCode = 2
  } else {
    try { process.stdout.write(render(slots)) } catch (e) {
      process.stderr.write(`${e.message}\n`); process.exitCode = 2
    }
  }
}
