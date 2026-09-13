'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, read } = require('../helpers')

// Owner: specs/20260912/09-a-mock-may-not-invent.md
// AC-20260912-09-1, AC-20260912-09-2, AC-20260912-09-3, AC-20260912-09-4, AC-20260912-09-5,
// AC-20260912-09-6, AC-20260912-09-7, AC-20260912-09-8.

// The same no-CSS-parser class-name extraction design-atlas.js's own hygiene checks use
// (flat `selector { declarations }` pairs, no @media/nesting) — used here only to derive the
// shared kit's real class count from the plugin's own template, never a hardcoded literal (D5:
// "computed at run time from the template, never a literal, so the cap moves with the shared
// kit").
function classNamesInCss(css) {
  // Strip /* ... */ comments first: wire.css's own header comment contains dot-tokens
  // (.md, .css, .js, calc(var(--radius) * 0.6|0.8|1.4)) that a naive selector scan would
  // misread as class names, inflating the derived cap past the true rule-body count.
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const names = new Set()
  for (const m of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const c of m[1].matchAll(/\.([-\w]+)/g)) names.add(c[1])
  }
  return names
}
const WIRE_CLASSES = classNamesInCss(read('spec/templates/mocks/wire.css'))
const WIRE_CAP = WIRE_CLASSES.size

function syntheticClasses(n) {
  const arr = []
  for (let i = 0; i < n; i++) arr.push('zzsynth' + i)
  return arr
}

// A labelled, non-canon, bound mock: links the wire register by default (D2's binding
// predicate), carries no <style> block and no style= attribute unless asked for one, so each
// test below isolates exactly one D3-D8 rule via a single addition.
function boundMockHtml({ label, status = 'approved',
  links = ['../wire/tokens.css', '../wire/wire.css'], styleBlock, styleAttr, extraBody = '' } = {}) {
  const linkTags = links.map((h) => '<link rel="stylesheet" href="' + h + '">\n').join('')
  const style = styleBlock !== undefined ? '<style>' + styleBlock + '</style>\n' : ''
  const attr = styleAttr !== undefined ? ' style="' + styleAttr + '"' : ''
  return linkTags + style +
    '<main data-screen-label="' + label + '" data-status="' + status + '"' + attr + '>' +
    label + extraBody + '</main>\n'
}

function writeFile(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
}

test('AC-20260912-09-1: design-atlas.js check names an unpermitted stylesheet a bound mock links under wire/, and reports no such violation once it links wire/project.css in its place', () => {
  const dir = tmpdir('mock-invention-links-')
  const mockPath = path.join(dir, 'design/mocks/lobby.html')
  writeFile(mockPath, boundMockHtml({
    label: 'lobby',
    links: ['../wire/tokens.css', '../wire/wire.css', '../wire/custom.css'],
  }))
  const bad = runNode('scripts/design-atlas.js', ['check', path.dirname(mockPath)])
  assert.strictEqual(bad.status, 1,
    'a bound mock linking an unpermitted stylesheet under wire/ must fail the check: ' + bad.stdout + bad.stderr)
  assert.match(bad.stdout, /custom\.css/,
    'the violation must name the unpermitted stylesheet (custom.css) so the author knows which link to remove: ' + bad.stdout)

  writeFile(mockPath, boundMockHtml({
    label: 'lobby',
    links: ['../wire/tokens.css', '../wire/wire.css', '../wire/project.css'],
  }))
  const ok = runNode('scripts/design-atlas.js', ['check', path.dirname(mockPath)])
  assert.strictEqual(ok.status, 0,
    'a bound mock linking only wire/tokens.css, wire/wire.css and wire/project.css must report no stylesheet-permission violation: ' + ok.stdout + ok.stderr)
})

test('AC-20260912-09-2: design-atlas.js check names one <style>-rule violation and one inline style= violation on a bound mock carrying both, and names neither when the only <style> block is an @import', () => {
  const dir = tmpdir('mock-invention-style-')
  const mockPath = path.join(dir, 'design/mocks/lobby.html')
  writeFile(mockPath, boundMockHtml({
    label: 'lobby',
    styleBlock: '.callbar{gap:8px}',
    styleAttr: 'margin:0',
  }))
  const bad = runNode('scripts/design-atlas.js', ['check', path.dirname(mockPath)])
  assert.match(bad.stdout, /1 <style> rule\(s\)/,
    'a bound mock declaring one <style> rule of its own must be named for exactly that count — a screen carries no styles of its own: ' + bad.stdout)
  assert.match(bad.stdout, /1 inline style= attribute\(s\)/,
    'a bound mock carrying one inline style= attribute must be named for exactly that count: ' + bad.stdout)

  writeFile(mockPath, boundMockHtml({
    label: 'lobby',
    styleBlock: '@import "../wire/tokens.css";',
  }))
  const ok = runNode('scripts/design-atlas.js', ['check', path.dirname(mockPath)])
  assert.ok(!/<style> rule\(s\)/.test(ok.stdout),
    'a <style> block containing only an @import is a link, not an invented style, and must never trip the <style>-rule violation: ' + ok.stdout)
  assert.ok(!/inline style= attribute\(s\)/.test(ok.stdout),
    'the @import-only mock carries no style= attribute and must never trip that violation either: ' + ok.stdout)
})

test('AC-20260912-09-3: design-atlas.js check names exactly one redefinition violation for a project.css class the shared wire.css already declares, and never names one it does not', () => {
  const dir = tmpdir('mock-invention-redef-')
  writeFile(path.join(dir, 'design/mocks/lobby.html'), boundMockHtml({ label: 'lobby' }))
  writeFile(path.join(dir, 'design/wire/project.css'),
    '.btn { min-height: 44px }\n.callbar { gap: 8px }\n')
  const r = runNode('scripts/design-atlas.js', ['check', dir])
  const redefLines = r.stdout.match(/^.*redefines shared class\(es\).*$/gm) || []
  assert.strictEqual(redefLines.length, 1,
    'one redefinition violation is owed for the whole project kit, not one line per overriding class: ' + r.stdout)
  assert.match(redefLines[0], /\.btn\b/,
    '.btn is declared in both project.css and the shared wire.css, so the redefinition violation must name it: ' + redefLines[0])
  assert.ok(!/\.callbar\b/.test(redefLines[0]),
    '.callbar is not a shared wire.css class, so the redefinition violation must never name it: ' + redefLines[0])
})

test('AC-20260912-09-4: design-atlas.js check refuses a bound approved mock whose project kit exceeds the shared kit\'s own class count, and only warns (exit 0) for the same project kit above a sketch mock', () => {
  const dir = tmpdir('mock-invention-cap-')
  const overCap = WIRE_CAP + 1
  const projectCss = syntheticClasses(overCap).map((c) => '.' + c + ' { color: red }').join('\n') + '\n'
  writeFile(path.join(dir, 'design/wire/project.css'), projectCss)
  const mockPath = path.join(dir, 'design/mocks/lobby.html')

  writeFile(mockPath, boundMockHtml({ label: 'lobby', status: 'approved' }))
  const approvedR = runNode('scripts/design-atlas.js', ['check', dir])
  assert.strictEqual(approvedR.status, 1,
    'a project kit larger than the shared kit it extends is a violation once the mock above it is approved: ' + approvedR.stdout)
  assert.match(approvedR.stdout, new RegExp(overCap + ' classes, over the shared kit\'s own ' + WIRE_CAP),
    'the violation must state both the project kit\'s own class count and the shared kit\'s cap: ' + approvedR.stdout)

  writeFile(mockPath, boundMockHtml({ label: 'lobby', status: 'sketch' }))
  const sketchR = runNode('scripts/design-atlas.js', ['check', '--verbose', dir])
  assert.strictEqual(sketchR.status, 0,
    'the same over-cap project kit above a sketch mock is a warn, never a violation, and must not fail the check: ' + sketchR.stdout)
  assert.ok(sketchR.stdout.includes(String(overCap)) && sketchR.stdout.includes(String(WIRE_CAP)),
    'the sketch-stage warn must carry the same two counts (the project kit\'s size and the shared kit\'s cap) the approved-stage violation states: ' + sketchR.stdout)
  assert.match(sketchR.stdout, /⚠️/,
    'exceeding the cap above a sketch mock must print as a ⚠️ warn, not silently: ' + sketchR.stdout)
})

test('AC-20260912-09-5: design-atlas.js check warns once for a project-kit class used on exactly one of several bound mocks in a run, and never warns when only one mock is checked', () => {
  const dir = tmpdir('mock-invention-single-screen-')
  writeFile(path.join(dir, 'design/wire/project.css'),
    '.callbar-aux { gap: 4px }\n.rowend { display: flex }\n')
  writeFile(path.join(dir, 'design/mocks/a.html'),
    boundMockHtml({ label: 'a', extraBody: '<div class="callbar-aux"></div>' }))
  writeFile(path.join(dir, 'design/mocks/b.html'),
    boundMockHtml({ label: 'b', extraBody: '<div class="rowend"></div>' }))
  writeFile(path.join(dir, 'design/mocks/c.html'),
    boundMockHtml({ label: 'c', extraBody: '<div class="rowend"></div>' }))

  const multi = runNode('scripts/design-atlas.js', ['check', '--verbose', dir])
  const hits = multi.stdout.match(/used on one screen only/g) || []
  assert.strictEqual(hits.length, 1,
    'exactly one project-kit class (callbar-aux) is used on exactly one of the three visited screens; a class used on two screens must never be named by this warn: ' + multi.stdout)
  assert.match(multi.stdout, /callbar-aux: used on one screen only \(a\)/,
    'the single-screen warn must name both the class and the one label that carries it: ' + multi.stdout)
  assert.ok(!/rowend: used on one screen only/.test(multi.stdout),
    'rowend is used on two of the three screens and must never be named by the single-screen warn: ' + multi.stdout)

  const single = runNode('scripts/design-atlas.js',
    ['check', '--verbose', path.join(dir, 'design/mocks/a.html')])
  assert.ok(!/used on one screen only/.test(single.stdout),
    'checking a single file visits fewer than two bound mocks, so the single-screen warn is meaningless and must never print: ' + single.stdout)
})

test('AC-20260912-09-7: design-atlas.js check reports no missing box-sizing hygiene violation for a bound mock with no <style> block that links the wire register', () => {
  const dir = tmpdir('mock-invention-hygiene-satisfied-')
  writeFile(path.join(dir, 'design/mocks/lobby.html'), boundMockHtml({
    label: 'lobby',
    links: ['../wire/tokens.css', '../wire/wire.css'],
  }))
  const r = runNode('scripts/design-atlas.js', ['check', path.join(dir, 'design/mocks')])
  assert.ok(!/no universal box-sizing: border-box rule/.test(r.stdout),
    'linking the wire register already carries a universal box-sizing: border-box rule — a bound mock with no <style> block of its own must not be told it is missing one: ' + r.stdout)
})

test('AC-20260912-09-8: design-atlas.js check SHALL CONTINUE TO report the missing box-sizing hygiene violation for a bound mock with no <style> block that links neither wire/tokens.css nor wire/wire.css', () => {
  const dir = tmpdir('mock-invention-hygiene-unsatisfied-')
  writeFile(path.join(dir, 'design/mocks/lobby.html'), boundMockHtml({
    label: 'lobby',
    links: ['../tokens.css'],
  }))
  const r = runNode('scripts/design-atlas.js', ['check', path.join(dir, 'design/mocks')])
  assert.match(r.stdout, /no universal box-sizing: border-box rule/,
    'a bound mock outside the wire register still owes its own box-sizing reset — D8\'s new satisfying route binds only to a wire-register link, so this rule must keep firing here: ' + r.stdout)
})

// D7's promised measured line has no exec pin anywhere in the suite: AC-20260912-09-6's own
// carrier (tests/mocks/kit-layers.test.js) asserts only layoutShare()'s pure return value, never
// a process invocation, so the once-per-project-kit ⓘ line design-atlas.js check actually prints
// can regress in shape, in whether it fires more than once per run, or in whether it prints at
// all, with every gate green. This test execs the real check against a synthetic resolved
// project kit and pins stdout directly.
test('AC-20260912-09-6: design-atlas.js check prints exactly one ⓘ project kit: line per resolved project kit, stating the computed class count against the template-derived cap, the rule count, and the rounded-half-up layout share, even when the run visits several bound mocks', () => {
  const dir = tmpdir('mock-invention-kit-line-')
  // .a is layout-only (display), .b is styling-only (color), .c is layout-only (padding): 3
  // rules, 2 of them layout, so layoutShare's rounded-half-up percent is Math.round(2/3*100) =
  // 67 — a non-round fraction, so the pin cannot pass by coincidence of the numbers chosen.
  writeFile(path.join(dir, 'design/wire/project.css'),
    '.a { display: flex }\n.b { color: red }\n.c { padding: 4px }\n')
  writeFile(path.join(dir, 'design/mocks/a.html'), boundMockHtml({ label: 'a' }))
  writeFile(path.join(dir, 'design/mocks/b.html'), boundMockHtml({ label: 'b' }))
  writeFile(path.join(dir, 'design/mocks/c.html'), boundMockHtml({ label: 'c' }))

  const r = runNode('scripts/design-atlas.js', ['check', dir])
  assert.strictEqual(r.status, 0,
    'three classes over a 23-class cap with no shared-class redefinition must pass the check cleanly, so any non-zero exit means something else broke: ' + r.stdout + r.stderr)

  const hits = r.stdout.match(/ⓘ project kit:.*$/gm) || []
  assert.strictEqual(hits.length, 1,
    'the run visits three bound mocks sharing one project kit; D7 promises the measured line once per resolved project kit, not once per screen, so anything other than exactly one hit means it either never printed or printed per screen: ' + r.stdout)
  assert.strictEqual(hits[0],
    'ⓘ project kit: 3/' + WIRE_CAP + ' classes · 3 rules · layout share 67% (2 of 3)',
    'the line must state the project kit\'s own class count against the template-derived cap (never a hardcoded literal, computed here the same way from spec/templates/mocks/wire.css), the rule count, and the rounded-half-up layout share as D7 specifies it: ' + r.stdout)
})
