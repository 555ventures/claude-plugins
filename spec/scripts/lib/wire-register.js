// Usage: const { stylesheetTargets, linksWireRegister } = require('./lib/wire-register')
//
// The single authority for "which stylesheets does this page apply?" and "does one of them land
// in the gray wireframe register?" — four call sites across design-atlas.js and mocks-driver.js
// hand-rolled their own answer to this and diverged on ten of twenty-four link forms, two of
// them defects (a wireframe styled through @import read as unstyled; a wireframe whose gray
// links survived only in a comment read as drawn). Owner: specs/20260908/07-one-wire-register-
// predicate.md D1-D3, AC-20260908-07-1, AC-20260908-07-2.
//
// stylesheetTargets(html) returns every URL the page applies as a stylesheet: a <link> whose rel
// contains "stylesheet" (case-insensitive, any attribute order, double/single/unquoted href, tag
// may span lines), plus every CSS @import target ("…", '…', url(…), url("…"), url('…')). HTML
// comments are stripped first. linksWireRegister(html) is true when some target has "wire" as a
// whole path segment (preceded by "/" or the start of the value — never a `\b` word boundary,
// which treats "-", "." and "_" as boundaries too).
//
// What this deliberately does NOT do: it never reads a file from disk (the caller reads the HTML
// string), never validates a URL resolves, never applies any call site's own gating (labeled/
// stamp/exemption rules stay with the caller), and never matches a <script src>, an <a href>, or
// a <link> whose rel is absent or does not contain "stylesheet" — a link the browser never
// applies as a stylesheet changes no pixel, so it is not a target.
//
// Exit codes: N/A — this is a library module, not an entry point.

'use strict'

function stripComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '')
}

function attrValue(tag, attr) {
  const m = new RegExp('\\b' + attr + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s"\'>]+))', 'i').exec(tag)
  if (!m) return null
  return m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]
}

function stylesheetTargets(html) {
  const stripped = stripComments(html)
  const targets = []
  const linkTags = stripped.match(/<link\b[^>]*>/gis) || []
  for (const tag of linkTags) {
    const rel = attrValue(tag, 'rel')
    if (!rel || !/stylesheet/i.test(rel)) continue
    const href = attrValue(tag, 'href')
    if (href) targets.push(href)
  }
  const importRe = /@import\s*(?:url\(\s*)?(?:"([^"]*)"|'([^']*)'|([^\s"'()]+))/gi
  let m
  while ((m = importRe.exec(stripped))) {
    const target = m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]
    if (target) targets.push(target)
  }
  return targets
}

const WIRE_SEGMENT_RE = /(^|\/)wire\//

function linksWireRegister(html) {
  return stylesheetTargets(html).some((t) => WIRE_SEGMENT_RE.test(t))
}

module.exports = { stylesheetTargets, linksWireRegister }
