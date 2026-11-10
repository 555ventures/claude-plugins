#!/usr/bin/env node
'use strict'
// connect.js [--root <dir>] [--project <id>] [--name <text>] [--base-url <url>] [--allow-temp-root]
// Links the project to the hosted review service: creates (or joins) the project through
// `npx walkthrough-cli`, stores the minted token as env.<tokenEnv> in the git-ignored
// .claude/settings.local.json, proves the link with one call, writes config.walkthrough, and
// prints `connected <id> → <url>/p/<id>` plus `next: /spec:mocks`. The token is never printed.
// A root under any scratch dir (realpath: $TMPDIR, the OS temp dir, /tmp, /var/tmp — on macOS the OS temp dir
// is /var/folders/…, so /tmp and the agent scratchpad under /private/tmp are separate places) is refused with
// exit 2 unless --allow-temp-root is passed: a scratch folder is never a real project, and connecting one
// registers a live project on the hosted service.
// Exit: 0 connected · 1 refused · 2 usage/config · 3 service silent. A connected project costs zero tool calls.

const fs = require('fs')
const path = require('path')
const os = require('os')
const { spawnSync } = require('child_process')
const { writeJson, configPath } = require('./lib/state')
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
    if (argv[i] === '--allow-temp-root') { f[k] = true; i -= 1; continue }
    if (!argv[i].startsWith('--') || !['root', 'project', 'name', 'base-url'].includes(k) || argv[i + 1] === undefined) {
      throw stop('usage', `bad argument ${JSON.stringify(argv[i])}`,
        'use: --project <id> --name <text> --base-url <url> --root <dir> --allow-temp-root', 2)
    }
    f[k] = argv[i + 1]
  }
  return f
}

const real = (p) => { try { return fs.realpathSync.native(p) } catch { return path.resolve(p) } }
const SCRATCH_DIRS = () => [os.tmpdir(), process.env.TMPDIR, '/tmp', '/var/tmp'].filter(Boolean).map(real)
function refuseTempRoot(root) {
  const r = real(root)
  const under = SCRATCH_DIRS().find((d) => r === d || r.startsWith(d.endsWith(path.sep) ? d : d + path.sep))
  if (under) {
    throw stop('temp-root',
      `${r} is under the scratch dir ${under}, so connecting it would register a live project`,
      'run it from the real project folder, or pass --allow-temp-root if this temp folder is meant to be a project', 2)
  }
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

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

// A JSON file that must hold an object: null when it is absent, a refusal when it exists and is anything
// else. Overwriting a file this script could not read would destroy it.
function readStrict(root, rel, code, ok = isObj) {
  let text
  try { text = fs.readFileSync(path.join(root, rel), 'utf8') } catch (e) {
    if (e.code === 'ENOENT') return null
    text = null
  }
  let v
  try { v = JSON.parse(text) } catch { v = undefined }
  if (!ok(v)) throw stop(code, `${rel} is not a JSON object${code === 'bad-settings' ? ' with an env object' : ''}`, `repair or delete ${rel}, then run /spec:connect again`, 2)
  return v
}

// The token file must be git-ignored before a token lands in it: ignored, go on; tracked, refuse; otherwise
// append the ignore line and, inside a repository, ask git again.
function guardTokenFile(root) {
  const notIgnored = () => stop('not-ignored', `${SETTINGS} is not ignored by git, so a token stored there could be committed`,
    `make git ignore ${SETTINGS} (a .gitignore deeper in the tree may un-ignore it), then run /spec:connect again`, 2)
  const first = git(root, 'check-ignore', '-q', SETTINGS)
  if (first.error) throw notIgnored()
  if (first.status === 0) return
  if (git(root, 'ls-files', '--error-unmatch', SETTINGS).status === 0) {
    throw stop('not-ignored', `${SETTINGS} is tracked by git, so a token stored there would be committed`, `run git rm --cached ${SETTINGS}, then run /spec:connect again`, 2)
  }
  const file = path.join(root, '.gitignore')
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  fs.writeFileSync(file, text + (text && !text.endsWith('\n') ? '\n' : '') + SETTINGS + '\n')
  if (first.status === 128) return // not a repository: nothing to ask
  const again = git(root, 'check-ignore', '-q', SETTINGS)
  if (again.error || again.status !== 0) throw notIgnored()
}

function storeToken(root, cur, tokenEnv, token) {
  const file = path.join(root, SETTINGS)
  writeJson(file, { ...(cur || {}), env: { ...((cur && cur.env) || {}), [tokenEnv]: token } })
  fs.chmodSync(file, 0o600)
}

async function main(argv) {
  const f = parse(argv)
  const root = path.resolve(f.root || process.cwd())
  if (!f['allow-temp-root']) refuseTempRoot(root)
  const cfg = readStrict(root, '.claude/spec.config.json', 'bad-config') || {}
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
  const settings = readStrict(root, SETTINGS, 'bad-settings', (v) => isObj(v) && (v.env === undefined || isObj(v.env)))
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
  storeToken(root, settings, tokenEnv, got.token)
  await wt.probe(wt.contextFromBlock(root, process.env, block))
  return done(note)
}

if (require.main === module) main(process.argv.slice(2)).then((out) => { process.stdout.write(out) }, (e) => {
  process.stderr.write(e instanceof wt.Refusal ? e.line() + '\n' : `connect: ${e.message || e}\n`)
  process.exitCode = e instanceof wt.Refusal ? e.exit : 1
})
