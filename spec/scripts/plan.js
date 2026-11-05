'use strict'
// plan.js — new <slug> | lock <path> [--confirmed]. The session writes the spec; this numbers it,
// validates it, locks it and (in a git repo) commits it on the current branch, so lanes branch with it.
const fs = require('fs')
const path = require('path')
const { readSpec, writeStatus, writeText, readText, readQueue } = require('./lib/state')
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
  const typed = arg || ''
  const file = fs.existsSync(path.resolve(root, typed)) || !fs.existsSync(path.resolve(process.cwd(), typed)) ? path.resolve(root, typed) : path.resolve(process.cwd(), typed)
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Refusal(`no such spec: ${arg || '(none)'}`)
  if (path.relative(root, file).startsWith('..')) throw new Refusal(`${file} is outside ${root}`)
  const s = readSpec(file)
  const missing = REQUIRED.filter((n) => !Object.keys(s.sections).some((k) => k === n || k.startsWith(n + ' ') || k.startsWith(n + '(')))
  if (missing.length) throw new Refusal(`missing sections: ${missing.join(', ')}`)
  if (s.markers) throw new Refusal(`${s.markers} [NEEDS CLARIFICATION:] marker(s) left — resolve them first`)
  // Code may say `--root <path>` or <Title>Hi</Title>: drop fenced blocks (line by line, so a stray fence cannot swallow prose) and inline code.
  let fence = false
  const prose = readText(file).split('\n').filter((l) => { if (/^\s*(```|~~~)/.test(l)) { fence = !fence; return false } return !fence }).join('\n').replace(/`[^`\n]*`/g, '')
  const left = [...new Set(readText(path.join(__dirname, '..', 'templates', 'spec.md')).match(/<[^<>\n]+>/g))].filter((t) => prose.includes(t))
  if (left.length) throw new Refusal(`template placeholders left: ${left.join(' ')} — fill them in first`)
  if (s.frontmatter.architecture === true && !confirmed) throw new Refusal("architecture change — needs the user's yes; re-run with --confirmed")
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
  let queued = false // no queue outside git
  try { queued = readQueue(root).items.some((i) => !i.done && i.payload === rel.split(path.sep).join('/')) } catch { /* not a repo */ }
  return `✅ spec hardened & locked — ${rel}\nNext: ${queued ? '/spec:run' : '/spec:queue add'} ${rel}`
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
