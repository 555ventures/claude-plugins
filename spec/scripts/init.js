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

// Lint and typecheck come from real commands only, never from a bare config file: package.json
// scripts, Makefile targets, pyproject / ruff.toml / mypy.ini. CHECK_WORDS is how a gate that already runs
// the check is recognised.
const CHECK_WORDS = { lint: ['lint', 'ruff'], typecheck: ['typecheck', 'type-check', 'mypy'] }

const scriptsOf = (root) => { try { return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts || {} } catch { return {} } }

function detect(root) {
  const has = (f) => fs.existsSync(path.join(root, f))
  const read = (f) => { try { return fs.readFileSync(path.join(root, f), 'utf8') } catch { return '' } }
  const scripts = scriptsOf(root)
  const pm = has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : (has('bun.lockb') || has('bun.lock')) ? 'bun' : 'npm'
  const py = read('pyproject.toml')
  const make = read('Makefile')
  const target = (n) => new RegExp(`^${n}\\s*:`, 'm').test(make)
  const setupCommand = ([['package-lock.json', 'npm ci'], ['pnpm-lock.yaml', 'pnpm install --frozen-lockfile'], ['yarn.lock', 'yarn install --frozen-lockfile'],
    ['requirements.txt', 'pip install -r requirements.txt'], ['go.mod', 'go mod download'], ['Cargo.toml', 'cargo fetch']].find(([f]) => has(f)) || [])[1] || null
  const script = (...names) => { const n = names.find((x) => scripts[x]); return n ? `${pm} run ${n}` : null }
  const lint = script('lint', 'lint:ci') || (target('lint') ? 'make lint' : null) || ((has('ruff.toml') || /\[tool\.ruff/.test(py)) ? 'ruff check .' : null)
  const typecheck = script('typecheck', 'type-check') || (target('typecheck') ? 'make typecheck' : null) || ((has('mypy.ini') || /\[tool\.mypy/.test(py)) ? 'mypy .' : null)
  const checks = [lint && { check: 'lint', command: lint }, typecheck && { check: 'typecheck', command: typecheck }].filter(Boolean)
  return { trunk: detectTrunk(root), testCommand: detectTestCommand(root), setupCommand, checks }
}

// True when `testCommand` already runs the check: its word is in the command, in a package.json script
// one of its tokens names, or in a file one of its tokens names (one level, no deeper).
function covered(root, testCommand, check) {
  const re = new RegExp(`(^|[^A-Za-z0-9])(${CHECK_WORDS[check].join('|')})([^A-Za-z0-9]|$)`)
  if (re.test(testCommand)) return true
  const scripts = scriptsOf(root)
  for (const tok of testCommand.split(/[\s;&|()]+/).filter(Boolean)) {
    if (typeof scripts[tok] === 'string' && re.test(scripts[tok])) return true
    try {
      const f = path.resolve(root, tok)
      if (!path.relative(root, f).startsWith('..') && fs.statSync(f).isFile() && re.test(fs.readFileSync(f, 'utf8'))) return true
    } catch { /* not a file */ }
  }
  return false
}

// One balanced `( … )` group: the `)` closing the first `(` is the last non-blank character, scanned with escapes,
// '…', "…" and comments (`#` at the start or after whitespace, to the end of its line) blanked so their `)` never counts.
function oneGroup(cmd) {
  const s = cmd.replace(/\\[\s\S]|'[^']*'|"(?:\\[\s\S]|[^"\\])*"|(^|\s)#[^\n]*/g, (m, sp) => sp ?? '_').trim(); let depth = 0
  for (let i = 0; i < s.length; i++) if (s[i] === '(') depth++; else if (s[i] === ')' && --depth === 0) return s[0] === '(' && i === s.length - 1
  return false
}

// `a || b`, `a; b` and `a & b` bind looser than `&&`: group them so a failed check fails the whole gate; after a
// comment, which would swallow it, the `)` goes on its own line.
const group = (cmd) => !/\|\||;|\n|(?<!&)&(?!&)/.test(cmd) || oneGroup(cmd) ? cmd : /(^|\s)#/.test(cmd) ? `(${cmd}\n)` : `(${cmd})`

// A chain setup wrote before the lint fix: only leading `<check> && ` prefixes `detect` found prove it ours.
function repairChain(testCommand, commands) {
  const front = []; let rest = testCommand; let c
  while ((c = commands.find((x) => rest.startsWith(x + ' && ')))) { front.push(c); rest = rest.slice(c.length + 4) }
  return front.length && rest ? [...front, group(rest)].join(' && ') : testCommand
}

// Repairs an old chain, then puts the checks `detect` found that it does not run yet in front of it.
function chain(root, testCommand, checks) {
  const cmd = repairChain(testCommand, checks.map((c) => c.command))
  const front = checks.filter((c) => !covered(root, cmd, c.check)).map((c) => c.command)
  return front.length ? [...front, group(cmd)].join(' && ') : cmd
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
  const { checks, ...found } = detect(root)
  const cfg = { ...existing }
  for (const [k, v] of Object.entries(found)) if (v && cfg[k] == null) cfg[k] = v
  Object.assign(cfg, opt.set)
  if (cfg.testCommand) cfg.testCommand = chain(root, cfg.testCommand, checks)
  writeConfig(root, cfg)
  const added = ensureGitignore(root)
  const questions = cfg.testCommand ? [] : [{ key: 'testCommand', question: 'What single command runs your whole test suite?' }]
  const warns = []
  let probe = null
  if (cfg.testCommand) {
    probe = run(cfg.testCommand, { cwd: root, timeoutMs: 600000 }).status
    if (probe !== 0) warns.push(`testCommand exited ${probe}${probe === 127 ? ' (command not found)' : ''} — fix it with: init.js --set testCommand=<cmd>`)
  }
  const outcome = questions.length ? 'config written — answers needed'
    : probe === 0 ? '✅ initialized — config written, gate verified' : 'config written — gate not verified'
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
module.exports = { ensureGitignore, detect, chain, repairChain, IGNORE }
