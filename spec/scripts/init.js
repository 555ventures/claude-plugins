#!/usr/bin/env node
'use strict'
// init.js — detect trunk, test/setup/lint/typecheck commands; merge .claude/spec.config.json;
// ensure .gitignore entries. node init.js [--root <dir>] [--json] [--set key=value]...
// Prints undetected keys as a JSON `questions` list; answers come back through --set.

const fs = require('fs')
const path = require('path')
const { readJson, writeConfig, configPath } = require('./lib/state')
const { run, detectTestCommand } = require('./lib/host')
const git = require('./lib/git')
const { render } = require('./lib/report')

const IGNORE = ['specs/**/*.run/', '.claude/worktrees/', '.claude/pending-question.json', '.claude/settings.local.json']

function ensureGitignore(root) {
  const file = path.join(root, '.gitignore')
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  const have = new Set(text.split('\n').map((l) => l.trim()))
  const added = IGNORE.filter((e) => !have.has(e))
  if (added.length) fs.writeFileSync(file, text + (text && !text.endsWith('\n') ? '\n' : '') + added.join('\n') + '\n')
  return added
}

function detectTrunk(root) {
  const r = git.raw(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], root)
  if (r.status === 0) return r.stdout.trim().replace(/^origin\//, '')
  const b = git.raw(['rev-parse', '--abbrev-ref', 'HEAD'], root)
  return b.status === 0 && b.stdout.trim() !== 'HEAD' ? b.stdout.trim() : 'main'
}

function detect(root) {
  const has = (f) => fs.existsSync(path.join(root, f))
  const read = (f) => { try { return fs.readFileSync(path.join(root, f), 'utf8') } catch { return '' } }
  let scripts = {}
  try { scripts = JSON.parse(read('package.json')).scripts || {} } catch { /* no package.json */ }
  const pm = has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : 'npm'
  const py = read('pyproject.toml')
  let setupCommand = null
  if (has('package-lock.json')) setupCommand = 'npm ci'
  else if (has('pnpm-lock.yaml')) setupCommand = 'pnpm install --frozen-lockfile'
  else if (has('yarn.lock')) setupCommand = 'yarn install --frozen-lockfile'
  else if (has('requirements.txt')) setupCommand = 'pip install -r requirements.txt'
  else if (has('go.mod')) setupCommand = 'go mod download'
  else if (has('Cargo.toml')) setupCommand = 'cargo fetch'
  const lint = scripts.lint ? `${pm} run lint` : (has('ruff.toml') || /\[tool\.ruff/.test(py)) ? 'ruff check .' : null
  const typecheck = scripts.typecheck ? `${pm} run typecheck` : (has('mypy.ini') || /\[tool\.mypy/.test(py)) ? 'mypy .' : null
  const test = detectTestCommand(root)
  const testCommand = test ? [lint, typecheck, test].filter(Boolean).join(' && ') : null
  return { trunk: detectTrunk(root), testCommand, setupCommand }
}

function main(argv) {
  const opt = { root: git.repoRoot(process.cwd()), json: false, set: {} }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') opt.root = path.resolve(argv[++i])
    else if (argv[i] === '--json') opt.json = true
    else if (argv[i] === '--set') {
      const [k, ...v] = String(argv[++i] || '').split('=')
      if (!k || !v.length) { process.stderr.write('init: --set needs key=value\n'); return 2 }
      opt.set[k] = v.join('=')
    }
  }
  const { root } = opt
  const existing = readJson(configPath(root), {}) || {}
  const found = detect(root)
  const cfg = { ...existing }
  for (const [k, v] of Object.entries(found)) if (v && cfg[k] == null) cfg[k] = v
  Object.assign(cfg, opt.set)
  writeConfig(root, cfg)
  const added = ensureGitignore(root)
  const questions = cfg.testCommand ? [] : [{ key: 'testCommand', question: 'What single command runs your whole test suite?' }]
  const warns = []
  let probe = null
  if (cfg.testCommand) {
    probe = run(cfg.testCommand, { cwd: root, timeoutMs: 600000 }).status
    if (probe > 1) warns.push(`testCommand exited ${probe}${probe === 127 ? ' (command not found)' : ''} — fix it with: init.js --set testCommand=<cmd>`)
  }
  const verified = probe === 0 || probe === 1
  const outcome = questions.length ? 'config written — answers needed'
    : verified ? '✅ initialized — config written, gate verified' : 'config written — gate not verified'
  if (opt.json) process.stdout.write(JSON.stringify({ config: cfg, gitignoreAdded: added, questions, warns, probe }) + '\n')
  else {
    process.stdout.write(render({
      outcome, bullets: Object.keys(cfg).map((k) => `${k}: ${typeof cfg[k] === 'string' ? cfg[k] : JSON.stringify(cfg[k])}`),
      warns, next: questions.length ? 're-run init.js with --set testCommand=<answer>' : 'commit .claude/spec.config.json and .gitignore, then /spec:doctor',
    }))
    if (questions.length) process.stdout.write('questions: ' + JSON.stringify(questions) + '\n')
  }
  return 0
}

if (require.main === module) process.exitCode = main(process.argv.slice(2))
module.exports = { ensureGitignore, detect, IGNORE }
