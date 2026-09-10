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

test('AC-20260907-09-2: typing "session" into #tocsearch leaves visible exactly the rows whose label or group title contains it, and the sketch status chip then narrows to rows matching both', async (t) => {
  const chrome = findChrome()
  if (!chrome) return t.skip('no Chrome binary (set CHROME_BIN) — AC-20260907-09-2 requires a real DOM/CSSOM to drive #tocsearch')
  await withServedAtlas(async ({ evalJs }) => {
    const afterSearch = await evalJs(`
      (function () {
        var input = document.getElementById('tocsearch')
        input.value = 'session'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        return Array.prototype.slice.call(document.querySelectorAll('.tocrow'))
          .filter(function (r) { return !r.hidden })
          .map(function (r) { return r.dataset.label })
          .sort()
      })()
    `)
    assert.deepStrictEqual(afterSearch, ['staff-approve', 'staff-invite'],
      'D3: typing "session" must leave visible only rows whose own label or group title contains it (both staff screens live under the "staff session" group) and hide owner-map: got ' + JSON.stringify(afterSearch))

    // AC-20260907-09-2's own text: "SHALL hide every group with no visible row" — the "other
    // area" group holds only owner-map, which the "session" query hides, so the WHOLE GROUP
    // (its .tocgroup wrapper, not just the row inside it) must go hidden too.
    const groupVisibility = await evalJs(`
      (function () {
        var out = {}
        Array.prototype.slice.call(document.querySelectorAll('.tocgroup')).forEach(function (g) {
          out[g.dataset.group] = !g.hidden
        })
        return out
      })()
    `)
    const otherAreaGroup = Object.keys(groupVisibility).find((title) => /other-area/.test(title))
    assert.ok(otherAreaGroup, 'test setup: the "other-area" .tocgroup (its title is the roadmap file\'s path, "other-area.md" stripped) must exist to prove it gets hidden: got ' + JSON.stringify(groupVisibility))
    assert.strictEqual(groupVisibility[otherAreaGroup], false,
      'D3: a group with no visible row ("other-area", holding only the hidden owner-map row) must itself be hidden: got ' + JSON.stringify(groupVisibility))
    const staffSessionGroup = Object.keys(groupVisibility).find((title) => /staff-session/.test(title))
    assert.strictEqual(groupVisibility[staffSessionGroup], true,
      'D3: a group that still has a visible row ("staff-session") must itself stay visible: got ' + JSON.stringify(groupVisibility))

    const afterChip = await evalJs(`
      (function () {
        var chip = Array.prototype.slice.call(document.querySelectorAll('[data-f]'))
          .find(function (b) { return /sketch/.test(b.textContent) })
        if (!chip) return null
        chip.click()
        return Array.prototype.slice.call(document.querySelectorAll('.tocrow'))
          .filter(function (r) { return !r.hidden })
          .map(function (r) { return r.dataset.label })
      })()
    `)
    assert.deepStrictEqual(afterChip, ['staff-invite'],
      'D4: clicking the sketch status chip while "session" is still typed must leave visible only the rows matching BOTH the query and the status (staff-approve is approved, not sketch): got ' + JSON.stringify(afterChip))

    // D3: ".tocempty" must appear once a query matches nothing at all.
    const nothingMatches = await evalJs(`
      (function () {
        var input = document.getElementById('tocsearch')
        input.value = 'no-such-screen-anywhere'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        var empty = document.querySelector('.tocempty')
        return {
          anyRowVisible: Array.prototype.slice.call(document.querySelectorAll('.tocrow')).some(function (r) { return !r.hidden }),
          emptyLineShown: !!empty && !empty.hidden,
        }
      })()
    `)
    assert.strictEqual(nothingMatches.anyRowVisible, false, 'test setup: a nonsense query must leave no .tocrow visible: got ' + JSON.stringify(nothingMatches))
    assert.strictEqual(nothingMatches.emptyLineShown, true,
      'D3: a query matching nothing must show the ".tocempty" line: got ' + JSON.stringify(nothingMatches))
  })
})

// Both scroll checks below force the target off-screen first (scroll to the very bottom), then
// assert it lands back within the viewport after activation — proving an actual scroll happened,
// not just the class add AC-20260907-09-3's earlier draft only checked. `settleScroll()` awaits
// the browser's own 'scrollend' event (falling back to a timeout so a call that triggers no
// scroll at all still resolves) before the "after" geometry is read.
const SETTLE_SCROLL_FN = 'function settleScroll(){return new Promise(function(resolve){var done=false;' +
  'function fin(){if(!done){done=true;window.removeEventListener("scrollend",fin);resolve()}}' +
  'window.addEventListener("scrollend",fin);setTimeout(fin,600)})}'

test('AC-20260907-09-3: activating a .tocrow scrolls its #s-<label> target into view and adds class "flash", and Enter in a non-empty #tocsearch activates the first visible row', async (t) => {
  const chrome = findChrome()
  if (!chrome) return t.skip('no Chrome binary (set CHROME_BIN) — AC-20260907-09-3 requires real DOM event dispatch')
  await withServedAtlas(async ({ evalJs }) => {
    const clickResult = await evalJs(`
      ${SETTLE_SCROLL_FN}
      (async function () {
        window.scrollTo(0, document.body.scrollHeight)
        await settleScroll()
        var target = document.getElementById('s-staff-invite')
        var before = target.classList.contains('flash')
        var beforeRect = target.getBoundingClientRect()
        var beforeInView = beforeRect.top >= 0 && beforeRect.top < window.innerHeight
        var row = document.querySelector('.tocrow[data-label="staff-invite"]')
        row.click()
        await settleScroll()
        var afterRect = target.getBoundingClientRect()
        var afterInView = afterRect.top >= 0 && afterRect.top < window.innerHeight
        return { before: before, after: target.classList.contains('flash'), beforeInView: beforeInView, afterInView: afterInView }
      })()
    `)
    assert.strictEqual(clickResult.before, false, 'test setup: the target must not already carry .flash before activation')
    assert.strictEqual(clickResult.beforeInView, false,
      'test setup: after scrolling to the bottom, #s-staff-invite must start off-screen, or the scroll assertion below proves nothing: got ' + JSON.stringify(clickResult))
    assert.strictEqual(clickResult.afterInView, true,
      'D2: activating the staff-invite .tocrow must actually scroll #s-staff-invite into view, not just flash it: got ' + JSON.stringify(clickResult))
    assert.strictEqual(clickResult.after, true,
      'D2: activating the staff-invite .tocrow must add class "flash" to #s-staff-invite: got ' + JSON.stringify(clickResult))

    const enterResult = await evalJs(`
      ${SETTLE_SCROLL_FN}
      (async function () {
        window.scrollTo(0, document.body.scrollHeight)
        await settleScroll()
        var target = document.getElementById('s-staff-approve')
        var beforeRect = target.getBoundingClientRect()
        var beforeInView = beforeRect.top >= 0 && beforeRect.top < window.innerHeight
        var input = document.getElementById('tocsearch')
        input.value = 'staff-approve'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        await settleScroll()
        var afterRect = target.getBoundingClientRect()
        var afterInView = afterRect.top >= 0 && afterRect.top < window.innerHeight
        return { flashed: target.classList.contains('flash'), beforeInView: beforeInView, afterInView: afterInView }
      })()
    `)
    assert.strictEqual(enterResult.beforeInView, false,
      'test setup: after scrolling to the bottom, #s-staff-approve must start off-screen, or the scroll assertion below proves nothing: got ' + JSON.stringify(enterResult))
    assert.strictEqual(enterResult.afterInView, true,
      'D3: pressing Enter must actually scroll #s-staff-approve into view, not just flash it: got ' + JSON.stringify(enterResult))
    assert.strictEqual(enterResult.flashed, true,
      'D3: pressing Enter in a non-empty #tocsearch matching exactly one row must activate that first visible row (flashing #s-staff-approve): got ' + JSON.stringify(enterResult))
  })
})

// D1 binds a `.18s ease` transition to #toc's transform, so a rect/transform read taken in the
// same synchronous tick as the triggering click/Escape/scrim event catches it mid-interpolation.
// __settle(el) resolves on that element's own transitionend (falling back to a timeout so a
// state that never actually transitions — e.g. the very first page load — still resolves), and
// every step below awaits it before reading geometry.
const SETTLE_FN = 'function __settle(el){return new Promise(function(resolve){var done=false;' +
  'function fin(){if(!done){done=true;el.removeEventListener("transitionend",onEnd);resolve()}}' +
  'function onEnd(e){if(e.propertyName==="transform")fin()}' +
  'el.addEventListener("transitionend",onEnd);setTimeout(fin,600)})}'

test('AC-20260907-09-4: below 1200px #tocbtn is displayed and #toc is off-canvas by default; activating #tocbtn opens #toc and paints #tocscrim; a row, Escape, or the scrim each close it', async (t) => {
  const chrome = findChrome()
  if (!chrome) return t.skip('no Chrome binary (set CHROME_BIN) — AC-20260907-09-4 requires real viewport/computed-style behavior')
  const dir = buildFixtureRoot()
  const { ready, stop } = serve(dir)
  try {
    const { port } = await ready
    await withChrome(chrome, async ({ navigate, evalJs, setViewport, sleep }) => {
      await setViewport(800, 900)
      await navigate('http://127.0.0.1:' + port + '/atlas/index.html')

      const initial = await evalJs(`
        (function () {
          var btn = document.getElementById('tocbtn')
          var toc = document.getElementById('toc')
          return {
            btnDisplayed: getComputedStyle(btn).display !== 'none',
            btnOn: btn.classList.contains('on'),
            tocPosition: getComputedStyle(toc).position,
            tocOffscreen: toc.getBoundingClientRect().right <= 0,
          }
        })()
      `)
      assert.strictEqual(initial.btnDisplayed, true, 'D1: below 1200px #tocbtn must compute as displayed: got ' + JSON.stringify(initial))
      assert.strictEqual(initial.btnOn, false, 'test setup: #tocbtn must not start with class "on", or the assertion below that activation adds it proves nothing: got ' + JSON.stringify(initial))
      assert.strictEqual(initial.tocPosition, 'fixed', 'D1: below 1200px #toc must be position:fixed: got ' + JSON.stringify(initial))
      assert.strictEqual(initial.tocOffscreen, true, 'D1: #toc must default fully off-canvas (translateX(-100%)) below 1200px: got ' + JSON.stringify(initial))

      const opened = await evalJs(`
        ${SETTLE_FN}
        (async function () {
          var toc = document.getElementById('toc')
          var btn = document.getElementById('tocbtn')
          document.getElementById('tocbtn').click()
          await __settle(toc)
          var scrim = document.getElementById('tocscrim')
          var r = scrim.getBoundingClientRect()
          // § UI: "#tocbtn.on" is a paint state, not just a class name — its background must
          // actually resolve to the --v-primary role, the same one .bar button.on already uses.
          var probe = document.createElement('div')
          probe.style.background = 'var(--v-primary)'
          document.body.appendChild(probe)
          var primaryColor = getComputedStyle(probe).backgroundColor
          probe.remove()
          return {
            tocOnscreen: toc.getBoundingClientRect().left >= 0 && toc.getBoundingClientRect().right > 0, scrimPainted: r.width > 0 && r.height > 0,
            btnOn: btn.classList.contains('on'), btnBg: getComputedStyle(btn).backgroundColor, primaryColor: primaryColor,
          }
        })()
      `)
      assert.strictEqual(opened.tocOnscreen, true, 'D1: activating #tocbtn must translate #toc fully onto screen once the transition settles: got ' + JSON.stringify(opened))
      assert.strictEqual(opened.scrimPainted, true, 'D1: activating #tocbtn must paint #tocscrim: got ' + JSON.stringify(opened))
      assert.strictEqual(opened.btnOn, true, '§ UI: activating #tocbtn must add class "on" to itself, exactly as the overlay-open state describes: got ' + JSON.stringify(opened))
      assert.strictEqual(opened.btnBg, opened.primaryColor,
        '§ UI: #tocbtn.on must actually paint the --v-primary background role, not just carry the class name with no visible pressed state: got ' + JSON.stringify(opened))

      const afterEscape = await evalJs(`
        ${SETTLE_FN}
        (async function () {
          var toc = document.getElementById('toc')
          var btn = document.getElementById('tocbtn')
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          await __settle(toc)
          var scrim = document.getElementById('tocscrim')
          var r = scrim.getBoundingClientRect()
          return { tocOffscreen: toc.getBoundingClientRect().right <= 0, scrimGone: !(r.width > 0 && r.height > 0), btnOn: btn.classList.contains('on') }
        })()
      `)
      assert.strictEqual(afterEscape.tocOffscreen, true, 'D1: Escape must remove the overlay once the transition settles: got ' + JSON.stringify(afterEscape))
      assert.strictEqual(afterEscape.scrimGone, true, 'D1: Escape must remove the painted scrim: got ' + JSON.stringify(afterEscape))
      assert.strictEqual(afterEscape.btnOn, false, '§ UI: Escape must remove #tocbtn\'s "on" class along with the rest of the overlay-closed state: got ' + JSON.stringify(afterEscape))

      const afterRow = await evalJs(`
        ${SETTLE_FN}
        (async function () {
          var toc = document.getElementById('toc')
          var btn = document.getElementById('tocbtn')
          document.getElementById('tocbtn').click()
          await __settle(toc)
          document.querySelector('.tocrow[data-label="staff-invite"]').click()
          await __settle(toc)
          return { tocOffscreen: toc.getBoundingClientRect().right <= 0, btnOn: btn.classList.contains('on') }
        })()
      `)
      assert.strictEqual(afterRow.tocOffscreen, true, 'D1: activating a .tocrow while the overlay is open must close it, once the transition settles: got ' + JSON.stringify(afterRow))
      assert.strictEqual(afterRow.btnOn, false, '§ UI: activating a .tocrow must remove #tocbtn\'s "on" class along with the rest of the overlay-closed state: got ' + JSON.stringify(afterRow))

      const afterScrim = await evalJs(`
        ${SETTLE_FN}
        (async function () {
          var toc = document.getElementById('toc')
          var btn = document.getElementById('tocbtn')
          document.getElementById('tocbtn').click()
          await __settle(toc)
          document.getElementById('tocscrim').click()
          await __settle(toc)
          return { tocOffscreen: toc.getBoundingClientRect().right <= 0, btnOn: btn.classList.contains('on') }
        })()
      `)
      assert.strictEqual(afterScrim.tocOffscreen, true, 'D1: clicking #tocscrim must close the overlay, once the transition settles: got ' + JSON.stringify(afterScrim))
      assert.strictEqual(afterScrim.btnOn, false, '§ UI: clicking #tocscrim must remove #tocbtn\'s "on" class along with the rest of the overlay-closed state: got ' + JSON.stringify(afterScrim))
    })
  } finally {
    await stop()
  }
})

test('AC-20260907-09-6: the last .sect > h2 at or above max(80, innerHeight*0.25) carries .here on its matching .tochead exclusively, recomputed on scroll, defaulting to the first heading at scroll 0', async (t) => {
  const chrome = findChrome()
  if (!chrome) return t.skip('no Chrome binary (set CHROME_BIN) — AC-20260907-09-6 requires real scroll/rAF behavior')
  await withServedAtlas(async ({ evalJs, sleep }) => {
    const atTop = await evalJs(`
      (function () {
        var heads = document.querySelectorAll('.tochead')
        var here = document.querySelectorAll('.tochead.here')
        return { headCount: heads.length, hereCount: here.length, hereIsFirst: here.length === 1 && here[0] === heads[0] }
      })()
    `)
    assert.strictEqual(atTop.headCount >= 2, true, 'test setup: the fixture must render at least two .tochead groups to prove the marker moves')
    assert.strictEqual(atTop.hereCount, 1, 'D5: exactly one .tochead may carry .here at any time: got ' + JSON.stringify(atTop))
    assert.strictEqual(atTop.hereIsFirst, true, 'D5: at scroll position 0 the FIRST section heading must be marked: got ' + JSON.stringify(atTop))

    await evalJs(`
      (function () {
        var second = document.querySelectorAll('.sect > h2')[1]
        window.scrollTo(0, second.getBoundingClientRect().top + window.scrollY + 5)
        window.dispatchEvent(new Event('scroll'))
      })()
    `)
    await sleep(200)

    const afterScroll = await evalJs(`
      (function () {
        var heads = document.querySelectorAll('.tochead')
        var here = document.querySelectorAll('.tochead.here')
        return { hereCount: here.length, hereIsSecond: here.length === 1 && here[0] === heads[1] }
      })()
    `)
    assert.strictEqual(afterScroll.hereCount, 1, 'D5: exactly one .tochead may carry .here after scrolling: got ' + JSON.stringify(afterScroll))
    assert.strictEqual(afterScroll.hereIsSecond, true,
      'D5: scrolling so the second section heading is the last one at or above max(80, innerHeight*0.25) must move .here onto the second .tochead, recomputed via the scroll listener: got ' + JSON.stringify(afterScroll))

    // Review finding: a hidden element's getBoundingClientRect().top is always 0 — which always
    // satisfies D5's "at or above threshold" test — so a hidden section later in render order can
    // beat a real, visible one for "current" unless the marking logic excludes hidden sections
    // outright. The "approved" status chip hides the whole "other-area" section (owner-map is
    // sketch, its only row) while "staff-session" stays visible (staff-approve is approved) — the
    // marker must land on the still-visible section, never the hidden one.
    const afterFilter = await evalJs(`
      (function () {
        var chip = Array.prototype.slice.call(document.querySelectorAll('[data-f]'))
          .find(function (b) { return /approved/.test(b.textContent) })
        chip.click()
        window.scrollTo(0, 0)
        // __filter() calls __tocApply() only — it never recomputes the marker itself, and
        // __tocMark() otherwise runs solely inside the scroll listener's own requestAnimationFrame.
        // A dispatched "scroll" event here would leave THIS synchronous read seeing whatever the
        // marker was left at by the test's earlier step, one frame stale — so the marker is
        // recomputed directly (A5's sanctioned fallback for this harness) rather than through an
        // event whose handler has not yet run when this line executes.
        window.__tocMark()
        var here = document.querySelector('.tochead.here')
        var hereTitle = here && here.id.indexOf('th-') === 0 ? here.id.slice(3) : null
        var hereHeading = hereTitle ? document.getElementById('j-' + hereTitle) : null
        var hereSectHidden = hereHeading ? !!(hereHeading.closest('.sect') || {}).hidden : null
        return {
          hereExists: !!here,
          hereSectHidden: hereSectHidden,
          hereIsStaffSession: !!(hereTitle && /staff-session/.test(hereTitle)),
        }
      })()
    `)
    assert.strictEqual(afterFilter.hereExists, true,
      'D4/D5: once "other-area" is entirely hidden by the status filter, some visible section\'s heading must still carry .here — a hidden section winning "current" used to leave NOTHING marked: got ' + JSON.stringify(afterFilter))
    assert.strictEqual(afterFilter.hereSectHidden, false,
      'D4/D5: the current-section marker must never land on a hidden section\'s heading, even when that section would otherwise satisfy the threshold rule (a hidden element\'s rect.top is always 0): got ' + JSON.stringify(afterFilter))
    assert.strictEqual(afterFilter.hereIsStaffSession, true,
      'D4/D5: with "other-area" hidden, the marker must sit on "staff-session" (the one remaining visible section): got ' + JSON.stringify(afterFilter))
  })
})

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
