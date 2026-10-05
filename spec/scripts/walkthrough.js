#!/usr/bin/env node
'use strict'
// walkthrough.js <verb> [--root <dir>] [--json] [--contract <file>] [--catalog <file>] — the one
// entry point that talks to the hosted review service, plus the offline checks around it.
//
//   self-check                                   no network: the contract and catalog files agree with themselves
//   validate --round-file <file>                 no network: a round file against the catalog
//   check                                        no network: the host's walkthrough config block only
//   hello                                        the service's version answer
//   push --round-file <file> [--round <n>] [--resume <n>]
//   pull-notes [--round <n>]    pull-approvals [--round <n>]
//   reply --note <id> --text-file <file>         mark --round <n> --status open|answered|closed
//
// Owner: specs/20260929/01-the-walkthrough-contract-and-the-client.md D6 (verbs, exit codes, the
// refusal line), D12 (check, reply, mark); the rules of each call live in lib/walkthrough-client.js
// (D7-D11), the offline checks in lib/walkthrough-catalog.js (D5) and lib/json-shape.js (D2).
// A project whose config has no `walkthrough` block is untouched: every verb that would talk to
// the service prints the not-configured line on stdout, sends nothing, writes nothing, exits 0.
//
// Every refusal is one stderr line `walkthrough: <code> — <sentence> — remedy: <what to do>`.
// `--json` prints one JSON object on stdout through a synchronous writer. The token is the non-empty
// string at env.<tokenEnv> in the host's ignored .claude/settings.local.json, else the
// environment variable the config names (lib/walkthrough-client.js storedToken); it is never
// printed or written here — walkthrough-connect.js is the one writer of the block and the token.
//
// Deliberately NOT here: any retry beyond one rate-limit wait, any redirect following, any
// approval-staleness comparison, any edit of the host's config, any call from a hook.
//
// Exit codes: 0 done, or not configured · 1 refused (by the service, by the contract, or by
// findings) · 2 usage, config or precondition · 3 the service did not answer (unreachable, timeout).

const fs = require('fs')
const path = require('path')
const { Refusal, checkConfig, openContext, gate, readRoundFile, checkRoundFile, push, pullNotes, pullApprovals, reply, mark } = require('./lib/walkthrough-client')
const { selfCheck, screenLabel } = require('./lib/walkthrough-catalog')

const TEMPLATES = path.join(__dirname, '..', 'templates', 'walkthrough')
const STATUSES = ['open', 'answered', 'closed']
const COMMON = ['root', 'contract', 'catalog']
const VERBS = {
  'self-check': [],
  validate: ['round-file'],
  check: [],
  hello: [],
  push: ['round-file', 'round', 'resume'],
  'pull-notes': ['round'],
  'pull-approvals': ['round'],
  reply: ['note', 'text-file'],
  mark: ['round', 'status'],
}

// A script that prints a payload and exits routes through a synchronous writer — a piped
// stdout write followed by process.exit truncates at the pipe buffer.
function writeOut(fd, str) {
  const buf = Buffer.from(str + '\n', 'utf8')
  let off = 0
  while (off < buf.length) {
    try {
      off += fs.writeSync(fd, buf, off, buf.length - off)
    } catch (e) {
      if (e.code === 'EAGAIN') continue
      throw e
    }
  }
}

const out = (s) => writeOut(1, s)
const err = (s) => writeOut(2, s)
const usage = (sentence, remedy) => new Refusal('usage', sentence, remedy || 'run walkthrough with a verb: self-check, validate, check, hello, push, pull-notes, pull-approvals, reply, mark', 2)

function parseArgs(argv) {
  const verb = argv[0]
  if (!verb || verb.startsWith('--')) throw usage('no verb given')
  if (!VERBS[verb]) throw usage(`unknown verb "${verb}"`)
  const flags = { json: false }
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') { flags.json = true; continue }
    const name = a.startsWith('--') ? a.slice(2) : null
    if (!name || !(COMMON.includes(name) || VERBS[verb].includes(name))) throw usage(`${verb} does not take ${a}`)
    if (i + 1 >= argv.length) throw usage(`${a} needs a value`)
    flags[name] = argv[++i]
  }
  return { verb, flags }
}

function need(flags, verb, ...names) {
  for (const n of names) if (flags[n] === undefined) throw usage(`${verb} needs --${n} <value>`)
}

function loadJsonFile(file, code, what) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch (e) {
    throw new Refusal(code, `${what} ${file} cannot be read as JSON (${e.code || e.message})`, `restore ${what} (spec-paths walkthrough-${what === 'the contract' ? 'contract' : 'catalog'}) or pass a valid file`, 2)
  }
}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`

function roundFindingLine(f) {
  const where = [f.screen ? screenLabel(f.screen, f.state) : 'round', f.element].filter(Boolean).join(' ')
  return `walkthrough: ${f.code} — ${where}: ${f.detail} — remedy: fix the round file, then run walkthrough validate again`
}

function selfCheckLine(f) {
  return `walkthrough: ${f.code} — ${f.at}: ${f.detail} — remedy: fix the file so it uses only the supported keywords and agrees with itself, then run walkthrough self-check`
}

async function run(argv, env) {
  const { verb, flags } = parseArgs(argv)
  const root = path.resolve(flags.root || process.cwd())
  const contractFile = flags.contract || path.join(TEMPLATES, 'contract.json')
  const catalogFile = flags.catalog || path.join(TEMPLATES, 'catalog.json')
  const done = (human, json) => out(flags.json ? JSON.stringify(json) : human)

  if (verb === 'self-check') {
    let contract = null
    let catalog = null
    const findings = []
    try { contract = JSON.parse(fs.readFileSync(contractFile, 'utf8')) } catch (e) { findings.push({ part: 'contract', code: 'bad-contract', at: contractFile, detail: `cannot be read as JSON (${e.code || e.message})` }) }
    try { catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8')) } catch (e) { findings.push({ part: 'catalog', code: 'bad-catalog', at: catalogFile, detail: `cannot be read as JSON (${e.code || e.message})` }) }
    const r = selfCheck(contract === null ? {} : contract, catalog === null ? {} : catalog)
    const all = contract === null || catalog === null ? findings : findings.concat(r.findings)
    if (flags.json) out(JSON.stringify({ ok: !all.length, calls: r.calls, components: r.components, findings: all }))
    else {
      const bad = new Set(all.map((f) => f.part))
      if (!bad.has('contract') && contract !== null) out(`contract ok: ${plural(r.calls, 'call')}`)
      if (!bad.has('catalog') && catalog !== null) out(`catalog ok: ${plural(r.components, 'component')}`)
      for (const f of all) err(selfCheckLine(f))
    }
    return all.length ? 1 : 0
  }

  if (verb === 'validate') {
    need(flags, verb, 'round-file')
    const contract = loadJsonFile(contractFile, 'bad-contract', 'the contract')
    const catalog = loadJsonFile(catalogFile, 'bad-catalog', 'the catalog')
    const { round } = readRoundFile(flags['round-file'])
    const findings = checkRoundFile(contract, catalog, round)
    const screens = round.screens.length
    const journeys = round.journeys.length
    if (flags.json) out(JSON.stringify({ ok: !findings.length, screens, journeys, findings }))
    else if (findings.length) for (const f of findings) err(roundFindingLine(f))
    else out(`round ok: ${plural(screens, 'screen')}, ${plural(journeys, 'journey')}`)
    return findings.length ? 1 : 0
  }

  if (verb === 'check') {
    const contract = loadJsonFile(contractFile, 'bad-contract', 'the contract')
    const found = checkConfig(root, env, contract.shapes)
    if (flags.json) out(JSON.stringify({ findings: found.map((f) => ({ code: f.code, at: f.at, detail: f.sentence, remedy: f.remedy })) }))
    else for (const f of found) err(`walkthrough: ${f.code} — ${f.sentence} — remedy: ${f.remedy}`)
    return found.length ? 1 : 0
  }

  // service verbs: usage first (exit 2), then the config, then everything else.
  if (verb === 'push') need(flags, verb, 'round-file')
  if (verb === 'reply') need(flags, verb, 'note', 'text-file')
  if (verb === 'mark') {
    need(flags, verb, 'round', 'status')
    if (!STATUSES.includes(flags.status)) throw usage(`--status ${JSON.stringify(flags.status)} is not one of ${STATUSES.join(', ')}`, 'pass --status open, answered or closed')
  }
  const contract = loadJsonFile(contractFile, 'bad-contract', 'the contract')
  const c = openContext(root, env, contract)
  if (c === null) {
    done('walkthrough: not configured for this project — nothing sent', { skipped: true })
    return 0
  }
  const warn = (line) => err(line)
  const base = { round: flags.round, warn }

  if (verb === 'hello') {
    const h = await gate(c, warn)
    done(`service ok — apiVersion ${h.apiVersion}, revision ${h.revision}`, { apiVersion: h.apiVersion, revision: h.revision, sunset: h.sunset })
    return 0
  }
  if (verb === 'push') {
    const catalog = loadJsonFile(catalogFile, 'bad-catalog', 'the catalog')
    const r = await push(c, { ...base, roundFile: path.resolve(flags['round-file']), resume: flags.resume, catalog })
    if (r.findings) {
      if (flags.json) out(JSON.stringify({ ok: false, findings: r.findings }))
      else for (const f of r.findings) err(roundFindingLine(f))
      return 1
    }
    const extra = (r.already ? ' (already on the service)' : '') + (r.pictures ? ` (${plural(r.pictures.uploaded, 'picture')} uploaded)` : '')
    done(`pushed round ${r.round} (${r.kind}) — ${r.status}${extra}`, r)
    return 0
  }
  if (verb === 'pull-notes') {
    const r = await pullNotes(c, base)
    done(`pulled notes for round ${r.round} — ${plural(r.notes, 'note')} (cursor ${r.cursor})`, r)
    return 0
  }
  if (verb === 'pull-approvals') {
    const r = await pullApprovals(c, base)
    done(`pulled approvals for round ${r.round} — ${plural(r.approvals, 'approval')}`, r)
    return 0
  }
  if (verb === 'reply') {
    const r = await reply(c, { warn, note: flags.note, textFile: path.resolve(flags['text-file']) })
    done(`replied to ${r.note}`, r)
    return 0
  }
  const r = await mark(c, { warn, round: flags.round, status: flags.status })
  done(`marked round ${r.round} — ${r.status}`, r)
  return 0
}

run(process.argv.slice(2), process.env).then(
  (code) => process.exit(code),
  (e) => {
    if (e instanceof Refusal) {
      err(e.line())
      process.exit(e.exit)
    }
    err(new Refusal('script-error', String(e && e.message).slice(0, 200), 'report this with the command you ran', 2).line())
    process.exit(2)
  },
)
