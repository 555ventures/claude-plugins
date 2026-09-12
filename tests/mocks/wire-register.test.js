'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { read, tmpdir, runNode } = require('../helpers')
const {
  SCRIPT, mark, writeFile, decideLook,
  advanceToJourneyWalked,
} = require('./mocks-driver-fixtures')

// Owner: specs/20260912/08-the-register-is-the-whole-shadcn-set.md
// AC-20260912-08-1, AC-20260912-08-2, AC-20260912-08-3, AC-20260912-08-7, AC-20260912-08-8.

test('AC-20260912-08-1: --mark theme-picked refuses a candidate that re-values only the retired eleven roles, naming every one of the ten missing colour roles plus --shadow-lg', () => {
  const dir = tmpdir('theme-red-')
  advanceToJourneyWalked(dir) // gets a signed-off design/kit/ on disk, the one precondition composeViolations needs before it even opens the candidate's tokens.css
  writeFile(path.join(dir, 'design/theme/a/tokens.css'),
    ':root{--bg:#fff;--fg:#111;--muted:#666;--muted-bg:#f0f0f0;--border:#ddd;--primary:#222;' +
    '--primary-fg:#fff;--ring:#999;--radius:8px;--font:sans-serif;--shadow:0 1px 2px rgba(0,0,0,.1)}\n')
  decideLook(dir, 'theme-picked', 'pick', { pick: 'a', others: [], by: 'jj' })
  const r = mark(dir, 'theme-picked', ['--direction', 'a'])
  assert.notStrictEqual(r.status, 0,
    'a candidate declaring only the retired eleven roles must be refused, never accepted, once the register grows to eighteen colour roles: ' + r.stdout + r.stderr)
  const expectedMissing = [
    '--background', '--foreground', '--card', '--card-foreground', '--popover',
    '--popover-foreground', '--primary-foreground', '--secondary', '--secondary-foreground',
    '--muted-foreground', '--accent', '--accent-foreground', '--destructive', '--input', '--shadow-lg',
  ]
  for (const role of expectedMissing) {
    assert.ok(r.stderr.includes(role),
      'the refusal must name ' + role + ' as a role the candidate never re-values: ' + r.stderr)
  }
})

test('AC-20260912-08-2: wire-tokens.css\'s :root declares exactly the twenty-two shadcn-Neutral roles, --muted/--muted-foreground carry the surface/text pairing the retired register had inverted, and none of the four retired short names appear', () => {
  const css = read('spec/templates/mocks/wire-tokens.css')
  const rootMatch = /:root\s*\{([^}]*)\}/.exec(css)
  assert.ok(rootMatch, 'wire-tokens.css must declare a :root block — the role-completeness leg reads it at run time: ' + css.slice(0, 200))
  const declared = []
  const valueOf = {}
  const declRe = /--([a-zA-Z0-9-]+)\s*:\s*([^;]+);/g
  let mm
  while ((mm = declRe.exec(rootMatch[1]))) { declared.push(mm[1]); valueOf[mm[1]] = mm[2].trim() }
  const expected = [
    'background', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground',
    'primary', 'primary-foreground', 'secondary', 'secondary-foreground', 'muted', 'muted-foreground',
    'accent', 'accent-foreground', 'destructive', 'border', 'input', 'ring', 'radius', 'font',
    'shadow', 'shadow-lg',
  ]
  assert.deepStrictEqual([...declared].sort(), [...expected].sort(),
    'the :root block must declare exactly the twenty-two shadcn-Neutral colour roles plus --radius and the three pipeline-local roles, no more and no fewer: got ' + JSON.stringify(declared))
  assert.strictEqual(valueOf.muted, 'oklch(0.97 0 0)',
    '--muted must resolve to the shadcn surface value, not the retired --muted text-colour meaning: got ' + valueOf.muted)
  assert.strictEqual(valueOf['muted-foreground'], 'oklch(0.556 0 0)',
    '--muted-foreground must carry the retired --muted role\'s text value now that the two names have swapped: got ' + valueOf['muted-foreground'])
  for (const retired of ['bg', 'fg', 'muted-bg', 'primary-fg']) {
    assert.ok(!new RegExp('--' + retired + '(?![\\w-])').test(css),
      'the retired short name --' + retired + ' must not appear anywhere in wire-tokens.css: ' + css)
  }
})

test('AC-20260912-08-3: wire.css\'s var() references all name a role wire-tokens.css declares, no retired short name is referenced, and every border-radius resolves through the shadcn four-step scale (or a deliberate 9999px pill)', () => {
  const tokensCss = read('spec/templates/mocks/wire-tokens.css')
  const wireCss = read('spec/templates/mocks/wire.css')
  const rootMatch = /:root\s*\{([^}]*)\}/.exec(tokensCss)
  assert.ok(rootMatch, 'wire-tokens.css must declare a :root block for its roles to be cross-checked against wire.css: ' + tokensCss.slice(0, 200))
  const declaredRoles = new Set()
  const declRe = /--([a-zA-Z0-9-]+)\s*:/g
  let mm
  while ((mm = declRe.exec(rootMatch[1]))) declaredRoles.add(mm[1])

  // Strip /* … */ comments first — wire.css's own header prose names a literal "var(--role)"
  // placeholder that would otherwise misread as a declaration reference.
  const wireCssCode = wireCss.replace(/\/\*[\s\S]*?\*\//g, '')
  const varRefs = wireCssCode.match(/var\(--[a-zA-Z0-9-]+\)/g) || []
  const undeclared = varRefs.filter((v) => !declaredRoles.has(v.slice(6, -1)))
  assert.deepStrictEqual(undeclared, [],
    'every var(--role) in wire.css must name a role wire-tokens.css declares — a leftover or invented role drifts the register out from under design-atlas.js check: ' + JSON.stringify(undeclared))

  for (const retired of ['bg', 'fg', 'muted-bg', 'primary-fg']) {
    assert.ok(!wireCssCode.includes('var(--' + retired + ')'),
      'wire.css must not reference the retired role --' + retired + ' — D6 renames it')
  }

  const radii = wireCssCode.match(/border-radius:\s*[^;]+;/g) || []
  assert.ok(radii.length > 0, 'wire.css must declare at least one border-radius for the scale to bind: ' + wireCss.length)
  const allowed = new Set([
    'calc(var(--radius) * 0.6)', 'calc(var(--radius) * 0.8)', 'var(--radius)',
    'calc(var(--radius) * 1.4)', '9999px',
  ])
  for (const decl of radii) {
    const value = decl.replace(/^border-radius:\s*/, '').replace(/;$/, '').trim()
    assert.ok(allowed.has(value),
      'every border-radius in wire.css must be one of the shadcn scale steps or the deliberate 9999px pill, never a raw length or a hand-rolled calc: got "' + value + '" from "' + decl + '"')
  }
})

test('AC-20260912-08-7: wire.css declares no box-shadow whose colour argument is an opaque surface role — the string var(--muted-bg) is gone, and .sheet\'s elevation is var(--shadow-lg)', () => {
  const wireCss = read('spec/templates/mocks/wire.css')
  assert.ok(!wireCss.includes('var(--muted-bg)'),
    'the second shadow layer must not pass the opaque surface role --muted-bg as a shadow colour — var(--muted-bg) must appear nowhere in wire.css: ' + (wireCss.match(/box-shadow:[^;]+;/g) || []).join(' | '))
  const sheetMatch = /\.sheet\s*\{([^}]*)\}/.exec(wireCss)
  assert.ok(sheetMatch, '.sheet must be a declared class in wire.css for its shadow rule to be checkable: ' + wireCss.slice(0, 80))
  assert.match(sheetMatch[1], /box-shadow:\s*var\(--shadow-lg\)\s*;/,
    '.sheet\'s elevation must be exactly var(--shadow-lg) — a pipeline role a theme re-values like any other, not a two-layer shadow naming an opaque surface role: got "' + sheetMatch[1].trim() + '"')
})

test('AC-20260912-08-8: design-atlas.js check continues to report no off-token colour violation for a labelled mock whose linked tokens.css values are oklch() — the colour-literal sweep reads the mock\'s own markup, never the linked register', () => {
  const dir = tmpdir('atlas-oklch-')
  fs.mkdirSync(path.join(dir, 'design/mocks'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'design/mocks/tokens.css'),
    ':root{--background:oklch(1 0 0);--foreground:oklch(0.145 0 0);--primary:oklch(0.205 0 0);' +
    '--primary-foreground:oklch(0.985 0 0);--muted:oklch(0.97 0 0);--muted-foreground:oklch(0.556 0 0)}\n')
  fs.writeFileSync(path.join(dir, 'design/mocks/a.html'),
    '<link rel="stylesheet" href="tokens.css">\n' +
    '<main data-screen-label="a" data-status="sketch">hello</main>\n')
  const r = runNode('scripts/design-atlas.js', ['check', path.join(dir, 'design/mocks')])
  assert.ok(!/off-token color literal/.test(r.stdout),
    'the colour-literal sweep reads the mock\'s own markup and inline styles, never the linked register — a tokens.css whose values are oklch() must never itself trip an off-token violation: ' + r.stdout)
})
