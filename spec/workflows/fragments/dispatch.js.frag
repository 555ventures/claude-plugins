const AGENT_MAP = args.agentMap || {}
const DEFAULT_AGENT = AGENT_MAP.default || 'general-purpose'

// Host .claude/agents/*.md types are invisible to the workflow agent registry (built-in and
// plugin agents only). A host role with a doctrinePath runs on general-purpose and the worker
// READS that file for its doctrine; anything else that fails to resolve falls back with a log.
const DOCTRINE_PATHS = args.doctrinePaths || {}
function resolveType(t) {
  const name = t || DEFAULT_AGENT
  return DOCTRINE_PATHS[name] ? 'general-purpose' : name
}
function doctrineBlock(t) {
  const p = DOCTRINE_PATHS[t || DEFAULT_AGENT]
  return p ? `## Your role\nBefore anything else, Read ${p} — that file is your role definition. Operate as that agent: the markdown after any frontmatter is your operating doctrine, subordinate only to the hard rules below.` : ''
}
// 2026-08-13 spec 09 D1: no workflow could pin Fable safely — a throw from a `fable` seat had no
// fallback path and propagated straight past the (unrelated) agentType retry below.
// LAYOUT REQUIREMENT (test-mode constraint, per wf-review's auditKilled / wf-research's
// capOptions precedent): MODEL_FALLBACK is declared INSIDE this function's braces —
// tests/helpers.js extractFn brace-matches a single named top-level function with no mode for
// adjacent top-level consts; a top-level-const layout would throw `MODEL_FALLBACK is not
// defined` under evalFns.
async function dispatch(prompt, opts) {
  // Maps only `fable`: an `opus` outage has no cheaper judgment tier worth silently substituting.
  const MODEL_FALLBACK = { fable: 'opus' }
  try {
    return await agent(prompt, opts)
  } catch (e) {
    if (opts.agentType !== 'general-purpose' && String(e).includes('not found')) {
      log(`agentType '${opts.agentType}' not in the workflow registry — retrying on general-purpose`)
      // Recurses through this same function, not a bare Agent call, so a fable+custom-type seat's
      // worst case genuinely composes: general-purpose retry, THEN the model fallback below,
      // instead of the second failure propagating past an unreachable fallback branch.
      return dispatch(prompt, { ...opts, agentType: 'general-purpose' })
    }
    if (opts.model && MODEL_FALLBACK[opts.model] && !opts.__fellBack) {
      log(`model '${opts.model}' unavailable — falling back to '${MODEL_FALLBACK[opts.model]}'`)
      return dispatch(prompt, { ...opts, model: MODEL_FALLBACK[opts.model], __fellBack: true })
    }
    throw e
  }
}