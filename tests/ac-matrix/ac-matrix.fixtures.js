'use strict'
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { runNode } = require('../helpers')

// specs/20260908/03-test-fixture-dedupe.md D3: the five byte-identical helpers shared by
// owning-spec-env.test.js and qualified-skip-mapping.test.js, lifted verbatim into one module.

function specMd(acLines, filePlanRows) {
  return '# Test Spec\n\n## Acceptance Criteria\n\n' + acLines.join('\n') + '\n\n' +
    '## File Plan\n\n| Path | Action | Layer | Summary |\n|------|--------|-------|---------|\n' +
    filePlanRows.join('\n') + '\n'
}

function writeManifest(dir, lines) {
  const p = path.join(dir, 'manifest.jsonl')
  fs.writeFileSync(p, lines.map(l => JSON.stringify(l)).join('\n') + (lines.length ? '\n' : ''))
  return p
}

function run(specPath, root, manifestPath, extraArgs = []) {
  return runNode('scripts/ac-matrix.js',
    ['--spec', specPath, '--root', root, '--manifest', manifestPath, ...extraArgs])
}

function findings(res) {
  let parsed
  try { parsed = JSON.parse(res.stdout) } catch (e) {
    assert.fail(`--json output did not parse as JSON (status ${res.status}, stderr: ${res.stderr}): ${e.message}`)
  }
  return parsed
}

// A minimal spec-under-review host: one well-formed, covered AC unrelated to the case under
// test, so the run has valid AC/File Plan sections without affecting skip reconciliation.
// Returns { specPath, root, manifestPath } per the Contracts block; callers that only need the
// spec path destructure `specPath` — the empty manifest it also writes is a harmless superset
// of the bare spec-path shape the two test files' own former copies returned.
function baseHost(dir) {
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'tests/foo.test.js'), '// covers AC-20260814-01-1\n')
  const specPath = path.join(dir, 'spec.md')
  fs.writeFileSync(specPath, specMd(
    ['- **AC-20260814-01-1**: WHEN X THE SYSTEM SHALL Y → tests/foo.test.js'],
    ['| tests/foo.test.js | CREATE | tests | covers AC |']))
  const manifestPath = writeManifest(dir, [])
  return { specPath, root: dir, manifestPath }
}

module.exports = { specMd, writeManifest, run, findings, baseHost }
