'use strict'
// lib/spec-sections.js — the sole authority for the AC-ID grammar, `## `/`### ` section
// extraction, and top-level AC-bullet parsing (specs/20260817/07-promise-sweep-leg.md D3).
// Extracted verbatim from ac-matrix.js so promise-sweep.js — a sibling script that also needs
// the AC-ID grammar and section extraction to enumerate a spec's own `## Decisions` and
// `## Acceptance Criteria` sections — can reuse them without either duplicating the regex (a
// second derivation of a load-bearing shape) or requiring ac-matrix.js as a module (a script
// that parses argv and calls process.exit as a side effect of being required). ac-matrix.js now
// imports from here; every observed string, finding class, and exit code it produces stays
// byte-identical (tests/ac-matrix/ac-matrix.test.js is the byte-identity pin).
//
// What this deliberately does NOT do: parse a spec's `## Decisions` table (promise-sweep.js's
// row-carrier grammar is its own, with no counterpart here), or read a file — both exports take
// a string and are pure.
//
// specs/20260821/01-red-check.md D1: `parseAcBullets` gains a `preGreen` field —
// the raw trimmed string inside a sibling `[pre-green: <reason>]` tag, or `null` when untagged —
// alongside the pre-existing `oracle`/`env` fields. `PRE_GREEN_REASONS` is exported as the SINGLE
// closed-enum authority (`fallback-rejection` | `absence-invariant` | `predicate-in-test`); this
// parser does NO enum validation itself — every consumer (ac-matrix.js D6, red-check.js D2)
// validates against the exported enum and fails closed on an out-of-enum reason. The bullet
// object also now carries `raw` (the bullet's full joined text, continuation lines included) —
// red-check.js needs it to check for a `SHALL CONTINUE TO` sanctioned-pin phrase, and no existing
// consumer's shape assertion depended on the object's key set being closed.
//
// Hardened (specs/20260821/01-red-check.md review finding, reviewer-1.json): the
// `[oracle:]`/`[env:]`/`[pre-green:]` extraction ran as an unanchored substring search over
// the bullet's whole raw text, so an AC bullet that merely ILLUSTRATES the tag syntax in its own
// prose (documentation-by-example, the pattern spec.md/plan.md themselves encourage) self-tagged
// — this spec's own AC-20260821-01-1 and AC-20260821-01-2 misparsed as carrying real tags. A tag
// is now recognised in exactly two positions: (1) the DECLARATION SLOT — directly between the
// bold AC token's closing `**` and the `:` that opens the requirement text, optionally wrapped in
// backticks (`spec/templates/spec.md` line 129-130; where all real tags in `specs/` sit today),
// or (2) TRAILING — the tag is the last non-whitespace content of the bullet's raw text, optionally
// backticked. A tag appearing mid-prose anywhere else (inside a parenthetical, inside a code span
// mid-sentence, describing the grammar by example) parses as `null`.
//
// Hardened again (same-day regression): the position-anchored regexes above each
// matched at most ONE tag occupying the slot, so a bullet declaring two SIBLING tags in the same
// position (`spec/templates/spec.md` lines 90-103 sanction `[env:]` and `[pre-green:]` together —
// only `[oracle:]` alongside a test mapping is forbidden) silently dropped both:
// `` `[env: FOO]` `[oracle: gate]`: `` parsed as `{env: null, oracle: null}`. A dropped `[env:]`
// turns a properly-declared skip into a fabricated hard finding — the exact false-finding class
// this spec exists to eliminate. Both positions now match a RUN of one or more tag items (each
// optionally backticked, whitespace-separated) instead of a single tag: `slotRun`/`trailingRun`
// find the declaration-slot segment (between `**` and the requirement colon) or the trailing run
// once, then `extractTag` searches within that run for the one named tag. A tag anywhere outside
// either run still parses `null`.
//
// Hardened a third time (escape rv_640c582f4902, unanchored-marker-match): the
// trailing position still accepted a BACKTICKED tag, so a bullet illustrating the trailing-tag
// grammar as a worked example (`` … SHALL y `[oracle: gate]` `` — every self-tagging illustration
// observed in this repo's prose quotes tag grammar inside a code span) still self-tagged there.
// The trailing position now requires the tag to be BARE (`BARE_TAG_ITEM_SRC`, no surrounding
// backticks) — the declaration slot is unaffected and keeps accepting backticked-or-bare, since
// (as of a census of THIS REPO's own `specs/` corpus, not a grammar rule — see the
// note below) every genuinely-declared tag observed here sat in the declaration slot,
// and `spec/templates/spec.md`'s own trailing worked example (AC-20260821-99-1) is already bare.
//
// specs/20260823/03-silent-drop-hardening.md D2/D3 (the
// silent-drop incident): the bare-only trailing refusal above is a REFUSAL, not a drop — parsing
// still had no way to say a trailing tag WAS refused, so a host whose real declarations happen to
// be backticked got a bare parse-null with no trace of why. `parseAcBullets`
// now also returns `trailingRejected`: the backtick-tolerant trailing run's text (built from the
// SAME `TAG_ITEM_SRC` used by `slotRun`, never a re-spelled regex — a second authority here is
// exactly the fragile spot this hardening exists to avoid) when the bare-only `trailingRun` above
// refused it, else null. `trailingRejected` does NOT change what parses (the named tag fields
// stay null on a refused run, D1's bare-only ban is untouched) — it only lets a consumer detect,
// by substring-testing the tag name against this one string, that a refusal was the cause of an
// otherwise-generic finding. D3 rescopes every "all 8 tags sit in the declaration slot" claim in
// this file's comments from an implied grammar fact to what it always actually was: a dated
// census of this repo's own `specs/` corpus — a host corpus
// demonstrably backticks trailing declarations, so the census was never a rule to build parsing
// around, only an observation about the fixtures this file happened to be tested against.
//
// specs/20260823/03-silent-drop-hardening.md D11 (build-time, supersedes
// D8's rationale and D2's predicate formula above): live evidence (specs/20260823/01
// AC-20260823-01-18/-20, review row rv_6825fa48c98d) showed a genuine declaration written just
// before the bullet's final `→ tests/…` File-Plan reference sits at NEITHER recognized position —
// D2's null-test formula (tolerant-run-matched AND bare-run-null) never even looked there, so it
// neither parsed nor set `trailingRejected`: the same silent-drop class this module exists to
// close. The refusal predicate is now a SAID-vs-PARSED comparison rather than a null test:
// `wideTrailingRun` tolerates exactly one final `→ <tail with no second →>` reference suffix after
// the tolerant tag run (same `TAG_ITEM_SRC`, never a re-spelled regex), and `trailingRejected` is
// set whenever that wide reading differs from what `trailingRun` actually accepted — this subsumes
// D2's formula and additionally catches a backticked tag standing beside an ACCEPTED bare tag at
// the true end, which the null test missed (both readings then differ, not just "wide non-null").
// Each bullet also gains `trailingRejectedCause` (`'backticked-at-end' | 'not-at-end' | null`) so
// `rejectedTrailingTagDetail` (below) never tells a not-at-end host "remove the backticks" — false
// there, since a bare tag before the arrow still would not parse either. What PARSES stays
// untouched: `slotRun`/`trailingRun`/`extractTag` keep their exact grammar; only what refusal SAYS
// widens.
//
// specs/20260821/03-cross-spec-skip-mapping.md D7 (amendment): exports
// `acIdOccurs(text, id)`, a full-token occurrence check — `id` counts as occurring only at a
// position whose preceding char is absent or outside `[A-Za-z0-9]` AND whose following char is
// absent or outside `[0-9A-Za-z]`. Two call sites (ac-matrix.js's coverage grep, red-check.js's
// carried-AC classifier) used a bare `String.includes(id)`, so a well-formed AC whose ID is a
// PREFIX of another declared AC's ID (`AC-…-1` inside `AC-…-12`) was credited a phantom hit —
// ac-matrix failed OPEN (a genuinely untested AC read "covered") and red-check failed CLOSED (a
// sanctioned-green pin read as a false `unsanctioned-green`, the live hit that stopped
// specs/20260822/02's build). This is an `indexOf` scan, not a per-call RegExp — the
// same discipline `promise-sweep.js` already applies inline to Decision-row citations, now given
// one exported authority instead of a third from-scratch spelling.

// AC-ID shape: full anchored match of `AC-\d{8}-\d{2}[a-z]?-\d+`.
const AC_ID_RE = /^AC-\d{8}-\d{2}[a-z]?-\d+$/
const AC_ID_RE_GLOBAL = /AC-\d{8}-\d{2}[a-z]?-\d+/g

function isAlnumChar(ch) {
  return (ch >= '0' && ch <= '9') || (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z')
}

// Pure, no I/O, sibling to AC_ID_RE. True iff `id` occurs in `text` at a full-token position —
// see the D7 header note above for the exact boundary rule and its provenance.
function acIdOccurs(text, id) {
  let from = 0
  for (;;) {
    const i = text.indexOf(id, from)
    if (i === -1) return false
    const before = i > 0 ? text[i - 1] : null
    const after = i + id.length < text.length ? text[i + id.length] : null
    if ((before === null || !isAlnumChar(before)) && (after === null || !isAlnumChar(after))) {
      return true
    }
    from = i + 1
  }
}

// The closed enum of `[pre-green: <reason>]` sub-shapes (D1) — the single authority every
// consumer validates a tagged bullet's raw reason against.
const PRE_GREEN_REASONS = ['fallback-rejection', 'absence-invariant', 'predicate-in-test']

// One `[tagname: value]` item, optionally backtick-wrapped. `[a-z][a-z-]*` covers the three
// known tag names (oracle, env, pre-green) generically — this exists only to consume a run of
// tag-shaped items, never to extract a value, so it need not be tied to one tagName.
const TAG_ITEM_SRC = '`?\\[[a-z][a-z-]*:\\s*[^\\]]+\\]`?'

// The BARE variant — same shape, backticks forbidden. Trailing-position only (see trailingRun):
// every self-tagging illustration observed in this repo's prose quotes the tag grammar inside a
// code span (documentation-by-example), so a backticked tag at the trailing position is a quote,
// never a declaration.
const BARE_TAG_ITEM_SRC = '\\[[a-z][a-z-]*:\\s*[^\\]]+\\]'

// The declaration-slot run — the segment between the bold AC token's closing `**` and the `:`
// that opens the requirement text on the bullet's first line. May hold zero or more tag items
// (`spec/templates/spec.md` 90-103 sanctions sibling tags, e.g. `[env:]` + `[pre-green:]`
// together — only `[oracle:]` alongside a test mapping is forbidden), or null if the first line
// doesn't have this shape at all. Backticked-or-bare: the declaration slot is never prose, so a
// backticked tag there is still a real declaration (a census of this repo's own
// `specs/` corpus found every genuinely-declared tag sitting here — a THIS-REPO observation, not
// a grammar rule; see the D2/D3 note above the module header).
function slotRun(firstLine) {
  const re = new RegExp('^- \\*\\*[^*]*\\*\\*\\s*((?:' + TAG_ITEM_SRC + '\\s*)*):')
  const m = firstLine.match(re)
  return m ? m[1] : null
}

// The trailing run — one or more BARE tag items ending the bullet's full raw text (trailing
// whitespace ignored), or null if the raw text doesn't end in a bare tag item at all.
//
// Hardened (escape rv_640c582f4902, unanchored-marker-match): the trailing position
// accepted a backticked tag too, so an AC that merely ILLUSTRATES the trailing-tag grammar
// in its own prose (e.g. `` … SHALL y `[oracle: gate]` `` — a worked example, not a declaration)
// self-tagged: ac-matrix.js would read the phantom tag as covered-by-declaration or a sanctioned
// skip, laundering coverage/skips exactly like the oracle/env/pre-green defect this
// module was hardened against. Requiring the trailing tag to be BARE closes it without touching
// the declaration slot (spec.md's own trailing example, AC-20260821-99-1, is bare and keeps
// parsing) or any tag this repo's own corpus census (a this-repo observation, not a
// grammar rule) found sitting in the declaration slot.
function trailingRun(raw) {
  const re = new RegExp('((?:' + BARE_TAG_ITEM_SRC + '\\s*)+)$')
  const m = raw.replace(/\s+$/, '').match(re)
  return m ? m[1] : null
}

// D2: the backtick-TOLERANT sibling of trailingRun above, built from the SAME
// TAG_ITEM_SRC slotRun uses — never a re-spelled regex, the one authority both positions share.
// Used ONLY to detect a REFUSED trailing declaration for `trailingRejected` below; it never
// extracts a tag value itself and the bare-only ban it annotates stays completely untouched.
function tolerantTrailingRun(raw) {
  const re = new RegExp('((?:' + TAG_ITEM_SRC + '\\s*)+)$')
  const m = raw.replace(/\s+$/, '').match(re)
  return m ? m[1] : null
}

// D11: the WIDENED tolerant run — same TAG_ITEM_SRC as tolerantTrailingRun above,
// additionally tolerating exactly one final `→ <tail containing no second →>` File-Plan-reference
// suffix, since a genuine declaration written just before that reference (specs/20260823/01
// AC-20260823-01-18/-20's actual shape) sits at neither recognized position under the unwidened
// reading. The capture is trimmed of trailing whitespace before use — when the arrow branch
// matches, the last tag item's own trailing `\s*` greedily consumes the separator whitespace
// before the arrow, and that whitespace would otherwise leak into the said-vs-parsed comparison
// below. Used ONLY to compute `trailingRejected`/`trailingRejectedCause`; it never extracts a tag
// value and never changes what PARSES.
function wideTrailingRun(raw) {
  const re = new RegExp('((?:' + TAG_ITEM_SRC + '\\s*)+)(?:\u2192[^\u2192]*)?$')
  const m = raw.replace(/\s+$/, '').match(re)
  return m ? m[1].replace(/\s+$/, '') : null
}

// specs/20260823/03-silent-drop-hardening.md D10 (amended by D11): the ONE authority
// for the `rejected-trailing-tag` remedy text — the first implementation landed a byte-identical copy of
// this function in both ac-matrix.js and red-check.js, the exact two-identical-copies shape D4
// (this same spec) exists to eliminate elsewhere. It lives here, beside `tolerantTrailingRun` and
// `trailingRejected`, because the remedy explains THIS module's own refusal (D2) — consumers
// import it rather than re-deriving the text, matching D2's "consumers never re-derive" rule for
// the predicate itself. The per-consumer `underlying` clause (what the refusal turned out to mean
// for that specific finding — absent coverage, an unsanctioned skip, a green expected-red file)
// stays a parameter; nothing else about the message differs across callers.
//
// D11: `cause` (`'backticked-at-end' | 'not-at-end'`) is now a required third
// argument, forking the middle sentences. The `backticked-at-end` branch is BYTE-IDENTICAL to
// D10's original text above — every existing consumer detail assertion (AC-20260823-03-1/-2/-3)
// depends on that. The `not-at-end` branch names the true problem instead (the tag sits before the
// bullet's final `→` reference, not a recognized declaration position) and offers only the
// move-into-the-declaration-slot remedy — it must NEVER say "remove the backticks", which is false
// there: a bare tag before the arrow still would not parse either. Both branches keep the shared
// opening (AC-ID + refused tag text) and the shared closing quote-disclaimer.
function rejectedTrailingTagDetail(acId, trailingRejected, cause, underlying) {
  if (cause === 'not-at-end') {
    return `${acId}: trailing tag ${trailingRejected} was refused as a declaration — it sits ` +
      `before the bullet's final → reference, which is not a recognized declaration position. ` +
      `If this is a genuine declaration: move it into the declaration slot (backticks allowed ` +
      `there). If it is meant only as a quote: ${underlying} still stands and needs its own fix.`
  }
  return `${acId}: trailing tag ${trailingRejected} was refused as a declaration — it ends the ` +
    `bullet backticked, and the bare-only trailing rule (rv_640c582f4902) accepts only a BARE ` +
    `trailing tag as a declaration. If this is a genuine declaration: remove the backticks, or ` +
    `move it into the declaration slot (backticks allowed there). If it is meant only as a quote: ` +
    `${underlying} still stands and needs its own fix.`
}

// Extracts one named `[tagName: value]` tag's value, searching the declaration-slot run first
// and falling through to the trailing run — a slot present but lacking this particular tag must
// still fall through (siblings occupy the same run; this tag may simply be the OTHER position).
// Anything outside either run (mid-prose, inside a parenthetical, a code span mid-sentence) is
// not a declaration and returns null — see the hardening notes above the module header.
function extractTag(tagName, firstLine, raw) {
  const tagRe = new RegExp('`?\\[' + tagName + ':\\s*([^\\]]+)\\]`?')
  const slot = slotRun(firstLine)
  if (slot !== null) {
    const m = slot.match(tagRe)
    if (m) return m[1].trim()
  }
  const trail = trailingRun(raw)
  if (trail !== null) {
    const m = trail.match(tagRe)
    if (m) return m[1].trim()
  }
  return null
}

function extractSection(text, heading) {
  const lines = text.split('\n')
  let start = -1, level = 0
  const re = new RegExp(`^(#{2,3}) ${heading}`, 'i')
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re)
    if (m) { start = i + 1; level = m[1].length; break }
  }
  if (start === -1) return null
  let end = lines.length
  for (let i = start; i < lines.length; i++) {
    const hm = lines[i].match(/^(#{1,6})\s/)
    if (hm && hm[1].length <= level) { end = i; break }
  }
  return lines.slice(start, end).join('\n')
}

function parseAcBullets(sectionText) {
  const stripped = sectionText.replace(/<!--[\s\S]*?-->/g, '')
  const lines = stripped.split('\n')
  const groups = []
  let cur = null
  for (const line of lines) {
    if (/^- /.test(line)) {
      if (cur) groups.push(cur)
      cur = [line]
    } else if (cur) {
      cur.push(line)
    }
  }
  if (cur) groups.push(cur)
  return groups.map(linesArr => {
    const raw = linesArr.join('\n')
    const tokenMatch = linesArr[0].match(/^- \*\*([^*]*)\*\*/)
    const token = tokenMatch ? tokenMatch[1] : ''
    const malformed = !AC_ID_RE.test(token)
    // D11: refused iff what was SAID (the widened tolerant reading) differs from what actually
    // PARSED (the bare-only trailingRun) — both captures trimmed of trailing whitespace before
    // comparison (wideTrailingRun's arrow branch, and trailingRun's own end-anchored capture,
    // can each carry trailing separator whitespace). This subsumes D2's narrower null-test formula
    // (see the D11 module-header note above) and also catches a backticked tag standing beside an
    // ACCEPTED bare tag at the true end, which the null test missed (AC-20260823-03-16).
    const bareRun = trailingRun(raw)
    const bareTrimmed = bareRun !== null ? bareRun.replace(/\s+$/, '') : null
    const wide = wideTrailingRun(raw)
    const trailingRejected = (wide !== null && wide !== bareTrimmed) ? wide : null
    // D11: cause is 'backticked-at-end' when the UNWIDENED end-anchored tolerant run (no arrow
    // tolerance) matches and equals the wide capture — i.e. the refused run really is the bullet's
    // true end, just backticked. Any other refusal (the wide reading only matched because of the
    // arrow-suffix tolerance) is 'not-at-end' — the tag sat before the bullet's final reference,
    // never a recognized declaration position, so "remove the backticks" would be a false remedy.
    let trailingRejectedCause = null
    if (trailingRejected !== null) {
      const unwidened = tolerantTrailingRun(raw)
      const unwidenedTrimmed = unwidened !== null ? unwidened.replace(/\s+$/, '') : null
      trailingRejectedCause = (unwidenedTrimmed !== null && unwidenedTrimmed === wide)
        ? 'backticked-at-end' : 'not-at-end'
    }
    return {
      id: malformed ? null : token,
      token,
      malformed,
      raw,
      oracle: extractTag('oracle', linesArr[0], raw),
      env: extractTag('env', linesArr[0], raw),
      preGreen: extractTag('pre-green', linesArr[0], raw),
      trailingRejected,
      trailingRejectedCause,
    }
  })
}

module.exports = {
  AC_ID_RE, AC_ID_RE_GLOBAL, PRE_GREEN_REASONS, extractSection, parseAcBullets, acIdOccurs,
  rejectedTrailingTagDetail,
}
