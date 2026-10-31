#!/usr/bin/env node
'use strict'
// catalog-inventory.js --root <dir> --out <file> [--check] [--json] [--shadcn <command>]
//
// Owner: specs/20260926/04-the-design-brief.md
// The shadcn-catalog inventory genesis's DESIGN_BRIEF state generates once
// (spec/scripts/genesis-driver.js runs this as a child, --shadcn threaded from the env
// GENESIS_SHADCN_COMMAND) and /spec:doctor re-checks with --check when a kit may have drifted.
//
// The shadcn project directory is located from the recorded kit path, never assumed to be the
// root: the kit is the host config's `design.kit`, else `kit` in
// <root>/.claude/genesis/design-paths.json (genesis writes it before the config's design block
// exists); from that directory the parents are walked up to and including the root, and the
// first one holding a components.json is the stack root. No kit recorded → the root alone. A host
// with no components.json anywhere on that chain is not a shadcn-catalog host: this writes the
// literal "catalog: none (no components.json)" and exits 0 — unless the catalog already on disk
// lists components, which is refused (exit 1, naming the chain searched), never overwritten.
// Otherwise it runs `<shadcn> info --json` (default `npx shadcn@latest`, cwd = the stack root)
// and, per listed component, fetches its doc page (https/http via the global fetch, 10s timeout;
// file: read from disk) and copies the "## Composition" section with every heading outside a
// code fence demoted to "#### ", so only component entries are "### " headings and --check reads
// back exactly the names it wrote — a fetch failure or an absent section degrades that one
// component to "composition: unavailable", never blocking the whole run.
//
// Does NOT: author or edit the catalog by hand (the header line says so), validate a component
// actually exists in the kit directory (design-contract-check.js's job), or retry a failed
// fetch — one attempt per component, always.
//
// Exit codes:
//   0  the file was written (including the no-components.json case), or --check found the
//      on-disk catalog current.
//   1  --check found the on-disk catalog stale or missing, the shadcn command itself failed
//      (--check then reports the failure by name, never a stale verdict listing every component
//      as removed), or no components.json was found while the on-disk catalog lists components.
//   2  usage error (missing --root or --out).

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { fileURLToPath } = require('url')
const { readConfig } = require('./lib/host-config')

function usage() {
  process.stderr.write('usage: catalog-inventory.js --root <dir> --out <file> [--check] [--json] [--shadcn <command>]\n')
}

function parseArgs(argv) {
  const out = { root: null, out: null, check: false, json: false, shadcn: 'npx shadcn@latest' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--root') { out.root = argv[++i]; continue }
    if (a === '--out') { out.out = argv[++i]; continue }
    if (a === '--check') { out.check = true; continue }
    if (a === '--json') { out.json = true; continue }
    if (a === '--shadcn') { out.shadcn = argv[++i]; continue }
  }
  return out
}

function writeOut(fd, text) {
  const buf = Buffer.from(text, 'utf8')
  let off = 0
  while (off < buf.length) off += fs.writeSync(fd, buf, off, buf.length - off)
}

// Runs `<shadcn> info --json` inside `root`; returns the parsed payload or null on any failure
// (non-zero exit, missing command, unparseable stdout) — the caller decides what "no info"
// means for its own branch (usage-refusal territory never reaches here).
function readShadcnInfo(shadcnCmd, root) {
  const parts = shadcnCmd.split(' ').filter(Boolean)
  const [cmd, ...args] = parts
  let stdout
  try {
    stdout = execFileSync(cmd, args.concat(['info', '--json']), { cwd: root, encoding: 'utf8' })
  } catch (e) {
    return null
  }
  try {
    return JSON.parse(stdout)
  } catch (e) {
    return null
  }
}

// Walks up from the recorded kit directory to the root (inclusive) and returns the first
// directory holding a components.json, plus the chain searched (root-relative) for messages. A
// kit recorded outside the root is a wrong config: the root alone is searched and the kit is
// returned as `outsideKit` so the refusal can name it.
function locateStackRoot(root) {
  const kit = readRecordedKit(root)
  const chain = []
  let dir = kit ? path.resolve(root, kit) : root
  const rel = path.relative(root, dir)
  const outsideKit = rel.startsWith('..') || path.isAbsolute(rel) ? kit : null
  if (outsideKit) dir = root
  for (;;) {
    chain.push(path.relative(root, dir) || '.')
    if (fs.existsSync(path.join(dir, 'components.json'))) return { stackRoot: dir, chain, outsideKit }
    if (path.relative(root, dir) === '' || path.dirname(dir) === dir) return { stackRoot: null, chain, outsideKit }
    dir = path.dirname(dir)
  }
}

// The refusal for a populated catalog with no components.json on the kit chain — shared by the
// write path (never overwrite it with "none") and --check (never report every entry removed).
function refuseNoComponentsJson(args, root, outPath, located, existing) {
  const text = args.json
    ? JSON.stringify({ ok: false, status: 'no-components-json', searched: located.chain, outsideKit: located.outsideKit, existing: existing.length }) + '\n'
    : 'catalog-inventory: refused — searched ' + located.chain.join(' → ') + ' for components.json, found none' +
      (located.outsideKit ? ' (design.kit ' + located.outsideKit + ' is outside the root)' : '') +
      ', but ' + path.relative(root, outPath) + ' lists ' + existing.length +
      ' components; set design.kit to the kit directory, or pass --root at the shadcn project\n'
  writeOut(1, text)
  process.exitCode = 1
}

function readRecordedKit(root) {
  const design = readConfig(root).design
  if (design && typeof design.kit === 'string' && design.kit) return design.kit
  try {
    const kit = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'genesis', 'design-paths.json'), 'utf8')).kit
    if (typeof kit === 'string' && kit) return kit
  } catch (e) { /* absent or unparseable — no recorded kit */ }
  return null
}

// Yields [line, insideFence] for each line, tracking ``` / ~~~ fences — a fence closes only on
// a run of its own character at least as long as the opener (CommonMark).
function fencedLines(text) {
  let fence = null
  return text.split('\n').map((line) => {
    const m = /^\s*(`{3,}|~{3,})/.exec(line)
    const inside = fence !== null
    if (m) {
      if (fence === null) fence = m[1]
      else if (m[1][0] === fence[0] && m[1].length >= fence.length) fence = null
    }
    return [line, inside || m !== null]
  })
}

// Extracts the "## Composition" section (through the line before the next "## " heading outside
// a code fence, or end of text) from a component doc page's text, its own headings demoted to
// "#### ". Returns null when the heading is absent.
function extractComposition(text) {
  const m = /^## Composition\s*$/m.exec(text)
  if (!m) return null
  const out = []
  for (const [line, fenced] of fencedLines(text.slice(m.index + m[0].length))) {
    if (!fenced && /^## /.test(line)) break
    out.push(!fenced && /^#{1,3} /.test(line) ? line.replace(/^#{1,3} /, '#### ') : line)
  }
  return out.join('\n').replace(/^\n+/, '').replace(/\s+$/, '')
}

// Fetches one component's doc page text — file: read synchronously from disk, https/http via
// the global fetch with a 10s timeout — or null on any failure. Never throws.
async function fetchDocText(url) {
  if (url.startsWith('file:')) {
    try { return fs.readFileSync(fileURLToPath(url), 'utf8') } catch (e) { return null }
  }
  if (url.startsWith('https:') || url.startsWith('http:')) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10000)
    try {
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) return null
      return await res.text()
    } catch (e) {
      return null
    } finally {
      clearTimeout(timer)
    }
  }
  return null
}

async function buildCatalog(root, shadcnCmd) {
  const info = readShadcnInfo(shadcnCmd, root)
  if (!info || !Array.isArray(info.components)) return { ok: false }
  const base = (info.config && info.config.base) || 'unknown'
  const linksTemplate = (info.links && info.links.components) || ''
  const components = []
  let unavailable = 0
  for (const name of info.components) {
    const url = linksTemplate.replace('[component]', name)
    const text = url ? await fetchDocText(url) : null
    const composition = text === null ? null : extractComposition(text)
    if (composition === null) unavailable++
    components.push({ name, composition })
  }
  return { ok: true, base, components, unavailable }
}

function renderCatalogMd(catalog) {
  let body = '# Catalog — shadcn (' + catalog.base + ') · generated by catalog-inventory.js, never edited by hand\n\n'
  body += '## Components\n'
  for (const c of catalog.components) {
    body += '### ' + c.name + '\n'
    body += (c.composition === null ? 'composition: unavailable' : c.composition) + '\n'
  }
  return body
}

function parseExistingNames(text) {
  return fencedLines(text)
    .filter(([line, fenced]) => !fenced && /^### /.test(line))
    .map(([line]) => line.slice(4).trim())
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.root || !args.out) {
    usage()
    process.exitCode = 2
    return
  }
  const root = path.resolve(args.root)
  const outPath = path.isAbsolute(args.out) ? args.out : path.join(root, args.out)
  const located = locateStackRoot(root)
  const hasComponentsJson = located.stackRoot !== null

  if (args.check) {
    if (!fs.existsSync(outPath)) {
      const text = args.json ? JSON.stringify({ ok: false, status: 'missing' }) + '\n' : 'missing — run without --check first\n'
      writeOut(1, text)
      process.exitCode = 1
      return
    }
    const existingNames = parseExistingNames(fs.readFileSync(outPath, 'utf8'))
    // --check compares names only — `info --json` lists them, so no doc page is fetched here.
    if (!hasComponentsJson && existingNames.length > 0) {
      refuseNoComponentsJson(args, root, outPath, located, existingNames)
      return
    }
    let liveNames = []
    if (hasComponentsJson) {
      const info = readShadcnInfo(args.shadcn, located.stackRoot)
      if (!info || !Array.isArray(info.components)) {
        const text = args.json
          ? JSON.stringify({ ok: false, status: 'shadcn-failed' }) + '\n'
          : 'unknown — ' + args.shadcn + ' info --json failed or printed unparseable output; ' +
            'fix the shadcn command, or pass --shadcn "<working command>", then re-run --check\n'
        writeOut(1, text)
        process.exitCode = 1
        return
      }
      liveNames = info.components
    }
    const added = liveNames.filter((n) => !existingNames.includes(n))
    const removed = existingNames.filter((n) => !liveNames.includes(n))
    if (added.length === 0 && removed.length === 0) {
      const text = args.json ? JSON.stringify({ ok: true, status: 'current' }) + '\n' : 'current\n'
      writeOut(1, text)
      process.exitCode = 0
      return
    }
    const text = args.json
      ? JSON.stringify({ ok: false, status: 'stale', added, removed }) + '\n'
      : 'stale' + (added.length ? ' — added: ' + added.join(', ') : '') +
        (removed.length ? ' — removed: ' + removed.join(', ') : '') + '\n'
    writeOut(1, text)
    process.exitCode = 1
    return
  }

  if (!hasComponentsJson) {
    const existing = fs.existsSync(outPath) ? parseExistingNames(fs.readFileSync(outPath, 'utf8')) : []
    if (existing.length > 0) {
      refuseNoComponentsJson(args, root, outPath, located, existing)
      return
    }
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, 'catalog: none (no components.json)\n')
    const text = args.json ? JSON.stringify({ ok: true, catalog: 'none' }) + '\n' : 'catalog: none (no components.json)\n'
    writeOut(1, text)
    process.exitCode = 0
    return
  }

  const catalog = await buildCatalog(located.stackRoot, args.shadcn)
  if (!catalog.ok) {
    process.stderr.write('catalog-inventory: ' + args.shadcn + ' info --json failed or printed unparseable output — ' +
      'fix the shadcn command, or pass --shadcn "<working command>", then re-run\n')
    process.exitCode = 1
    return
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, renderCatalogMd(catalog))
  const text = args.json
    ? JSON.stringify({
        ok: true, catalog: 'shadcn', base: catalog.base,
        components: catalog.components.map((c) => ({ name: c.name, composition: c.composition !== null })),
        unavailable: catalog.unavailable,
      }) + '\n'
    : catalog.components.length + ' components · ' + catalog.unavailable + ' compositions unavailable\n'
  writeOut(1, text)
  process.exitCode = 0
}

main()
