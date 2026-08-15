'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode } = require('./helpers')

const SCRIPT = 'scripts/fidelity-check.js'

// One surface (s1) mapped to src/S1.tsx by default; override any piece per test.
// `strings`/`layout` build a legacy (schemaVersion 2) extract — that compat path must keep
// working; `surfaces` passes full v3 surfaces (regions + entries).
function fixture({ strings = [], layout = [], files = {}, skeletons = null, deltas = null, slice = null,
  extract = null, surfaces = null, config = null } = {}) {
  const root = tmpdir('fid')
  const sidecar = path.join(root, 'spec.design')
  fs.mkdirSync(sidecar, { recursive: true })
  fs.writeFileSync(path.join(sidecar, 'slice-s1.html'),
    slice !== null ? slice : '<div>' + strings.map(s => '<span>' + s + '</span>').join('') + '</div>')
  fs.writeFileSync(path.join(sidecar, 'extract.json'), JSON.stringify(extract || {
    schemaVersion: surfaces ? 3 : 2,
    surfaces: surfaces || [{ id: 's1', sliceFile: 'slice-s1.html', strings, layout }],
  }))
  fs.writeFileSync(path.join(sidecar, 'skeletons.json'), JSON.stringify(skeletons || {
    skeletons: [{ id: 's1', decision: 'author', componentPath: 'src/S1.tsx',
      sliceRef: 'slice-s1.html', states: ['default'], tokens: ['surface'] }],
  }))
  if (deltas) fs.writeFileSync(path.join(sidecar, 'deltas.json'), JSON.stringify(deltas))
  if (config) {
    fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
    fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify(config))
  }
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(root, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, content)
  }
  return { root, sidecar }
}
const run = (f) => runNode(SCRIPT, [f.sidecar, '--repo-root', f.root])

test('clean pass: every mock string present, in order', () => {
  const f = fixture({
    strings: ['Email address', 'Send invite', 'Cancel'],
    files: { 'src/S1.tsx': 'label("Email address"); <Button>Send invite</Button>; <Button>Cancel</Button>' },
  })
  const res = run(f)
  assert.strictEqual(res.status, 0, res.stderr)
  assert.match(res.stdout, /clean/)
})

test('missing mock copy fails and names the string', () => {
  const f = fixture({
    strings: ['Send invite'],
    files: { 'src/S1.tsx': '<Button>Send</Button>' }, // the classic paraphrase loss
  })
  const res = run(f)
  assert.strictEqual(res.status, 1)
  assert.match(res.stderr, /Send invite/)
})

test('whitespace/entity variants still count as the same copy', () => {
  const f = fixture({
    strings: ['Email address'],
    files: { 'src/S1.tsx': '<label>Email&nbsp;address</label>' },
  })
  assert.strictEqual(run(f).status, 0)
})

test('reordered actions fail the order check', () => {
  const f = fixture({
    strings: ['Send invite', 'Cancel'], // mock: Send first
    files: { 'src/S1.tsx': '<Button>Cancel</Button><Button>Send invite</Button>' },
  })
  const res = run(f)
  assert.strictEqual(res.status, 1)
  assert.match(res.stderr, /order/)
})

test('layout primitive: Tailwind arbitrary-value form passes, absence fails', () => {
  const layout = [{ property: 'grid-template-columns', value: '1fr auto' }]
  const ok = fixture({ layout, files: { 'src/S1.tsx': '<div className="grid grid-cols-[1fr_auto]">' } })
  assert.strictEqual(run(ok).status, 0, run(ok).stderr)
  const bad = fixture({ layout, files: { 'src/S1.tsx': '<div className="flex flex-col">' } })
  const res = run(bad)
  assert.strictEqual(res.status, 1)
  assert.match(res.stderr, /grid-template-columns/)
})

test('camelCase style-object form of a layout primitive passes', () => {
  const f = fixture({
    layout: [{ property: 'flex-direction', value: 'column' }],
    files: { 'src/S1.tsx': 'style={{ flexDirection: "column" }}' },
  })
  assert.strictEqual(run(f).status, 0, run(f).stderr)
})

test('a delta with a verified slice quote excuses a divergence; a forged quote does not', () => {
  const args = {
    strings: ['Send invite'],
    files: { 'src/S1.tsx': '<Button>Send</Button>' },
  }
  const good = fixture({ ...args, deltas: { deltas: [{ surfaceId: 's1', kind: 'string', target: 'Send invite',
    sliceQuote: 'Send invite', proof: 'gate output: Button label max 6 chars (tokens/type.css:12)' }] } })
  const gres = run(good)
  assert.strictEqual(gres.status, 0, gres.stderr)
  assert.match(gres.stdout, /excused/)

  const forged = fixture({ ...args, deltas: { deltas: [{ surfaceId: 's1', kind: 'string', target: 'Send invite',
    sliceQuote: 'Revoke is a direct action', proof: 'UX: re-issuable in one click' }] } })
  const fres = run(forged)
  assert.strictEqual(fres.status, 1)
  assert.match(fres.stderr, /sliceQuote not found/)
})

test('a delta addressing a region label instead of a surface id gets the addressing error, not a quote error', () => {
  const f = fixture({
    strings: ['Send invite'],
    files: { 'src/S1.tsx': '<Button>Send</Button>' },
    deltas: { deltas: [{ surfaceId: 's1.handoff.provenance', kind: 'string', target: 'Send invite',
      sliceQuote: 'Send invite', proof: 'gate output: Button label max 6 chars' }] },
  })
  const res = run(f)
  assert.strictEqual(res.status, 1)
  assert.match(res.stderr, /unknown surfaceId "s1\.handoff\.provenance"/)
  assert.match(res.stderr, /known: s1/) // lists the real ids so the fix is one glance away
  assert.doesNotMatch(res.stderr, /sliceQuote not found/) // never blame the evidence for an addressing error
})

test('a verbatim carrier comment wrapped across // lines still matches contiguously', () => {
  const f = fixture({
    strings: ['We could not verify this claim against the primary source'],
    files: { 'src/S1.tsx':
      '// mock authority: "We could not verify this\n' +
      '// claim against the primary source"\n' +
      '<Note>{copy.unverified}</Note>' },
  })
  const res = run(f)
  assert.strictEqual(res.status, 0, res.stderr)
})

test('an UNMARKED comment quoting the mock does not satisfy copy — narration is not a render', () => {
  // The live escape: a fixtures-file aside quoting "All 24 markets ›" passed a bound copy
  // obligation for a link the code deliberately omits. Only `mock authority:` carriers count.
  const f = fixture({
    strings: ['All 24 markets'],
    files: { 'src/S1.tsx': '// (BTC-P survived) behind an "All 24 markets" link\n<List rows={markets} />' },
  })
  const res = run(f)
  assert.strictEqual(res.status, 1)
  assert.match(res.stderr, /All 24 markets/)
})

test('a delta row that excuses nothing is itself a failure — no dead exemptions', () => {
  const f = fixture({
    strings: ['Send invite'],
    slice: '<div><span>Send invite</span><span>Old line the mock dropped</span></div>',
    files: { 'src/S1.tsx': '<Button>Send invite</Button>' },
    deltas: { deltas: [{ surfaceId: 's1', kind: 'string', target: 'Old line the mock dropped',
      sliceQuote: 'Old line the mock dropped', proof: 'gate output: line removed in round 2' }] },
  })
  const res = run(f)
  assert.strictEqual(res.status, 1)
  assert.match(res.stderr, /excused nothing/)
})

test('a delta with an empty proof is itself a failure', () => {
  const f = fixture({
    strings: ['Send invite'],
    files: { 'src/S1.tsx': '<Button>Send</Button>' },
    deltas: { deltas: [{ surfaceId: 's1', kind: 'string', target: 'Send invite', sliceQuote: 'Send invite', proof: '  ' }] },
  })
  const res = run(f)
  assert.strictEqual(res.status, 1)
  assert.match(res.stderr, /proof/)
})

test('copy living in another skeleton-owned file (fixtures) passes with a note', () => {
  const f = fixture({
    strings: ['No members yet'],
    files: { 'src/S1.tsx': '<Empty text={emptyCopy} />', 'src/mocks.ts': 'export const emptyCopy = "No members yet"' },
    skeletons: { skeletons: [
      { id: 's1', decision: 'author', componentPath: 'src/S1.tsx', sliceRef: 'slice-s1.html', states: ['default'], tokens: ['x'] },
      { id: 'foundation', decision: 'author', componentPath: 'src/mocks.ts', states: ['default'], tokens: ['x'], tree: [{ el: 'x' }] },
    ] },
  })
  const res = run(f)
  assert.strictEqual(res.status, 0, res.stderr)
  assert.match(res.stdout, /note:.*mocks\.ts/)
})

test('a mapped file missing on disk fails (cannot verify)', () => {
  const f = fixture({ strings: ['Hi'], files: {} })
  const res = run(f)
  assert.strictEqual(res.status, 1)
  assert.match(res.stderr, /does not exist/)
})

test('no fidelity data (pre-contract extract) is a clean no-op; missing skeletons.json dies', () => {
  const f = fixture({ extract: { schemaVersion: 1, surfaces: [{ id: 's1', sliceFile: 'slice-s1.html' }] } })
  assert.strictEqual(run(f).status, 0)

  const g = fixture({ strings: ['Hi'], files: { 'src/S1.tsx': 'Hi' } })
  fs.rmSync(path.join(g.sidecar, 'skeletons.json'))
  assert.strictEqual(run(g).status, 2)
})

test('a mock surface with no bound region is a note, not a failure (spec covers a subset)', () => {
  const f = fixture({
    extract: { schemaVersion: 2, surfaces: [
      { id: 's1', sliceFile: 'slice-s1.html', strings: ['Hi'], layout: [] },
      { id: 'unplanned', sliceFile: 'slice-unplanned.html', strings: ['Elsewhere'], layout: [] },
    ] },
    files: { 'src/S1.tsx': 'Hi' },
  })
  fs.writeFileSync(path.join(f.sidecar, 'slice-s1.html'), '<span>Hi</span>')
  const res = run(f)
  assert.strictEqual(res.status, 0, res.stderr)
  assert.match(res.stdout, /note:.*unplanned.*no bound region/)
})

// Interpolation templates: mock SAMPLE DATA renders from props, not hardcoded literals — the
// gate must accept `Remove ${member.name}` for "Remove Jamie Chen" without opening a hole for
// shortened static copy.

test('composite string passes via a template-literal hole; bare instance data via catalog-entry fixture', () => {
  const f = fixture({
    strings: ['Remove Jamie Chen', 'Jamie Chen', 'Remove'],
    skeletons: { skeletons: [{ id: 's1', decision: 'author', componentPath: 'src/S1.tsx',
      catalogEntryPath: 'src/S1.stories.tsx', sliceRef: 'slice-s1.html', states: ['default'], tokens: ['surface'] }] },
    files: {
      'src/S1.tsx': 'const a = `Remove ${member.name}`; <Button aria-label={a}>Remove</Button>',
      'src/S1.stories.tsx': 'export const Default = { args: { member: { name: "Jamie Chen" } } }',
    },
  })
  const res = run(f)
  assert.strictEqual(res.status, 0, res.stderr)
  assert.match(res.stdout, /via interpolation template/)
})

test('JSX text run with an expression hole matches a composite string', () => {
  const f = fixture({
    strings: ['Invited May 3', 'May 3'],
    files: { 'src/S1.tsx': '<span>Invited {invitedAt}</span>; const at = "May 3"' },
  })
  assert.strictEqual(run(f).status, 0, run(f).stderr)
})

test('a pure-hole template excuses nothing — shortened copy still fails', () => {
  const f = fixture({
    strings: ['Send invite'],
    // `${label}` and {label} have no static segment: matching them would reopen the paraphrase hole
    files: { 'src/S1.tsx': 'const t = `${label}`; <Button>{label}</Button><Button>Send</Button>' },
  })
  const res = run(f)
  assert.strictEqual(res.status, 1)
  assert.match(res.stderr, /Send invite/)
})

test('templates are anchored: a non-hole edge cannot swallow extra mock copy', () => {
  const f = fixture({
    strings: ['Send invite'],
    // template `invite ${n}` matches "invite …" only from the start — not "Send invite"
    files: { 'src/S1.tsx': 'const t = `invite ${n}`' },
  })
  assert.strictEqual(run(f).status, 1)
})

test('bare instance data appearing nowhere in the pass still fails', () => {
  const f = fixture({
    strings: ['Jamie Chen'],
    files: { 'src/S1.tsx': 'const a = `Remove ${member.name}`' }, // template exists, fixture forgotten
  })
  const res = run(f)
  assert.strictEqual(res.status, 1)
  assert.match(res.stderr, /Jamie Chen/)
})

// ---- v2: region-scoped binding (schemaVersion 3) --------------------------------------------------

// One screen, two regions: the spec binds only the sidebar. Fail-closed applies INSIDE the bound
// region; the unbound region is a note — this is the fix for the all-or-nothing whole-screen trap.
const V3_SURFACE = {
  id: 'app', sliceFile: 'slice-s1.html',
  regions: [
    { id: 'root', label: null, source: 'root', parent: null },
    { id: 'sidebar', label: 'Sidebar', source: 'screen-label', parent: 'root' },
    { id: 'nav', label: 'nav', source: 'comment', parent: 'sidebar' },
    { id: 'thread', label: 'Thread', source: 'screen-label', parent: 'root' },
  ],
  entries: [
    { region: 'sidebar', kind: 'copy', value: 'New chat' },
    { region: 'nav', kind: 'copy', value: 'Workspace' },
    { region: 'thread', kind: 'copy', value: 'Weekly Investor Update' },
    { region: 'sidebar', kind: 'binding', value: 'b.name' },
    { region: 'sidebar', kind: 'sample', value: 'Acme Corp' },
    { region: 'sidebar', kind: 'template', value: 'Invited {{ date }}', segments: ['Invited', ''] },
  ],
  layout: [
    { region: 'sidebar', property: 'flex-direction', value: 'column' },
    { region: 'thread', property: 'grid-template-columns', value: '1fr auto' },
  ],
}
const sidebarSkeleton = (files = {}) => ({
  skeletons: [{ id: 'sidebar-comp', decision: 'author', componentPath: 'src/Sidebar.tsx',
    catalogEntryPath: 'src/Sidebar.stories.tsx', regionRef: 'app#sidebar', states: ['default'], tokens: ['surface'], ...files }],
})

test('regionRef: bound region checked fail-closed; unbound region skipped with a note', () => {
  const f = fixture({
    surfaces: [V3_SURFACE],
    skeletons: sidebarSkeleton(),
    files: {
      // 'Workspace' (nav ⊂ sidebar) and 'Invited' present; thread's copy + layout ABSENT — must not fail
      'src/Sidebar.tsx': '<aside style={{flexDirection:"column"}}><button>New chat</button><span>Workspace</span><i>Invited {date}</i></aside>',
      'src/Sidebar.stories.tsx': 'export const Default = { args: { name: "Acme Corp" } }',
    },
  })
  const res = run(f)
  assert.strictEqual(res.status, 0, res.stderr)
  assert.match(res.stdout, /note:.*thread.*not claimed/, 'unbound region must surface as a coverage note')
  assert.match(res.stdout, /binding\(s\) skipped/, 'mustache bindings are prop obligations, not grep rows')
})

test('regionRef: binding a region covers its subtree — a missing child-region string fails', () => {
  const f = fixture({
    surfaces: [V3_SURFACE],
    skeletons: sidebarSkeleton(),
    files: {
      'src/Sidebar.tsx': '<aside style={{flexDirection:"column"}}><button>New chat</button><i>Invited {date}</i></aside>', // 'Workspace' (nav) missing
      'src/Sidebar.stories.tsx': 'export const Default = { args: { name: "Acme Corp" } }',
    },
  })
  const res = run(f)
  assert.strictEqual(res.status, 1)
  assert.match(res.stderr, /\[nav\]: copy "Workspace" missing/)
})

test('regionRef: sample data must appear in the pass; a mock template with lost static copy fails', () => {
  const noSample = fixture({
    surfaces: [V3_SURFACE],
    skeletons: sidebarSkeleton(),
    files: {
      'src/Sidebar.tsx': '<aside style={{flexDirection:"column"}}><button>New chat</button><span>Workspace</span><i>Invited {date}</i></aside>',
      'src/Sidebar.stories.tsx': 'export const Default = {}', // fixture forgot "Acme Corp"
    },
  })
  const r1 = run(noSample)
  assert.strictEqual(r1.status, 1)
  assert.match(r1.stderr, /sample "Acme Corp" missing/)

  const noTemplate = fixture({
    surfaces: [V3_SURFACE],
    skeletons: sidebarSkeleton(),
    files: {
      'src/Sidebar.tsx': '<aside style={{flexDirection:"column"}}><button>New chat</button><span>Workspace</span></aside>', // 'Invited' static segment lost
      'src/Sidebar.stories.tsx': 'export const Default = { args: { name: "Acme Corp" } }',
    },
  })
  const r2 = run(noTemplate)
  assert.strictEqual(r2.status, 1)
  assert.match(r2.stderr, /template "Invited \{\{ date \}\}"/)
})

test('regionRef naming a region the extract does not know is a loud failure', () => {
  const f = fixture({
    surfaces: [V3_SURFACE],
    skeletons: { skeletons: [{ id: 'x', decision: 'author', componentPath: 'src/X.tsx',
      regionRef: 'app#composer', states: ['default'], tokens: ['x'] }] },
    files: { 'src/X.tsx': 'x' },
  })
  const res = run(f)
  assert.strictEqual(res.status, 1)
  assert.match(res.stderr, /unknown region "composer"/)
})

test('regionRefs array binds several regions; layout is checked per bound region only', () => {
  const f = fixture({
    surfaces: [V3_SURFACE],
    skeletons: { skeletons: [{ id: 'shell', decision: 'author', componentPath: 'src/Shell.tsx',
      catalogEntryPath: 'src/Shell.stories.tsx',
      regionRefs: ['app#sidebar', 'app#thread'], states: ['default'], tokens: ['x'] }] },
    files: {
      'src/Shell.tsx': '<div className="grid grid-cols-[1fr_auto]"><aside style={{flexDirection:"column"}}>' +
        '<button>New chat</button><span>Workspace</span><i>Invited {date}</i></aside><main>Weekly Investor Update</main></div>',
      'src/Shell.stories.tsx': 'export const Default = { args: { name: "Acme Corp" } }',
    },
  })
  const res = run(f)
  assert.strictEqual(res.status, 0, res.stderr)
})

// ---- v2: copy catalogs (the i18n home) ------------------------------------------------------------

test('mock copy found as an i18n catalog VALUE passes; catalog key order never fails the order check', () => {
  const f = fixture({
    surfaces: [V3_SURFACE],
    skeletons: sidebarSkeleton(),
    config: { design: { copyCatalogs: ['app/messages/en.json'] } },
    files: {
      // components carry m.*() calls, zero literals — the i18n-lint reality
      'src/Sidebar.tsx': '<aside style={{flexDirection:"column"}}><button>{m.nav_new_chat()}</button><span>{m.nav_workspace()}</span><i>Invited {date}</i></aside>',
      'src/Sidebar.stories.tsx': 'export const Default = { args: { name: "Acme Corp" } }',
      // catalog order is REVERSED vs the mock — must not trip the order check
      'app/messages/en.json': JSON.stringify({ nav_workspace: 'Workspace', nav_new_chat: 'New chat' }),
    },
  })
  const res = run(f)
  assert.strictEqual(res.status, 0, res.stderr)
  assert.match(res.stdout, /via copy catalog/)
})

test('a catalog value with a {hole} template-matches composite mock copy', () => {
  const surface = { ...V3_SURFACE, entries: [{ region: 'sidebar', kind: 'copy', value: 'Invited May 3' }], layout: [] }
  const f = fixture({
    surfaces: [surface],
    skeletons: sidebarSkeleton(),
    config: { design: { copyCatalogs: ['app/messages/en.json'] } },
    files: {
      'src/Sidebar.tsx': '<i>{m.invited_at({ date })}</i>',
      'src/Sidebar.stories.tsx': 'x',
      'app/messages/en.json': JSON.stringify({ invited_at: 'Invited {date}' }),
    },
  })
  assert.strictEqual(run(f).status, 0, run(f).stderr)
})

test('a declared catalog that does not exist on disk is a loud failure, not a silent skip', () => {
  const f = fixture({
    strings: ['Hi'],
    config: { design: { copyCatalogs: ['app/messages/en.json'] } },
    files: { 'src/S1.tsx': 'Hi' },
  })
  const res = run(f)
  assert.strictEqual(res.status, 1)
  assert.match(res.stderr, /copy catalog app\/messages\/en\.json.*not readable/)
})

// ---- over-claim detection (spec 20260814/02 D5) ---------------------------------------------------
// A root-bound skeleton (bare-surface ref / legacy sliceRef / id == surface id) claims every
// region of the surface, including chrome no shipped screen renders. When the pass fully
// satisfies one obligation-bearing child region while fully missing another, that shape IS the
// naming-collision incident (PRAX-20260804-02) — the fix names the true cause directly instead of
// leaving the reader to infer it from an unexplained missing-chrome-copy finding.
const ROOT_BOUND_SURFACE = {
  id: 'screen', sliceFile: 'slice-s1.html',
  regions: [
    { id: 'root', label: null, source: 'root', parent: null },
    { id: 'form', label: 'Form', source: 'screen-label', parent: 'root' },
    { id: 'chrome', label: 'Chrome', source: 'screen-label', parent: 'root' },
  ],
  entries: [
    { region: 'form', kind: 'copy', value: 'Email address' },
    { region: 'chrome', kind: 'copy', value: 'Sign out' },
  ],
  layout: [],
}
const rootBoundSkeleton = () => ({
  skeletons: [{ id: 'screen', decision: 'author', componentPath: 'src/Screen.tsx',
    sliceRef: 'slice-s1.html', states: ['default'], tokens: ['surface'] }],
})

test('AC-20260814-02-7: a root-bound skeleton whose pass fully implements one child region and fully misses another gets the over-claim diagnosis naming the implemented region', () => {
  const f = fixture({
    surfaces: [ROOT_BOUND_SURFACE],
    skeletons: rootBoundSkeleton(),
    files: { 'src/Screen.tsx': '<label>Email address</label>' }, // 'Sign out' (chrome) never renders
  })
  const res = run(f)
  assert.strictEqual(res.status, 1, 'the missing chrome copy must still fail the gate — the diagnosis re-labels why the finding fired, it never suppresses it')
  assert.match(res.stderr, /copy "Sign out" missing/,
    'the underlying unexcused finding for the fully-unreferenced chrome region must still print')
  assert.match(res.stderr, /over-claim: skeleton 'screen' binds all of 'screen'/,
    'a root-bound skeleton with one fully-satisfied and one fully-unreferenced obligation-bearing child region must get a prepended over-claim diagnosis naming the skeleton and surface — this is the mechanized fix for the fidelity refusal misdiagnosing a naming collision as missing chrome copy')
  assert.match(res.stderr, /\[form\] are implemented/,
    'the diagnosis must name the fully-implemented region (form), not the fully-missing one (chrome), as what the skeleton actually covers')
  assert.match(res.stderr, /bind those regions and name the skeleton distinctly/,
    'the diagnosis must suggest the remedy: bind the implemented region(s) explicitly and rename the skeleton away from the bare surface id')
})

test('AC-20260814-02-7: findings spread across every obligation-bearing child region never trigger the over-claim diagnosis', () => {
  const f = fixture({
    surfaces: [ROOT_BOUND_SURFACE],
    skeletons: rootBoundSkeleton(),
    files: { 'src/Screen.tsx': '<div>nothing renders here</div>' }, // both form and chrome fully missing
  })
  const res = run(f)
  assert.strictEqual(res.status, 1, 'both regions failing must still fail the gate')
  assert.match(res.stderr, /copy "Email address" missing/, 'the form region finding must still print')
  assert.match(res.stderr, /copy "Sign out" missing/, 'the chrome region finding must still print')
  assert.doesNotMatch(res.stderr, /over-claim:/,
    'when no obligation-bearing child region is fully satisfied there is no "subset actually implemented" to name — the diagnosis must not fire on a plain across-the-board miss (D5: needs ≥1 fully-satisfied region alongside ≥1 fully-unreferenced one)')
})

test('AC-20260814-02-8: a clean pass and a flat schemaVersion-2 extract never emit the over-claim diagnosis and exit exactly as at HEAD (regression pin)', () => {
  const clean = fixture({
    surfaces: [ROOT_BOUND_SURFACE],
    skeletons: rootBoundSkeleton(),
    files: { 'src/Screen.tsx': '<label>Email address</label><button>Sign out</button>' },
  })
  const cres = run(clean)
  assert.strictEqual(cres.status, 0, cres.stderr)
  assert.doesNotMatch(cres.stdout, /over-claim:/,
    'a clean root-bound pass (every child region fully satisfied) must never emit the over-claim diagnosis — there is no unexcused finding for it to re-label')

  const flat = fixture({
    strings: ['Email address', 'Sign out'],
    files: { 'src/S1.tsx': '<label>Email address</label>' }, // legacy flat extract: one root region, no children
  })
  const fres = run(flat)
  assert.strictEqual(fres.status, 1, fres.stdout)
  assert.doesNotMatch(fres.stderr, /over-claim:/,
    'a schemaVersion-2 flat extract has one root region with no children — there is no child-region coverage split to compute, so the over-claim diagnosis can never fire on it (D5: no false positives on old sidecars)')
})

test('the catalog does not excuse copy that is nowhere: missing copy still fails with catalogs declared', () => {
  const f = fixture({
    surfaces: [{ ...V3_SURFACE, entries: [{ region: 'sidebar', kind: 'copy', value: 'Send invite' }], layout: [] }],
    skeletons: sidebarSkeleton(),
    config: { design: { copyCatalogs: ['app/messages/en.json'] } },
    files: {
      'src/Sidebar.tsx': '<Button>{m.send()}</Button>',
      'src/Sidebar.stories.tsx': 'x',
      'app/messages/en.json': JSON.stringify({ send: 'Send' }), // paraphrased in the catalog too
    },
  })
  const res = run(f)
  assert.strictEqual(res.status, 1)
  assert.match(res.stderr, /copy "Send invite" missing/)
})
