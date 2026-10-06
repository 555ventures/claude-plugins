#!/usr/bin/env node
'use strict'
// walkthrough-connect.js [--root <dir>] [--project <id>] [--name <text>] [--base-url <url>]
//                        — connect the host project to the hosted review service.
//
// Owner: specs/20261005/01-connect-wires-a-project-to-the-review-service.md (D1-D11) and
// specs/20261005/02-connect-runs-first.md (D1-D4) and specs/20261005/04-connect-protects-the-token-file.md (D1-D4).
// Since 7.242.0 the project and its token come from the public terminal tool walkthrough-cli
// (walkthrough specs/20261006/01), so anyone signed in with it can connect, not only the Railway owner.
// It creates the project on the service (or joins the id the service already holds) through
// `npx walkthrough-cli new` and mints a token with `npx walkthrough-cli token`, stores
// the token as env.<tokenEnv> in the host's .claude/settings.local.json, proves the link with one call
// that needs the token (lib/walkthrough-client.js probe), and only then writes the `walkthrough`
// block into the host config; a host with no config file gets one holding only that block, created
// by that write alone, so a refused run or a failed proof leaves no config file. It is the one
// writer of that block and of the stored token; a second run on a connected host changes nothing
// and calls walkthrough-cli zero times. On the create/join path `whoami` runs first: not signed in is
// refused with the login command named; with no --base-url and no block, the address is the one
// whoami reports.
//
// On success one stdout line: `connected <id> → <baseUrl>/p/<id>` plus ` (new project)`,
// ` (joined existing project)`, ` (already connected)` or nothing; a second line `next: /spec:genesis`
// follows (same write) when the root holds no entry whose name lacks a leading dot and the config
// has no generatedBy string. Every refusal is one stderr line
// `walkthrough-connect: <code> — <sentence> — remedy: <what to do>`; a refusal thrown by the client is
// printed as the client words it. The minted token is never printed, nor any token the tool prints.
//
// Before a token is stored the guard appends the line .claude/settings.local.json to <root>/.gitignore
// (created when absent) unless git already ignores that file; git tracking it is refused with
// `git rm --cached` named, and inside a repository git is asked again after the write. A folder that is
// not a repository gets the line and stays a plain folder.
//
// Deliberately NOT here: running git init, touching a global ignore file, untracking a file, overwriting a config file that is not a JSON object, any verb of walkthrough.js, a rewrite of a block that points elsewhere, any
// edit of a file git tracks, any retry, a shell (npx and git are spawned by bare name through
// PATH, stdin closed, 60 s limit), passing WALKTHROUGH_TOKEN or <tokenEnv> to the tool (it would read
// the plugin token as a sign-in), or the creation of a design/ folder.
//
// Exit codes: 0 connected · 1 refused (by the service or by walkthrough-cli) · 2 usage,
// config or precondition (incl. write-failed: the settings, config or .gitignore file could not be written;
// not-ignored: git tracks the token file; no-tool: npx cannot be started) ·
// 3 the service did not answer.

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { readConfigStrict, configPath, configExists, CONFIG_RELPATH } = require('./lib/host-config')
const { validate } = require('./lib/json-shape')
const client = require('./lib/walkthrough-client')

const SETTINGS_REL = '.claude/settings.local.json'
const DEFAULT_TOKEN_ENV = 'WALKTHROUGH_TOKEN'
const FLAGS = ['root', 'project', 'name', 'base-url']
const FLAG_LIST = '--root <dir> --project <id> --name <text> --base-url <url>'
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

let minted = ''
const scrub = (s) => {
  let t = String(s).replace(/token: \S+/g, 'token: <token>').replace(/"token"\s*:\s*"[^"]*"/g, '"token":"<token>"')
  if (minted) t = t.split(minted).join('<token>')
  return t
}

class Stop extends Error {
  constructor(code, sentence, remedy, exit) { super(code); this.code = code; this.sentence = sentence; this.remedy = remedy; this.exit = exit }
  line() { return scrub(`walkthrough-connect: ${this.code} — ${this.sentence} — remedy: ${this.remedy}`) }
}

function writeFd(fd, str) {
  const buf = Buffer.from(str + '\n', 'utf8')
  let off = 0
  while (off < buf.length) {
    try { off += fs.writeSync(fd, buf, off, buf.length - off) } catch (e) { if (e.code === 'EAGAIN') continue; throw e }
  }
}

function parseArgs(argv) {
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const name = a.startsWith('--') ? a.slice(2) : null
    if (!name || !FLAGS.includes(name)) throw new Stop('usage', `unknown argument ${JSON.stringify(a)}`, `use only: ${FLAG_LIST}`, 2)
    if (i + 1 >= argv.length) throw new Stop('usage', `${a} needs a value`, `pass ${a} <value>; flags: ${FLAG_LIST}`, 2)
    flags[name] = argv[++i]
  }
  return flags
}

// ---- processes (no shell, stdin closed, 60 s) ----------------------------------------------

function run(cmd, args, cwd, env = process.env) {
  const r = spawnSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000, encoding: 'utf8', env })
  return r
}

const lastLine = (text) => String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).pop() || ''
const lines = (text) => String(text || '').split('\n').map((l) => l.trim())

// The tool's env: the caller's, minus WALKTHROUGH_TOKEN and <tokenEnv> (the tool reads
// WALKTHROUGH_TOKEN as a sign-in, and the plugin token would be taken for one), plus
// WALKTHROUGH_URL=<baseUrl> when an address is known.
function toolEnv(tokenEnv, baseUrl) {
  const env = { ...process.env }
  delete env.WALKTHROUGH_TOKEN
  delete env[tokenEnv]
  if (baseUrl) env.WALKTHROUGH_URL = baseUrl
  return env
}

const TOOL_REMEDY = 'run npx walkthrough-cli whoami in a terminal to see what is wrong, then /spec:connect again'

function walkthroughCli(args, cwd, env) {
  const r = run('npx', ['--yes', 'walkthrough-cli', ...args], cwd, env)
  if (r.error) {
    if (r.error.code === 'ETIMEDOUT') throw new Stop('tool-failed', 'walkthrough-cli did not answer within 60 s', TOOL_REMEDY, 1)
    throw new Stop('no-tool', 'npx cannot be started, so walkthrough-cli cannot run', 'install Node.js (it brings npx), then /spec:connect again', 2)
  }
  return r
}

// The first JSON object among the stdout lines that passes `want`, else null.
function jsonLine(stdout, want) {
  for (const l of lines(stdout)) {
    let v
    try { v = JSON.parse(l) } catch { continue }
    if (isObj(v) && want(v)) return v
  }
  return null
}

const notSignedIn = (r) => lines(r.stderr).some((l) => l.includes('Run: npx walkthrough-cli login'))

function failed(r, what) {
  if (notSignedIn(r)) return new Stop('not-signed-in', lastLine(r.stderr), 'run npx walkthrough-cli login in a terminal, then /spec:connect again', 1)
  const why = lastLine(r.stderr) || `${what} exited ${r.status}`
  return new Stop('tool-failed', why, TOOL_REMEDY, 1)
}

// ---- the target ------------------------------------------------------------------------------

function folderName(root) {
  const g = run('git', ['rev-parse', '--absolute-git-dir'], root)
  const c = run('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], root)
  if (!g.error && !c.error && g.status === 0 && c.status === 0) {
    const gd = g.stdout.trim()
    const cd = c.stdout.trim()
    if (gd && cd && path.resolve(gd) !== path.resolve(cd) && path.basename(cd) === '.git') return path.basename(path.dirname(cd))
  }
  return path.basename(root)
}

const deriveId = (folder) => folder.replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '')
const nameOk = (shapes, v) => typeof v === 'string' && v !== '' && validate(shapes, 'name', v).length === 0

const trimUrl = (u) => String(u).trim().replace(/\/+$/, '')

function readSettings(root) {
  const file = path.join(root, SETTINGS_REL)
  let text
  try { text = fs.readFileSync(file, 'utf8') } catch (e) {
    if (e.code === 'ENOENT') return null
    throw new Stop('bad-settings', `${SETTINGS_REL} cannot be read (${e.code || e.message})`, `repair or delete ${SETTINGS_REL}, then run /spec:connect again`, 2)
  }
  let v
  try { v = JSON.parse(text) } catch { v = undefined }
  if (!isObj(v) || (v.env !== undefined && !isObj(v.env))) {
    throw new Stop('bad-settings', `${SETTINGS_REL} is not a JSON object with an env object`, `repair or delete ${SETTINGS_REL}, then run /spec:connect again`, 2)
  }
  return v
}

function writeAtomic(file, value, newMode) {
  const text = JSON.stringify(value, null, 2) + '\n'
  let mode = newMode
  try { mode = fs.statSync(file).mode & 0o777 } catch { /* new file */ }
  const tmp = `${file}.${process.pid}.tmp`
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(tmp, text, { mode })
    fs.chmodSync(tmp, mode)
    fs.renameSync(tmp, file)
  } catch (e) {
    try { fs.unlinkSync(tmp) } catch { /* nothing to remove */ }
    throw new Stop('write-failed', `${path.basename(file)} could not be written (${e.code || e.message})`, 'run the same command from a plain terminal in the project folder', 2)
  }
}

function storeToken(root, settings, tokenEnv, token) {
  const next = settings ? { ...settings } : {}
  next.env = { ...(settings && settings.env ? settings.env : {}), [tokenEnv]: token }
  writeAtomic(path.join(root, SETTINGS_REL), next, 0o600)
}

function writeBlock(root, cfg, block) {
  writeAtomic(configPath(root), { ...cfg, walkthrough: block }, 0o644)
}

// `\nnext: /spec:genesis` when the root holds no non-dot entry and the config on disk carries no
// generatedBy string; '' otherwise. Appended to the connected line so both go out in one write.
function nextLine(root) {
  let entries
  try { entries = fs.readdirSync(root) } catch { return '' }
  if (entries.some((n) => !n.startsWith('.'))) return ''
  let cfg = {}
  if (configExists(root)) { try { cfg = readConfigStrict(root) } catch { cfg = {} } }
  if (isObj(cfg) && typeof cfg.generatedBy === 'string' && cfg.generatedBy !== '') return ''
  return '\nnext: /spec:genesis'
}

// The token-file guard: ignored → go on; tracked → refuse; otherwise append the ignore line to
// <root>/.gitignore and, inside a repository, ask git again. Never runs git init.
function guardTokenFile(root) {
  const notIgnored = () => new Stop('not-ignored', `${SETTINGS_REL} is not ignored by git (not listed, tracked, or not a git repository), so a token stored there could be committed`, `add ${SETTINGS_REL} to .gitignore (and git rm --cached it when it is tracked), then run /spec:connect again`, 2)
  const first = run('git', ['check-ignore', '-q', SETTINGS_REL], root)
  if (first.error) throw notIgnored()
  if (first.status === 0) return
  const tracked = run('git', ['ls-files', '--error-unmatch', SETTINGS_REL], root)
  if (tracked.error) throw notIgnored()
  if (tracked.status === 0) {
    throw new Stop('not-ignored', `${SETTINGS_REL} is tracked by git, so a token stored there would be committed`, `run git rm --cached ${SETTINGS_REL}, then run /spec:connect again`, 2)
  }
  const file = path.join(root, '.gitignore')
  try {
    let text = ''
    try { text = fs.readFileSync(file, 'utf8') } catch (e) { if (e.code !== 'ENOENT') throw e }
    fs.writeFileSync(file, text + (text !== '' && !text.endsWith('\n') ? '\n' : '') + SETTINGS_REL + '\n')
  } catch (e) {
    throw new Stop('write-failed', `.gitignore could not be written (${e.code || e.message})`, 'run the same command from a plain terminal in the project folder', 2)
  }
  if (first.status === 128) return
  const again = run('git', ['check-ignore', '-q', SETTINGS_REL], root)
  if (again.error || again.status !== 0) throw notIgnored()
}

// ---- main ------------------------------------------------------------------------------------

async function main(argv) {
  const flags = parseArgs(argv)
  const root = path.resolve(flags.root || process.cwd())

  // 1. config
  let cfg = {}
  if (configExists(root)) {
    let parsed
    try { parsed = readConfigStrict(root) } catch { parsed = null }
    if (!isObj(parsed)) throw new Stop('bad-config', `${CONFIG_RELPATH} is not a JSON object`, `repair or delete ${CONFIG_RELPATH}, then run /spec:connect again`, 2)
    cfg = parsed
  }
  let contract
  try { contract = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'templates', 'walkthrough', 'contract.json'), 'utf8')) } catch (e) {
    throw new Stop('bad-config', `the walkthrough contract cannot be read (${e.code || e.message})`, 'reinstall the spec plugin', 2)
  }
  const shapes = contract.shapes

  // 2. target
  const hasBlock = cfg.walkthrough !== undefined && cfg.walkthrough !== null
  const folder = folderName(root)
  const displayName = flags.name !== undefined ? flags.name : folder
  let block = null
  let id
  let tokenEnv = DEFAULT_TOKEN_ENV
  let baseUrl = flags['base-url'] !== undefined ? trimUrl(flags['base-url']) : ''
  if (hasBlock) {
    block = cfg.walkthrough
    const bad = client.configFindings(block, process.env, shapes, root).filter((f) => f.code !== 'no-token')
    if (bad.length) throw new Stop('bad-config', bad[0].sentence, bad[0].remedy, 2)
    id = block.project
    tokenEnv = block.tokenEnv
    const elsewhere = (what) => new Stop('connected-elsewhere', `${CONFIG_RELPATH} already connects ${block.project} at ${trimUrl(block.baseUrl)}, not ${what}`, 'delete the walkthrough block, then run /spec:connect again', 2)
    if (flags.project !== undefined && flags.project !== block.project) throw elsewhere(`project ${flags.project}`)
    if (flags['base-url'] !== undefined && baseUrl !== trimUrl(block.baseUrl)) throw elsewhere(baseUrl)
    baseUrl = trimUrl(block.baseUrl)
  } else {
    id = flags.project !== undefined ? flags.project : deriveId(folder)
    if (!nameOk(shapes, id)) throw new Stop('no-id', `${JSON.stringify(id)} is not a valid project id (letters, digits, . _ -, no "--", at most 80)`, 'pass --project <id>', 2)
  }

  // whoami: signed in, and the address the tool talks to. Run once, only when it is needed.
  let signedIn = false
  const whoami = () => {
    if (signedIn) return
    const r = walkthroughCli(['whoami', '--json'], root, toolEnv(tokenEnv, baseUrl))
    if (r.status !== 0) {
      if (r.status === 1 && notSignedIn(r)) throw new Stop('not-signed-in', 'walkthrough-cli is not signed in on this computer', 'run npx walkthrough-cli login in a terminal, then /spec:connect again', 1)
      throw failed(r, 'walkthrough-cli whoami')
    }
    const me = jsonLine(r.stdout, (v) => typeof v.service === 'string' && v.service !== '')
    if (!me) throw new Stop('tool-failed', 'walkthrough-cli whoami --json printed no service address', TOOL_REMEDY, 1)
    if (!baseUrl) baseUrl = trimUrl(me.service)
    signedIn = true
  }
  if (!baseUrl) whoami()

  const target = { baseUrl, project: id, tokenEnv }
  const lineFor = (note) => `connected ${id} → ${baseUrl}/p/${id}${note}`
  const ctxFor = () => client.contextFromBlock(root, process.env, contract, target)
  const nothing = () => {}

  // 3. candidate
  const candidate = client.storedToken(root, tokenEnv) || process.env[tokenEnv] || ''
  let note = ''
  if (candidate) {
    minted = candidate
    try {
      await client.probe(ctxFor(), nothing)
      if (!hasBlock) writeBlock(root, cfg, target)
      return lineFor(hasBlock ? ' (already connected)' : '') + nextLine(root)
    } catch (e) {
      if (!(e instanceof client.Refusal)) throw e
      if (!['bad-token', 'wrong-project', 'unknown-project'].includes(e.code)) throw e
    }
    minted = ''
  }

  // 4. create or join
  guardTokenFile(root)
  const settings = readSettings(root)
  whoami()
  const env = toolEnv(tokenEnv, baseUrl)
  const made = walkthroughCli(['new', displayName, '--id', id, '--json'], root, env)
  note = ' (new project)'
  if (made.status !== 0) {
    if (!lines(made.stderr).some((l) => l.startsWith(`A project with the id "${id}" already exists.`))) throw failed(made, 'walkthrough-cli new')
    note = ' (joined existing project)'
  }
  const r = walkthroughCli(['token', '--project', id, '--json'], root, env)
  if (r.status !== 0) {
    const team = lines(r.stderr).find((l) => l === `You are not on the team of the project "${id}".` || l === `You are a reader of "${id}", not on its team.`)
    if (team) throw new Stop('not-team', team, `ask someone on the project's team to run npx walkthrough-cli invite <your email> --team --project ${id}`, 1)
    throw failed(r, 'walkthrough-cli token')
  }
  const got = jsonLine(r.stdout, (v) => typeof v.token === 'string' && v.token !== '')
  if (!got) throw new Stop('no-token-line', 'walkthrough-cli token exited 0 without a {"token": <value>} line on stdout', `run npx walkthrough-cli tokens --project ${id} in a terminal to see the project's tokens`, 1)
  minted = got.token

  // 5. store, 6. prove
  storeToken(root, settings, tokenEnv, minted)
  await client.probe(ctxFor(), nothing)

  // 7. block
  if (!hasBlock) writeBlock(root, cfg, target)
  return lineFor(note) + nextLine(root)
}

main(process.argv.slice(2)).then((line) => {
  writeFd(1, line)
  process.exit(0)
}, (e) => {
  if (e instanceof Stop) { writeFd(2, e.line()); process.exit(e.exit) }
  if (e instanceof client.Refusal) { writeFd(2, scrub(e.line())); process.exit(e.exit) }
  writeFd(2, scrub(`walkthrough-connect: internal — ${e && e.message ? e.message : e} — remedy: repeat the command; if it persists, report it`))
  process.exit(2)
})
