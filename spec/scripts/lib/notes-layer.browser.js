// notes-layer.browser.js — served verbatim as GET /__notes/notes.js by design-atlas.js's
// `serve`, injected before </body> on every served mock page unless the request carries
// ?clean. specs/20260902/10-page-notes-review-loop.md D3; specs/20260905/01-picks-on-the-atlas-page.md D5.
//
// specs/20260906/03-questions-on-the-wireframe.md D5: a note carrying kind:"question" renders as
// a distinct row (id badge, "I assumed <claim>", "I rejected: <rejected>" when present) with
// three controls — Yes/No(+text)/Later — that POST /__notes/answer; an answered question renders
// "You confirmed"/"You corrected: <text>" and no controls. The composer on both scopes gains a
// reason chip row; the mock-page composer alone gains a "Whole project" scope toggle. New
// question-specific chrome carries `nl-q`-prefixed classes so spec/templates/mocks/viewer.css (a
// parallel doctrine change, never touched here) can style it — this file adds no new local CSS
// rule for them.
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
// This is a browser script, not a Node module — no `require`, no `module.exports`, evaluated by
// the page it is injected into.
'use strict'
;(function () {
  if (new URLSearchParams(location.search).has('clean')) return

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
  // D5: while the lightbox is open, the served page's own bar/panel are hidden — the framed
  // mock's own bar (inside the lightbox iframe, a different document) is the only one visible.
  hostStyle.textContent = 'body.lb-open .nl-host{display:none}'
  document.head.appendChild(hostStyle)

  var css =
    '.nl-bar,.nl-strip,.nl-proj{font:15px/1.5 var(--v-font);color:var(--v-fg)}' +
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
  var activeState = stateButtons.length ? stateButtons[0].getAttribute('data-state-btn') : 'default'
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

  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] })
  }
  function api(p, body) {
    var opts = body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined
    return fetch(__base + '/__notes/' + p, opts).then(function (r) { return r.json() })
  }

  var bar = document.createElement('div'); bar.className = 'nl-bar'
  document.body.appendChild(mount(bar))

  // D5: exactly one panel exists per page, matching the declared scope — a project page never
  // gets an nl-strip (mock notes belong on the screen), a mock page never gets an nl-proj (project
  // notes belong on the atlas).
  var proj = null
  var strip = null
  if (scope === 'project') {
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
  } else {
    strip = document.createElement('div'); strip.className = 'nl-strip'
    var stripAnchor = rootEl || document.body
    stripAnchor.insertAdjacentElement('afterend', mount(strip))
  }

  var showResolved = false
  var mockNotes = []
  var projectNotes = []

  // D6/D7/D7′: the project panel now lists every open note, flat — a project-scope row keeps its
  // plain <b> id badge, and so does a mock-scope row EVERYWHERE EXCEPT the project panel itself
  // (D7′(a): the swap is scoped to `isProject` — a served mock page's own strip keeps the plain
  // badge, since D8 gives the strip one thing only, the "Project notes ↗" link). Inside the
  // project panel, a mock-scope row swaps that badge for a `.nl-anchor` control: a button
  // (labelled "<screen> · <state>") when the screen's card AND its iframe.frame AND
  // window.__lbOpen all exist, or an inert `.nl-anchor.plain` span ("<screen> · not drawn")
  // otherwise — D7′(b): a gap chip carries id="s-<label>" with no iframe.frame, so the frame
  // itself (not merely the card id) is the button's gate, keeping a gap screen's pill inert. The
  // button targets that SAME iframe.frame, the one a card click opens — never a navigation (D9:
  // no query-string state deep link anywhere in this file). Shared by noteRow AND questionRow —
  // every ledger question is scope:"mock" (mocks-driver.js creates them that way), so it needs
  // the identical screen-and-state pill a plain mock-scope note gets.
  function mockAnchor(n) {
    var target = document.getElementById('s-' + n.screen)
    var frame = target && target.querySelector && target.querySelector('iframe.frame')
    if (frame && window.__lbOpen) {
      var btn = document.createElement('button')
      btn.className = 'nl-anchor'
      // mocks-driver.js's `--state` is optional (a question can be asked with none) — n.state is
      // then null, and "<screen> · null" is not a state. Name the screen alone rather than invent
      // a state that was never declared.
      btn.textContent = n.state ? (n.screen + ' · ' + n.state) : n.screen
      btn.onclick = function () {
        if (window.__lbOpen) window.__lbOpen(frame)
      }
      return btn
    }
    var span = document.createElement('span')
    span.className = 'nl-anchor plain'
    span.textContent = n.screen + ' · not drawn'
    return span
  }

  function noteRow(n, isProject) {
    var d = document.createElement('div')
    d.className = 'n' + (n.status === 'resolved' ? ' done' : '')
    if (isProject && n.scope === 'mock') {
      d.appendChild(mockAnchor(n))
    } else {
      var idBadge = document.createElement('b'); idBadge.textContent = n.id
      d.appendChild(idBadge)
    }
    var t = document.createElement('span'); t.className = 't'
    t.innerHTML = esc(n.text) + '<small>' + esc(n.by) + (n.status === 'resolved' ? ' · resolved by ' + esc(n.resolvedBy) : '') + '</small>'
    d.appendChild(t)
    if (n.status !== 'resolved') {
      var resolveBtn = document.createElement('button')
      resolveBtn.className = 'nl-btn'; resolveBtn.textContent = 'Resolve'
      resolveBtn.onclick = function () { api('resolve', { id: n.id, by: author }).then(refresh) }
      d.appendChild(resolveBtn)
    }
    return d
  }

  // D5: the reason chip row shared by both scopes' composers — "Other" is the default until a
  // different chip is clicked.
  var REASONS = [
    { label: 'Missing screen', value: 'missing-screen' },
    { label: 'Wrong direction', value: 'wrong-direction' },
    { label: 'Wrong words', value: 'wrong-words' },
    { label: 'Other', value: 'other' },
  ]

  // `allowProjectToggle` (mock composer only) adds a "This screen | Whole project" scope toggle;
  // `onSave(text, reason, sendAsProject)` is called only when the textarea is non-empty.
  // Class names below are the exact `.nl-chips`/`.nl-chip`/`.nl-chip-on`/`.nl-scope`/`.nl-scope-on`
  // register spec/templates/mocks/viewer.css declares (a parallel doctrine change, never touched
  // here) — this layer emits only those names, never an invented sibling.
  function buildComposer(container, placeholder, allowProjectToggle, onSave) {
    var box = document.createElement('div')
    var reason = 'other'
    var sendAsProject = false

    var chipsRow = document.createElement('div'); chipsRow.className = 'nl-chips'
    var chipEls = []
    REASONS.forEach(function (r) {
      var chip = document.createElement('button')
      chip.className = 'nl-btn nl-chip' + (r.value === 'other' ? ' nl-chip-on' : '')
      chip.textContent = r.label
      chip.onclick = function () {
        reason = r.value
        chipEls.forEach(function (c) { c.el.className = 'nl-btn nl-chip' + (c.value === reason ? ' nl-chip-on' : '') })
      }
      chipEls.push({ el: chip, value: r.value })
      chipsRow.appendChild(chip)
    })
    box.appendChild(chipsRow)

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
    save.onclick = function () { if (ta.value.trim()) onSave(ta.value.trim(), reason, sendAsProject) }
    row.appendChild(cancel); row.appendChild(save)
    box.appendChild(ta); box.appendChild(row)
    container.appendChild(box)
    if (ta.focus) ta.focus()
  }
  function composeProject() {
    buildComposer(proj, 'Direction-level: what is wrong with the whole set, or where should it go?', false, function (text, reason) {
      api('add', { scope: 'project', screen: null, state: null, text: text, by: author, reason: reason }).then(refresh)
    })
  }
  function composeMock() {
    buildComposer(strip, 'What is wrong with "' + activeState + '", or what should change?', true, function (text, reason, sendAsProject) {
      if (sendAsProject) {
        api('add', { scope: 'project', screen: null, state: null, text: text, by: author, reason: reason }).then(refresh)
      } else {
        api('add', { scope: 'mock', screen: screen, state: activeState, text: text, by: author, reason: reason }).then(refresh)
      }
    })
  }

  // D5: a question row — id badge, "I assumed <claim>", "I rejected: <rejected>" when present,
  // and three controls (Yes/No+text/Later) while open; "You confirmed"/"You corrected: <text>"
  // and no controls once answered. s0 fix: open/answered keys on `answer == null`, never
  // `status` — a question's status can later move to "addressed" (the session's own `notes
  // address` follow-up recording a redraw after a "no") without ever un-answering it. Class
  // names are the exact `.nl-q`/`.nl-q-id`/`.nl-q-claim`/`.nl-q-rejected`/`.nl-q-actions`/
  // `.nl-q-answered`/`.nl-q-text` register viewer.css declares (never touched here). D7/D7′: in
  // the project panel a question note (always scope:"mock" — mocks-driver.js's own creation)
  // gets the same mockAnchor swap noteRow's plain notes get, replacing the ledger id badge; the
  // ledger-specific claim/rejected/answered treatment below is unchanged either way.
  function questionRow(n, isProject) {
    var answered = n.answer != null
    var d = document.createElement('div')
    d.className = 'n nl-q' + (answered ? ' done' : '')
    var idBadge
    if (isProject && n.scope === 'mock') {
      idBadge = mockAnchor(n)
    } else {
      idBadge = document.createElement('b'); idBadge.className = 'nl-q-id'; idBadge.textContent = n.ledgerId || n.id
    }
    var body = document.createElement('span'); body.className = 't'
    var assumed = document.createElement('div'); assumed.className = 'nl-q-claim'
    assumed.textContent = 'I assumed ' + (n.claim != null ? n.claim : n.text)
    body.appendChild(assumed)
    if (n.rejected) {
      var rejected = document.createElement('small'); rejected.className = 'nl-q-rejected'
      rejected.textContent = 'I rejected: ' + n.rejected
      body.appendChild(rejected)
    }
    d.appendChild(idBadge); d.appendChild(body)

    if (answered) {
      var verdict = document.createElement('small'); verdict.className = 'nl-q-answered'
      verdict.textContent = n.answer.verdict === 'no' ? 'You corrected: ' + n.answer.text : 'You confirmed'
      body.appendChild(verdict)
      return d
    }

    var controls = document.createElement('div'); controls.className = 'nl-row nl-q-actions'
    var yesBtn = document.createElement('button'); yesBtn.className = 'nl-btn'; yesBtn.textContent = "Yes, that's right"
    yesBtn.onclick = function () { api('answer', { id: n.id, verdict: 'yes', by: author }).then(refresh) }
    var noBtn = document.createElement('button'); noBtn.className = 'nl-btn'; noBtn.textContent = "No, it's…"
    noBtn.onclick = function () {
      var box = document.createElement('div')
      var ta = document.createElement('textarea'); ta.className = 'nl-q-text'; ta.placeholder = 'What is actually true?'
      var save = document.createElement('button'); save.className = 'nl-btn primary'; save.textContent = 'Save'
      save.onclick = function () {
        if (!ta.value.trim()) return
        api('answer', { id: n.id, verdict: 'no', text: ta.value.trim(), by: author }).then(refresh)
      }
      box.appendChild(ta); box.appendChild(save)
      d.appendChild(box)
      if (ta.focus) ta.focus()
    }
    var laterBtn = document.createElement('button'); laterBtn.className = 'nl-btn'; laterBtn.textContent = 'Later'
    laterBtn.onclick = function () { /* nothing written — the question stays open */ }
    controls.appendChild(yesBtn); controls.appendChild(noBtn); controls.appendChild(laterBtn)
    d.appendChild(controls)
    return d
  }

  // s0 fix: a question's "open" is `answer == null`, never `status` — used everywhere below that
  // counts or renders "open" vs. settled notes.
  function isOpenNote(n) { return n.kind === 'question' ? n.answer == null : n.status !== 'resolved' }

  function render() {
    var openMock = mockNotes.filter(isOpenNote).length
    var openProj = projectNotes.filter(isOpenNote).length

    bar.innerHTML = ''
    var badge = document.createElement('span')
    badge.textContent = (scope === 'project' ? openProj : openMock) + ' open'
    bar.appendChild(badge)
    if (scope === 'project') {
      var addProjBtn = document.createElement('button'); addProjBtn.className = 'nl-btn primary'
      addProjBtn.textContent = '+ Project note'; addProjBtn.onclick = composeProject
      bar.appendChild(addProjBtn)
    } else {
      var addMockBtn = document.createElement('button'); addMockBtn.className = 'nl-btn primary'
      addMockBtn.textContent = '+ Note on this state'; addMockBtn.onclick = composeMock
      bar.appendChild(addMockBtn)
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
      // D5: an answered question stays visible (its own row already reads as settled — "You
      // confirmed"/"You corrected") — only a plain resolved note hides behind "Show resolved".
      projectNotes.filter(function (n) { return n.kind === 'question' || showResolved || n.status !== 'resolved' })
        .forEach(function (n) { proj.appendChild(n.kind === 'question' ? questionRow(n, true) : noteRow(n, true)) })
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
      strip.appendChild(stripHead)
      mockNotes.filter(function (n) { return n.state === activeState && (n.kind === 'question' || showResolved || n.status !== 'resolved') })
        .forEach(function (n) { strip.appendChild(n.kind === 'question' ? questionRow(n, false) : noteRow(n, false)) })
      var stripAdd = document.createElement('button'); stripAdd.className = 'nl-btn'; stripAdd.textContent = '+ Note on this state'
      stripAdd.onclick = composeMock
      strip.appendChild(stripAdd)
    }
  }

  // D5/D6: a page fetches only the list its declared scope owns — a mock page never fetches the
  // project-wide list, a project page never fetches a per-screen list. D6: the project panel now
  // requests screen=** (every note, ledger-joined identically) so it can list a mock-scope note
  // too — screen=* would return only project-scope notes, the gap A1's micro-spike found.
  function refresh() {
    if (scope === 'project') {
      return fetch(__base + '/__notes/list?screen=**').then(function (r) { return r.json() }).then(function (list) {
        projectNotes = list || []
        render()
      })
    }
    return fetch(__base + '/__notes/list?screen=' + encodeURIComponent(screen || '')).then(function (r) { return r.json() }).then(function (list) {
      mockNotes = list || []
      render()
    })
  }
  refresh()
})()
