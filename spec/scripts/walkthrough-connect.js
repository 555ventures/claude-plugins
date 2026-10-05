#!/usr/bin/env node
'use strict'
// walkthrough-connect.js [--root <dir>] [--project <id>] [--name <text>] [--environment <name>]
//                        [--base-url <url>] — connect the host project to the hosted review service.
//
// Owner: specs/20261005/01-connect-wires-a-project-to-the-review-service.md (D1-D11). It creates the
// project on the service (or joins the id the service already holds) through the Railway CLI, stores
// the token as env.<tokenEnv> in the host's .claude/settings.local.json, proves the link with one call
// that needs the token (lib/walkthrough-client.js probe), and only then writes the `walkthrough`
// block into the host config. It is the one writer of that block and of the stored token; a second
// run on a connected host changes nothing and calls Railway zero times.
//
// On success one stdout line: `connected <id> → <baseUrl>/p/<id>` plus ` (new project)`,
// ` (joined existing project)`, ` (already connected)` or nothing. Every refusal is one stderr line
// `walkthrough-connect: <code> — <sentence> — remedy: <what to do>`; a refusal thrown by the client is
// printed as the client words it. The minted token is never printed.
//
// Deliberately NOT here: any verb of walkthrough.js, a rewrite of a block that points elsewhere, any
// edit of a file git tracks, any retry, a shell (railway and git are spawned by bare name through
// PATH, stdin closed, 60 s limit), or the creation of a design/ folder.
//
// Exit codes: 0 connected · 1 refused (by the service, by Railway or by the project tool) · 2 usage,
// config or precondition (incl. write-failed: the settings or config file could not be written) ·
// 3 the service did not answer.

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { readConfigStrict, configPath, configExists, CONFIG_RELPATH } = require('./lib/host-config')
const { validate } = require('./lib/json-shape')
const client = require('./lib/walkthrough-client')

const SETTINGS_REL = '.claude/settings.local.json'
const DEFAULT_TOKEN_ENV = 'WALKTHROUGH_TOKEN'
const FLAGS = ['root', 'project', 'name', 'environment', 'base-url']
const FLAG_LIST = '--root <dir> --project <id> --name <text> --environment <name> --base-url <url>'
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

let minted = ''
const scrub = (s) => {
  let t = String(s).replace(/token: \S+/g, 'token: <token>')
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
  if (flags.environment !== undefined && !/^[A-Za-z0-9_-]{1,40}$/.test(flags.environment)) {
    throw new Stop('usage', `--environment ${JSON.stringify(flags.environment)} is not an environment name`, 'pass --environment <name> of letters, digits, _ and -, at most 40', 2)
  }
  return flags
}

// ---- processes (no shell, stdin closed, 60 s) ----------------------------------------------

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000, encoding: 'utf8', env: process.env })
  return r
}

const lastLine = (text) => String(text || '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('Using SSH key')).pop() || ''

function railway(args, cwd) {
  const r = run('railway', args, cwd)
  if (r.error) {
    if (r.error.code === 'ETIMEDOUT') throw new Stop('railway-failed', 'railway did not answer within 60 s', 'run railway login, or pass --environment <name> for a deployed one', 1)
    throw new Stop('no-railway', 'the railway binary cannot be started', 'install the Railway CLI and run railway login', 2)
  }
  return r
}

function failed(r, what) {
  const why = lastLine(r.stderr) || `${what} exited ${r.status}`
  return new Stop('railway-failed', why, 'run railway login, or pass --environment <name> for an environment that is deployed', 1)
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

// ---- main ------------------------------------------------------------------------------------

async function main(argv) {
  const flags = parseArgs(argv)
  const root = path.resolve(flags.root || process.cwd())
  const environment = flags.environment || 'staging'

  // 1. config
  let cfg = null
  if (configExists(root)) { try { cfg = readConfigStrict(root) } catch { cfg = null } }
  if (!isObj(cfg)) throw new Stop('no-config', `${CONFIG_RELPATH} is absent or not a JSON object`, 'run /spec:init in the project first', 2)
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

  let pid = null
  const projectId = () => {
    if (pid) return pid
    const r = railway(['list', '--json'], root)
    if (r.status !== 0) throw failed(r, 'railway list')
    let list
    try { list = JSON.parse(r.stdout) } catch { list = null }
    const hit = Array.isArray(list) ? list.find((p) => isObj(p) && p.name === 'walkthrough' && typeof p.id === 'string') : null
    if (!hit) throw new Stop('railway-failed', 'railway list --json holds no project named walkthrough', 'run railway login with the account that owns the walkthrough project', 1)
    pid = hit.id
    return pid
  }
  const ssh = (tail) => ['ssh', '--project', projectId(), '--service', 'walkthrough', '--environment', environment, '--', ...tail]
  const lookupAddress = () => {
    const r = railway(ssh(['printenv', 'RAILWAY_PUBLIC_DOMAIN']), root)
    if (r.status !== 0) throw failed(r, 'railway ssh')
    const d = String(r.stdout).trim()
    if (!/^[A-Za-z0-9.-]+(:\d+)?$/.test(d)) throw new Stop('railway-failed', `the address answer ${JSON.stringify(d.slice(0, 80))} is not a host name`, 'pass --environment <name> for a deployed environment, or --base-url <url>', 1)
    return 'https://' + d
  }
  if (!baseUrl) baseUrl = lookupAddress()

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
      return lineFor(hasBlock ? ' (already connected)' : '')
    } catch (e) {
      if (!(e instanceof client.Refusal)) throw e
      if (!['bad-token', 'wrong-project', 'unknown-project'].includes(e.code)) throw e
    }
    minted = ''
  }

  // 4. create or join
  const ignored = run('git', ['check-ignore', '-q', SETTINGS_REL], root)
  if (ignored.error || ignored.status !== 0) {
    throw new Stop('not-ignored', `${SETTINGS_REL} is not ignored by git (not listed, tracked, or not a git repository), so a token stored there could be committed`, `add ${SETTINGS_REL} to .gitignore (and git rm --cached it when it is tracked), then run /spec:connect again`, 2)
  }
  const settings = readSettings(root)
  if (hasBlock && flags['base-url'] === undefined) {
    const found = lookupAddress()
    if (found !== baseUrl) throw new Stop('connected-elsewhere', `${CONFIG_RELPATH} connects ${baseUrl}, but ${environment} answers ${found}`, 'delete the walkthrough block, then run /spec:connect again', 2)
  }
  const tool = (verb, ...rest) => railway(ssh(['node', 'dist/server/src/start/project.js', verb, id, ...rest]), root)
  let r = tool('create', displayName)
  note = ' (new project)'
  if (r.status !== 0) {
    if (!String(r.stderr).split('\n').some((l) => l.trim() === 'project-exists')) throw failed(r, 'the project tool')
    r = tool('token')
    if (r.status !== 0) throw failed(r, 'the project tool')
    note = ' (joined existing project)'
  }
  const m = String(r.stdout).split('\n').map((l) => l.replace(/\r$/, '')).map((l) => /^token: (\S+)$/.exec(l)).find(Boolean)
  if (!m) throw new Stop('no-token-line', 'the project tool exited 0 without a "token: <value>" line on stdout', 'run the project tool by hand: railway ssh -- node dist/server/src/start/project.js token ' + id, 1)
  minted = m[1]

  // 5. store, 6. prove
  storeToken(root, settings, tokenEnv, minted)
  await client.probe(ctxFor(), nothing)

  // 7. block
  if (!hasBlock) writeBlock(root, cfg, target)
  return lineFor(note)
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
