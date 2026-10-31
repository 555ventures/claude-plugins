#!/usr/bin/env node
'use strict'
// secrets-scan.js --root <dir> (--worktree | --paths <file>) [--json]
//
// Owner: specs/20261029/04-the-four-questions-that-did-not-exist.md D1a (AC-20261029-04-1).
// /git:commit Step 1 runs it beside `git add -A` so a would-be-staged secret becomes a question
// on evidence, never a model's guess.
//
// --worktree scans every path `git status --porcelain -z --untracked-files=all` lists for the
// whole repository that still exists on disk (the set `git add -A` stages from any directory;
// deletions skipped, ignored files never listed). --root only locates the repository and anchors
// the reported paths: hits are relative to --root, so a file outside a sub-directory root reads
// `../<path>` and `git reset -q -- <path>` run from --root unstages exactly it. --paths scans one
// --root-relative path per line from <file>.
//
// Closed detector list — no host configuration:
//   path (basename):  .env, .env.* except .env.example|.env.sample|.env.template; *.pem *.key
//     *.p12 *.pfx *.jks; id_rsa[.*], id_ed25519[.*]; credentials.json, service-account*.json,
//     secrets.json, secrets.yml, secrets.yaml, .netrc, .pgpass
//   content (first 1 MiB; a file whose first 8 KiB holds a NUL byte is binary and skipped; a line
//     containing `secrets-scan:allow` is skipped): AKIA[0-9A-Z]{16}, private-key BEGIN blocks,
//     gh[pousr]_ tokens, github_pat_ tokens, sk- keys, xox[baprs]- Slack tokens,
//     (sk|rk)_live_ Stripe keys, AIza Google keys, npm _authToken lines
// A path hit short-circuits that file's content scan.
//
// Does NOT: read the index, scan history, or take host patterns.
//
// stdout (--json): {"hits":[{"path","reason":"path:<pat>"|"content:<pat>","line":N|null}]}
// stdout (plain):  `<path>  <reason>[:<line>]` per hit; `no secrets found` on none
// Exit codes: 0 no hits - 1 at least one hit - 2 usage, --root not a work tree, or --paths
// unreadable (the message on stderr names the remedy)
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const PATH_RULES = [
  [/^\.env$/, '.env'],
  [/^\.env\..+$/, '.env.*', (b) => !['.env.example', '.env.sample', '.env.template'].includes(b)],
  [/\.pem$/, '*.pem'], [/\.key$/, '*.key'], [/\.p12$/, '*.p12'], [/\.pfx$/, '*.pfx'], [/\.jks$/, '*.jks'],
  [/^id_rsa$/, 'id_rsa'], [/^id_rsa\..+$/, 'id_rsa.*'],
  [/^id_ed25519$/, 'id_ed25519'], [/^id_ed25519\..+$/, 'id_ed25519.*'],
  [/^credentials\.json$/, 'credentials.json'], [/^service-account.*\.json$/, 'service-account*.json'],
  [/^secrets\.json$/, 'secrets.json'], [/^secrets\.yml$/, 'secrets.yml'], [/^secrets\.yaml$/, 'secrets.yaml'],
  [/^\.netrc$/, '.netrc'], [/^\.pgpass$/, '.pgpass'],
]
const CONTENT_RULES = [
  'AKIA[0-9A-Z]{16}',
  '-----BEGIN [A-Z ]*PRIVATE KEY-----',
  'gh[pousr]_[A-Za-z0-9]{36}',
  'github_pat_[A-Za-z0-9_]{22,}',
  'sk-[A-Za-z0-9_-]{20,}',
  'xox[baprs]-[A-Za-z0-9-]{10,}',
  '(sk|rk)_live_[A-Za-z0-9]{20,}',
  'AIza[0-9A-Za-z_-]{35}',
  '_authToken\\s*=\\s*\\S+',
].map(src => [new RegExp(src), src])
const ALLOW = 'secrets-scan:allow'

function usage(msg) {
  if (msg) console.error('secrets-scan: ' + msg)
  console.error('usage: secrets-scan.js --root <dir> (--worktree | --paths <file>) [--json]')
  process.exit(2)
}

let root = null, paths = null, worktree = false, json = false
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--root') root = argv[++i]
  else if (a === '--paths') paths = argv[++i]
  else if (a === '--worktree') worktree = true
  else if (a === '--json') json = true
  else usage('unknown argument ' + a)
}
if (!root) usage('--root is required')
if (worktree === (paths != null)) usage('give exactly one of --worktree or --paths <file>')
root = path.resolve(root)

const inTree = spawnSync('git', ['-C', root, 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' })
if (inTree.status !== 0 || inTree.stdout.trim() !== 'true') {
  console.error(`secrets-scan: ${root} is not a git work tree — pass --root <repo dir>`)
  process.exit(2)
}

let files
if (worktree) {
  const st = spawnSync('git', ['-C', root, 'status', '--porcelain', '-z', '--untracked-files=all'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (st.status !== 0) { console.error('secrets-scan: git status failed — run git status in ' + root); process.exit(2) }
  const parts = st.stdout.split('\0').filter(Boolean)
  // Porcelain paths are relative to the repo toplevel, not --root: resolve against the toplevel
  // and report them relative to --root. Never filter to --root — `git add -A` does not.
  const top = spawnSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' })
  if (top.status !== 0) { console.error('secrets-scan: cannot resolve the repo toplevel — run git rev-parse in ' + root); process.exit(2) }
  const topDir = top.stdout.trim()
  let realRoot = root
  try { realRoot = fs.realpathSync(root) } catch { /* keep the given path */ }
  files = []
  for (let i = 0; i < parts.length; i++) {
    const code = parts[i].slice(0, 2), p = parts[i].slice(3)
    if (code[0] === 'R' || code[0] === 'C') i++ // rename/copy: the next entry is the source path
    files.push(path.relative(realRoot, path.join(topDir, p)))
  }
} else {
  let txt
  try { txt = fs.readFileSync(paths, 'utf8') } catch {
    console.error(`secrets-scan: cannot read --paths file ${paths} — pass a readable file of --root-relative paths`)
    process.exit(2)
  }
  files = txt.split('\n').map(s => s.trim()).filter(Boolean)
}

const hits = []
for (const rel of [...new Set(files)]) {
  const abs = path.join(root, rel)
  let st
  try { st = fs.statSync(abs) } catch { continue }
  if (!st.isFile()) continue
  const base = path.basename(rel)
  const pr = PATH_RULES.find(([re, , ok]) => re.test(base) && (!ok || ok(base)))
  if (pr) { hits.push({ path: rel, reason: 'path:' + pr[1], line: null }); continue }
  let buf
  try {
    const fd = fs.openSync(abs, 'r')
    buf = Buffer.alloc(Math.min(st.size, 1048576))
    const n = fs.readSync(fd, buf, 0, buf.length, 0)
    fs.closeSync(fd)
    buf = buf.subarray(0, n)
  } catch { continue }
  if (buf.subarray(0, 8192).includes(0)) continue
  const lines = buf.toString('utf8').split('\n')
  for (let n = 0; n < lines.length; n++) {
    if (lines[n].includes(ALLOW)) continue
    const cr = CONTENT_RULES.find(([re]) => re.test(lines[n]))
    if (cr) hits.push({ path: rel, reason: 'content:' + cr[1], line: n + 1 })
  }
}

if (json) console.log(JSON.stringify({ hits }))
else if (!hits.length) console.log('no secrets found')
else for (const h of hits) console.log(`${h.path}  ${h.reason}${h.line ? ':' + h.line : ''}`)
process.exit(hits.length ? 1 : 0)
