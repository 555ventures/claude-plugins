#!/usr/bin/env node
'use strict'
// connect.js [--root <dir>] [--project <id>] [--name <text>] [--base-url <url>]
// Links the project to the hosted review service: creates (or joins) the project through
// `npx walkthrough-cli`, stores the minted token as env.<tokenEnv> in the git-ignored
// .claude/settings.local.json, proves the link with one call, writes config.walkthrough, and
// prints `connected <id> → <url>/p/<id>` plus `next: /spec:mocks`. The token is never printed.
// Exit: 0 connected · 1 refused · 2 usage/config · 3 service silent. A connected project costs zero tool calls.

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { readJson, writeJson, configPath } = require('./lib/state')
const wt = require('./lib/walkthrough')
const SETTINGS = '.claude/settings.local.json'
const TOKEN_ENV = 'WALKTHROUGH_TOKEN'
const stop = (code, sentence, remedy, exit = 1) => new wt.Refusal(code, sentence, remedy, exit)
const lines = (t) => String(t || '').split('\n').map((l) => l.trim()).filter(Boolean)
const trimUrl = (u) => String(u).trim().replace(/\/+$/, '')

function parse(argv) {
  const f = {}
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i].replace(/^--/, '')
    if (!argv[i].startsWith('--') || !['root', 'project', 'name', 'base-url'].includes(k) || argv[i + 1] === undefined) {
      throw stop('usage', `bad argument ${JSON.stringify(argv[i])}`, 'use: --project <id> --name <text> --base-url <url> --root <dir>', 2)
    }
    f[k] = argv[i + 1]
  }
  return f
}

// Runs walkthrough-cli with the plugin token removed from its env; returns {status, stdout, stderr}.
function cli(args, root, baseUrl, tokenEnv) {
  const env = { ...process.env }
  delete env.WALKTHROUGH_TOKEN
  delete env[tokenEnv]
  if (baseUrl) env.WALKTHROUGH_URL = baseUrl
  const r = spawnSync('npx', ['--yes', 'walkthrough-cli', ...args], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000, encoding: 'utf8' })
  if (r.error) throw stop('no-tool', 'npx cannot be started, so walkthrough-cli cannot run', 'install Node.js (it brings npx), then /spec:connect again', 2)
  if (lines(r.stderr).some((l) => l.includes('Run: npx walkthrough-cli login'))) {
    throw stop('not-signed-in', 'walkthrough-cli is not signed in on this computer', 'run npx walkthrough-cli login in a terminal, then /spec:connect again')
  }
  return r
}

const jsonLine = (out, want) => lines(out).map((l) => { try { return JSON.parse(l) } catch { return null } }).find((v) => v && want(v)) || null
const fail = (r, what) => stop('tool-failed', lines(r.stderr).pop() || `${what} exited ${r.status}`, 'run npx walkthrough-cli whoami to see what is wrong, then /spec:connect again')
const git = (root, ...a) => spawnSync('git', ['-C', root, ...a], { encoding: 'utf8' })

// Makes sure git ignores the token file (appends to .gitignore when it does not); warns when tracked.
function guardTokenFile(root) {
  if (git(root, 'ls-files', '--error-unmatch', SETTINGS).status === 0) {
    process.stderr.write(`warning: ${SETTINGS} is tracked by git, so the token would be committed — run: git rm --cached ${SETTINGS}\n`)
    return
  }
  if (git(root, 'check-ignore', '-q', SETTINGS).status === 0) return
  fs.appendFileSync(path.join(root, '.gitignore'), (fs.existsSync(path.join(root, '.gitignore')) && !fs.readFileSync(path.join(root, '.gitignore'), 'utf8').endsWith('\n') ? '\n' : '') + SETTINGS + '\n')
}

function storeToken(root, tokenEnv, token) {
  const file = path.join(root, SETTINGS)
  const cur = readJson(file, {})
  writeJson(file, { ...cur, env: { ...(cur.env || {}), [tokenEnv]: token } })
  fs.chmodSync(file, 0o600)
}

async function main(argv) {
  const f = parse(argv)
  const root = path.resolve(f.root || process.cwd())
  const cfg = readJson(configPath(root), {})
  const have = cfg.walkthrough && cfg.walkthrough.baseUrl ? cfg.walkthrough : null
  const tokenEnv = have ? have.tokenEnv || TOKEN_ENV : TOKEN_ENV
  const id = have ? have.project : f.project || path.basename(root).replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '')
  if (!wt.nameOk(id)) throw stop('no-id', `${JSON.stringify(id)} is not a valid project id`, 'pass --project <id> (letters, digits, . _ -)', 2)
  if (have && ((f.project && f.project !== have.project) || (f['base-url'] && trimUrl(f['base-url']) !== trimUrl(have.baseUrl)))) {
    throw stop('connected-elsewhere', `${have.project} at ${have.baseUrl} is already connected`, 'delete config.walkthrough, then run /spec:connect again', 2)
  }
  let baseUrl = have ? trimUrl(have.baseUrl) : f['base-url'] ? trimUrl(f['base-url']) : ''
  if (!baseUrl) {
    const r = cli(['whoami', '--json'], root, '', tokenEnv)
    const me = r.status === 0 && jsonLine(r.stdout, (v) => v.service)
    if (!me) throw fail(r, 'walkthrough-cli whoami')
    baseUrl = trimUrl(me.service)
  }
  const block = { baseUrl, project: id, tokenEnv }
  const done = (note) => {
    if (!have) writeJson(configPath(root), { ...cfg, walkthrough: block })
    return `connected ${id} → ${baseUrl}/p/${id}${note}\nnext: /spec:mocks\n`
  }
  if (wt.resolveToken(root, process.env, tokenEnv)) {
    try {
      await wt.probe(wt.contextFromBlock(root, process.env, block))
      return done(have ? ' (already connected)' : '')
    } catch (e) {
      if (!(e instanceof wt.Refusal) || !['bad-token', 'wrong-project', 'unknown-project'].includes(e.code)) throw e
    }
  }

  guardTokenFile(root)
  const made = cli(['new', f.name || id, '--id', id, '--json'], root, baseUrl, tokenEnv)
  let note = ' (new project)'
  if (made.status !== 0) {
    if (!lines(made.stderr).some((l) => l.startsWith(`A project with the id "${id}" already exists.`))) throw fail(made, 'walkthrough-cli new')
    note = ' (joined existing project)'
  }
  const t = cli(['token', '--project', id, '--json'], root, baseUrl, tokenEnv)
  const team = lines(t.stderr).find((l) => /^You are (not on the team of the project|a reader of) /.test(l))
  if (team) throw stop('not-team', team, `ask someone on the team to run npx walkthrough-cli invite <your email> --team --project ${id}`)
  const got = t.status === 0 && jsonLine(t.stdout, (v) => v.token)
  if (!got) throw fail(t, 'walkthrough-cli token')
  storeToken(root, tokenEnv, got.token)
  await wt.probe(wt.contextFromBlock(root, process.env, block))
  return done(note)
}

main(process.argv.slice(2)).then((out) => { process.stdout.write(out) }, (e) => {
  process.stderr.write(e instanceof wt.Refusal ? e.line() + '\n' : `connect: ${e.message || e}\n`)
  process.exitCode = e instanceof wt.Refusal ? e.exit : 1
})
