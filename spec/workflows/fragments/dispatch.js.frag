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
async function dispatch(prompt, opts) {
  try {
    return await agent(prompt, opts)
  } catch (e) {
    if (opts.agentType !== 'general-purpose' && String(e).includes('not found')) {
      log(`agentType '${opts.agentType}' not in the workflow registry — retrying on general-purpose`)
      return agent(prompt, { ...opts, agentType: 'general-purpose' })
    }
    throw e
  }
}