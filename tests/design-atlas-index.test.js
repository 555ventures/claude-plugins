'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir } = require('./helpers')
const { findChrome, serve, withChrome } = require('./mocks/chrome-harness')

// specs/20260907/09-atlas-index-and-note-navigation.md D1-D5: the persistent screen index
// (#shell/#toc, search, the shared status-chip filter, and the scroll-derived current-section
// marker) does not exist yet on design-atlas.js's page()/buildAtlas — none of #tocsearch,
// .tocrow, #tocbtn, #tocscrim or .tochead render today. All four ACs here are `[env: CHROME_BIN]`
// (A2/A3/A4 were executed against a real served page); each skips with a named reason when no
// Chrome resolves — findChrome/serve/withChrome come from tests/mocks/chrome-harness.js (A5),
// the shared harness three near-identical copies of this were extracted into.

// Two roadmap sections: "staff-session" (title contains "session") holds staff-invite (sketch,
// the default status) and staff-approve (data-status="approved"); "other-area" (no "session"
// anywhere in its title or its own row label) holds owner-map (sketch). AC-20260907-09-2's own
// worked example.
function buildFixtureRoot() {
  const dir = tmpdir('atlas-idx')
  const mk = (rel, c) => { const p = path.join(dir, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c) }
  mk('docs/roadmap/staff-session.md', '# staff session\n```surfaces\nstaff-invite\nstaff-invite -> staff-approve\n```\n')
  mk('docs/roadmap/other-area.md', '# other area\n```surfaces\nowner-map\n```\n')
  mk('design/mocks/staff-invite.html', '<main data-screen-label="staff-invite">invite</main>\n')
  mk('design/mocks/staff-approve.html', '<main data-screen-label="staff-approve" data-status="approved">approve</main>\n')
  mk('design/mocks/owner-map.html', '<main data-screen-label="owner-map">map</main>\n')
  return dir
}

async function withServedAtlas(fn) {
  const chrome = findChrome()
  const dir = buildFixtureRoot()
  const { ready, stop } = serve(dir)
  try {
    const { port } = await ready
    await withChrome(chrome, async (page) => {
      await page.navigate('http://127.0.0.1:' + port + '/atlas/index.html')
      await fn(page)
    })
  } finally {
    await stop()
  }
}

// Review finding: shapes and theme carry a heading and no rows by design — no fixture anywhere
// in this file included design/shapes/* or an open theme-picked stop, so the "a row-less group
// must stay visible" branch (and the theme heading's own .count pill) had no executable
// coverage at all.
function buildFixtureRootWithShapesAndTheme() {
  const dir = buildFixtureRoot()
  const mk = (rel, c) => { const p = path.join(dir, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c) }
  mk('design/shapes/one.html', '<main data-screen-label="one">one</main>\n')
  mk('design/themes/ocean/signin.html', '<main data-screen-label="x">x</main>\n')
  mk('design/mocks/picks.json', JSON.stringify([
    {
      id: 'P001', kind: 'pick', key: 'theme-picked', title: 'pick a theme', question: null,
      candidates: [{ group: 'ocean', label: 'signin', path: 'themes/ocean/signin.html' }],
      url: null, openedAt: '2026-01-01T00:00:00.000Z', status: 'open', decision: null, previous: [],
    },
  ], null, 2) + '\n')
  return dir
}

async function withServedShapesThemeAtlas(fn) {
  const chrome = findChrome()
  const dir = buildFixtureRootWithShapesAndTheme()
  const { ready, stop } = serve(dir)
  try {
    const { port } = await ready
    await withChrome(chrome, async (page) => {
      await page.navigate('http://127.0.0.1:' + port + '/atlas/index.html')
      await fn(page)
    })
  } finally {
    await stop()
  }
}

// Both scroll checks below force the target off-screen first (scroll to the very bottom), then
// assert it lands back within the viewport after activation — proving an actual scroll happened,
// not just the class add AC-20260907-09-3's earlier draft only checked. `settleScroll()` awaits
// the browser's own 'scrollend' event (falling back to a timeout so a call that triggers no
// scroll at all still resolves) before the "after" geometry is read.
const SETTLE_SCROLL_FN = 'function settleScroll(){return new Promise(function(resolve){var done=false;' +
  'function fin(){if(!done){done=true;window.removeEventListener("scrollend",fin);resolve()}}' +
  'window.addEventListener("scrollend",fin);setTimeout(fin,600)})}'

// D1 binds a `.18s ease` transition to #toc's transform, so a rect/transform read taken in the
// same synchronous tick as the triggering click/Escape/scrim event catches it mid-interpolation.
// __settle(el) resolves on that element's own transitionend (falling back to a timeout so a
// state that never actually transitions — e.g. the very first page load — still resolves), and
// every step below awaits it before reading geometry.
const SETTLE_FN = 'function __settle(el){return new Promise(function(resolve){var done=false;' +
  'function fin(){if(!done){done=true;el.removeEventListener("transitionend",onEnd);resolve()}}' +
  'function onEnd(e){if(e.propertyName==="transform")fin()}' +
  'el.addEventListener("transitionend",onEnd);setTimeout(fin,600)})}'

// Review finding: a group hidden whenever it has no visible .tocrow would wrongly catch shapes
// and theme, which carry a heading and no rows BY DESIGN (D2: neither is a "surface" with an
// id="s-<label>" to jump to) — that rule alone would vanish both on every apply, including the
// one that runs at page load. A row-less group is visible at load, hides when the search query
// excludes its own title (same rule an ordinary row-holding group already follows), and — per a
// second disposition — ALSO hides exactly when the page's own status-filter machinery has
// hidden its underlying `.sect` (shapes/theme cards carry no `data-st` at all, so any non-"all"
// chip always hides those sections on the page itself): D4 forbids the index disagreeing with
// the page, so a row-less group tracking its own section's hidden state is the correct behavior,
// not a bug — the earlier "must stay visible through a status filter" pin here was wrong and is
// corrected in place, per the disposer's ruling. Query assertions run BEFORE the status-chip
// click: the page's own `.sect`-hiding rule never un-hides once a chip has been clicked (even
// clicking "all" again re-triggers the same no-`[data-st]`-descendant check), so ordering the
// query assertions after the chip click would fail to isolate search filtering from that
// persistent state. This also covers D2's separate requirement that the theme heading carries
// the same .count pill shapes and every journey group already carry.
test('D2/D4 review finding: the row-less shapes and theme groups are visible at load, hide when the search query excludes their own titles, and hide exactly when the status filter has hidden their underlying .sect; the theme heading carries its .count pill', async (t) => {
  const chrome = findChrome()
  if (!chrome) return t.skip('no Chrome binary (set CHROME_BIN) — this pin requires real DOM/CSSOM filtering behavior')
  await withServedShapesThemeAtlas(async ({ evalJs }) => {
    const groupVisible = (title) => `!(document.querySelector('.tocgroup[data-group="${title}"]') || { hidden: true }).hidden`

    const atLoad = await evalJs(`
      (function () {
        return { shapesVisible: ${groupVisible('shapes')}, themeVisible: ${groupVisible('theme')} }
      })()
    `)
    assert.strictEqual(atLoad.shapesVisible, true,
      'D2/D4: the row-less "shapes" group must be visible at page load — it must never vanish just because it has no .tocrow to filter: got ' + JSON.stringify(atLoad))
    assert.strictEqual(atLoad.themeVisible, true,
      'D2/D4: the row-less "theme" group must be visible at page load — it must never vanish just because it has no .tocrow to filter: got ' + JSON.stringify(atLoad))

    const themeCount = await evalJs(`
      (function () {
        var pill = document.querySelector('#th-theme .count')
        return pill ? pill.textContent : null
      })()
    `)
    assert.strictEqual(themeCount, '1',
      'D2: the theme heading (#th-theme) must carry the same .count pill shapes and every journey group already do — one open theme-picked stop must read "1": got ' + JSON.stringify(themeCount))

    // Query filtering, exercised BEFORE any status chip is clicked — see the header comment for
    // why order matters here.
    const excludingQuery = await evalJs(`
      (function () {
        var input = document.getElementById('tocsearch')
        input.value = 'no-such-group-title-anywhere'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        return { shapesVisible: ${groupVisible('shapes')}, themeVisible: ${groupVisible('theme')} }
      })()
    `)
    assert.strictEqual(excludingQuery.shapesVisible, false,
      'D2/D3: a query that excludes "shapes" from its own title must hide the row-less group, exactly the same rule an ordinary row-holding group follows: got ' + JSON.stringify(excludingQuery))
    assert.strictEqual(excludingQuery.themeVisible, false,
      'D2/D3: a query that excludes "theme" from its own title must hide the row-less group, exactly the same rule an ordinary row-holding group follows: got ' + JSON.stringify(excludingQuery))

    const matchingQuery = await evalJs(`
      (function () {
        var input = document.getElementById('tocsearch')
        input.value = 'shapes'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        return { shapesVisible: ${groupVisible('shapes')}, themeVisible: ${groupVisible('theme')} }
      })()
    `)
    assert.strictEqual(matchingQuery.shapesVisible, true,
      'D2/D3: a query matching "shapes" own title must keep the row-less group visible: got ' + JSON.stringify(matchingQuery))
    assert.strictEqual(matchingQuery.themeVisible, false,
      'D2/D3: that same query must still hide "theme" — its own title does not contain "shapes", and there is no row in it to match either: got ' + JSON.stringify(matchingQuery))

    // Clear the query back to empty before touching the status filter, isolating this step's own
    // effect from the search state exercised above.
    await evalJs(`
      (function () {
        var input = document.getElementById('tocsearch')
        input.value = ''
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })()
    `)

    const afterStatusFilter = await evalJs(`
      (function () {
        var chip = Array.prototype.slice.call(document.querySelectorAll('[data-f]'))
          .find(function (b) { return /sketch/.test(b.textContent) })
        chip.click()
        return { shapesVisible: ${groupVisible('shapes')}, themeVisible: ${groupVisible('theme')} }
      })()
    `)
    assert.strictEqual(afterStatusFilter.shapesVisible, false,
      'D4: the index must hide a row-less group exactly when the page has hidden its section — "shapes" carries no data-st descendant at all, so the page\'s own status-filter rule hides #shapes on any non-"all" chip, and the index must agree rather than listing a section the page removed: got ' + JSON.stringify(afterStatusFilter))
    assert.strictEqual(afterStatusFilter.themeVisible, false,
      'D4: the index must hide a row-less group exactly when the page has hidden its section — "theme" carries no data-st descendant at all, so the page\'s own status-filter rule hides #theme on any non-"all" chip, and the index must agree rather than listing a section the page removed: got ' + JSON.stringify(afterStatusFilter))
  })
})

// D2's heading-jump clause (§ Behavior / Contracts skeleton): clicking a journey/group heading
// itself, not just a row, must scroll that section into view and close the overlay in narrow
// mode — the same navigation a row click gives, minus .flash (D2 pairs .flash with the row-jump
// clause specifically; the heading's own persistent .here border is its arrival feedback, so no
// .flash is asserted here). No AC covers this D2 mechanism — named after the Decision, following
// the D7′(a) precedent already in this suite.
test('D2: activating a .tochead scrolls its section into view and closes the overlay in narrow mode, without adding .flash', async (t) => {
  const chrome = findChrome()
  if (!chrome) return t.skip('no Chrome binary (set CHROME_BIN) — this pin requires real DOM/CSSOM scroll and overlay behavior')
  const dir = buildFixtureRoot()
  const { ready, stop } = serve(dir)
  try {
    const { port } = await ready
    await withChrome(chrome, async ({ navigate, evalJs, setViewport, sleep }) => {
      await setViewport(800, 900)
      await navigate('http://127.0.0.1:' + port + '/atlas/index.html')

      const result = await evalJs(`
        ${SETTLE_SCROLL_FN}
        (async function () {
          document.getElementById('tocbtn').click()
          var head = document.getElementById('th-staff-session') ||
            Array.prototype.slice.call(document.querySelectorAll('.tochead')).find(function (h) { return /staff-session/.test(h.id) })
          var section = document.getElementById('j-' + head.id.slice(3))
          // staff-session is the SECOND section on this fixture's page — at scroll 0 (the top)
          // its heading already sits below the fold, so no scroll setup is needed to push it
          // off-screen; the click must pull it back up.
          window.scrollTo(0, 0)
          await settleScroll()
          var beforeRect = section.getBoundingClientRect()
          var beforeInView = beforeRect.top >= 0 && beforeRect.top < window.innerHeight
          var toc = document.getElementById('toc')
          var overlayOpenBefore = toc.classList.contains('open')
          head.click()
          await settleScroll()
          var afterRect = section.getBoundingClientRect()
          var afterInView = afterRect.top >= 0 && afterRect.top < window.innerHeight
          return {
            overlayOpenBefore: overlayOpenBefore,
            beforeInView: beforeInView, afterInView: afterInView,
            overlayOpenAfter: toc.classList.contains('open'),
            sectionFlashed: section.classList.contains('flash'),
          }
        })()
      `)
      assert.strictEqual(result.overlayOpenBefore, true, 'test setup: #tocbtn must have opened the overlay, or the "closes the overlay" assertion below proves nothing: got ' + JSON.stringify(result))
      assert.strictEqual(result.beforeInView, false, 'test setup: the staff-session heading\'s own <h2> must start off-screen at the top of the page, or the scroll assertion below proves nothing: got ' + JSON.stringify(result))
      assert.strictEqual(result.afterInView, true, 'D2: activating a .tochead must scroll its own section into view, exactly like a row activation does: got ' + JSON.stringify(result))
      assert.strictEqual(result.overlayOpenAfter, false, 'D2: activating a .tochead in narrow mode must close the overlay, exactly like a row activation does: got ' + JSON.stringify(result))
      assert.strictEqual(result.sectionFlashed, false, 'D2: activating a .tochead must NOT add .flash to its section — .flash pairs with the row-jump clause specifically, and the heading\'s persistent .here border is its own arrival feedback: got ' + JSON.stringify(result))
    })
  } finally {
    await stop()
  }
})
