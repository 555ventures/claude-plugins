'use strict'
// plan.js — new <slug> | lock <path> [--confirmed]. The session writes the spec; this numbers it,
// validates it, locks it and (in a git repo) commits it on the current branch, so lanes branch with it.
const fs = require('fs')
const path = require('path')
const { readSpec, writeStatus, writeText, readText } = require('./lib/state')
const git = require('./lib/git')

const REQUIRED = ['Intent', 'Goal', 'Decisions', 'File Plan', 'Acceptance Criteria', 'Assumptions']

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

function lock(root, arg, confirmed) {
  const file = path.resolve(root, arg || '')
  if (!fs.existsSync(file)) throw new Refusal(`no such spec: ${arg}`)
  const s = readSpec(file)
  const missing = REQUIRED.filter((n) => !Object.keys(s.sections).some((k) => k === n || k.startsWith(n + ' ') || k.startsWith(n + '(')))
  if (missing.length) throw new Refusal(`missing sections: ${missing.join(', ')}`)
  if (s.markers) throw new Refusal(`${s.markers} [NEEDS CLARIFICATION:] marker(s) left — resolve them first`)
  if (s.frontmatter.architecture === true && !confirmed) throw new Refusal("architecture change — needs the user's yes; re-run with --confirmed")
  writeStatus(file, 'hardened')
  const rel = path.relative(root, file)
  if (git.raw(['rev-parse', '--git-dir'], root).status === 0) {
    const id = (/(\d{8})\/(\d+)-/.exec(rel.split(path.sep).join('/')) || []).slice(1).join('/') || path.basename(rel, '.md')
    git.sh(['add', '--', rel], root)
    git.sh(['commit', '-q', '-m', `chore(spec): lock ${id}`, '--', rel], root)
  }
  return `✅ spec hardened & locked — ${rel}`
}

function main(argv) {
  const flags = {}; const pos = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--confirmed') flags.confirmed = true
    else if (argv[i] === '--root') flags.root = argv[++i]
    else pos.push(argv[i])
  }
  const root = path.resolve(flags.root || process.cwd())
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
