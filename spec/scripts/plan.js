'use strict'
// plan.js — new <slug> | lock <path> [--confirmed]. The session writes the spec; this numbers it,
// validates it, locks it and (in a git repo) commits it on the current branch, so lanes branch with it.
const fs = require('fs')
const path = require('path')
const { readSpec, writeStatus, writeText, readText, readProto, specsCiting } = require('./lib/state')
const { isSpecText, decisionRows } = require('./lib/spec')
const { retiredRefusal } = require('./lib/criteria')
const { isStub } = require('./lib/stub')
const Q = require('./lib/queue')
const N = require('./lib/next')
const git = require('./lib/git')

const REQUIRED = ['Intent', 'Goal', 'Decisions', 'File Plan', 'Acceptance Criteria', 'Assumptions']

// A Decisions row that takes something away from users needs the client's word: `[asked:]` on the row, or the Intent line.
const RESTRICT_RE = /\b(cannot|can't|no longer|only (?:an? )?\w+ (?:can|may)|immutable|read-only|requires? (?:a )?reason|hidden from|removed from|locked out)\b/i

class Refusal extends Error { constructor(m) { super(m); this.exit = 2 } }

function create(root, slug) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug || '')) throw new Refusal('new needs a kebab-case <slug>')
  const d = new Date()
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const dir = path.join(root, 'specs', date)
  const nums = (fs.existsSync(dir) ? fs.readdirSync(dir) : []).map((f) => /^(\d+)-.*\.md$/.exec(f)).filter(Boolean).map((m) => Number(m[1]))
  const nn = String(Math.max(0, ...nums) + 1).padStart(2, '0')
  const tpl = readText(path.join(__dirname, '..', 'templates', 'spec.md'))
  const text = tpl.replace(/^date:.*$/m, `date: ${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`).replace(/AC-YYYYMMDD-NN/g, `AC-${date}-${nn}`)
  const file = path.join(dir, `${nn}-${slug}.md`)
  writeText(file, text)
  return path.relative(root, file)
}

// The behaviour pins of a prototype contract that no AC of this spec, or of an earlier locked spec citing the
// same stem, ends with `(pin pN)` — a stub's from its `acs:` entries. Returns {stem, contract, uncovered}; null for a
// spec with no `prototype:`.
const CITE = /\(pin (p\d+)\)/g
function pinCoverage(root, file, s) {
  const stem = s.frontmatter.prototype
  if (typeof stem !== 'string' || !stem) return null
  const { contract } = readProto(root, stem) // a v7 file stops here, naming /spec:migrate
  if (!contract) throw new Refusal(`no contract at design/prototypes/${stem}/contract.json`)
  const cited = new Set()
  const cite = (acs) => { for (const a of acs) for (const m of a.text.matchAll(CITE)) cited.add(m[1]) }
  cite(s.acs)
  for (const c of specsCiting(root, stem)) {
    if (path.resolve(root, c.rel) === file || !['hardened', 'implementing', 'done'].includes(c.status)) continue
    const d = readSpec(path.resolve(root, c.rel))
    cite(isStub(d.frontmatter) ? [].concat(d.frontmatter.acs || []).map((text) => ({ text })) : d.acs)
  }
  const uncovered = (contract.pins || []).filter((p) => p.status === 'active' && p.kind === 'behaviour' && !cited.has(p.id)).map((p) => p.id)
  return { stem, contract, uncovered }
}

function lock(root, arg, confirmed) {
  const typed = (arg || '').replace(/^@/, '') // `/spec:run @path` pastes the file mention
  const file = fs.existsSync(path.resolve(root, typed)) || !fs.existsSync(path.resolve(process.cwd(), typed)) ? path.resolve(root, typed) : path.resolve(process.cwd(), typed)
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Refusal(`no such spec: ${arg || '(none)'}`)
  if (path.relative(root, file).startsWith('..')) throw new Refusal(`${file} is outside ${root}`)
  const s = readSpec(file)
  const missing = REQUIRED.filter((n) => !Object.keys(s.sections).some((k) => k === n || k.startsWith(n + ' ') || k.startsWith(n + '(')))
  if (missing.length) throw new Refusal(`missing sections: ${missing.join(', ')}`)
  if (s.markers) throw new Refusal(`${s.markers} [NEEDS CLARIFICATION:] marker(s) left — resolve them first`)
  // A spec this big is two specs or a wrong design: cut before lock, never after review.
  const dKey = Object.keys(s.sections).find((k) => k === 'Decisions' || k.startsWith('Decisions ') || k.startsWith('Decisions('))
  const size = { Decisions: dKey ? decisionRows(s.sections[dKey]).length : 0, lines: readText(file).trimEnd().split('\n').length }
  if (size.Decisions > 12 || size.lines > 90) throw new Refusal(`spec too big: ${size.Decisions} Decisions (max 12), ${size.lines} lines (max 90) — split it, or name the existing code each Decision changes and cut the rest`)
  // Code may say `--root <path>` or <Title>Hi</Title>: drop fenced blocks (line by line, so a stray fence cannot swallow prose) and inline code.
  let fence = false
  const prose = readText(file).split('\n').filter((l) => { if (/^\s*(```|~~~)/.test(l)) { fence = !fence; return false } return !fence }).join('\n').replace(/`[^`\n]*`/g, '')
  const left = [...new Set(readText(path.join(__dirname, '..', 'templates', 'spec.md')).match(/<[^<>\n]+>/g))].filter((t) => prose.includes(t))
  if (left.length) throw new Refusal(`template placeholders left: ${left.join(' ')} — fill them in first`)
  const retiring = retiredRefusal(s) // an optional `## Retired criteria`: each line names an AC and a reason it may go
  if (retiring) throw new Refusal(`Retired criteria: ${retiring}`)
  // Every gate refuses a build that edits another spec (run.js `specEdits`), so such a plan can never pass.
  const own = path.relative(root, file).split(path.sep).join('/')
  const others = s.filePaths.map((p) => p.replace(/^\.\//, '')).filter((p) => isSpecText(p) && p !== own && !p.startsWith(own.replace(/\.md$/, '.run/')))
  if (others.length) throw new Refusal(`File Plan lists other spec files: ${others.join(', ')} — a build may not edit them. Drop the rows and edit them on the trunk yourself: commit before lock, or edit after the merge`)
  if (s.frontmatter.architecture === true && !confirmed) throw new Refusal("architecture change — needs the user's yes; re-run with --confirmed")
  // A v7-era spec without an Intent section is unaffected.
  const intentKey = Object.keys(s.sections).find((k) => k === 'Intent' || k.startsWith('Intent '))
  if (intentKey !== undefined && s.intent.signoff === null) {
    const rows = decisionRows(s.sections[Object.keys(s.sections).find((k) => k === 'Decisions' || k.startsWith('Decisions ') || k.startsWith('Decisions(')) || ''])
    const hit = rows.find((c) => RESTRICT_RE.test(c[1]) && !/\[(asked|guards):/.test(c[1]))
    const reason = s.frontmatter.breaking === true ? 'the spec is marked breaking: true'
      : hit ? `Decisions row ${hit[0]} restricts users ("${hit[1].length > 80 ? hit[1].slice(0, 77) + '...' : hit[1]}")` : null
    if (reason) throw new Refusal(`client sign-off needed: ${reason} — ask, then fill the Intent line`)
  }
  const cover = pinCoverage(root, file, s)
  if (cover && cover.uncovered.length) {
    throw new Refusal(`behaviour pins without an AC: ${cover.uncovered.join(', ')} — write an AC ending (pin pN) for each, or node prototype.js ${cover.stem} drop pN --why …`)
  }
  writeStatus(file, 'hardened')
  const rel = path.relative(root, file)
  if (git.raw(['rev-parse', '--git-dir'], root).status === 0) {
    const id = (/(\d{8})\/(\d+)-/.exec(rel.split(path.sep).join('/')) || []).slice(1).join('/') || path.basename(rel, '.md')
    // ADR and brief edits the plan made travel with the spec, so lanes branch with them.
    const docs = git.raw(['status', '--porcelain', '--untracked-files=all', '--', 'docs/adr', 'docs/roadmap'], root).stdout
      .split('\n').filter(Boolean).map((l) => l.slice(3).trim())
    git.sh(['add', '--', rel, ...docs], root)
    git.sh(['commit', '-q', '-m', `chore(spec): lock ${id}`, '--', rel, ...docs], root)
  }
  // Every active behaviour pin has an AC: the plan item the contract queued is done.
  let closed = false
  if (cover && git.raw(['rev-parse', '--git-dir'], root).status === 0) {
    const item = `design/prototypes/${cover.stem}/contract.json`
    try { closed = Q.tick(root, (i) => i.type === 'plan' && i.payload === item) > 0 } catch (e) { if (e.exit === 2) throw e }
  }
  try { Q.read(root) } catch (e) { if (e.exit === 2) throw e /* an unmigrated queue stops here, before any Next */ }
  return `✅ spec hardened & locked — ${rel}${closed ? '\n📋 plan item closed — every behaviour pin has an AC' : ''}\nNext: ${N.topLines(N.derive(root)).join('\n')}`
}

function main(argv) {
  const flags = {}; const pos = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--confirmed') flags.confirmed = true
    else if (argv[i] === '--root') flags.root = argv[++i]
    else pos.push(argv[i])
  }
  const root = path.resolve(flags.root || git.repoRoot(process.cwd()))
  try {
    const [cmd, arg] = pos
    if (cmd === 'new') console.log(create(root, arg))
    else if (cmd === 'lock') console.log(lock(root, arg, flags.confirmed))
    else throw new Refusal('usage: plan.js new <slug> | lock <path> [--confirmed]')
    return 0
  } catch (e) {
    console.error('plan: ' + e.message)
    return e.exit || 1
  }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2))
