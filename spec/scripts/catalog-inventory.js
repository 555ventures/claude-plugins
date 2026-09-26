#!/usr/bin/env node
'use strict'
// catalog-inventory.js --root <dir> --out <file> [--check] [--json] [--shadcn <command>]
//
// Owner: specs/20260926/04-the-design-brief.md D4 (AC-20260926-04-6, AC-20260926-04-7,
// AC-20260926-04-8) — the shadcn-catalog inventory genesis's DESIGN_BRIEF state generates once
// (spec/scripts/genesis-driver.js runs this as a child, --shadcn threaded from the env
// GENESIS_SHADCN_COMMAND) and /spec:doctor re-checks with --check when a kit may have drifted.
//
// A root with no <root>/components.json is not a shadcn-catalog host at all: this writes the
// literal "catalog: none (no components.json)" and exits 0, never a failure. Otherwise it runs
// `<shadcn> info --json` (default `npx shadcn@latest`, cwd = root) and, per listed component,
// fetches its doc page (https/http via the global fetch, 10s timeout; file: read from disk) and
// copies the "## Composition" section verbatim — a fetch failure or an absent section degrades
// that one component to "composition: unavailable", never blocking the whole run.
//
// Does NOT: author or edit the catalog by hand (the header line says so), validate a component
// actually exists in the kit directory (design-contract-check.js's job), or retry a failed
// fetch — one attempt per component, always.
//
// Exit codes:
//   0  the file was written (including the no-components.json case), or --check found the
//      on-disk catalog current.
//   1  --check found the on-disk catalog stale or missing, or the shadcn command itself failed.
//   2  usage error (missing --root or --out).

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { fileURLToPath } = require('url')

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

// Extracts the "## Composition" section (through the line before the next "## " heading, or end
// of text) from a component doc page's text. Returns null when the heading is absent.
function extractComposition(text) {
  const m = /^## Composition\s*$/m.exec(text)
  if (!m) return null
  const rest = text.slice(m.index + m[0].length)
  const nextIdx = rest.search(/^## /m)
  const body = nextIdx === -1 ? rest : rest.slice(0, nextIdx)
  return body.replace(/^\n+/, '').replace(/\s+$/, '')
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
  return [...text.matchAll(/^### (.+)$/gm)].map((m) => m[1].trim())
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
  const componentsJsonPath = path.join(root, 'components.json')
  const hasComponentsJson = fs.existsSync(componentsJsonPath)

  if (args.check) {
    if (!fs.existsSync(outPath)) {
      const text = args.json ? JSON.stringify({ ok: false, status: 'missing' }) + '\n' : 'missing — run without --check first\n'
      writeOut(1, text)
      process.exitCode = 1
      return
    }
    const existingNames = parseExistingNames(fs.readFileSync(outPath, 'utf8'))
    let liveNames = []
    if (hasComponentsJson) {
      const catalog = await buildCatalog(root, args.shadcn)
      if (catalog.ok) liveNames = catalog.components.map((c) => c.name)
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
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, 'catalog: none (no components.json)\n')
    const text = args.json ? JSON.stringify({ ok: true, catalog: 'none' }) + '\n' : 'catalog: none (no components.json)\n'
    writeOut(1, text)
    process.exitCode = 0
    return
  }

  const catalog = await buildCatalog(root, args.shadcn)
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
