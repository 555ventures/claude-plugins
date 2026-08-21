'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('../helpers')

// specs/20260820/08-config-name-ban.md (2026-08-20, D7): lib/host-config.js gains three exports
// so the config-name ban has a sanctioned route for every legitimate reason a script named the
// file before this spec — a presence probe and a remedy string. `configPath(root)` is the
// existing private `configPathFor`, renamed at the export boundary. `configExists(root)` is a
// pure presence probe (fs.existsSync — never opens, reads, or parses). `CONFIG_RELPATH` is the
// literal `.claude/spec.config.json`, for user-facing remedy text only. AC-20260820-08-5 pins
// configPath, AC-20260820-08-6 pins configExists, AC-20260820-08-9 pins the seven remedy strings
// behaviorally (two of the seven, in review-legs.js and fidelity-check.js, are executed here
// against a synthetic host), and AC-20260820-08-12 re-pins readConfig/readConfigStrict/
// declaredForge as an untouched regression (SHALL CONTINUE TO — this spec's Contracts block
// states their behavior is byte-for-byte unchanged).

test('AC-20260820-08-5: configPath(root) returns the joined path <root>/.claude/spec.config.json', () => {
  const { configPath } = require('../../spec/scripts/lib/host-config')
  const root = tmpdir('host-config-path')
  assert.strictEqual(configPath(root), path.join(root, '.claude', 'spec.config.json'),
    'configPath must return exactly root joined with .claude/spec.config.json — every caller that switches from a private path.join to this export relies on byte-identical output, or its own file-existence and read logic silently starts looking in the wrong place')
})

test('AC-20260820-08-6: configExists(root) is true iff a filesystem entry sits at configPath(root), without opening, reading, or parsing it — an unparsable config, and a directory occupying the path, both still read as true', () => {
  const { configExists, configPath } = require('../../spec/scripts/lib/host-config')

  const absentRoot = tmpdir('host-config-exists-absent')
  assert.strictEqual(configExists(absentRoot), false,
    'configExists must return false when no .claude directory (and so no config file) exists at all — a true here would make every caller believe a host is configured when it is not')

  const garbageRoot = tmpdir('host-config-exists-garbage')
  fs.mkdirSync(path.join(garbageRoot, '.claude'), { recursive: true })
  fs.writeFileSync(configPath(garbageRoot), '{ not json')
  assert.strictEqual(configExists(garbageRoot), true,
    'an unparsable config must still read as true — configExists is a presence probe, not a validity probe; folding parse failure into false would make a broken config indistinguishable from an absent one for a caller that only wants to know whether to route the read through readConfigStrict')

  const dirAsFileRoot = tmpdir('host-config-exists-dirasfile')
  fs.mkdirSync(configPath(dirAsFileRoot), { recursive: true })
  assert.strictEqual(configExists(dirAsFileRoot), true,
    'a directory occupying the config path must still read as true (existsSync semantics) — configExists never distinguishes a file from a directory at the path; a caller that needs readability calls readConfigStrict, which is where that distinction is made and surfaced')
})

test('AC-20260820-08-12: readConfig, readConfigStrict, and declaredForge continue to behave exactly as before this spec — no shape change at the export boundary that renames configPathFor to configPath', () => {
  const { readConfig, readConfigStrict, declaredForge } = require('../../spec/scripts/lib/host-config')
  // Deliberately NOT using the new configPath export here: this test pins OLD, untouched
  // behavior (AC-12 is expected green pre-migration), so it must not depend on the very export
  // D7 has not landed yet — that would make an unrelated regression pin fail for the wrong reason.
  const cfgPath = (root) => path.join(root, '.claude', 'spec.config.json')

  const absentRoot = tmpdir('host-config-api-absent')
  assert.deepStrictEqual(readConfig(absentRoot), {},
    'readConfig must still degrade to {} on an absent config — D7 renames the private path helper at the export boundary, it must not touch readConfig\'s own degrade contract')
  assert.throws(() => readConfigStrict(absentRoot), /cannot read\/parse/,
    'readConfigStrict must still throw naming "cannot read/parse" on an absent config — the export rename must not change the strict reader\'s fail-loud contract')

  const forgeRoot = tmpdir('host-config-api-forge')
  fs.mkdirSync(path.join(forgeRoot, '.claude'), { recursive: true })
  fs.writeFileSync(cfgPath(forgeRoot), JSON.stringify({ capabilities: { forge: 'github' } }))
  assert.strictEqual(declaredForge(forgeRoot), 'github',
    'declaredForge must still derive the declared forge capability from capabilities.forge — this is the one derivation every CI script shares, and it must not regress when configPathFor becomes the exported configPath underneath it')

  const noForgeRoot = tmpdir('host-config-api-noforge')
  assert.strictEqual(declaredForge(noForgeRoot), undefined,
    'declaredForge must still return undefined (the legacy-mode signal) when the config or the capabilities block is absent — undefined must never collapse to a falsy "none" that this function does not mean')
})

// AC-20260820-08-9: the seven remedy strings interpolate CONFIG_RELPATH instead of writing the
// literal. This is BEHAVIORAL — exec the scripts via runNode against a synthetic host and assert
// the rendered .claude/spec.config.json path appears in the process's actual output, rather than
// reading the source for the substring (a source-grep pin here would prove nothing about what a
// user actually sees on the terminal).

test('AC-20260820-08-9: review-legs.js exits with a remedy naming .claude/spec.config.json when --root has no config (config degrades to {}, so gateCommand is reported missing)', () => {
  const root = tmpdir('host-config-api-review-legs')
  // No .claude/spec.config.json under root at all: readConfig(root) degrades to {} (D7/AC-12
  // leaves this untouched), so review-legs.js's own gateCommand guard is what actually fires —
  // the reachable remedy path. review-legs.js's OTHER remedy string, guarding a readConfig()
  // throw, is unreachable by execution: readConfig() never throws (it swallows every read/parse
  // failure to {} internally, per AC-12), so that branch is dead code under every --root value.
  const manifest = path.join(tmpdir('host-config-api-manifest'), 'manifest.jsonl')
  const r = runNode('scripts/review-legs.js', [
    '--root', root, '--spec', 'specs/does-not-matter.md', '--base', 'HEAD', '--manifest', manifest,
  ])
  assert.strictEqual(r.status, 2,
    'a --root with no config and so no gateCommand must be a usage/precondition failure (exit 2), not a leg run: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /\.claude\/spec\.config\.json/,
    'review-legs.js\'s remedy for a missing gateCommand must render the path .claude/spec.config.json (via CONFIG_RELPATH) so an operator knows exactly which file to create — a bare "spec.config.json" or an interpolation bug silently makes the remedy less actionable: ' + r.stderr)
})

test('AC-20260820-08-9: fidelity-check.js reports an unreadable declared copy catalog by naming .claude/spec.config.json design.copyCatalogs', () => {
  const root = tmpdir('host-config-api-fidelity-root')
  const sidecar = path.join(root, 'spec.design')
  fs.mkdirSync(sidecar, { recursive: true })
  fs.writeFileSync(path.join(sidecar, 'slice-s1.html'), '<div><span>Hi</span></div>')
  fs.writeFileSync(path.join(sidecar, 'extract.json'), JSON.stringify({
    schemaVersion: 2,
    surfaces: [{ id: 's1', sliceFile: 'slice-s1.html', strings: ['Hi'], layout: [] }],
  }))
  fs.writeFileSync(path.join(sidecar, 'skeletons.json'), JSON.stringify({
    skeletons: [{ id: 's1', decision: 'author', componentPath: 'src/S1.tsx',
      sliceRef: 'slice-s1.html', states: ['default'], tokens: ['surface'] }],
  }))
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
  // Declares a copy catalog that does not exist on disk — the declared-but-unreadable case D9/D10
  // migrate the remedy for.
  fs.writeFileSync(path.join(root, '.claude', 'spec.config.json'),
    JSON.stringify({ design: { copyCatalogs: ['app/messages/en.json'] } }))
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.writeFileSync(path.join(root, 'src', 'S1.tsx'), 'Hi')

  const r = runNode('scripts/fidelity-check.js', [sidecar, '--repo-root', root])
  assert.strictEqual(r.status, 1,
    'an undeclared-on-disk copy catalog must be an unexcused finding (exit 1), not a silent pass: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /\.claude\/spec\.config\.json design\.copyCatalogs/,
    'fidelity-check.js\'s remedy for an unreadable declared catalog must render ".claude/spec.config.json design.copyCatalogs" (via CONFIG_RELPATH) so an operator knows both which file declares the catalog and which key to fix — D10 adds the .claude/ prefix that was missing before: ' + r.stderr)
})
