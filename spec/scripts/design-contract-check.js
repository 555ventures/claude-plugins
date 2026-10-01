#!/usr/bin/env node
'use strict'
// design-contract-check.js --root <dir> [--json] [--rules <file> --kit <dir> --tokens <file>] —
// presence oracle for a host's design contract: the token file, the kit directory of
// intent-named composites, and the auto-loaded rules file holding the intent-to-pattern table
// and the four naming subsections.
//
// Owner: specs/20260926/02-the-design-contract-is-code.md D2/D3 (AC-20260926-02-1 through
// AC-20260926-02-6, AC-20260926-02-10); specs/20260926/04-the-design-brief.md D7 adds the
// --rules/--kit/--tokens override flags (AC-20260926-04-15) — all three together, repo-relative
// to --root, bypass `.claude/spec.config.json` entirely and run the same findings over the named
// paths, for genesis's `--mark design-brief-written` (no `design` block exists in the config at
// that point yet).
//
// Does NOT: author tables, components, or tokens; validate anything about a host whose
// `.claude/spec.config.json` carries no `design` block and no override flags are given (that
// host is reported `skipped`); walk for composites when the kit directory itself does not
// exist; re-derive an enforcer (that is /spec:enforce's job — this script only reports
// presence).
//
// A `design` block that is present but missing `kit`, `tokens`, or `rules` (D1: all three are
// required once the block exists) reports the same *-missing kind as a missing path would, with
// no `path` (there is no configured value to point at) and a remedy naming the key to add — it
// never crashes and never invents a new finding kind.
//
// Exit codes: 0 clean or skipped (no design block, no overrides) · 1 one or more findings ·
// 2 usage error (missing --root, or exactly one or two of --rules/--kit/--tokens given)

const fs = require('node:fs')
const path = require('node:path')
const { readConfig } = require('./lib/host-config')

function usage() {
  process.stderr.write('usage: design-contract-check.js --root <dir> [--json] [--rules <file> --kit <dir> --tokens <file>]\n')
}

function parseArgs(argv) {
  const out = { root: null, json: false, rules: null, kit: null, tokens: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--root') { out.root = argv[++i]; continue }
    if (a === '--json') { out.json = true; continue }
    if (a === '--rules') { out.rules = argv[++i]; continue }
    if (a === '--kit') { out.kit = argv[++i]; continue }
    if (a === '--tokens') { out.tokens = argv[++i]; continue }
  }
  return out
}

function writeOut(fd, text) {
  const buf = Buffer.from(text, 'utf8')
  let off = 0
  while (off < buf.length) {
    off += fs.writeSync(fd, buf, off, buf.length - off)
  }
}

// Finds the first markdown table block (a run of `|...|` lines) in `text`. Returns the data
// rows (header and separator lines excluded) as arrays of trimmed cells, or null when no table
// block (fewer than a header + separator line) is found at all.
function findTable(text) {
  const lines = text.split('\n')
  let start = -1
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*\|.*\|\s*$/.test(lines[i])) { start = i; break }
  }
  if (start === -1) return null
  let end = start
  while (end < lines.length && /^\s*\|.*\|\s*$/.test(lines[end])) end++
  const tableLines = lines.slice(start, end)
  if (tableLines.length < 2) return null
  const dataLines = tableLines.slice(2)
  return dataLines.map(line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim()))
}

// Slices `content` from a `## Heading` match (exclusive of the heading line) to the next `## `
// heading or end of string. Returns null when the heading itself is not found.
function extractSection(content, startRe) {
  const m = startRe.exec(content)
  if (!m) return null
  const rest = content.slice(m.index + m[0].length)
  const nextIdx = rest.search(/^## /m)
  return nextIdx === -1 ? rest : rest.slice(0, nextIdx)
}

// Same as extractSection but for a `### Heading` inside an already-sliced `## Naming` section —
// stops at the next `### ` or `## ` heading.
function extractSubsection(text, startRe) {
  const m = startRe.exec(text)
  if (!m) return null
  const rest = text.slice(m.index + m[0].length)
  const nextIdx = rest.search(/^(### |## )/m)
  return nextIdx === -1 ? rest : rest.slice(0, nextIdx)
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function toKebab(pascal) {
  return pascal.replace(/(?<!^)(?=[A-Z])/g, '-').toLowerCase()
}

function walk(dir) {
  let out = []
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out = out.concat(walk(p))
    else if (e.isFile()) out.push(p)
  }
  return out
}

// The Composite cell grammar (templates/design-rules.md): one or more PascalCase names,
// backticked or bare. Spans are the backticked runs when the cell has any, else the whole cell;
// each span contributes its leading PascalCase identifier (`Button kind="ink"` → Button,
// `Frame`'s → Frame); spans with none (`marks`) and prose between backticks are ignored.
function compositeNames(cell) {
  const ticked = String(cell || '').match(/`[^`]*`/g)
  const spans = ticked ? ticked.map((t) => t.slice(1, -1)) : [String(cell || '')]
  const names = []
  for (const span of spans) {
    const m = span.trim().match(/^[A-Z][A-Za-z0-9]*/)
    if (m && !names.includes(m[0])) names.push(m[0])
  }
  return names
}

function compositePresent(kitAbs, composite) {
  const kebab = toKebab(composite)
  const files = walk(kitAbs)
  const exportRe = new RegExp('export\\s+(default\\s+)?(function|const|class)\\s+' + escapeRegExp(composite) + '\\b')
  for (const f of files) {
    const base = path.basename(f, path.extname(f))
    if (base === composite || base === kebab) return true
    let text
    try {
      text = fs.readFileSync(f, 'utf8')
    } catch {
      continue
    }
    if (exportRe.test(text)) return true
  }
  return false
}

const NAMING_LAYERS = ['code', 'schema', 'routes', 'wire']

function checkNamingLayer(namingSection, layer, rulesRelPath, findings) {
  const sub = namingSection === null ? null : extractSubsection(namingSection, new RegExp('^### ' + layer + '$', 'm'))
  if (sub === null) {
    findings.push({
      kind: 'naming-section-missing', layer, path: rulesRelPath,
      remedy: `add a ### ${layer} table under ## Naming`,
    })
    return
  }
  const rows = findTable(sub)
  if (rows === null) {
    findings.push({
      kind: 'table-missing', layer, path: rulesRelPath,
      remedy: `add a table under ### ${layer} in ${rulesRelPath}`,
    })
    return
  }
  if (rows.length === 0) {
    findings.push({
      kind: 'table-empty', layer, path: rulesRelPath,
      remedy: `fill the ### ${layer} table (genesis design stage, or by hand)`,
    })
  }
}

// D7: the shared check body, run either from a host config's `design` block (run(), below) or
// from the --rules/--kit/--tokens override flags (main()) — the same findings either way, since
// a bypassed config is just a different source for the same three paths.
function runWithPaths(root, { tokens, kit, rules } = {}) {
  const findings = []

  const isNonEmptyString = v => typeof v === 'string' && v.length > 0

  const tokensRel = isNonEmptyString(tokens) ? tokens : null
  const kitRel = isNonEmptyString(kit) ? kit : null
  const rulesRel = isNonEmptyString(rules) ? rules : null

  const tokensExists = tokensRel !== null && fs.existsSync(path.join(root, tokensRel)) && fs.statSync(path.join(root, tokensRel)).isFile()
  const kitAbs = kitRel !== null ? path.join(root, kitRel) : null
  const kitExists = kitRel !== null && fs.existsSync(kitAbs) && fs.statSync(kitAbs).isDirectory()
  const rulesAbs = rulesRel !== null ? path.join(root, rulesRel) : null
  const rulesExists = rulesRel !== null && fs.existsSync(rulesAbs) && fs.statSync(rulesAbs).isFile()

  if (tokensRel === null) {
    findings.push({ kind: 'tokens-missing', remedy: 'add design.tokens (repo-relative path to the design token file) to the host config\'s design block' })
  } else if (!tokensExists) {
    findings.push({ kind: 'tokens-missing', path: tokensRel, remedy: `create ${tokensRel} (the token file design.tokens names)` })
  }
  if (kitRel === null) {
    findings.push({ kind: 'kit-missing', remedy: 'add design.kit (repo-relative path to the kit directory) to the host config\'s design block' })
  } else if (!kitExists) {
    findings.push({ kind: 'kit-missing', path: kitRel, remedy: `create ${kitRel} (the kit directory design.kit names)` })
  }
  if (rulesRel === null) {
    findings.push({ kind: 'rules-missing', remedy: 'add design.rules (repo-relative path to the design rules file) to the host config\'s design block' })
  } else if (!rulesExists) {
    findings.push({ kind: 'rules-missing', path: rulesRel, remedy: `seed ${rulesRel} from $(spec-paths design-rules-template)` })
  }

  if (rulesExists) {
    const content = fs.readFileSync(rulesAbs, 'utf8')

    const intentSection = extractSection(content, /^## Intent to pattern$/m)
    if (intentSection === null) {
      findings.push({
        kind: 'table-missing', layer: 'intent', path: rulesRel,
        remedy: `add a ## Intent to pattern table to ${rulesRel}`,
      })
    } else {
      const rows = findTable(intentSection)
      if (rows === null) {
        findings.push({
          kind: 'table-missing', layer: 'intent', path: rulesRel,
          remedy: `add a ## Intent to pattern table to ${rulesRel}`,
        })
      } else if (rows.length === 0) {
        findings.push({
          kind: 'table-empty', layer: 'intent', path: rulesRel,
          remedy: 'fill the ## Intent to pattern table (genesis design stage, or by hand)',
        })
      } else if (kitExists) {
        for (const row of rows) {
          const [intent, , composite] = row
          if (!composite) continue
          const names = compositeNames(composite)
          if (names.length === 0) {
            findings.push({
              kind: 'composite-missing', intent, composite, path: kitRel,
              remedy: `the Composite cell names no PascalCase composite — fix the Composite cell`,
            })
            continue
          }
          for (const name of names) {
            if (!compositePresent(kitAbs, name)) {
              findings.push({
                kind: 'composite-missing', intent, composite: name, path: kitRel,
                remedy: `add ${name} under ${kitRel} or fix the Composite cell`,
              })
            }
          }
        }
      }
    }

    const namingSection = extractSection(content, /^## Naming$/m)
    for (const layer of NAMING_LAYERS) {
      checkNamingLayer(namingSection, layer, rulesRel, findings)
    }
  }

  return { ok: findings.length === 0, findings }
}

function run(root) {
  const config = readConfig(root)
  const design = config.design
  if (!design) {
    return { ok: true, findings: [], skipped: 'no-design-block' }
  }
  return runWithPaths(root, { tokens: design.tokens, kit: design.kit, rules: design.rules })
}

function renderHuman(result) {
  if (result.skipped) return 'skipped: no design block\n'
  if (result.findings.length === 0) return 'design contract: ok\n'
  return result.findings.map(f => `${f.kind}: ${f.remedy}`).join('\n') + '\n'
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.root) {
    usage()
    process.exitCode = 2
    return
  }
  const overridesGiven = [args.rules, args.kit, args.tokens].filter((v) => v !== null)
  if (overridesGiven.length > 0 && overridesGiven.length < 3) {
    process.stderr.write('usage: --rules, --kit and --tokens go together\n')
    process.exitCode = 2
    return
  }
  const result = overridesGiven.length === 3
    ? runWithPaths(args.root, { tokens: args.tokens, kit: args.kit, rules: args.rules })
    : run(args.root)
  const text = args.json ? JSON.stringify(result) + '\n' : renderHuman(result)
  writeOut(1, text)
  process.exitCode = result.findings.length === 0 ? 0 : 1
}

if (require.main === module) main()

module.exports = { compositeNames }
