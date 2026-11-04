'use strict'
// plan.js — new <slug> | check <path> | lock <path> [--confirmed]. The session writes the spec; this numbers, validates, locks.
const fs = require('fs')
const path = require('path')
const { readSpec, writeStatus, writeText, readText } = require('./lib/state')

const REQUIRED = ['Intent', 'Goal', 'Decisions', 'File Plan', 'Acceptance Criteria', 'Assumptions']
// Inline fallback when spec/templates/spec.md is absent (sections per architecture §6).
const MINIMAL = `---
date: YYYY-MM-DD
status: draft
area: <area>
depends_on: []
brief: n/a
architecture: false
---

# <Title>

## Intent
- You asked:
- I will build:
- I will not touch:
- Architecture or behaviour change: no

## Goal

## Decisions

## File Plan

| Path | Action | Summary |
|------|--------|---------|

## Acceptance Criteria

## Assumptions
`

class Refusal extends Error { constructor(m) { super(m); this.exit = 2 } }

function create(root, slug, date) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug || '')) throw new Refusal('new needs a kebab-case <slug>')
  if (!/^\d{8}$/.test(date)) throw new Refusal('--date must be YYYYMMDD')
  const dir = path.join(root, 'specs', date)
  const nums = (fs.existsSync(dir) ? fs.readdirSync(dir) : []).map((f) => /^(\d+)-.*\.md$/.exec(f)).filter(Boolean).map((m) => Number(m[1]))
  const nn = String(Math.max(0, ...nums) + 1).padStart(2, '0')
  const tpl = readText(path.join(__dirname, '..', 'templates', 'spec.md')) || MINIMAL
  const text = tpl.replace(/^date:.*$/m, `date: ${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`).replace(/AC-YYYYMMDD-NN/g, `AC-${date}-${nn}`)
  const file = path.join(dir, `${nn}-${slug}.md`)
  writeText(file, text)
  return path.relative(root, file)
}

function check(file) {
  const s = readSpec(file)
  const missing = REQUIRED.filter((n) => !Object.keys(s.sections).some((k) => k === n || k.startsWith(n + ' ') || k.startsWith(n + '(')))
  return { ok: !missing.length && s.markers === 0, missing, markers: s.markers, architecture: s.frontmatter.architecture === true }
}

function main(argv) {
  const flags = {}; const pos = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--confirmed') flags.confirmed = true
    else if (argv[i] === '--root' || argv[i] === '--date') flags[argv[i].slice(2)] = argv[++i]
    else pos.push(argv[i])
  }
  const root = path.resolve(flags.root || process.cwd())
  try {
    const [cmd, arg] = pos
    if (cmd === 'new') {
      const d = new Date()
      const today = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
      console.log(create(root, arg, flags.date || today))
    } else if (cmd === 'check' || cmd === 'lock') {
      const file = path.resolve(root, arg || '')
      if (!fs.existsSync(file)) throw new Refusal(`no such spec: ${arg}`)
      const r = check(file)
      if (cmd === 'check') return console.log(JSON.stringify(r)), 0
      if (r.missing.length) throw new Refusal(`missing sections: ${r.missing.join(', ')}`)
      if (r.markers) throw new Refusal(`${r.markers} [NEEDS CLARIFICATION:] marker(s) left — resolve them first`)
      if (r.architecture && !flags.confirmed) throw new Refusal("architecture change — needs the user's yes; re-run with --confirmed")
      writeStatus(file, 'hardened')
      console.log(`✅ spec hardened & locked — ${path.relative(root, file)}`)
    } else throw new Refusal('usage: plan.js new <slug> [--date YYYYMMDD] | check <path> | lock <path> [--confirmed]')
    return 0
  } catch (e) {
    console.error('plan: ' + e.message)
    return e.exit || 1
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2))
