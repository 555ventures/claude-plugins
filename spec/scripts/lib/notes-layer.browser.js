// notes-layer.browser.js — served verbatim as GET /__notes/notes.js by design-atlas.js's
// `serve`, injected before </body> on every served mock page unless the request carries
// ?clean. specs/20260902/10-page-notes-review-loop.md D3; specs/20260905/01-picks-on-the-atlas-page.md D5.
//
// specs/20260912/11-a-note-can-mark-an-area.md D4-D8: a mock-scope page gains a third shadow
// host, the overlay — `position:absolute;inset:0` (D4, locked verbatim) over the mock root's
// document flow (never `position:relative` on the mock root itself, which the isolation invariant
// forbids touching) — that paints one `.nl-region` box per note whose `region` (NotesAnchor.resolve,
// from GET /__notes/anchor.js, loaded before this script per D3) resolves on the active state.
// Because the host is absolutely (not fixed) positioned, its own coordinate frame is page-relative,
// not viewport-relative — box/card coordinates below are therefore always computed as
// `rootEl.getBoundingClientRect()` (viewport px) PLUS the current scroll offset (`pageXOffset`/
// `pageYOffset`) plus the resolved, root-relative box, so a box painted on a mock taller than the
// viewport stays pinned to its element through scroll and re-paint (state-button click, `resize`)
// alike. This spec's Contracts block exposes no reply-posting verb (only add/region/delete/reopen/
// resolve/answer are named) — D6's card carries no Reply control or textarea for that reason; a
// reply is out of scope, not a bug (see the sidecar deviation).
//
// specs/20260913/07-the-critic-is-out.md D6/D8: a note carrying a legacy `kind: "question"` was
// never written by a person and is never rendered here — every row this layer builds is a note
// row; the composer on both scopes carries no reason chip row (D10) and the mock-page composer
// alone gains a "Whole project" scope toggle.
//
// Anchor = the served page's data-screen-label + the active state (the last-clicked
// data-state-btn, else the first declared, else "default"), or the project scope — never an
// element. Talks only to the /__notes/* endpoints design-atlas.js's serve exposes; every visual
// reads var(--v-*) off /__notes/viewer.css, linked inside this layer's own shadow roots — never
// into the served document — so no rule of it reaches the mock's cascade. No literal color here.
// D5: the endpoint base (and the viewer.css link) is derived from location.pathname by the same
// rule the atlas's own decide script uses (a leading `/p/<name>` mount, else ''), and the page
// declares exactly ONE scope via <meta name="notes-scope"> — `project` (the atlas index) or
// `mock` (a served screen); meta absent falls back to `mock` when a [data-screen-label] root
// exists, else `project`. Declared scope always wins over that fallback (A6: the atlas index
// itself carries [data-screen-label] on every state-frame wrapper, so inferring scope from that
// attribute alone would misread it as a mock page).
//
// Does NOT: resolve a note (only POST /__notes/resolve does that — this file's own Resolve
// button is its one caller; address/reply are driver-only and unreachable from here), touch mock
// markup, or run at all when ?clean is present (screenshot capture stays clean).
//
// specs/20260913/02-the-layer-owns-one-mode-and-the-page-owns-the-card.md D1-D9,D12: the overlay
// holds exactly one `mode` — 'idle'|'arming'|'drawing'|'composing' — written only through
// `setMode`, mirrored onto `data-mode` for viewer.css to derive cursor/pointer-events/scrim from
// (D5), with zero inline pointer-events/cursor writes anywhere — the overlay's own light-DOM host
// carries a permanent, unconditional `pointer-events:none` (see hostStyle in mount() below) so a
// click always falls through it to the mock underneath; the overlay ELEMENT's own explicit
// per-mode value (auto during arming/drawing) is what makes it hit-testable then; an explicit
// descendant value always wins over whatever an ancestor's own value is, so the host never needs
// its own toggle. The drag binds `pointerdown`/`pointermove`/`pointerup`/
// `pointercancel`/`lostpointercapture` on the overlay element itself and captures the pointer
// there (D2) — never on `document`. `renderOverlay` keeps an id→element Map and reconciles it
// (D9); selection is a class toggle (`.sel`/`has-sel`) that never re-enters it. When framed
// (`window.parent !== window`), a card is built into `window.parent.document` and handed up via
// `__rvCardOpen`/`__rvCardClose` (D6) — there remains exactly one card renderer.
//
// This is a browser script, not a Node module — no `require`, no `module.exports`, evaluated by
// the page it is injected into.
'use strict'
;(function () {
  // specs/20260912/12-the-loop-re-anchors-and-everyone-draws.md D3/D5: a review board's framed
  // mock rides `?clean&notes=1` (lib/review-page.js's frameSrc) so this layer still mounts (the
  // clean strip is a server-side style only, CLEAN_STYLE in design-atlas.js) — a bare `?clean`
  // (every other caller) still returns here immediately, unchanged.
  var qs = new URLSearchParams(location.search)
  if (qs.has('clean') && !qs.has('notes')) return

  // D4: the mock document's own extent, captured BEFORE this layer mounts anything of its own —
  // the in-flow strip this script inserts after `rootEl` (mock scope, unframed) grows
  // `document.documentElement.scrollHeight` past the mock's own content height, and a clamp taken
  // live at drag time would clamp against that self-inflated bound instead of the mock's own.
  // Feature-detected: sibling test fixtures (tests/mocks/notes-layer-navigation.test.js) build a
  // minimal stub `document` with no `documentElement` at all — this file still runs unchanged
  // over that fixture (the same posture as setStyle/on below), and a real DOM always carries it.
  var pristineDocW = document.documentElement ? document.documentElement.scrollWidth : 0
  var pristineDocH = document.documentElement ? document.documentElement.scrollHeight : 0

  // Render-defect fix (2026-09-13, this spec's own escape — the whole authoring layer was
  // riding into the review page's boards): `notes=1` means "paint the marks", never "inject the
  // authoring UI" — D3's binding note surface is the review page's OWN right rail
  // (lib/review-page.js's inspector), so a framed board contributes the box layer
  // (renderOverlay/boxLayer) and nothing else. `marksOnly` gates the two things that remain
  // authoring chrome: the fixed bar and the in-flow strip — specs/20260913/02's D6 retires the
  // third (a card auto-opening on a box click/focus never populated cardSlot in a framed board);
  // the card now always builds, placed by the host when framed (D6/D8). `__nlMark`/`__nlSelect`/
  // `__nlPins`/`__rvPick` (D8/D10/D11) all still work regardless of `marksOnly`. A normal
  // (unflagged) served mock page — `qs.has('notes')` false — keeps its full bar and strip exactly
  // as before this fix (the pinned invariant).
  var marksOnly = qs.has('notes')

  var __base = (location.pathname.match(/^\/p\/[^/]+/) || [''])[0]

  // Chrome isolation: every piece of this layer lives in a shadow root — the viewer stylesheet
  // is linked INSIDE each root (its tokens are declared on `:host,:root`, so they resolve
  // there), never into the served document's <head>: viewer.css carries `body{background;color}`
  // and `*{box-sizing}` chrome-page rules that would otherwise cascade over the mock's own (later
  // sheet, equal specificity) and repaint the mock in the light palette whatever its theme. The
  // one document-level rule this layer adds targets only its own `.nl-host` elements. Invariant
  // (tests/mocks/notes-layer-isolation.test.js): a served mock computes the same styles with and
  // without this layer attached.
  var hostStyle = document.createElement('style')
  // specs/20260913/06-every-mock-has-a-page-you-can-mark.md D4: the lightbox is gone, so the
  // clause that hid the served page's own bar/panel while it was open goes with it.
  //
  // specs/20260913/02-the-layer-owns-one-mode-and-the-page-owns-the-card.md D2/D5: every `.nl-host`
  // (bar/strip/proj/overlay alike) is permanently `pointer-events:none` here — a SINGLE bare
  // `.nl-host` selector, so this stays the layer's one document-level rule, scoped, and AC-6's "no
  // inline pointer-events anywhere" holds with no per-host toggle at all. The overlay host spans
  // `inset:0` over the whole page, so without this an ancestor box would independently swallow
  // clicks that pass through a `pointer-events:none` .nl-overlay descendant (the classic "icon
  // inside a button" pattern) — but an explicit descendant value always wins over WHATEVER value
  // its ancestor carries, so the overlay's own `data-mode`-derived pointer-events (auto during
  // arming/drawing, viewer.css) still makes it directly hit-testable with no host-level exception
  // needed. Every OTHER host restores `auto` on its own shadow-scoped root below (`.nl-bar`,
  // `.nl-strip`, `.nl-proj` — the `css` string every host's shadow root carries), which
  // pointer-events then inherits down to their buttons exactly as it did before this rule existed.
  hostStyle.textContent = '.nl-host{pointer-events:none}'
  document.head.appendChild(hostStyle)

  var css =
    '.nl-bar,.nl-strip,.nl-proj{font:15px/1.5 var(--v-font);color:var(--v-fg);pointer-events:auto}' +
    '.nl-bar{position:fixed;top:13px;right:32px;z-index:9999;display:flex;gap:8px;align-items:center;' +
    'background:none;border:0;border-radius:0;' +
    'padding:0;box-shadow:none}' +
    '.nl-btn{display:inline-flex;align-items:center;height:32px;padding:0 12px;border-radius:var(--v-radius);' +
    'border:1px solid var(--v-border);background:var(--v-bg);color:var(--v-fg);cursor:pointer;' +
    'font:400 14px/1 var(--v-font)}' +
    '.nl-btn:hover{background:var(--v-muted-bg)}' +
    '.nl-btn.primary{background:var(--v-primary);color:var(--v-primary-fg);border-color:var(--v-primary);font-weight:500}' +
    '.nl-strip,.nl-proj{margin:16px 0;border:0;border-top:1px solid var(--v-border);border-radius:0;' +
    'background:none;padding:16px 0 0}' +
    '.nl-strip h4,.nl-proj h4{margin:0 0 10px;font-size:19px;font-weight:600;letter-spacing:-.005em;color:var(--v-fg)}' +
    '.nl-strip .n,.nl-proj .n{border-top:1px solid var(--v-border);border-left:2px solid var(--v-warn);' +
    'padding:10px 0 10px 12px;display:flex;align-items:flex-start;gap:10px}' +
    '.nl-strip .n:first-of-type,.nl-proj .n:first-of-type{border-top:0}' +
    '.nl-strip .n.done,.nl-proj .n.done{border-left-color:var(--v-border)}' +
    '.nl-strip .n.done,.nl-proj .n.done{color:var(--v-muted)}' +
    '.nl-strip .n b,.nl-proj .n b{font-size:14px;font-weight:600;color:var(--v-fg);' +
    'font-variant-numeric:tabular-nums;border:0;border-radius:0;padding:0;flex:none}' +
    '.nl-strip .n .t,.nl-proj .n .t{flex:1;max-width:80ch}' +
    '.nl-strip .n small,.nl-proj .n small{display:block;color:var(--v-muted);font-size:14px;margin-top:2px}' +
    '.nl-strip textarea,.nl-proj textarea{width:100%;box-sizing:border-box;min-height:64px;' +
    'font:15px/1.5 var(--v-font);color:var(--v-fg);border:1px solid var(--v-border);' +
    'border-radius:var(--v-radius);padding:8px 10px;margin:10px 0;resize:vertical;max-width:60ch}' +
    '.nl-row{display:flex;gap:8px;justify-content:flex-end}'

  // One shadow host per chrome piece (the fixed bar; the in-flow strip or project panel). The
  // host element is a plain block in the mock's flow; everything painted lives behind the
  // shadow boundary with its own copy of the viewer link + the rules above.
  function mount(element) {
    var host = document.createElement('div')
    host.className = 'nl-host'
    var root = host.attachShadow({ mode: 'open' })
    var link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = __base + '/__notes/viewer.css'
    root.appendChild(link)
    root.appendChild(Object.assign(document.createElement('style'), { textContent: css }))
    root.appendChild(element)
    return host
  }

  var rootEl = document.querySelector('[data-screen-label]')
  var screen = rootEl ? rootEl.getAttribute('data-screen-label') : null

  // D5: one declared scope per page — the server stamps <meta name="notes-scope"> on every page
  // it serves; absent meta falls back to mock (a screen root exists) or project (it does not).
  // The declared value always wins, so the atlas index's own [data-screen-label] frame wrappers
  // (A6) never make the layer misclassify it as a mock page.
  var metaEl = document.querySelector('meta[name="notes-scope"]')
  var declaredScope = metaEl ? metaEl.content : null
  var scope = declaredScope === 'project' ? 'project' : declaredScope === 'mock' ? 'mock' : (rootEl ? 'mock' : 'project')

  var stateButtons = Array.prototype.slice.call(document.querySelectorAll('[data-state-btn]'))
  // Before any state button is clicked, the page shows its base render — "happy" in
  // review-page.js's own naming (D9's data-state fallback; rowOpen's `n.state || 'happy'`),
  // never the FIRST declared button's name, which a page with only e.g. "error" declared would
  // otherwise wrongly claim as the active state on load (a served ?state=<s> frame corrects this
  // via its own click simulation before this ever matters; a screen with no data-state-btn at
  // all keeps 'default', unchanged).
  var activeState = stateButtons.length ? 'happy' : 'default'
  stateButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      activeState = btn.getAttribute('data-state-btn') || activeState
      render()
    })
  })

  // Author identity: asked once per browser, kept in localStorage under nl-author; falls back
  // to an in-memory ask (never a hard-coded name) if localStorage is unavailable — A3.
  var author = null
  function getAuthor() {
    var stored = null
    try { stored = localStorage.getItem('nl-author') } catch (e) { stored = null }
    if (stored) return stored
    var name = (window.prompt('Your name (shown on your notes)') || '').trim() || 'anonymous'
    try { localStorage.setItem('nl-author', name) } catch (e) { /* in-memory only this session */ }
    return name
  }
  author = getAuthor()

  // D4/D5/D6/D7: sibling test fixtures (tests/mocks/notes-layer-navigation.test.js) build a
  // minimal stub DOM with no `.style` object on their plain elements — setStyle no-ops rather
  // than throwing when `.style` is absent, so this file still runs unchanged over that fixture;
  // a real DOM element always carries `.style`, so nothing here changes for a served page.
  function setStyle(el, props) {
    if (!el || !el.style) return
    for (var k in props) { if (Object.prototype.hasOwnProperty.call(props, k)) el.style[k] = props[k] }
  }
  // Same posture as setStyle above — the stub DOM's `document`/`window` carry no addEventListener.
  function on(target, type, fn) {
    if (target && typeof target.addEventListener === 'function') target.addEventListener(type, fn)
  }
  // Same posture again — the stub DOM's elements carry no `.classList`. A real DOM element always
  // does, so this takes the cheap `classList` path there and only falls back to plain `className`
  // string surgery for the fixture.
  function toggleClass(el, cls, on) {
    if (!el) return
    if (el.classList) { el.classList.toggle(cls, !!on); return }
    var kept = String(el.className || '').split(/\s+/).filter(function (c) { return c && c !== cls })
    if (on) kept.push(cls)
    el.className = kept.join(' ')
  }

  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] })
  }
  function api(p, body) {
    var opts = body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined
    return fetch(__base + '/__notes/' + p, opts).then(function (r) { return r.json() })
  }

  // marksOnly: the bar is authoring chrome (compose/mark/author/show-resolved) — it must not
  // PAINT over a review board, but it still mounts (shadow root, buttons, the live "Marking ·
  // Esc to stop" text D11 hands the review page's own Mark-an-area bridge test): the host itself
  // just carries `display:none`, so it renders nothing and takes no layout space while staying
  // queryable exactly as tests/mocks/review-region.test.js's AC-17 needs (a same-origin
  // same-document query into the frame's shadow root, no visible chrome).
  var bar = document.createElement('div'); bar.className = 'nl-bar'
  var barHost = mount(bar)
  if (marksOnly) setStyle(barHost, { display: 'none' })
  document.body.appendChild(barHost)

  // D5: exactly one panel exists per page, matching the declared scope — a project page never
  // gets an nl-strip (mock notes belong on the screen), a mock page never gets an nl-proj (project
  // notes belong on the atlas). marksOnly skips both — same reasoning as the bar above; render()
  // already guards every strip/proj access behind `if (strip)`/`if (proj)`, so leaving them null
  // is enough to drop the in-flow strip and the filter row/composer it carries.
  var proj = null
  var strip = null
  if (!marksOnly && scope === 'project') {
    proj = document.createElement('div'); proj.className = 'nl-proj'
    // specs/20260907/09 D8: mount right after the atlas's own #nl-notes anchor when it exists —
    // that anchor sits as the last element of #main, giving the panel a stable spot inside the
    // two-column grid; the pre-existing rootEl||document.body fallback still applies everywhere
    // else (this element is absent on every other project-scope page). Feature-detected: a
    // served page's real `document` always has getElementById, but this file also runs unchanged
    // under stub DOMs a caller may build without it.
    var nlNotesEl = typeof document.getElementById === 'function' ? document.getElementById('nl-notes') : null
    var projAnchor = nlNotesEl || rootEl || document.body
    projAnchor.insertAdjacentElement('afterend', mount(proj))
  } else if (!marksOnly) {
    strip = document.createElement('div'); strip.className = 'nl-strip'
    var stripAnchor = rootEl || document.body
    stripAnchor.insertAdjacentElement('afterend', mount(strip))
  }

  // D4: the overlay — a third .nl-host, mock scope only, `position:absolute;inset:0` (locked
  // verbatim) so it scrolls with the page instead of pinning to the viewport on a mock taller than
  // it. specs/20260913/02 D5: `pointer-events` on the overlay ITSELF derives from `data-mode` in
  // viewer.css (never an imperative write); the host's own permanent `pointer-events:none`
  // (hostStyle, above) is what lets a click fall through to the mock at idle/composing with zero
  // inline style anywhere — the overlay's own explicit per-mode value overrides it directly
  // whenever the overlay itself must be hit-testable (arming/drawing), no host-level exception
  // needed. The boxes (renderOverlay,
  // per-box inline `pointer-events:auto`) stay clickable regardless of mode — but the card and
  // toast are NOT boxes and sit directly in the overlay, so they get the same `auto` override on
  // their own slot elements (cardSlot/toastSlot) below; without it every control inside them
  // (Accept/Reject/Send back/the overflow menu/Undo) would inherit the overlay's own `none` at
  // idle/composing and fail hit-testing even though they render on top.
  var overlay = null
  var boxLayer = null
  var cardSlot = null
  var toastSlot = null
  var overlayHost = null
  if (scope === 'mock' && rootEl) {
    overlay = document.createElement('div'); overlay.className = 'nl-overlay'
    boxLayer = document.createElement('div')
    cardSlot = document.createElement('div')
    toastSlot = document.createElement('div')
    setStyle(cardSlot, { pointerEvents: 'auto' })
    setStyle(toastSlot, { pointerEvents: 'auto' })
    overlay.appendChild(boxLayer); overlay.appendChild(cardSlot); overlay.appendChild(toastSlot)
    overlayHost = mount(overlay)
    setStyle(overlayHost, { position: 'absolute', inset: '0', zIndex: '9997' })
    document.body.appendChild(overlayHost)
    overlay.setAttribute('data-mode', 'idle')
  }

  // D9: color/glyph come from the register — a per-box `--c` custom property set to one of the
  // four role tokens, never a literal color.
  //
  // specs/20260912/12-the-loop-re-anchors-and-everyone-draws.md D17 (owner ruling, 2026-09-13):
  // this SHALL CONTINUE TO resolve specs/20260912/11 D9's four roles distinctly — open stays
  // `--v-danger`, never collapsed onto `--v-warn`. The review page's own chrome (`.rv-pin`,
  // `.rv-badge`, `.rv-tabpin`, the rail counts) carries the separate orange register D3 describes;
  // that register binds only that chrome and never the box tint or its frame, which track status.
  //
  // specs/20260913/05-a-note-is-a-conversation.md D5: colorFor now takes a TURN (session/you/
  // done/outdated), never a raw status — session -> --v-danger, you -> --v-warn, done -> --v-ok,
  // outdated is unchanged (a lost anchor, not a turn). The glyph CLASS names stay today's
  // (open/addressed/resolved/outdated — glyphClassFor below), since viewer.css's glyph rules and
  // the client's own lib/walk-page.js both still key on those class names.
  function colorFor(role) {
    if (role === 'you') return 'var(--v-warn)'
    if (role === 'done') return 'var(--v-ok)'
    if (role === 'outdated') return 'var(--v-muted)'
    return 'var(--v-danger)' // session
  }
  function glyphClassFor(role) {
    if (role === 'you') return 'addressed'
    if (role === 'done') return 'resolved'
    if (role === 'outdated') return 'outdated'
    return 'open' // session
  }

  // D4/D8: the display role a box/row/badge shows — the note's own turn, except `outdated`
  // (resolve() === null on a non-resolved note) which is DERIVED here, never written to disk.
  // `mode` ('exact'|'children'|null) rides along so D8's strip footnote can tell a
  // fitted-to-content box apart from an exact one without a second resolve() call.
  function regionInfo(n) {
    if (!n.region || !rootEl || !window.NotesAnchor) return { role: turnOf(n), mode: null }
    var resolved = window.NotesAnchor.resolve(rootEl, n.region)
    return {
      role: resolved === null && n.status !== 'resolved' ? 'outdated' : turnOf(n),
      mode: resolved ? resolved.mode : null,
    }
  }
  function regionStatusOf(n) { return regionInfo(n).role }

  // D9: `--c` is set on the badge itself, not inherited from an ancestor box — a badge painted
  // without a box ancestor (D8 strip rows, D6 card header) would otherwise render transparent
  // with near-white text, since custom properties only inherit down the DOM tree.
  // `doc` (default this document) is threaded through so a framed card built into
  // `window.parent.document` (D6) can still use this same badge builder.
  function regionBadge(id, role, doc) {
    doc = doc || document
    var badge = doc.createElement('span'); badge.className = 'nl-region-badge'
    badge.style.setProperty('--c', colorFor(role))
    var glyph = doc.createElement('span'); glyph.className = 'nl-region-glyph ' + glyphClassFor(role)
    badge.appendChild(glyph)
    badge.appendChild(doc.createTextNode(id))
    return badge
  }

  // ---- D8: the box → row intent, and the local (unframed) fallback -----------------------------
  // A box click/Enter never selects locally by itself (D8) — framed, it emits the intent upward;
  // unframed, there is no parent hook, so it takes the SAME path a `__nlSelect` call from the host
  // would: select without revealing (the box is already under the cursor).
  function pickNote(id) {
    if (window.parent !== window) {
      try { window.parent.__rvPick(id); return } catch (e) { /* no parent hook */ }
    }
    window.__nlSelect(id, { reveal: false })
  }

  // ---- D9: a data change reconciles an id -> element Map; a view-state change (selection) only
  // ever toggles `.sel`/`has-sel` and never re-enters this function. One delegated click listener
  // on boxLayer (data-id) replaces the old per-box `el.onclick`.
  var boxEls = new Map()
  var boxClickWired = false
  function renderOverlay() {
    if (!overlay || !boxLayer) return
    if (!rootEl || typeof rootEl.getBoundingClientRect !== 'function') return
    if (!boxClickWired) {
      boxClickWired = true
      boxLayer.addEventListener('click', function (e) {
        var el = e.target && e.target.closest ? e.target.closest('[data-id]') : null
        if (el) pickNote(el.getAttribute('data-id'))
      })
      boxLayer.addEventListener('keydown', function (e) {
        var el = e.target && e.target.closest ? e.target.closest('[data-id]') : null
        if (!el) return
        var id = el.getAttribute('data-id')
        var n = mockNotes.filter(function (m) { return m.id === id })[0]
        if (!n) return
        if (e.key === 'Enter') pickNote(id)
        else if ((e.key === 'a' || e.key === 'A') && n.status === 'addressed') api('resolve', { id: id, by: author, verdict: 'accepted' }).then(function () { return refresh(id) })
        else if ((e.key === 'r' || e.key === 'R') && n.status === 'addressed') pickNote(id)
      })
    }
    var rootRect = rootEl.getBoundingClientRect()
    // The host is position:absolute (page-relative), not fixed (viewport-relative) — add the
    // current scroll offset to the viewport rect so a box stays pinned to its element on a mock
    // taller than the viewport instead of drifting by the scroll amount.
    var scrollX = window.pageXOffset || 0
    var scrollY = window.pageYOffset || 0
    var seen = {}
    mockNotes.forEach(function (n) {
      if (!n.region || (n.state || 'default') !== activeState) { return }
      var resolved = window.NotesAnchor ? window.NotesAnchor.resolve(rootEl, n.region) : null
      var role = resolved === null && n.status !== 'resolved' ? 'outdated' : turnOf(n)
      // A dropped note reaches here only via the client mount (untouched by this spec, D4
      // Rationale) — box-wise it stays the "done" green it always painted; D5's new register has
      // no box role of its own for it.
      if (role === 'dropped') role = 'done'
      if (resolved === null) return // outdated -> no box, only the strip row explains it
      // specs/20260913/05-a-note-is-a-conversation.md D5/Behavior: "a green box is approved" — a
      // done note's box paints alongside the still-open ones now, never hidden behind the strip's
      // own "Show resolved" toggle (AC-20260913-05-7's fixture paints all three with no toggle
      // click at all). The toggle still governs the strip's own resolved-note ROWS, unchanged.
      seen[n.id] = true
      var box = resolved.box
      var el = boxEls.get(n.id)
      if (!el) {
        el = document.createElement('div')
        el.className = 'nl-region'
        el.tabIndex = 0
        el.setAttribute('data-id', n.id)
        el.style.pointerEvents = 'auto'
        boxEls.set(n.id, el)
        boxLayer.appendChild(el)
      }
      toggleClass(el, 'sel', selectedNoteId === n.id)
      // The badge (and its role-derived glyph) is only rebuilt when the role actually changed — a
      // pass triggered by a pure selection/mode change (D9's own view-state case) touches no note
      // data at all, so skipping needless DOM churn here keeps that path cheap, which matters for
      // a transitioning property elsewhere (viewer.css's `.nl-region` opacity, AC-8) that must not
      // have its paint delayed by unrelated work in the same task.
      if (el.getAttribute('data-status') !== role) {
        el.setAttribute('data-status', role)
        el.style.setProperty('--c', colorFor(role))
        // The box element itself (`el`), the one D9/AC-7 pins DOM identity on, is never replaced.
        el.innerHTML = ''
        el.appendChild(regionBadge(n.id, role))
      }
      el.style.left = (rootRect.left + scrollX + box.x) + 'px'
      el.style.top = (rootRect.top + scrollY + box.y) + 'px'
      el.style.width = Math.max(0, box.w) + 'px'
      el.style.height = Math.max(0, box.h) + 'px'
    })
    boxEls.forEach(function (el, id) {
      if (!seen[id]) { if (el.parentNode) el.parentNode.removeChild(el); boxEls.delete(id) }
    })
  }

  // ---- D8/D9: selection is state, toggled by class alone — never a renderOverlay re-entry.
  var selectedNoteId = null
  function setSelectedBox(id) {
    if (selectedNoteId === id) return
    var prevEl = selectedNoteId != null ? boxEls.get(selectedNoteId) : null
    toggleClass(prevEl, 'sel', false)
    selectedNoteId = id
    var curEl = id != null ? boxEls.get(id) : null
    toggleClass(curEl, 'sel', true)
    toggleClass(overlay, 'has-sel', id != null)
  }

  // ---- D6: toast-deferred POST (Delete/Withdraw/Resolve/Accept) --------------------------------
  function clearToast() { if (toastSlot) toastSlot.innerHTML = '' }
  function deferPost(label, doPost) {
    clearToast()
    if (!toastSlot) { doPost(); return }
    var toast = document.createElement('div'); toast.className = 'nl-toast'
    var span = document.createElement('span'); span.textContent = label
    var undo = document.createElement('button'); undo.textContent = 'Undo'
    var timer = setTimeout(function () { clearToast(); doPost() }, 5000)
    undo.onclick = function () { clearTimeout(timer); clearToast() }
    toast.appendChild(span); toast.appendChild(undo)
    toastSlot.appendChild(toast)
  }

  // ---- D6: the card — built into the framed document when framed, into this overlay's own
  // shadow root otherwise; there is exactly one card renderer either way. ------------------------
  function framed() { return window.parent !== window }
  function cardDoc() { return framed() ? window.parent.document : document }

  // D7: flip-then-shift, in VIEWPORT coordinates (the caller converts to page coordinates once,
  // after this decides left/top) — beside the box on the side with room, flipped to the other
  // flank when there is none, shifted along the cross axis to stay in the viewport, never
  // overlapping the box's own rectangle. `boxRect` is {left,top,right,bottom} in the SAME
  // coordinate space as `vw`/`vh` (viewport pixels). Shared in substance with review.browser.js's
  // `placeHostCard` — the identical rule, restated because this repo ships no shared
  // browser-script module system for two independently-served scripts to import from.
  // D7: beside the box on the side with room, flipped to the other flank when there is none,
  // shifted along the cross axis to stay in the viewport — but D7 carries no escape clause for
  // "neither flank has room": clamping the flipped side back into the viewport (the retired
  // `Math.min(anchorRect.right + 12, innerWidth - 340)` shape, under a new name) would put the
  // card ON TOP of its own box, which D7 forbids outright. When neither side fits, this falls
  // back to the OTHER axis instead — below the box, else above — shifted horizontally to stay in
  // the viewport, so the card is placed beside the box on whichever axis actually has room rather
  // than ever clamped over it.
  function flipThenShift(cw, ch, boxRect, vw, vh, gap) {
    gap = gap == null ? 12 : gap
    var right = boxRect.right + gap
    var left = boxRect.left - gap - cw
    if (right + cw <= vw || left >= 0) {
      var x = right + cw <= vw ? right : left
      var y = boxRect.top
      if (y + ch > vh) y = Math.max(0, vh - ch)
      if (y < 0) y = 0
      return { left: x, top: y }
    }
    var below = boxRect.bottom + gap
    var above = boxRect.top - gap - ch
    var y2 = below + ch <= vh ? below : (above >= 0 ? above : Math.max(0, vh - ch))
    var x2 = boxRect.left
    if (x2 + cw > vw) x2 = Math.max(0, vw - cw)
    if (x2 < 0) x2 = 0
    return { left: x2, top: y2 }
  }
  // Places a LOCAL (unframed) card beside `boxRect` (a viewport-relative rect, e.g. from
  // `getBoundingClientRect()`) — below 640px viewer.css's own media rule turns `.nl-card` into a
  // fixed bottom sheet (left:0;right:0;bottom:0), so left/top are left alone under that
  // breakpoint and the sheet owns its own layout entirely.
  function placeCardBeside(card, boxRect) {
    if (window.matchMedia && window.matchMedia('(max-width:640px)').matches) return
    var scrollX = window.pageXOffset || 0
    var scrollY = window.pageYOffset || 0
    var pos = flipThenShift(card.offsetWidth || 328, card.offsetHeight || 200, boxRect, window.innerWidth, window.innerHeight)
    card.style.left = (pos.left + scrollX) + 'px'
    card.style.top = (pos.top + scrollY) + 'px'
  }

  function closeCard() {
    var wasFramed = framed()
    if (cardSlot) cardSlot.innerHTML = ''
    if (wasFramed) { try { window.parent.__rvCardClose(window) } catch (e) { /* no parent hook */ } }
    setSelectedBox(null)
    // D1: closing a card returns to idle, or to arming when a re-place was pending.
    setMode(pendingReplace ? 'arming' : 'idle')
  }

  // specs/20260913/05-a-note-is-a-conversation.md D6: both sides of the thread render, oldest
  // first — the note's own text, then for each thread entry its `addressed.change` (a session
  // message) when present followed by its own text, then the note's current `addressed.change`
  // or legacy `reply` as the newest session message. Resolve/Accept/Send-back/Withdraw are gone:
  // one Reply box+button, Approve, Reject — the owner can keep writing until they approve or
  // reject, and Reject is final (D4).
  function buildCardChrome(doc, n, role) {
    var card = doc.createElement('div'); card.className = 'nl-card'

    var hd = doc.createElement('div'); hd.className = 'nl-card-hd'
    hd.appendChild(regionBadge(n.id, role, doc))
    if (n.reason) { var chip = doc.createElement('span'); chip.className = 'chip'; chip.textContent = n.reason; hd.appendChild(chip) }
    var whoEl = doc.createElement('span'); whoEl.textContent = n.by
    hd.appendChild(whoEl)
    card.appendChild(hd)

    if (role === 'outdated') {
      var notice = doc.createElement('div'); notice.className = 'nl-card-outdated'
      notice.textContent = 'Outdated — the area it marked is gone.'
      card.appendChild(notice)
    }

    var thread = doc.createElement('div'); thread.className = 'nl-card-thread'
    function msg(text, by) {
      var m = doc.createElement('div'); m.className = 'nl-card-msg' + (by === author ? ' nl-card-me' : '')
      var p = doc.createElement('div'); p.textContent = text
      var s = doc.createElement('small'); s.textContent = by
      m.appendChild(p); m.appendChild(s)
      thread.appendChild(m)
    }
    msg(n.text, n.by)
    ;(Array.isArray(n.thread) ? n.thread : []).forEach(function (e) {
      if (e.addressed && e.addressed.change != null) msg(e.addressed.change, 'session')
      msg(e.text, e.by)
    })
    if (n.addressed && n.addressed.change != null) msg(n.addressed.change, 'session')
    else if (n.reply) msg(n.reply, 'session')
    card.appendChild(thread)

    var row = doc.createElement('div'); row.className = 'nl-card-row'
    var sp = doc.createElement('span'); sp.className = 'sp'; row.appendChild(sp)

    if (n.status === 'open' || n.status === 'addressed') {
      var replyTa = doc.createElement('textarea'); replyTa.placeholder = 'Still not right? Say more.'
      card.appendChild(replyTa)
      var replyBtn = doc.createElement('button'); replyBtn.className = 'nl-btn'; replyBtn.textContent = 'Reply'
      replyBtn.onclick = function () {
        var v = replyTa.value.trim()
        if (!v) { replyTa.focus(); return }
        api('reopen', { id: n.id, text: v, by: author }).then(function () { return refresh(n.id) })
      }
      var acceptBtn = doc.createElement('button'); acceptBtn.className = 'nl-btn primary'; acceptBtn.textContent = 'Approve'
      var rejectBtn = doc.createElement('button'); rejectBtn.className = 'nl-btn'; rejectBtn.textContent = 'Reject'
      acceptBtn.onclick = function () {
        closeCard()
        deferPost('Approved', function () { api('resolve', { id: n.id, by: author, verdict: 'accepted' }).then(function () { return refresh(n.id) }) })
      }
      rejectBtn.onclick = function () {
        closeCard()
        deferPost('Rejected', function () { api('resolve', { id: n.id, by: author, verdict: 'withdrawn' }).then(function () { return refresh(n.id) }) })
      }
      row.appendChild(replyBtn); row.appendChild(acceptBtn); row.appendChild(rejectBtn)
    }

    // D6: the `…` menu keeps Re-place the box (outdated only) and Delete (an untouched, unreplied
    // open plain note only) — Withdraw is gone with the rest, and the menu itself is never
    // rendered when it would carry nothing.
    var threadEmpty = !Array.isArray(n.thread) || n.thread.length === 0
    var canDelete = n.status === 'open' && n.kind == null && threadEmpty
    var canReplace = role === 'outdated'
    if (canReplace || canDelete) {
      var moreWrap = doc.createElement('div'); moreWrap.className = 'nl-card-more'
      var moreBtn = doc.createElement('button'); moreBtn.className = 'nl-btn'; moreBtn.textContent = '…'
      moreBtn.onclick = function () {
        var existing = moreWrap.querySelector('.nl-card-menu')
        if (existing) { existing.remove(); return }
        var menu = doc.createElement('div'); menu.className = 'nl-card-menu'
        if (canReplace) {
          var replaceBtn = doc.createElement('button'); replaceBtn.textContent = 'Re-place the box'
          replaceBtn.onclick = function () {
            pendingReplace = n.id
            closeCard()
          }
          menu.appendChild(replaceBtn)
        }
        if (canDelete) {
          var deleteBtn = doc.createElement('button'); deleteBtn.textContent = 'Delete'
          deleteBtn.onclick = function () {
            closeCard()
            deferPost('Deleted', function () { api('delete', { id: n.id, by: author }).then(function () { return refresh(n.id) }) })
          }
          menu.appendChild(deleteBtn)
        }
        moreWrap.appendChild(menu)
      }
      moreWrap.appendChild(moreBtn)
      row.appendChild(moreWrap)
    }
    card.appendChild(row)
    return card
  }

  function openNoteCard(n) {
    setSelectedBox(n.id)
    setMode('composing')
    var status = regionStatusOf(n)
    var doc = cardDoc()
    var card = buildCardChrome(doc, n, status)
    if (framed()) {
      var resolved = n.region && window.NotesAnchor ? window.NotesAnchor.resolve(rootEl, n.region) : null
      // A frame-local box in the framed mock's own document coordinates, before the board's scale
      // (D6's Contracts). A note with no drawn box (a plain screen+state note, no region) has
      // nothing for the host to place beside — fall back to the root element's own frame-local
      // rect so the card still lands somewhere sane rather than throwing.
      var box = resolved ? resolved.box : (rootEl ? (function () {
        var r = rootEl.getBoundingClientRect()
        return { x: 0, y: 0, w: r.width, h: Math.min(r.height, 40) }
      })() : { x: 0, y: 0, w: 0, h: 0 })
      try { window.parent.__rvCardOpen(card, box, window) } catch (e) { /* no parent hook */ }
      return
    }
    if (!cardSlot) return
    cardSlot.innerHTML = ''
    cardSlot.appendChild(card)
    var anchorEl = (boxLayer && boxLayer.querySelector('[data-id="' + n.id + '"]')) || rootEl
    placeCardBeside(card, anchorEl.getBoundingClientRect())
  }

  // ---- D5: the draft composer at the box, and D7's Save note -----------------------------------
  // specs/20260913/07-the-critic-is-out.md D10: the reason chip row is retired — the composer is
  // a textarea and Save/Discard alone.
  function buildDraftCard(doc, region, box) {
    var card = doc.createElement('div'); card.className = 'nl-card'

    var ta = doc.createElement('textarea'); ta.placeholder = 'What is wrong here?'
    card.appendChild(ta)

    var row = doc.createElement('div'); row.className = 'nl-card-row'
    var sp = doc.createElement('span'); sp.className = 'sp'; row.appendChild(sp)
    var discard = doc.createElement('button'); discard.className = 'nl-btn'; discard.textContent = 'Discard'
    discard.onclick = function () { closeCard() }
    var save = doc.createElement('button'); save.className = 'nl-btn primary'; save.textContent = 'Save note'
    function doSave() {
      var text = ta.value.trim()
      if (!text) { ta.focus(); return }
      api('add', { scope: 'mock', screen: screen, state: activeState, text: text, by: author, region: region }).then(function () {
        closeCard()
        refresh()
      })
    }
    save.onclick = doSave
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSave() }
    })
    row.appendChild(discard); row.appendChild(save)
    card.appendChild(row)
    return { card: card, ta: ta }
  }
  function openDraftCard(region, box) {
    var doc = cardDoc()
    var built = buildDraftCard(doc, region, box)
    if (framed()) {
      try { window.parent.__rvCardOpen(built.card, box, window) } catch (e) { /* no parent hook */ }
      if (built.ta.focus) built.ta.focus()
      return
    }
    if (!cardSlot) return
    cardSlot.innerHTML = ''
    cardSlot.appendChild(built.card)
    // Same positioning contract as placeCardBeside() above: leave position/left/top to
    // viewer.css's own bottom-sheet media rule below 640px, otherwise place it beside the drawn
    // box (D7) — box/rootRect are viewport-relative, matching placeCardBeside's own input.
    var rootRect = rootEl.getBoundingClientRect()
    var boxRect = box
      ? { left: rootRect.left + box.x, top: rootRect.top + box.y, right: rootRect.left + box.x + box.w, bottom: rootRect.top + box.y + box.h }
      : { left: rootRect.left, top: rootRect.top, right: rootRect.left, bottom: rootRect.top }
    placeCardBeside(built.card, boxRect)
    if (built.ta.focus) built.ta.focus()
  }

  // ---- D1-D4: the mode machine, pointer capture on the overlay, and drag-to-draw ----------------
  // specs/20260913/02-the-layer-owns-one-mode-and-the-page-owns-the-card.md D1: one mode at a
  // time — 'idle'|'arming'|'drawing'|'composing' — changed only through setMode. The `marking`
  // boolean and the dragStart/draftEl/dragIsTouch/touchStart flags that used to encode mode
  // implicitly are retired as mode carriers; the drag's own geometry (dragStart/draftEl/etc.)
  // stays, since it is geometry, not mode.
  var mode = 'idle'
  var dragStart = null
  var draftEl = null
  var pendingReplace = null
  function setMode(next) {
    mode = next
    // The overlay's own `data-mode` is the only write here — the host's own pointer-events is a
    // permanent `none` (hostStyle) that the overlay's explicit per-mode value always overrides
    // when the overlay itself needs to be hit-testable, so no host-level class ever needs to
    // track mode.
    if (overlay) overlay.setAttribute('data-mode', mode)
    // D5: a one-line hint the first time arming is entered in this browser.
    if (mode === 'arming') {
      var seen = false
      try { seen = !!localStorage.getItem('nl-hint-seen') } catch (e) { seen = false }
      if (!seen && overlay) {
        var hint = document.createElement('div'); hint.className = 'nl-hint'
        hint.textContent = 'Drag over anything to leave a note'
        overlay.insertBefore(hint, overlay.firstChild)
        setTimeout(function () { if (hint.parentNode) hint.parentNode.removeChild(hint) }, 4000)
        try { localStorage.setItem('nl-hint-seen', '1') } catch (e) { /* in-memory only */ }
      }
    }
    // specs/20260913/05-a-note-is-a-conversation.md D8: whenever marking ends INSIDE the frame
    // (a save, a discard, or this frame's own Escape all route through here) the review page's
    // own `[data-rv="mark-area"]` button must unpress too — only the page's own button click or
    // its own Escape did that before. A no-op unframed, or when the parent hook does not exist.
    if (mode === 'idle' && window.parent !== window) {
      try { window.parent.__rvMarkOff(window) } catch (e) { /* no parent hook */ }
    }
    render()
  }
  function removeDraftEl() {
    if (draftEl && draftEl.parentNode) draftEl.parentNode.removeChild(draftEl)
    draftEl = null; dragStart = null; dragIsTouch = false
  }
  function updateDraft(x2, y2) {
    if (!draftEl || !dragStart) return
    var left = Math.min(dragStart.x, x2), top = Math.min(dragStart.y, y2)
    var w = Math.abs(x2 - dragStart.x), h = Math.abs(y2 - dragStart.y)
    // dragStart/x2/y2 are viewport-relative (clientX/clientY); the draft lives in the
    // position:absolute (page-relative) overlay, so the current scroll offset must be added —
    // same reasoning as renderOverlay's box placement above.
    draftEl.style.left = (left + (window.pageXOffset || 0)) + 'px'
    draftEl.style.top = (top + (window.pageYOffset || 0)) + 'px'
    draftEl.style.width = w + 'px'; draftEl.style.height = h + 'px'
    var sz = draftEl.querySelector('.nl-draft-size')
    if (sz) sz.textContent = Math.round(w) + '×' + Math.round(h)
  }
  // D4: both corners clamp to the mock document's own [0,scrollWidth]×[0,scrollHeight] box before
  // NotesAnchor.capture ever sees them — a release past the document's own edges must never
  // produce a region no re-anchor pass can resolve.
  function boxFromDrag(x2, y2) {
    var r = rootEl.getBoundingClientRect()
    var docW = pristineDocW
    var docH = pristineDocH
    var clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }
    var x1c = clamp(dragStart.x - r.left, 0, docW)
    var y1c = clamp(dragStart.y - r.top, 0, docH)
    var x2c = clamp(x2 - r.left, 0, docW)
    var y2c = clamp(y2 - r.top, 0, docH)
    var left = Math.min(x1c, x2c), top = Math.min(y1c, y2c)
    return { x: left, y: top, w: Math.abs(x2c - x1c), h: Math.abs(y2c - y1c) }
  }
  // specs/20260912/12-the-loop-re-anchors-and-everyone-draws.md D5: pointer events replace mouse
  // events (a mouse's own pointerType is 'mouse' — its drag starts immediately, byte-identical to
  // the pre-change mousedown/mousemove/mouseup timing). A `pointerType:'touch'` press starts the
  // draft only after a 350ms hold with no movement past 8px — a scroll gesture (finger moves
  // before the hold fires) never draws, so the hold timer is simply cleared and no draft is ever
  // created. A touch-originated drag also skips the pre-existing 12×12 accidental-click floor
  // below (mouse's own filter for a bare click, w=h=0): the 350ms hold is itself the deliberate
  // gesture, and a valid touch selection can be a thin, single-axis strip (drag straight down or
  // across).
  var touchHoldTimer = null
  var touchStart = null
  var dragIsTouch = false
  // D3: `lostpointercapture` aborts a drag ONLY when no `pointerup` has been seen for that
  // pointer id — it fires on every ordinary release too (measured, A3), so treating it
  // unconditionally as a cancel would discard every completed drag.
  var sawPointerUp = false
  function clearTouchHold() { if (touchHoldTimer) clearTimeout(touchHoldTimer); touchHoldTimer = null; touchStart = null }
  function beginDrag(x, y, isTouch) {
    dragIsTouch = !!isTouch
    dragStart = { x: x, y: y }
    draftEl = document.createElement('div'); draftEl.className = 'nl-draft'
    var sz = document.createElement('div'); sz.className = 'nl-draft-size'
    draftEl.appendChild(sz)
    overlay.appendChild(draftEl)
    updateDraft(x, y)
  }
  // D1: toggling arming with the 'm' key (or `__nlMark`) is a no-op mid-drag/mid-card — only
  // idle<->arming is reachable by the toggle.
  function toggleArming() {
    if (mode === 'idle') setMode('arming')
    else if (mode === 'arming') setMode('idle')
  }
  if (scope === 'mock' && rootEl) {
    // D2: pointerdown/pointermove/pointerup/pointercancel/lostpointercapture all bind on the
    // overlay ELEMENT — never `document` — and the handler calls `setPointerCapture` on that same
    // element, so every subsequent event for this pointer targets the overlay regardless of what
    // the layer's own chrome (`.nl-bar`, sitting above it in stacking order) or the mock underneath
    // would otherwise have received. The uncommitted click-swallowing shield this replaces is
    // deleted with the document listeners it used to guard.
    overlay.addEventListener('pointerdown', function (e) {
      if (mode !== 'arming') return
      // A mouse drag that crosses the viewport's own bottom/right edge (D4's own scenario — a
      // press near the corner, released past the document) can otherwise trigger the browser's
      // NATIVE text-selection auto-scroll, which moves the page under the drag between press and
      // release and desyncs `dragStart` (captured in the pre-scroll viewport frame) from the
      // release-time `getBoundingClientRect()` (the new, scrolled frame) — `preventDefault` here
      // suppresses that native selection/auto-scroll without affecting the pointer events
      // themselves (capture already keeps this element the sole target).
      if (e.preventDefault) e.preventDefault()
      try { overlay.setPointerCapture(e.pointerId) } catch (err) { /* already released, or unsupported */ }
      sawPointerUp = false
      if (e.pointerType === 'touch') {
        touchStart = { x: e.clientX, y: e.clientY }
        touchHoldTimer = setTimeout(function () {
          var x = touchStart.x, y = touchStart.y
          touchHoldTimer = null
          touchStart = null
          beginDrag(x, y, true)
          setMode('drawing')
        }, 350)
        return
      }
      beginDrag(e.clientX, e.clientY, false)
      setMode('drawing')
    })
    overlay.addEventListener('pointermove', function (e) {
      // Still inside the touch hold window: movement past 8px is a scroll, not a draw — cancel
      // the pending hold and draw nothing (mode stays 'arming').
      if (touchStart && !dragStart) {
        var dx = e.clientX - touchStart.x, dy = e.clientY - touchStart.y
        if (Math.sqrt(dx * dx + dy * dy) > 8) clearTouchHold()
        return
      }
      if (mode !== 'drawing') return
      updateDraft(e.clientX, e.clientY)
    })
    overlay.addEventListener('pointerup', function (e) {
      sawPointerUp = true
      if (touchHoldTimer) { clearTouchHold(); return } // released before the hold fired — no draft, mode stays 'arming'
      if (mode !== 'drawing') return
      var box = boxFromDrag(e.clientX, e.clientY)
      var wasTouch = dragIsTouch
      removeDraftEl()
      // D3: under 12×12 it is a click, not a box — the draft is removed (above) and mode returns
      // to 'arming', never 'idle' or 'drawing'. A touch-originated drag skips this floor (the
      // 350ms hold is itself the deliberate gesture).
      if (!wasTouch && (box.w < 12 || box.h < 12)) { setMode('arming'); return }
      var region = window.NotesAnchor.capture(rootEl, box)
      if (pendingReplace) {
        var noteId = pendingReplace
        pendingReplace = null
        setMode('idle')
        api('region', { id: noteId, region: region, by: author }).then(function () { return refresh(noteId) })
        return
      }
      setMode('composing')
      openDraftCard(region, box)
    })
    overlay.addEventListener('pointercancel', function (e) {
      if (mode !== 'drawing') return
      removeDraftEl()
      clearTouchHold()
      setMode('arming')
    })
    overlay.addEventListener('lostpointercapture', function (e) {
      if (mode !== 'drawing' || sawPointerUp) return
      removeDraftEl()
      clearTouchHold()
      setMode('arming')
    })
    on(document, 'keydown', function (e) {
      var tag = document.activeElement && document.activeElement.tagName
      var typing = tag === 'TEXTAREA' || tag === 'INPUT'
      if (e.key === 'Escape') {
        if (mode === 'drawing') { removeDraftEl(); clearTouchHold(); setMode('arming'); return }
        if (mode === 'composing') { closeCard(); return }
        if (mode === 'arming') { setMode('idle'); return }
        return
      }
      if (!typing && (e.key === 'm' || e.key === 'M')) toggleArming()
    })
    // D4: re-paint the overlay on resize (a state click already calls render() via the existing
    // stateButtons listener above).
    on(window, 'resize', renderOverlay)
  }

  var showResolved = false
  var mockNotes = []
  var projectNotes = []
  // D8: the strip's segmented filter — persisted per browser, defaulting to "Needs you".
  var filter = 'needsYou'
  try { filter = localStorage.getItem('nl-filter') || 'needsYou' } catch (e) { filter = 'needsYou' }

  // D6/D7/D7′: the project panel now lists every open note, flat — a project-scope row keeps its
  // plain <b> id badge, and so does a mock-scope row EVERYWHERE EXCEPT the project panel itself
  // (D7′(a): the swap is scoped to `isProject` — a served mock page's own strip keeps the plain
  // badge, since D8 gives the strip one thing only, the "Project notes ↗" link). Inside the
  // project panel, a mock-scope row swaps that badge for a `.nl-anchor` control: an `<a>` link to
  // the note's screen page (labelled "<screen> · <state>") when the screen's card AND its
  // iframe.frame both exist, or an inert `.nl-anchor.plain` span ("<screen> · not drawn")
  // otherwise — D7′(b): a gap chip carries id="s-<label>" with no iframe.frame, so the frame
  // itself (not merely the card id) is the anchor's gate, keeping a gap screen's pill inert.
  // specs/20260913/06-every-mock-has-a-page-you-can-mark.md D5: the lightbox is gone, so this no
  // longer opens the deleted lightbox — it links straight to /screen/<n.screen>.html, the one page
  // every screen now has.
  function mockAnchor(n) {
    var target = document.getElementById('s-' + n.screen)
    var frame = target && target.querySelector && target.querySelector('iframe.frame')
    if (frame) {
      var a = document.createElement('a')
      a.className = 'nl-anchor'
      a.href = __base + '/screen/' + encodeURIComponent(n.screen) + '.html'
      // mocks-driver.js's `--state` is optional (a question can be asked with none) — n.state is
      // then null, and "<screen> · null" is not a state. Name the screen alone rather than invent
      // a state that was never declared.
      a.textContent = n.state ? (n.screen + ' · ' + n.state) : n.screen
      return a
    }
    var span = document.createElement('span')
    span.className = 'nl-anchor plain'
    span.textContent = n.screen + ' · not drawn'
    return span
  }

  function noteRow(n, isProject) {
    var d = document.createElement('div')
    // D8: every row (region-carrying or not) gains data-id/data-status — the region-carrying
    // ones alone also swap the plain id badge for the box's own pill and gain the outdated
    // footnote; a plain screen+state note (no region) is unchanged from today.
    var info = regionInfo(n)
    var role = info.role
    d.className = 'n' + (n.status === 'resolved' ? ' done' : '')
    d.setAttribute('data-id', n.id)
    d.setAttribute('data-status', role)
    if (isProject && n.scope === 'mock') {
      d.appendChild(mockAnchor(n))
    } else if (n.region) {
      d.appendChild(regionBadge(n.id, role))
    } else {
      var idBadge = document.createElement('b'); idBadge.textContent = n.id
      d.appendChild(idBadge)
    }
    var t = document.createElement('span'); t.className = 't'
    var footnote = role === 'outdated'
      ? 'Outdated — the area it marked is gone.'
      : esc(n.by) + (n.status === 'resolved' ? ' · resolved by ' + esc(n.resolvedBy) : '')
    // D8: a box that resolved in `children` mode (union of surviving children, not the original
    // exact element) gets this appended so the owner can tell the anchor fitted rather than found.
    if (info.mode === 'children') footnote += ' · fitted to content on this size'
    t.innerHTML = esc(n.text) + '<small>' + footnote + '</small>'
    d.appendChild(t)
    if (n.region) {
      d.style.cursor = 'pointer'
      // D8: clicking the mock's OWN strip row is a reveal (the box may be off-screen) — the same
      // `__nlSelect(id, {reveal:true})` path a review-page rail row drives, restated locally since
      // there is no parent host here to call it through.
      d.onclick = function () { window.__nlSelect(n.id, { reveal: true }) }
      d.addEventListener('mouseenter', function () {
        var box = boxLayer && boxLayer.querySelector('[data-id="' + n.id + '"]')
        if (box) { box.classList.add('pulse'); setTimeout(function () { box.classList.remove('pulse') }, 700) }
      })
    } else if (n.status !== 'resolved') {
      var resolveBtn = document.createElement('button')
      resolveBtn.className = 'nl-btn'; resolveBtn.textContent = 'Resolve'
      // specs/20260913/05-a-note-is-a-conversation.md D6: the strip row's Resolve button is an
      // Approve, told apart from Reject the same way the card's own Approve is.
      resolveBtn.onclick = function () { api('resolve', { id: n.id, by: author, verdict: 'accepted' }).then(function () { return refresh(n.id) }) }
      d.appendChild(resolveBtn)
    }
    return d
  }

  // `allowProjectToggle` (mock composer only) adds a "This screen | Whole project" scope toggle;
  // `onSave(text, sendAsProject)` is called only when the textarea is non-empty.
  // specs/20260913/07-the-critic-is-out.md D10: the reason chip row is retired — the freed height
  // goes to the textarea. Class names below are the exact `.nl-scope`/`.nl-scope-on` register
  // spec/templates/mocks/viewer.css declares (a parallel doctrine change, never touched here) —
  // this layer emits only those names, never an invented sibling.
  function buildComposer(container, placeholder, allowProjectToggle, onSave) {
    var box = document.createElement('div')
    var sendAsProject = false

    if (allowProjectToggle) {
      var toggleRow = document.createElement('div'); toggleRow.className = 'nl-scope'
      var thisScreen = document.createElement('button')
      thisScreen.className = 'nl-btn nl-scope-on'; thisScreen.textContent = 'This screen'
      var wholeProject = document.createElement('button')
      wholeProject.className = 'nl-btn'; wholeProject.textContent = 'Whole project'
      thisScreen.onclick = function () { sendAsProject = false; thisScreen.className = 'nl-btn nl-scope-on'; wholeProject.className = 'nl-btn' }
      wholeProject.onclick = function () { sendAsProject = true; wholeProject.className = 'nl-btn nl-scope-on'; thisScreen.className = 'nl-btn' }
      toggleRow.appendChild(thisScreen); toggleRow.appendChild(wholeProject)
      box.appendChild(toggleRow)
    }

    var ta = document.createElement('textarea'); ta.placeholder = placeholder
    var row = document.createElement('div'); row.className = 'nl-row'
    var cancel = document.createElement('button'); cancel.className = 'nl-btn'; cancel.textContent = 'Cancel'
    var save = document.createElement('button'); save.className = 'nl-btn primary'; save.textContent = 'Save'
    cancel.onclick = render
    save.onclick = function () { if (ta.value.trim()) onSave(ta.value.trim(), sendAsProject) }
    row.appendChild(cancel); row.appendChild(save)
    box.appendChild(ta); box.appendChild(row)
    container.appendChild(box)
    if (ta.focus) ta.focus()
  }
  function composeProject() {
    buildComposer(proj, 'Direction-level: what is wrong with the whole set, or where should it go?', false, function (text) {
      api('add', { scope: 'project', screen: null, state: null, text: text, by: author }).then(function () { return refresh() })
    })
  }
  function composeMock() {
    buildComposer(strip, 'What is wrong with "' + activeState + '", or what should change?', true, function (text, sendAsProject) {
      if (sendAsProject) {
        api('add', { scope: 'project', screen: null, state: null, text: text, by: author }).then(function () { return refresh() })
      } else {
        api('add', { scope: 'mock', screen: screen, state: activeState, text: text, by: author }).then(function () { return refresh() })
      }
    })
  }

  // specs/20260913/07-the-critic-is-out.md D6/D8: a legacy `kind: "question"` note was never
  // written by a person and is never rendered here — the two-clause exclusion below inlines the
  // same predicate lib/mocks-notes.js's authoredByPerson names (this browser file cannot import
  // the lib).
  function authoredByPerson(n) { return n.kind !== 'question' && n.kind !== 'walk' }
  // specs/20260913/05-a-note-is-a-conversation.md D1: turnOf's home is lib/mocks-notes.js —
  // inlined here (and in review.browser.js) because neither browser file can require the lib.
  function turnOf(n) {
    if (n.status === 'resolved') return n.resolution === 'withdrawn' ? 'dropped' : 'done'
    return (n.addressed || n.reply) ? 'you' : 'session'
  }
  function isOpenNote(n) { return n.status !== 'resolved' }

  function render() {
    var openMock = mockNotes.filter(isOpenNote).length
    var openProj = projectNotes.filter(isOpenNote).length
    // D8: the mock-scope bar counter gains a "need you" (addressed) count alongside "open".
    var needsYou = mockNotes.filter(function (n) { return n.status === 'addressed' }).length

    bar.innerHTML = ''
    var badge = document.createElement('span')
    badge.textContent = scope === 'project'
      ? openProj + ' open'
      : openMock + ' open' + (needsYou ? ' · ' + needsYou + ' need you' : '')
    bar.appendChild(badge)
    if (scope === 'project') {
      var addProjBtn = document.createElement('button'); addProjBtn.className = 'nl-btn primary'
      addProjBtn.textContent = '+ Project note'; addProjBtn.onclick = composeProject
      bar.appendChild(addProjBtn)
    } else {
      var addMockBtn = document.createElement('button'); addMockBtn.className = 'nl-btn primary'
      addMockBtn.textContent = '+ Note on this state'; addMockBtn.onclick = composeMock
      bar.appendChild(addMockBtn)
      // D5: the Mark area toggle — mock scope only, since it draws a box against the mock root.
      var isArming = mode === 'arming' || mode === 'drawing'
      var markBtn = document.createElement('button'); markBtn.className = 'nl-btn' + (isArming ? ' on' : '')
      markBtn.textContent = isArming ? 'Marking · Esc to stop' : 'Mark area'
      markBtn.onclick = function () { toggleArming() }
      bar.appendChild(markBtn)
    }
    var showBtn = document.createElement('button'); showBtn.className = 'nl-btn'
    showBtn.textContent = showResolved ? 'Hide resolved' : 'Show resolved'
    showBtn.onclick = function () { showResolved = !showResolved; render() }
    var authorBtn = document.createElement('button'); authorBtn.className = 'nl-btn'; authorBtn.textContent = author
    authorBtn.onclick = function () {
      var name = (window.prompt('Your name (shown on your notes)', author) || '').trim()
      if (name) { author = name; try { localStorage.setItem('nl-author', author) } catch (e) { /* in-memory only */ } }
      render()
    }
    bar.appendChild(showBtn); bar.appendChild(authorBtn)

    if (proj) {
      proj.innerHTML = ''
      var projHead = document.createElement('h4'); projHead.textContent = 'Project notes (' + openProj + ' open)'
      proj.appendChild(projHead)
      // specs/20260913/07-the-critic-is-out.md D8: a note a person did not type is never shown.
      projectNotes.filter(function (n) { return authoredByPerson(n) && (showResolved || n.status !== 'resolved') })
        .forEach(function (n) { proj.appendChild(noteRow(n, true)) })
      var projAdd = document.createElement('button'); projAdd.className = 'nl-btn'; projAdd.textContent = '+ Note'
      projAdd.onclick = composeProject
      proj.appendChild(projAdd)
    }

    if (strip) {
      strip.innerHTML = ''
      var stripHead = document.createElement('h4'); stripHead.textContent = 'Notes — ' + activeState
      // D8: one link back to the atlas's project panel, landing on #nl-notes — the served mock
      // page never opens the project panel in place (that would render a second scope and break
      // the layer's one-panel-per-scope rule), so the return path is a same-tab navigation.
      var upLink = document.createElement('a'); upLink.className = 'nl-up'
      upLink.textContent = 'Project notes ↗'
      upLink.href = __base + '/atlas/index.html#nl-notes'
      stripHead.appendChild(upLink)
      // D8: the segmented filter — Needs you (addressed) · Open · All · Resolved, default Needs
      // you, stored under nl-filter. Scoped to region-carrying notes only: a plain screen+state
      // note (no region, predating this spec) keeps its old unconditional visibility so an
      // existing host's non-region workflow never regresses.
      var seg = document.createElement('div'); seg.className = 'nl-seg'
      ;[['needsYou', 'Needs you'], ['open', 'Open'], ['all', 'All'], ['resolved', 'Resolved']].forEach(function (pair) {
        var segBtn = document.createElement('button')
        segBtn.textContent = pair[1]
        segBtn.setAttribute('aria-pressed', filter === pair[0] ? 'true' : 'false')
        segBtn.onclick = function () {
          filter = pair[0]
          try { localStorage.setItem('nl-filter', filter) } catch (e) { /* in-memory only */ }
          render()
        }
        seg.appendChild(segBtn)
      })
      stripHead.appendChild(seg)
      strip.appendChild(stripHead)
      var stripRows = mockNotes.filter(function (n) {
        if (!authoredByPerson(n)) return false
        if ((n.state || 'default') !== activeState) return false
        if (!n.region) return showResolved || n.status !== 'resolved'
        var role = regionStatusOf(n)
        if (filter === 'resolved') return role === 'done'
        if (filter === 'all') return showResolved || role !== 'done'
        if (filter === 'open') return role === 'session' || role === 'outdated'
        return role === 'you' || role === 'outdated' // needsYou (default)
      })
      if (!stripRows.length) {
        var empty = document.createElement('p')
        empty.textContent = filter === 'needsYou' ? 'Nothing waiting on you here.' : 'No notes on this state yet. Drag over anything to add one.'
        strip.appendChild(empty)
      } else {
        stripRows.forEach(function (n) { strip.appendChild(noteRow(n, false)) })
      }
      var stripAdd = document.createElement('button'); stripAdd.className = 'nl-btn'; stripAdd.textContent = '+ Note on this state'
      stripAdd.onclick = composeMock
      strip.appendChild(stripAdd)
    }
    renderOverlay()
  }

  // D10: the review page's per-board eye — hides or shows this frame's box layer entirely
  // (display:none on the whole layer, never per box), so a hidden box reports zero client rects.
  // Not persisted — a fresh load always starts shown. Hiding marks while a card is open closes
  // the card — a card with no visible box has no anchor.
  window.__nlPins = function (on) {
    if (boxLayer) setStyle(boxLayer, { display: on ? '' : 'none' })
    if (!on && mode === 'composing') closeCard()
  }

  // D11: the review page's "Mark an area" ghost action — the drag, the draft and the note itself
  // stay entirely inside this frame's own layer. `__nlMark(on)` is now `setMode('arming'|'idle')`.
  window.__nlMark = function (on) {
    setMode(on ? 'arming' : 'idle')
  }

  // specs/20260913/05-a-note-is-a-conversation.md D9: the review page's switchTab calls this on
  // the OUTGOING frame before hiding it — the card belongs to the frame being hidden, so it is
  // closed through this frame's own closeCard() (which also clears the page's cardhost via
  // __rvCardClose and returns this frame to idle), never reached into from the page directly.
  window.__nlCloseCard = function () {
    if (mode === 'composing') closeCard()
  }

  // specs/20260913/02-the-layer-owns-one-mode-and-the-page-owns-the-card.md D8: `__nlFocus` is
  // RETIRED — its two behaviors (select, reveal) are separated here. `opts.reveal` gates the
  // scroll+pulse; selection itself (the 'sel'/'has-sel' toggle) and opening the card happen
  // through `openNoteCard` -> `setSelectedBox` regardless of `reveal`. A no-op on an id this page
  // has never painted a box for (unknown note, or the box has not resolved on the active state) —
  // the note may still exist (a plain screen+state note with no region), so the card can still
  // open even when `box` below is null.
  window.__nlSelect = function (id, opts) {
    opts = opts || {}
    var box = boxLayer ? boxLayer.querySelector('[data-id="' + id + '"]') : null
    if (opts.reveal) {
      if (box && box.scrollIntoView) box.scrollIntoView({ block: 'center' })
      if (box) { box.classList.add('pulse'); setTimeout(function () { box.classList.remove('pulse') }, 700) }
    }
    var note = mockNotes.filter(function (n) { return n.id === id })[0]
    if (note) openNoteCard(note)
  }

  // D5/D6: a page fetches only the list its declared scope owns — a mock page never fetches the
  // project-wide list, a project page never fetches a per-screen list. D6: the project panel now
  // requests screen=** (every note, ledger-joined identically) so it can list a mock-scope note
  // too — screen=* would return only project-scope notes, the gap A1's micro-spike found.
  // `touchedId` names the note the landed POST changed (none for a fresh add or the initial load).
  function refresh(touchedId) {
    if (scope === 'project') {
      return fetch(__base + '/__notes/list?screen=**').then(function (r) { return r.json() }).then(function (list) {
        projectNotes = list || []
        render()
      })
    }
    return fetch(__base + '/__notes/list?screen=' + encodeURIComponent(screen || '')).then(function (r) { return r.json() }).then(function (list) {
      mockNotes = list || []
      render()
      // specs/20260913/05-a-note-is-a-conversation.md UI table: "Reply (card or row) | card:
      // re-renders with your words as the newest message" — render() never touches cardSlot
      // (only open/compose paths do), so a card left open across this refresh (selectedNoteId
      // survives render()) is rebuilt here from the server's just-fetched answer, never from the
      // request that was sent. A refused POST never reaches this .then at all, so the box the
      // owner typed into is left exactly as they left it. The rebuild is scoped to the note the
      // POST touched: a deferred Approve/Reject/Delete lands ~5s after its card closed, and
      // rebuilding whatever card is open by then would wipe a draft typed into a different note.
      if (selectedNoteId != null && selectedNoteId === touchedId) {
        var openNote = mockNotes.filter(function (n) { return n.id === selectedNoteId })[0]
        if (openNote) openNoteCard(openNote)
      }
    })
  }
  refresh()
})()
