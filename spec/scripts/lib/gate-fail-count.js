'use strict'
// Owner: specs/20261029/07-every-dead-stop-becomes-a-question-with-a-default.md (the ESCALATE re-arm/park recommendation reads this count); specs/20261102/01-the-host-names-its-runner-grammar.md (declared pattern).
// failCount(text, pattern?) -> number | null
// Reads a gate log's failure count so the build driver's ESCALATE step can recommend re-arm or
// park from the trend. First match wins, in this order: node:test's summary
// line (`ℹ fail N`, or TAP `# fail N`), then the generic `N failed` form (jest, vitest, pytest).
// Pure function, no I/O; it does NOT guess — text with neither shape returns null, and the caller
// treats null as "not derivable" (park), never as zero.
// A host-declared `pattern` (capabilities.failCountPattern, group 1 = count) is the only shape
// consulted when given; "none" returns null; an invalid regex or no match returns null.
// Exit codes: none (library).
const SUMMARY_RES = [/^(?:ℹ|#) fail (\d+)\s*$/m, /(\d+) failed/]

function failCount(text, pattern) {
  if (typeof text !== 'string') return null
  if (pattern === 'none') return null
  if (typeof pattern === 'string') {
    try {
      const m = new RegExp(pattern, 'm').exec(text)
      return m && m[1] !== undefined && /^\d+$/.test(m[1]) ? Number(m[1]) : null
    } catch { return null }
  }
  for (const re of SUMMARY_RES) {
    const m = re.exec(text)
    if (m) return Number(m[1])
  }
  return null
}

module.exports = { failCount }
