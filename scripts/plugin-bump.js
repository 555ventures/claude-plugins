#!/usr/bin/env node
'use strict'
// scripts/plugin-bump.js — the plugin version discipline as a script, not a reviewer reading prose.
//
// Usage:
//   node scripts/plugin-bump.js --check [--base <ref>] [--root <dir>]
//       For every plugin in <root>/.claude-plugin/marketplace.json: when any path under the
//       plugin's directory OTHER than its own .claude-plugin/plugin.json changed between <base>
//       and HEAD, the manifest version at HEAD must be strictly greater (numeric, per component)
//       than the manifest version at <base>. Base: --base, else a 40-hex $SPEC_REVIEW_BASE, else
//       merge-base(HEAD, main), else merge-base(HEAD, origin/main); none resolvable is a
//       refusal, never a pass. $SPEC_REVIEW_BASE is ignored unless it is a full 40-hex commit
//       sha — a ref name resolves in every repository (including a synthetic one a test builds
//       in tmpdir()) and would silently redirect the base there.
//   node scripts/plugin-bump.js --bump --plugin <name> --changelog "<paragraph>" [--root <dir>] [--dry-run]
//       Rewrites the plugin's manifest: version -> MAJOR.(MINOR+1).0; the description's
//       "Changelog (last 3): " run gains "<new> — <paragraph>" at its head and keeps exactly three
//       entries. Prints the new version. --dry-run prints it and writes nothing.
//
// Owner: specs/20260908/01-plugin-bump-and-merge-base-pin.md (D1–D4, D9; landed as a direct fix).
//
// What this deliberately does NOT do: decide whether a change is a "behavior change" (any change
// under the plugin directory owes a bump — a script cannot tell a chore from a feature); check
// that a version number is globally unused (two branches spending one number collide on
// plugin.json at merge, and git reports that); touch any manifest during --check.
//
// Exit codes:
//   0 = --check: every plugin green · --bump: manifest written (or --dry-run)
//   1 = --check: at least one plugin changed without a higher version (one ❌ line each)
//   2 = usage error, unreadable marketplace/manifest, non-semver version, unresolvable base,
//       --bump on a manifest with no "Changelog (last 3): " run, empty --changelog, or unknown
//       --plugin (stderr line starts "plugin-bump: " and names the remedy; nothing written)

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const MARKER = 'Changelog (last 3): '
const ENTRY_SPLIT = /(?=\b\d+\.\d+\.\d+ — )/

function die(msg) { process.stderr.write('plugin-bump: ' + msg + '\n'); process.exit(2) }

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const flag = (f) => { const i = argv.indexOf(f); return i > -1 && i + 1 < argv.length ? argv[i + 1] : null }

const root = path.resolve(flag('--root') || process.cwd())

function git(...args) {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() }
}

function parseSemver(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v))
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}
function compareSemver(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}

function readMarketplace() {
  const p = path.join(root, '.claude-plugin', 'marketplace.json')
  let j
  try { j = JSON.parse(fs.readFileSync(p, 'utf8')) } catch (e) {
    die(`cannot read ${p} (${e.message}) — remedy: run from the marketplace repo root or pass --root <dir>`)
  }
  const plugins = Array.isArray(j.plugins) ? j.plugins : []
  return plugins.map((pl) => ({
    name: String(pl.name || ''),
    dir: String(pl.source || '').replace(/^\.\//, '').replace(/\/+$/, ''),
  })).filter((pl) => pl.name && pl.dir)
}

function manifestRel(dir) { return `${dir}/.claude-plugin/plugin.json` }

function readManifestAt(rel) {
  const p = path.join(root, rel)
  let raw
  try { raw = fs.readFileSync(p, 'utf8') } catch (e) {
    die(`cannot read ${rel} (${e.message}) — remedy: check the plugin's source path in marketplace.json`)
  }
  let m
  try { m = JSON.parse(raw) } catch (e) { die(`${rel} is not valid JSON (${e.message}) — remedy: fix the manifest before bumping`) }
  return { raw, manifest: m }
}

// ---- --check --------------------------------------------------------------------------------
// resolveBase (specs/20260909/02-replay-base-and-label-honesty.md D2): --base outranks
// everything; otherwise SPEC_REVIEW_BASE is a candidate ONLY when it is a full 40-hex commit
// sha (a ref name resolves in every repo, including the synthetic marketplaces this script's
// own tests build in tmpdir(), and would silently redirect their base), then main, then
// origin/main — first candidate whose merge-base resolves wins.
function resolveBase() {
  const explicit = flag('--base')
  const env = process.env.SPEC_REVIEW_BASE
  const envCandidate = env && /^[0-9a-f]{40}$/.test(env) ? env : null
  const candidates = explicit ? [explicit] : [envCandidate, 'main', 'origin/main'].filter(Boolean)
  for (const c of candidates) {
    const r = git('merge-base', 'HEAD', c)
    if (r.code === 0 && r.out) return r.out
  }
  die(explicit
    ? `cannot resolve --base ${explicit} to a commit — remedy: pass a ref git rev-parse accepts`
    : 'no base resolvable: neither $SPEC_REVIEW_BASE, main nor origin/main is a ref here — remedy: git fetch origin main:main or pass --base <ref>')
}

function check() {
  const plugins = readMarketplace()
  const base = resolveBase()
  const base7 = base.slice(0, 7)
  let red = 0
  for (const pl of plugins) {
    const rel = manifestRel(pl.dir)
    const diff = git('diff', '--name-only', base, 'HEAD', '--', pl.dir + '/')
    if (diff.code !== 0) die(`git diff failed for ${pl.dir}/ (${diff.err}) — remedy: run inside the repository`)
    const changed = diff.out.split('\n').filter(Boolean).filter((f) => f !== rel)
    const { manifest } = readManifestAt(rel)
    const headV = parseSemver(manifest.version)
    if (!headV) die(`${rel} version ${JSON.stringify(manifest.version)} is not MAJOR.MINOR.PATCH — remedy: fix the manifest`)
    if (!changed.length) {
      console.log(`✅ ${pl.name} ${manifest.version} (no change under ${pl.dir}/)`)
      continue
    }
    const shown = git('show', `${base}:${rel}`)
    let baseV = [0, 0, 0]
    let baseStr = '0.0.0'
    if (shown.code === 0) {
      let bm
      try { bm = JSON.parse(shown.out) } catch { die(`${rel} at ${base7} is not valid JSON — remedy: pass --base <ref> at a sane commit`) }
      baseV = parseSemver(bm.version)
      if (!baseV) die(`${rel} at ${base7} has non-semver version ${JSON.stringify(bm.version)} — remedy: pass --base <ref>`)
      baseStr = bm.version
    }
    const cmp = compareSemver(headV, baseV)
    if (cmp > 0) {
      console.log(`✅ ${pl.name} ${baseStr} → ${manifest.version}`)
    } else {
      red++
      const behind = cmp < 0 ? ` (behind the base? merge or rebase onto ${base7} first)` : ''
      console.log(`❌ ${pl.name}: ${pl.dir}/ changed since ${base7} but version is ${manifest.version} (base ${baseStr}) — ` +
        `remedy: node scripts/plugin-bump.js --bump --plugin ${pl.name} --changelog "<paragraph>"${behind}`)
    }
  }
  process.exit(red ? 1 : 0)
}

// ---- --bump ---------------------------------------------------------------------------------
function bump() {
  const name = flag('--plugin')
  const paragraph = (flag('--changelog') || '').trim()
  if (!name) die('--bump needs --plugin <name> — remedy: name a plugin from .claude-plugin/marketplace.json')
  if (!paragraph) die('--changelog is empty or missing — remedy: pass the changelog paragraph for this bump')
  const pl = readMarketplace().find((p) => p.name === name)
  if (!pl) die(`plugin ${JSON.stringify(name)} is not in .claude-plugin/marketplace.json — remedy: use one of its plugins[].name values`)
  const rel = manifestRel(pl.dir)
  const { manifest } = readManifestAt(rel)
  const v = parseSemver(manifest.version)
  if (!v) die(`${rel} version ${JSON.stringify(manifest.version)} is not MAJOR.MINOR.PATCH — remedy: fix the manifest`)
  const desc = typeof manifest.description === 'string' ? manifest.description : ''
  const idx = desc.indexOf(MARKER)
  if (idx === -1) {
    die(`${rel} description has no "${MARKER.trim()}" run — remedy: add one (the description is this repo's changelog surface), or bump by hand and let --check verify`)
  }
  const head = desc.slice(0, idx + MARKER.length)
  const entries = desc.slice(idx + MARKER.length).split(ENTRY_SPLIT).map((e) => e.trim()).filter(Boolean)
  if (entries.length !== 3) {
    die(`${rel} changelog run has ${entries.length} entries, expected exactly 3 — remedy: fix the description's "${MARKER.trim()}" run first`)
  }
  const next = `${v[0]}.${v[1] + 1}.0`
  const entry = `${next} — ${paragraph}${/[.!?]$/.test(paragraph) ? '' : '.'}`
  manifest.version = next
  manifest.description = head + [entry, entries[0], entries[1]].join(' ')
  if (!has('--dry-run')) fs.writeFileSync(path.join(root, rel), JSON.stringify(manifest, null, 2) + '\n')
  console.log(next)
  process.exit(0)
}

if (has('--check') && !has('--bump')) check()
else if (has('--bump') && !has('--check')) bump()
else die('usage: plugin-bump.js --check [--base <ref>] [--root <dir>] | --bump --plugin <name> --changelog "<paragraph>" [--root <dir>] [--dry-run]')
