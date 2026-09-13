// Usage: const { classNamesIn, rulesIn, overrides, layoutShare, LAYOUT_PROPERTIES } =
//   require('./lib/kit-layers')
//
// Owner: specs/20260912/09-a-mock-may-not-invent.md D4/D5/D6/D7, AC-20260912-09-3,
// AC-20260912-09-4, AC-20260912-09-6. Pure CSS-string readers behind design-atlas.js's
// project-kit rules: D4's redefinition check, D5's class-count cap, D6's cross-file
// single-screen sweep and D7's measured layout-share line. Flat `selector { declarations }`
// parsing only — the same no-CSS-parser discipline design-atlas.js's own cssRulesOf/
// styleBlocksOf hygiene helpers use; @media and nested rules are out of scope.
//
// Comments are stripped before any regex sees the text. spec/templates/mocks/wire.css's own
// header comment cites paths like "docs/adr/0017-….md" and "design/wire/wire.css" — read
// without stripping, a bare `.md`/`.js`/`.css` inside that prose reads as a declared class and
// inflates the count D5's cap and D7's share are computed from, silently widening the cap past
// what the shared kit actually declares. classNamesIn requires the character right after `.` to
// be a letter or underscore (never a digit), which also keeps a layout value like `1.4` in
// `calc(var(--radius) * 1.4)` from reading as a class named `4`.
//
// What this deliberately does NOT do: read a file from disk (the caller reads the CSS string),
// resolve @import, understand cascade/specificity, or parse a selector into anything beyond its
// dot-prefixed class tokens.
//
// Exit codes: N/A — this is a library module, not an entry point.

'use strict'

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

// Same flat-parse shape as design-atlas.js's own cssRulesOf: a run of non-brace text, an open
// brace, a run of non-brace text, a close brace. @media and nested rules are out of scope (D5).
function rulesIn(css) {
  const stripped = stripComments(css)
  return [...stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), decls: m[2] }))
}

const CLASS_RE = /\.-?[_a-zA-Z][_a-zA-Z0-9-]*/g

function classNamesIn(css) {
  const names = new Set()
  for (const rule of rulesIn(css)) {
    for (const m of rule.selector.match(CLASS_RE) || []) names.add(m.slice(1))
  }
  return names
}

// overrides(projectCss, wireCss) -> [class, ...] present in both, sorted — D4's redefinition set.
function overrides(projectCss, wireCss) {
  const wireClasses = classNamesIn(wireCss)
  const out = []
  for (const c of classNamesIn(projectCss)) if (wireClasses.has(c)) out.push(c)
  return out.sort()
}

// Contracts § Layout classification: a rule counts as layout only when EVERY declaration in its
// body names one of these properties. Anything else (colour, background, border, radius, font,
// shadow, opacity, transition, text-*) is styling, and a rule mixing the two counts as styling —
// the question is "how much of this layer a richer component kit would have absorbed", and a
// rule that sets a colour would not have been.
const LAYOUT_PROPERTIES = new Set([
  'display', 'position', 'top', 'right', 'bottom', 'left', 'inset', 'inset-block', 'inset-inline', 'z-index',
  'float', 'clear', 'overflow', 'overflow-x', 'overflow-y', 'box-sizing', 'aspect-ratio', 'object-fit',
  'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'margin-block', 'margin-inline',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'padding-block', 'padding-inline',
  'flex', 'flex-basis', 'flex-direction', 'flex-grow', 'flex-shrink', 'flex-wrap', 'order',
  'grid', 'grid-area', 'grid-auto-columns', 'grid-auto-flow', 'grid-auto-rows', 'grid-column', 'grid-row',
  'grid-template', 'grid-template-areas', 'grid-template-columns', 'grid-template-rows',
  'gap', 'row-gap', 'column-gap', 'align-content', 'align-items', 'align-self',
  'justify-content', 'justify-items', 'justify-self', 'place-content', 'place-items', 'place-self',
])

function isLayoutRule(decls) {
  const props = decls.split(';').map((d) => d.trim()).filter(Boolean).map((d) => d.split(':')[0].trim())
  if (!props.length) return false
  return props.every((p) => LAYOUT_PROPERTIES.has(p))
}

// layoutShare(css) -> { rules, layoutRules, percent } — percent is integer, rounded half up,
// and 0 for an empty stylesheet (AC-20260912-09-6).
function layoutShare(css) {
  const rules = rulesIn(css)
  const layoutRules = rules.filter((r) => isLayoutRule(r.decls)).length
  const percent = rules.length ? Math.round((layoutRules / rules.length) * 100) : 0
  return { rules: rules.length, layoutRules, percent }
}

module.exports = { classNamesIn, rulesIn, overrides, layoutShare, LAYOUT_PROPERTIES }
