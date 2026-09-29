// spec/templates/proto-capture-page.js
//
// Injected standalone by spec/scripts/proto-capture.js through `page.addScriptTag`, alongside
// spec/templates/proto-stable-id.js, into the running prototype at capture time.
// specs/20260928/02-freeze-export-and-the-contract.md D1, AC-20260928-02-1.
//
// captureComposites(rootEl, composites, props) walks every element under `rootEl`
// (`rootEl.querySelectorAll('*')`), keeping only the ones that are (a) visible and (b) owned,
// somewhere along their React owner chain, by one of the declared kit `composites` — exactly
// the contract spec 01 D6's stable-id module already computes for the pin overlay. The id for
// each qualifying element is `globalThis.__protoStableId.stableIdFor(el)` (injected first, by
// proto-capture.js's own script-tag order) — this module never recomputes owner chains itself,
// so the capture's ids and the overlay's pin ids can never drift apart.
//
// A qualifying element's owner-chain id looks like `Row[w_01]<List<Screen#0` — segments joined
// by `<`, each an owner name optionally suffixed `[key]`, with a trailing `#<ordinal>` on the
// whole string. An element "whose owner chain contains a composite name" means: split the id on
// `<`, strip each segment's optional `[key]` and the final segment's optional `#ordinal` suffix,
// and check the stripped name against the declared `composites` list.
//
// Visibility: an element is skipped when `getComputedStyle(el).getPropertyValue('display')` is
// `"none"` — the one deliberately-tested invisibility signal (D1: "skip invisible elements
// (display:none etc.)"); the browser's own computed style already folds an ancestor's
// `display: none` into a descendant's own computed value, so no ancestor walk is needed here.
//
// ESM-free by construction (D1, File Plan): a browser module injected through `page.addScriptTag`
// cannot resolve a bare specifier, so this file is a plain script. It assigns its one export onto
// `globalThis.__protoCapture` rather than using `export` — no imports, no exports.
//
// Exit codes: n/a — this is a browser module, never invoked as a CLI.
//
// `props` (documented as a plain array of style-property names) is the one argument this module
// leans on to find the calling realm's own Array/Object constructors, rather than creating box
// arrays and style objects through this script's own `[]`/`{}` literals: a real browser page has
// exactly one realm, so this makes no observable difference there, but `captureComposites` is
// also called directly (never through `page.evaluate`) by this repo's own harness, which loads
// this file into a `vm` context distinct from the realm that built its fixtures — a literal
// object/array built inside this script would then carry a different, non-reference-equal
// Array.prototype/Object.prototype than the caller's own, which a strict structural comparison
// (this repo's tests use `assert.deepStrictEqual`) treats as unequal even when every value
// matches. Borrowing the caller's own constructors keeps `box`/`styles` structurally identical
// to what the caller itself would have built.

;(function () {
  function stripSegment(seg) {
    return seg.replace(/\[[^\]]*\]/, '').replace(/#\d+$/, '')
  }

  function chainNames(id) {
    return id.split('<').map(stripSegment)
  }

  function ownsComposite(id, composites) {
    const names = chainNames(id)
    for (let i = 0; i < names.length; i++) {
      if (composites.indexOf(names[i]) !== -1) return true
    }
    return false
  }

  function isVisible(el) {
    const style = getComputedStyle(el)
    return style.getPropertyValue('display') !== 'none'
  }

  function collapseText(text) {
    const collapsed = (text || '').replace(/\s+/g, ' ').trim()
    return collapsed.length > 80 ? collapsed.slice(0, 80) : collapsed
  }

  function boxOf(el, ArrayCtor) {
    const rect = el.getBoundingClientRect()
    return ArrayCtor.of(Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height))
  }

  function stylesOf(el, props, ObjectCtor) {
    const style = getComputedStyle(el)
    const out = new ObjectCtor()
    for (let i = 0; i < props.length; i++) {
      out[props[i]] = style.getPropertyValue(props[i])
    }
    return out
  }

  function captureComposites(rootEl, composites, props) {
    // Borrow the caller's own Array/Object constructors from `props` — see the header comment.
    const ArrayCtor = props.constructor
    const ObjectCtor = Object.getPrototypeOf(ArrayCtor.prototype).constructor
    const stableId = globalThis.__protoStableId
    const elements = rootEl.querySelectorAll('*')
    const entries = []
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i]
      if (!isVisible(el)) continue
      const id = stableId ? stableId.stableIdFor(el) : null
      if (!id) continue
      if (!ownsComposite(id, composites)) continue
      entries.push({
        id: id,
        tag: (el.tagName || '').toLowerCase(),
        box: boxOf(el, ArrayCtor),
        text: collapseText(el.textContent),
        styles: stylesOf(el, props, ObjectCtor),
      })
    }
    return entries
  }

  globalThis.__protoCapture = { captureComposites: captureComposites }
})()
