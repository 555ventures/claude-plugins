// notes-anchor.browser.js — the pure hybrid anchor: capture(root, box) records a drawn rectangle
// as a fraction of its smallest containing element plus that element's layout signature and
// touched children; resolve(root, region) reproduces the box exactly when nothing has changed, or
// falls back to the padded union of the still-present touched children once the anchor's layout
// signature no longer matches. specs/20260912/11-a-note-can-mark-an-area.md D1,
// AC-20260912-11-1/-2/-3.
//
// Exposed as a browser global (`NotesAnchor`) when injected by design-atlas.js's
// GET /__notes/anchor.js, and as `module.exports` when `module` exists (Node tests feed fake DOM
// objects over the documented interface below — no jsdom, no real browser).
//
// DOM interface consumed, and nothing else: el.children, el.parentNode, el.textContent,
// el.tagName, el.getBoundingClientRect(), root.querySelectorAll('*'). No fetch, no rendering, no
// status, no localStorage — those all live in notes-layer.browser.js, which calls into this module
// only through capture()/resolve().
//
// Exit codes: none — this is a library, not an executable.
'use strict'
;(function (root, factory) {
  var mod = factory()
  if (typeof module !== 'undefined' && module.exports) module.exports = mod
  else root.NotesAnchor = mod
})(typeof window !== 'undefined' ? window : this, function () {
  // Contracts' own truncation rule: first 40 chars of textContent, whitespace-collapsed.
  function snippetOf(text) {
    return String(text == null ? '' : text).replace(/\s+/g, ' ').trim().slice(0, 40)
  }

  function rectOf(el) {
    return el.getBoundingClientRect()
  }

  function rectArea(r) {
    return Math.max(0, r.width) * Math.max(0, r.height)
  }

  function fullyContains(outer, inner) {
    return inner.x >= outer.left && inner.y >= outer.top &&
      inner.x + inner.w <= outer.right && inner.y + inner.h <= outer.bottom
  }

  // D1: <2 children -> 'single'; all child tops within 4px -> 'row'; all lefts within 4px ->
  // 'col'; else 'grid'.
  function arrangementOf(el) {
    var kids = Array.prototype.slice.call(el.children || [])
    if (kids.length < 2) return 'single'
    var rects = kids.map(rectOf)
    var top0 = rects[0].top
    if (rects.every(function (r) { return Math.abs(r.top - top0) <= 4 })) return 'row'
    var left0 = rects[0].left
    if (rects.every(function (r) { return Math.abs(r.left - left0) <= 4 })) return 'col'
    return 'grid'
  }

  // Walks from `root` down through `path` (child indices) — returns the element, or null when the
  // path walks off the tree at any step.
  function walkPath(root, path) {
    var el = root
    for (var i = 0; i < path.length; i++) {
      var kids = el && el.children
      if (!kids || path[i] < 0 || path[i] >= kids.length) return null
      el = kids[path[i]]
    }
    return el
  }

  // D1: capture(root, box) — box is {x,y,w,h} root-relative px. Picks the smallest descendant of
  // root (root itself when none does) whose rect fully contains box, walking every element
  // querySelectorAll('*') returns and comparing rect area.
  function capture(root, box) {
    var rootRect = rectOf(root)
    var candidates = [{ el: root, rect: rootRect, path: [] }]
    var all = Array.prototype.slice.call(root.querySelectorAll('*'))

    // Build each candidate's own child-index path by walking parentNode back to root.
    function pathOf(el) {
      var path = []
      var cur = el
      while (cur && cur !== root) {
        var parent = cur.parentNode
        if (!parent || !parent.children) return null
        var idx = Array.prototype.indexOf.call(parent.children, cur)
        if (idx === -1) return null
        path.unshift(idx)
        cur = parent
      }
      return cur === root ? path : null
    }

    for (var i = 0; i < all.length; i++) {
      var el = all[i]
      var p = pathOf(el)
      if (p === null) continue
      candidates.push({ el: el, rect: rectOf(el), path: p })
    }

    // Absolute box coordinates (root-relative -> viewport-relative, matching getBoundingClientRect).
    var absBox = { x: rootRect.left + box.x, y: rootRect.top + box.y, w: box.w, h: box.h }

    // D1: "the smallest descendant of root ... (root itself when none does)" — descendants are
    // preferred over root even when a descendant's rect ties root's own area (e.g. a single full-
    // width section), so root is considered only as the fallback, never as a candidate to beat.
    var best = null
    for (var j = 1; j < candidates.length; j++) {
      var c = candidates[j]
      if (!fullyContains(c.rect, absBox)) continue
      if (best === null || rectArea(c.rect) < rectArea(best.rect)) best = c
    }
    if (best === null) best = candidates[0] // root always fully contains its own box by construction

    var anchorRect = best.rect
    var kids = Array.prototype.slice.call(best.el.children || [])
    var touched = []
    for (var k = 0; k < kids.length; k++) {
      var kr = rectOf(kids[k])
      var intersects = kr.left < absBox.x + absBox.w && kr.left + kr.width > absBox.x &&
        kr.top < absBox.y + absBox.h && kr.top + kr.height > absBox.y
      if (intersects) touched.push({ i: k, snippet: snippetOf(kids[k].textContent) })
    }

    return {
      drawnAt: { w: Math.round(rectOf(root).width) },
      anchor: { path: best.path, tag: String(best.el.tagName || '').toLowerCase(), snippet: snippetOf(best.el.textContent) },
      frac: {
        x: (absBox.x - anchorRect.left) / anchorRect.width,
        y: (absBox.y - anchorRect.top) / anchorRect.height,
        w: absBox.w / anchorRect.width,
        h: absBox.h / anchorRect.height,
      },
      layout: { arrangement: arrangementOf(best.el), aspect: anchorRect.width / anchorRect.height },
      touched: touched,
    }
  }

  // D1: resolve(root, region) — path walks to an element else null; snippet (when non-empty) must
  // equal else null; anchor rect area 0 -> null; signature = arrangement match && aspect within
  // 0.75..1.33 of region.layout.aspect; signature true, or touched empty -> exact; else children
  // whose index exists -> union+4px pad; none exist -> null.
  function resolve(root, region) {
    var el = walkPath(root, region.anchor.path)
    if (!el) return null
    var elSnippet = snippetOf(el.textContent)
    if (region.anchor.snippet && region.anchor.snippet !== elSnippet) return null
    var rect = rectOf(el)
    if (rectArea(rect) === 0) return null

    var sigMatches = arrangementOf(el) === region.layout.arrangement &&
      (rect.width / rect.height) / region.layout.aspect >= 0.75 &&
      (rect.width / rect.height) / region.layout.aspect <= 1.33

    if (sigMatches || !region.touched || region.touched.length === 0) {
      var f = region.frac
      return {
        mode: 'exact',
        box: {
          x: rect.left - rectOf(root).left + f.x * rect.width,
          y: rect.top - rectOf(root).top + f.y * rect.height,
          w: f.w * rect.width,
          h: f.h * rect.height,
        },
      }
    }

    var kids = Array.prototype.slice.call(el.children || [])
    var present = []
    for (var i = 0; i < region.touched.length; i++) {
      var idx = region.touched[i].i
      if (idx >= 0 && idx < kids.length) present.push(kids[idx])
    }
    if (present.length === 0) return null

    var rootRect = rectOf(root)
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (var j = 0; j < present.length; j++) {
      var r = rectOf(present[j])
      minX = Math.min(minX, r.left)
      minY = Math.min(minY, r.top)
      maxX = Math.max(maxX, r.left + r.width)
      maxY = Math.max(maxY, r.top + r.height)
    }
    var pad = 4
    return {
      mode: 'children',
      box: {
        x: (minX - rootRect.left) - pad,
        y: (minY - rootRect.top) - pad,
        w: (maxX - minX) + pad * 2,
        h: (maxY - minY) + pad * 2,
      },
    }
  }

  return { capture: capture, resolve: resolve }
})
