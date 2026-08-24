// render-inventory.browser.js — the in-page measuring script the host's `design.render.capture`
// command evaluates inside a real page (Contracts: `(${fn})(${JSON.stringify({theme, state})})`).
//
// WHY this file is a bare JS EXPRESSION, not a module: specs/20260824/01-render-gate.md D1/D2
// (2026-08-24, ADR-0002) — the plugin never launches a browser (D1: dependency/tool-naming
// cost). The host's own capture command is the only thing that runs inside a page, so this file
// has to be something a page-evaluate call can hand a value straight to: one expression
// evaluating to `(opts) => inventoryDocument`. No module wrapper, no shebang, no `require`/
// `import`, and — per the entry rules below — zero Node APIs; it reads only `document`, ambient
// `getComputedStyle`, and `window`'s scroll offsets, the surfaces a captured page actually has.
//
// WHAT IT MEASURES (D2/D3/D11, prax + salon-os spikes, 2026-08-24 A1): an accessibility-tree-
// shaped walk of `[data-screen-label]` (or `body`) in document order. Own PAINTED text — text
// nodes with the element's own computed text-transform applied, never raw textContent — closes
// the measured `4h`->`4H` false positive. `aria-label` is kept as a separate `name` facet rather
// than folded into the matched text, closing the measured label/glyph collision. `outOfFlow`/
// `fixed`/`dataPositioned` are structural flags (inherited downward from position/ancestor), not
// tolerances — render-compare.js is the ONLY place they turn into exclusions or findings.
//
// What this deliberately does NOT do: screenshot or read any pixel data (D7 — pixels are not a
// signal here, ever); apply any GEOMETRY tolerance or text-matching logic (that is render-
// compare.js's job, over this file's OUTPUT, never here); call `document.querySelector` for its
// own root/state-button lookup — the capture contract's own stub-DOM surface (AC-20260824-01-13)
// guarantees only tagName/getAttribute/hasAttribute/childNodes/children/innerText/
// getBoundingClientRect/click per element, so both lookups are this file's own manual walk over
// `children`; assume any DOM method not in that list — every optional lookup below is guarded.
//
// Exit codes: n/a — not an entrypoint. The host's capture command owns exit 0/non-zero for the
// process that evaluates this file; this expression only ever returns a document or throws.

(function (opts) {
  var theme = opts && opts.theme
  var state = opts && opts.state

  // opts.theme is written to documentElement's data-theme BEFORE walking (Contracts) — every
  // theme-scoped computed style below must see the theme that was requested, not the page's
  // default.
  if (document && document.documentElement && typeof document.documentElement.setAttribute === 'function') {
    document.documentElement.setAttribute('data-theme', theme)
  }

  // The capture contract's own stub-DOM surface (AC-20260824-01-13) guarantees only
  // tagName/getAttribute/hasAttribute/childNodes/children/innerText/getBoundingClientRect/click
  // on an element, and NOT document.querySelector — so root/state-button lookup is this file's
  // own manual tree walk over `children`, never a selector query.
  function findFirstElement(root, predicate) {
    if (!root || root.nodeType !== 1) return null
    if (predicate(root)) return root
    var kids = root.children || []
    for (var k = 0; k < kids.length; k++) {
      var hit = findFirstElement(kids[k], predicate)
      if (hit) return hit
    }
    return null
  }

  function hasAttr(el, name) {
    return typeof el.hasAttribute === 'function' && el.hasAttribute(name)
  }
  function attrIs(el, name, value) {
    return hasAttr(el, name) && el.getAttribute(name) === value
  }

  var bodyEl = document && document.body

  // D11: states are declared by the mock's own data-state-btn buttons; "-" means no switch. The
  // click happens BEFORE walking so every flag/box/text below reflects the post-switch DOM.
  if (state && state !== '-') {
    var stateBtn = findFirstElement(bodyEl, function (el) { return attrIs(el, 'data-state-btn', state) })
    if (stateBtn && typeof stateBtn.click === 'function') stateBtn.click()
  }

  function computedStyleOf(el) {
    if (typeof getComputedStyle === 'function') return getComputedStyle(el) || {}
    if (typeof window !== 'undefined' && window && typeof window.getComputedStyle === 'function') {
      return window.getComputedStyle(el) || {}
    }
    return {}
  }

  function collapseWhitespace(s) {
    return String(s).replace(/\s+/g, ' ').trim()
  }

  // D2: applied to OWN painted text only — computed text-transform, never raw textContent.
  // `capitalize` is applied per word (CSS's own per-word rule); anything else passes through.
  function applyTextTransform(text, transform) {
    if (transform === 'uppercase') return text.toUpperCase()
    if (transform === 'lowercase') return text.toLowerCase()
    if (transform === 'capitalize') {
      return text.replace(/\S+/g, function (w) { return w.charAt(0).toUpperCase() + w.slice(1) })
    }
    return text
  }

  // Own text = DIRECT text-node children only (never descendant elements' text) — the accessible-
  // walk boundary that keeps a wrapping <div> from claiming its <span> child's own entry.
  function ownPaintedText(el) {
    var raw = ''
    var childNodes = el.childNodes || []
    for (var k = 0; k < childNodes.length; k++) {
      var n = childNodes[k]
      if (n && n.nodeType === 3) {
        raw += n.textContent != null ? n.textContent : (n.data != null ? n.data : '')
      }
    }
    var collapsed = collapseWhitespace(raw)
    if (!collapsed) return ''
    var style = computedStyleOf(el)
    return applyTextTransform(collapsed, style.textTransform || 'none')
  }

  var INTERACTIVE_ROLES = { button: true, link: true, textbox: true, combobox: true, checkbox: true, radio: true }

  // Roles: explicit `role=` wins; else tag-derived (Contracts' own list).
  function roleOf(el) {
    var explicit = typeof el.getAttribute === 'function' ? el.getAttribute('role') : null
    if (explicit) return explicit
    var tag = (el.tagName || '').toLowerCase()
    if (/^h[1-6]$/.test(tag)) return 'heading'
    if (tag === 'a') return 'link'
    if (tag === 'button') return 'button'
    if (tag === 'select') return 'combobox'
    if (tag === 'textarea') return 'textbox'
    if (tag === 'input') {
      var type = ((typeof el.getAttribute === 'function' && el.getAttribute('type')) || 'text').toLowerCase()
      if (type === 'checkbox') return 'checkbox'
      if (type === 'radio') return 'radio'
      return 'textbox'
    }
    return 'text'
  }

  // D3: structural exclusions — pruned subtrees never enter the inventory, not even flagged.
  function isPruned(el) {
    if (attrIs(el, 'aria-hidden', 'true')) return true
    if (attrIs(el, 'data-contract', 'none')) return true
    var style = computedStyleOf(el)
    if (style.display === 'none') return true
    if (style.visibility === 'hidden') return true
    return false
  }

  function round2(n) {
    return Math.round(n * 100) / 100
  }

  // Page-coordinate box (viewport rect + scroll), 2 dp — the geometry contract render-compare.js
  // reads verbatim.
  function boxOf(el) {
    var r = el.getBoundingClientRect()
    var scrollX = 0, scrollY = 0
    if (typeof window !== 'undefined' && window) {
      scrollX = window.scrollX != null ? window.scrollX : (window.pageXOffset || 0)
      scrollY = window.scrollY != null ? window.scrollY : (window.pageYOffset || 0)
    }
    var w = r.width != null ? r.width : (r.right - r.left)
    var h = r.height != null ? r.height : (r.bottom - r.top)
    return { x: round2(r.x + scrollX), y: round2(r.y + scrollY), w: round2(w), h: round2(h) }
  }

  var entries = []
  var nextIndex = 0

  // Flags inherit downward (D2/D3): fixed/sticky, outOfFlow (absolute), dataPositioned all union
  // the parent's own flags with this element's own contribution — a child of a data-positioned
  // ancestor is dataPositioned even when it carries no attribute of its own.
  function walk(el, inherited) {
    if (!el || el.nodeType !== 1) return
    if (isPruned(el)) return

    var style = computedStyleOf(el)
    var position = style.position || 'static'
    var flags = {
      fixed: inherited.fixed || position === 'fixed' || position === 'sticky',
      outOfFlow: inherited.outOfFlow || position === 'absolute',
      dataPositioned: inherited.dataPositioned || hasAttr(el, 'data-positioned'),
    }

    var role = roleOf(el)
    var isInteractive = !!INTERACTIVE_ROLES[role]
    var text = ownPaintedText(el)
    if (!text && isInteractive) {
      var inner = el.innerText != null ? collapseWhitespace(el.innerText) : ''
      if (inner) {
        text = inner
      } else {
        var title = typeof el.getAttribute === 'function' ? el.getAttribute('title') : null
        text = title ? collapseWhitespace(title) : ''
      }
    }

    if (text || isInteractive) {
      var box = boxOf(el)
      entries.push({
        i: nextIndex++,
        role: role,
        text: text,
        name: (typeof el.getAttribute === 'function' && el.getAttribute('aria-label')) || null,
        tag: (el.tagName || '').toLowerCase(),
        box: box,
        srOnly: box.w <= 2 || box.h <= 2,
        fixed: flags.fixed,
        outOfFlow: flags.outOfFlow,
        dataPositioned: flags.dataPositioned,
        color: style.color || null,
        background: style.backgroundColor || null,
        fontSize: style.fontSize || null,
        lineHeight: style.lineHeight || null,
      })
    }

    var children = el.children || []
    for (var c = 0; c < children.length; c++) walk(children[c], flags)
  }

  var labeledRoot = findFirstElement(bodyEl, function (el) { return hasAttr(el, 'data-screen-label') })
  var rootEl = labeledRoot || bodyEl
  var rootSelector = labeledRoot ? '[data-screen-label]' : 'body'

  walk(rootEl, { fixed: false, outOfFlow: false, dataPositioned: false })

  return {
    schemaVersion: 1,
    theme: theme || null,
    state: (rootEl && typeof rootEl.getAttribute === 'function' && rootEl.getAttribute('data-state')) || null,
    root: rootSelector,
    entries: entries,
  }
})
