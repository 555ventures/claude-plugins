#!/usr/bin/env node
'use strict'
// registry-check.js --menu <file>… [--write] [--base <registry>=<url>]… [--timeout-ms <n>] [--json]
//
// specs/20260825/03-genesis-currency-executed.md: replaces wf-research.js's deleted Haiku "still
// current?" pass — a fast model asked to opine, never told to pin to release pages, in a year
// when blog roundups asserted Bun 2.0 / Deno 3.0 / Storybook 11 (none of which exist, spec
// Assumptions A1/A3). This script makes currency EXECUTED instead of opined: it resolves every
// `options[].packages[]` entry a research menu names against the registry's own per-version JSON
// endpoint (npm, PyPI, crates.io) or endoflife.date's cycle list for runtimes, prints one verdict
// line per package, and — with --write — mechanically drops any option whose package 404s and
// stamps every survivor with the check it passed. A version that does not exist on its registry
// becomes mechanically impossible to ship in a genesis menu.
//
// What this deliberately does NOT do:
//   - shell out to `npm view` / `pip index` / `cargo search` — the planning host may not have
//     the package manager installed; a plain HTTPS GET is portable and dependency-free
//     (spec Rationale).
//   - follow HTTP redirects, retry a failed request, or cache a verdict across runs — one GET
//     per package, per invocation.
//   - treat an unreachable registry as evidence a version is missing — offline is never a block
//     (exit 3 stamps `unverified` and the interview continues; see spec D3/D4).
//   - treat an endoflife.date 404 (the curated runtime list has never heard of the product) as
//     evidence of a missing VERSION — that is `unknown-product`, never `missing` (spec D3
//     Rationale: "a runtime slug the researcher spelled differently must not delete a real
//     option").
//   - relocate the session CWD, mutate any file it was not pointed at via --menu, or write
//     anything at all without --write.
//
// Exit codes:
//   0  __REGISTRY_OK__          — no option's packages resolved `missing`.
//   1  __REGISTRY_DROPPED__ n=<k> — k options resolved `missing` (dropped for currency).
//   2  usage / unreadable or malformed --menu file (stderr names the file/flag and the remedy;
//      nothing is written even with --write).
//   3  __REGISTRY_UNREACHABLE__ — every package actually probed came back `unreachable`; nothing
//      was verified. The never-block path: with --write every option is stamped `unverified`
//      and none is removed.

const fs = require('fs')
const path = require('path')
const http = require('http')
const https = require('https')

// The 64 KiB process.exit stdout truncation this synchronous writer avoids is explained in full
// at spec/scripts/lib/driver-io.js's writeOut.
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

function die(code, msg) {
  writeOut(2, 'registry-check: ' + msg)
  process.exit(code)
}

const USAGE = 'registry-check.js --menu <file>… [--write] [--base <registry>=<url>]… ' +
  '[--timeout-ms <n>] [--json]'

const KNOWN_REGISTRIES = ['npm', 'pypi', 'crates', 'endoflife']
const DEFAULT_BASES = {
  npm: 'https://registry.npmjs.org',
  pypi: 'https://pypi.org',
  crates: 'https://crates.io',
  endoflife: 'https://endoflife.date',
}

function pluginVersion() {
  try {
    const p = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.claude-plugin', 'plugin.json'), 'utf8'))
    return (p && p.version) || '0.0.0'
  } catch (e) {
    return '0.0.0'
  }
}

// ---------------------------------------------------------------------------
// Arg parsing — hand-rolled, no library.
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const opts = { menuPaths: [], write: false, json: false, timeoutMs: 8000, bases: {} }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--menu') {
      const v = argv[++i]
      if (!v) die(2, 'usage: ' + USAGE + ' — --menu needs a path')
      opts.menuPaths.push(v)
    } else if (a === '--write') {
      opts.write = true
    } else if (a === '--json') {
      opts.json = true
    } else if (a === '--timeout-ms') {
      const v = Number(argv[++i])
      if (!Number.isFinite(v) || v <= 0) die(2, 'usage: ' + USAGE + ' — --timeout-ms needs a positive number')
      opts.timeoutMs = v
    } else if (a === '--base') {
      const raw = argv[++i]
      const eq = raw ? raw.indexOf('=') : -1
      if (!raw || eq === -1) die(2, 'usage: ' + USAGE + ' — --base needs <registry>=<url>, got "' + raw + '"')
      const registry = raw.slice(0, eq)
      const url = raw.slice(eq + 1)
      if (!KNOWN_REGISTRIES.includes(registry)) {
        die(2, 'usage: --base registry must be one of ' + KNOWN_REGISTRIES.join('|') + ', got "' + registry + '"')
      }
      opts.bases[registry] = url
    } else {
      die(2, 'usage: ' + USAGE + ' — unknown argument "' + a + '"')
    }
  }
  if (!opts.menuPaths.length) die(2, 'usage: ' + USAGE)
  return opts
}

// ---------------------------------------------------------------------------
// Menu loading + shape validation. All --menu files are validated BEFORE any
// network call or write, so a malformed file among several never leaves a
// partial run behind.
// ---------------------------------------------------------------------------
function loadMenu(p) {
  let raw
  try {
    raw = fs.readFileSync(p, 'utf8')
  } catch (e) {
    die(2, p + ': cannot read menu file (' + e.message + ') — re-run the research round')
  }
  let menu
  try {
    menu = JSON.parse(raw)
  } catch (e) {
    die(2, p + ': not valid JSON (' + e.message + ') — re-run the research round')
  }
  if (!menu || typeof menu !== 'object' || Array.isArray(menu)) {
    die(2, p + ': menu must be a JSON object — re-run the research round')
  }
  if (!Array.isArray(menu.options)) {
    die(2, p + ': menu.options must be an array — re-run the research round')
  }
  for (const opt of menu.options) {
    const packages = opt && opt.packages
    if (packages === undefined) continue
    if (!Array.isArray(packages)) {
      die(2, p + ': option "' + (opt && opt.label) + '" packages must be an array — re-run the research round')
    }
    for (const pkg of packages) {
      for (const field of ['registry', 'name', 'version']) {
        if (!pkg || typeof pkg[field] !== 'string' || !pkg[field]) {
          die(2, p + ': option "' + (opt && opt.label) + '" has a package missing "' + field +
            '" — re-run the research round')
        }
      }
    }
  }
  return { path: p, menu }
}

// ---------------------------------------------------------------------------
// Per-package registry probe.
// ---------------------------------------------------------------------------
function buildUrl(pkg, baseUrl) {
  const { registry, name, version } = pkg
  let pathPart
  if (registry === 'npm') {
    pathPart = '/' + name.split('/').map(encodeURIComponent).join('%2f') + '/' + encodeURIComponent(version)
  } else if (registry === 'pypi') {
    pathPart = '/pypi/' + encodeURIComponent(name) + '/' + encodeURIComponent(version) + '/json'
  } else if (registry === 'crates') {
    pathPart = '/api/v1/crates/' + encodeURIComponent(name) + '/' + encodeURIComponent(version)
  } else {
    pathPart = '/api/' + encodeURIComponent(name) + '.json'
  }
  return new URL(pathPart, baseUrl)
}

// Behavior: `nodejs@26` matches cycle `26`; `nodejs@26.1.0` matches cycle `26` (starts-with-
// cycle-plus-dot); `deno@3.0` against cycles `2.9, 2.8, …` does not match.
function endoflifeMatches(version, cycles) {
  return cycles.some((c) => {
    const cycle = String(c && c.cycle)
    return version === cycle || version.startsWith(cycle + '.')
  })
}

function deriveVerdict(registry, version, status, body) {
  if (status === 200) {
    let parsed
    try {
      parsed = JSON.parse(body)
    } catch (e) {
      return 'unreachable' // a 200 whose body is not JSON (D3)
    }
    if (registry === 'endoflife') {
      const cycles = Array.isArray(parsed) ? parsed : []
      return endoflifeMatches(version, cycles) ? 'exists' : 'missing'
    }
    return 'exists'
  }
  if (status === 404) {
    return registry === 'endoflife' ? 'unknown-product' : 'missing'
  }
  return 'unreachable' // any 5xx, or any other unexpected status
}

function probe(pkg, bases, timeoutMs, userAgent) {
  return new Promise((resolve) => {
    if (!KNOWN_REGISTRIES.includes(pkg.registry)) {
      resolve('unsupported')
      return
    }
    const baseUrl = bases[pkg.registry] || DEFAULT_BASES[pkg.registry]
    let url
    try {
      url = buildUrl(pkg, baseUrl)
    } catch (e) {
      resolve('unreachable')
      return
    }
    const client = url.protocol === 'http:' ? http : https
    let settled = false
    const finish = (verdict) => {
      if (settled) return
      settled = true
      resolve(verdict)
    }
    const req = client.request(url, {
      method: 'GET',
      headers: { 'user-agent': userAgent, accept: 'application/json' },
      timeout: timeoutMs,
    }, (res) => {
      let body = ''
      res.on('data', (c) => { body += c })
      res.on('end', () => finish(deriveVerdict(pkg.registry, pkg.version, res.statusCode, body)))
      res.on('error', () => finish('unreachable'))
    })
    req.on('timeout', () => req.destroy(new Error('registry-check: request timed out')))
    req.on('error', () => finish('unreachable'))
    req.end()
  })
}

// ---------------------------------------------------------------------------
// Option-status derivation (D3, applied in this exact order):
//   1. any package `missing`                        -> `missing`
//   2. else no packages                              -> `unverified`
//   3. else any `unreachable`/`unknown-product`       -> `unverified`
//   4. else any `unsupported` and no `exists`         -> `unsupported`
//   5. else                                           -> `verified`
// ---------------------------------------------------------------------------
function deriveOptionStatus(pkgResults) {
  if (pkgResults.some((p) => p.verdict === 'missing')) return 'missing'
  if (!pkgResults.length) return 'unverified'
  if (pkgResults.some((p) => p.verdict === 'unreachable' || p.verdict === 'unknown-product')) return 'unverified'
  if (pkgResults.some((p) => p.verdict === 'unsupported') && !pkgResults.some((p) => p.verdict === 'exists')) {
    return 'unsupported'
  }
  return 'verified'
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const loaded = opts.menuPaths.map(loadMenu) // dies (exit 2) before any network call/write

  const userAgent = 'spec-plugin-registry-check/' + pluginVersion()
  const runNow = new Date().toISOString()

  const outLines = []
  const jsonMenus = []
  let totalDropped = 0
  let anyProbe = false
  let allUnreachable = true

  for (const { path: menuPath, menu } of loaded) {
    const dimension = menu.dimension
    const options = Array.isArray(menu.options) ? menu.options : []
    const survivorOptions = []
    const droppedEntries = []
    const jsonOptions = []

    // Sequential per menu (Behavior): at most a handful of packages per option, so a slow
    // registry costs at most timeout-ms × packages, never a parallel fan-out.
    for (const opt of options) {
      const packages = Array.isArray(opt.packages) ? opt.packages : []
      const pkgResults = []
      for (const pkg of packages) {
        const verdict = await probe(pkg, opts.bases, opts.timeoutMs, userAgent)
        outLines.push('registry-check: ' + dimension + ' "' + opt.label + '" ' +
          pkg.registry + ':' + pkg.name + '@' + pkg.version + ' ' + verdict)
        pkgResults.push({ registry: pkg.registry, name: pkg.name, version: pkg.version, verdict })
        if (KNOWN_REGISTRIES.includes(pkg.registry)) {
          anyProbe = true
          if (verdict !== 'unreachable') allUnreachable = false
        }
      }
      const status = deriveOptionStatus(pkgResults)
      jsonOptions.push({ label: opt.label, status, packages: pkgResults })
      if (status === 'missing') {
        totalDropped++
        droppedEntries.push({
          label: opt.label,
          packages: packages.map((p) => ({ registry: p.registry, name: p.name, version: p.version })),
        })
      } else {
        survivorOptions.push({ ...opt, currency: { status, checkedAt: runNow, packages: pkgResults } })
      }
    }

    jsonMenus.push({ file: menuPath, dimension, options: jsonOptions })

    if (opts.write) {
      const existingDropped = Array.isArray(menu.droppedForCurrency) ? menu.droppedForCurrency : []
      const newMenu = {
        ...menu,
        options: survivorOptions,
        droppedForCurrency: existingDropped.concat(droppedEntries),
        currencyCheckedAt: runNow,
      }
      fs.writeFileSync(menuPath, JSON.stringify(newMenu, null, 2) + '\n')
    }
  }

  let exitCode
  let sentinel
  if (totalDropped > 0) {
    exitCode = 1
    sentinel = '__REGISTRY_DROPPED__ n=' + totalDropped
  } else if (anyProbe && allUnreachable) {
    exitCode = 3
    sentinel = '__REGISTRY_UNREACHABLE__'
  } else {
    exitCode = 0
    sentinel = '__REGISTRY_OK__'
  }

  if (opts.json) {
    writeOut(1, JSON.stringify({ menus: jsonMenus }))
  } else {
    writeOut(1, outLines.concat(sentinel).join('\n'))
  }
  process.exit(exitCode)
}

main()
