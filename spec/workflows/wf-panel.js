export const meta = {
  name: 'wf-panel',
  description: 'Genesis research + MoA panel: parallel research fan-out → blind Sonnet proposers → Fable aggregator (Opus fallback) returning a decision matrix, hard-fork list, and minority positions',
  whenToUse: 'Invoked between AskUserQuestion rounds by /spec:genesis-architect and /spec:genesis-design',
  phases: [
    { title: 'Research', detail: 'parallel web research, one agent per selected angle' },
    { title: 'Propose', detail: '3 blind Sonnet proposers fed the research (skipped when constrained)' },
    { title: 'Aggregate', detail: 'Fable aggregator (Opus fallback) → matrix, hard forks, minority positions' },
  ],
}

// Normalize `args` before any use. The harness convention has varied: some versions deliver the
// object verbatim, others JSON-encode it as a string on the scriptPath channel. We accept both,
// tolerate accidental double-encoding, and on failure throw a message that shows what actually
// arrived (length + preview) instead of a bare "Unable to parse JSON string" at the call site.
function normalizeArgs(raw) {
  let v = raw
  // Unwrap up to 2 layers of JSON-string encoding (single = older harness; double = caller bug).
  for (let i = 0; i < 2 && typeof v === 'string'; i++) {
    const s = v.trim()
    if (s === '[object Object]') {
      throw new Error('wf-panel: args arrived String()-coerced to "[object Object]" — the ' +
        'caller stringified the object with String()/template interpolation instead of passing a ' +
        'real JSON object (or JSON.stringify). Pass `args` as a plain object in the Workflow call.')
    }
    try {
      v = JSON.parse(s)
    } catch (e) {
      throw new Error('wf-panel: args was a string but not valid JSON (' + s.length +
        ' chars). This is structural corruption — free text / a non-scalar reached `args`, which ' +
        'must carry only paths, ids, enums, booleans, and command strings; prose lives on disk in ' +
        'the artifact the agents Read (spec / brief / rule docs). First 160 chars: ' +
        JSON.stringify(s.slice(0, 160)) + ' — parse error: ' + e.message)
    }
  }
  return v
}
args = normalizeArgs(args)
if (!args || typeof args !== 'object' || !Array.isArray(args.researchKeys)) {
  throw new Error('wf-panel: malformed args (expected the object documented below with a ' +
    '`researchKeys` array, got ' + (args === undefined ? 'undefined' : typeof args) + ')')
}
// Panel doctrine (genesis.md § The MoA Panel): exactly 3 proposers — fewer loses the minority-view
// texture the aggregator needs, more dilutes it. Enforce at the trust boundary, not by convention.
if (args.runProposers && (!Array.isArray(args.roleKeys) || args.roleKeys.length !== 3)) {
  throw new Error('wf-panel: runProposers=true requires exactly 3 roleKeys (got ' +
    (Array.isArray(args.roleKeys) ? args.roleKeys.length : typeof args.roleKeys) + ') — the MoA ' +
    'panel is 3 blind proposers by doctrine')
}

// args carries ONLY paths, enum keys, and booleans — never free text. The project description,
// intake answers, the research-angle focus for each key, the proposer role personas, and the open
// dimensions all live in the brief file on disk (written by the command); the agents Read them.
// Each round is a FRESH invocation — the command accumulates prior research/decisions on disk and
// passes them via contextPaths; this round researches only the newly-opened angles. (We do not
// rely on workflow resume here: the agent prompts reference briefPath, not its content, so a
// changed brief would cache-stale under resume — fresh-call-per-round sidesteps that entirely.)
// args: {
//   stage: "architect" | "design",
//   briefPath: string,            // .claude/genesis/brief.md — goal + intake + Research Angles +
//                                 //   Panel Roles + Open Dimensions sections; agents Read it
//   researchKeys: [string],       // enum keys for THIS round's research angles (menu in genesis.md)
//   roleKeys: [string],           // enum keys for the 3 proposer role personas
//   runProposers: boolean,        // false → selective skip (all hard-to-reverse dims constrained)
//   contextPaths: [string],       // prior round outputs + stack-descriptor (design stage) to Read; []
// }

// 2026-08-13 spec 09 D1/D2: the aggregate seat below runs on Fable (JJ's ruling), so it must be
// routed through the shared `dispatch` helper, not a bare Agent call, for the model-unavailable
// fallback (fable falling back to opus) to actually apply to it — a bare Agent call would
// propagate a fable outage straight to the caller.
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

// 2026-08-13 spec 06 D6: a named top-level function (not inlined into the Propose phase below)
// so tests can extract and evaluate it standalone via evalFns, matching the guard-function
// convention this workflow set already uses (wf-build's assertGateArgs, wf-design's
// assertBatchKinds). The panel doctrine's 3-proposer floor (genesis.md § The MoA Panel) is
// enforced at runtime, not just by the trust-boundary arg check above: fewer than 3 surviving
// proposals loses the minority-view texture the aggregator needs, so this throws
// pre-aggregation, naming the degraded count, instead of quietly synthesizing from a
// degraded panel. Takes the already-filtered surviving proposals array.
function assertProposalSurvival(proposals) {
  if (proposals.length < 3) {
    throw new Error('panel degraded: ' + proposals.length + '<3 proposals')
  }
}

const briefPath = args.briefPath
const ctx = Array.isArray(args.contextPaths) ? args.contextPaths : []
const ctxLine = ctx.length
  ? 'Also Read this prior context (accumulated earlier rounds + descriptors): ' + ctx.join(', ') + '.'
  : 'There is no prior context this round.'

const RESEARCH_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['angle', 'key_findings', 'recommendations', 'watch_outs'],
  properties: {
    angle: { type: 'string' },
    key_findings: { type: 'array', items: { type: 'string' } },
    recommendations: { type: 'array', items: { type: 'string' }, description: 'concrete, decisive guidance for this project' },
    watch_outs: { type: 'array', items: { type: 'string' }, description: 'pitfalls, anti-patterns, things to deliberately exclude' },
    sources: { type: 'array', items: { type: 'string' } },
  },
}

const PROPOSAL_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['role', 'positions', 'biggest_risk'],
  properties: {
    role: { type: 'string' },
    positions: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      required: ['dimension', 'recommendation', 'rationale'],
      properties: {
        dimension: { type: 'string' },
        recommendation: { type: 'string' },
        rationale: { type: 'string' },
        confidence: { type: 'string' },
      },
    } },
    cross_cutting_notes: { type: 'array', items: { type: 'string' } },
    biggest_risk: { type: 'string' },
  },
}

const AGGREGATE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['original_goal', 'decision_matrix', 'hard_fork_list', 'minority_positions', 'consensus_summary', 'research_gaps'],
  properties: {
    original_goal: { type: 'string', description: 'verbatim restatement of the goal from the brief (anti-drift)' },
    decision_matrix: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      required: ['dimension', 'options_seen', 'recommended_default', 'rationale'],
      properties: {
        dimension: { type: 'string' },
        options_seen: { type: 'array', items: { type: 'string' } },
        recommended_default: { type: 'string' },
        rationale: { type: 'string' },
      },
    } },
    hard_fork_list: { type: 'array', description: 'genuine conflicts on hard-to-reverse dimensions → mandatory AskUserQuestion, presented verbatim', items: {
      type: 'object', additionalProperties: false,
      required: ['dimension', 'conflicting_positions', 'recommended_first', 'recommended_first_reason'],
      properties: {
        dimension: { type: 'string' },
        conflicting_positions: { type: 'array', items: {
          type: 'object', additionalProperties: false,
          required: ['option', 'consequence', 'rationale'],
          properties: {
            option: { type: 'string' },
            consequence: { type: 'string', description: 'one plain-English line: what happens / what it costs if the user picks this' },
            rationale: { type: 'string' },
          },
        } },
        recommended_first: { type: 'string', description: 'which option the panel recommends as the first AskUserQuestion choice' },
        recommended_first_reason: { type: 'string', description: 'why recommended_first should win — the "(Recommended)" gloss shown to the user' },
      },
    } },
    minority_positions: { type: 'array', description: 'any proposer option the synthesis would otherwise suppress — recorded verbatim into the ADR Dissents section', items: {
      type: 'object', additionalProperties: false,
      required: ['dimension', 'position', 'rationale'],
      properties: { dimension: { type: 'string' }, position: { type: 'string' }, rationale: { type: 'string' } },
    } },
    consensus_summary: { type: 'string' },
    research_gaps: { type: 'array', items: { type: 'string' }, description: 'angles that warrant a follow-up round (drive the next wf-panel call)' },
  },
}

phase('Research')
const researchRaw = await parallel(args.researchKeys.map(key => () =>
  agent(
    'You are the research agent for the "' + key + '" angle of a ' + args.stage + ' genesis session. ' +
    'Read the brief at ' + briefPath + ' and find your angle\'s focus under its "## Research Angles" ' +
    'section (the row whose key is "' + key + '"). ' + ctxLine + ' Research it with current, concrete, ' +
    'opinionated best practice — use WebSearch/WebFetch if available, otherwise rely on your knowledge ' +
    'and say so. Be decisive and specific to THIS project (its archetype, audience/locale, and goals as ' +
    'stated in the brief); call out what to deliberately exclude, not just what to include.',
    { label: 'research:' + key, phase: 'Research', model: 'sonnet', effort: 'medium', agentType: 'general-purpose', schema: RESEARCH_SCHEMA }
  )
))
// 2026-08-13 spec 06 D6: angle deaths were filtered silently (`.filter(Boolean)` alone) — counted
// here and folded into `agentsFailed` on the return below, alongside proposer deaths.
const research = researchRaw.filter(Boolean)
const researchFailed = researchRaw.length - research.length

// Compact JSON: this block is inlined into 3 proposer prompts + the aggregator (4x), so the
// pretty-print whitespace alone was a ~30% pure-overhead multiplier on the largest prompt block.
const researchBlock = 'THIS ROUND\'S RESEARCH (structured JSON):\n' + JSON.stringify(research)

let proposals = []
let proposalsFailed = 0
if (args.runProposers) {
  phase('Propose')
  const proposalsRaw = await parallel(args.roleKeys.map(role => () =>
    agent(
      'You are the "' + role + '" proposer on a genesis design panel (' + args.stage + ' stage). ' +
      'Read the brief at ' + briefPath + ' — adopt the persona described for your role under its ' +
      '"## Panel Roles" section, and take a clear position on EVERY dimension listed under its ' +
      '"## Open Dimensions" section, through your role\'s lens. ' + ctxLine + ' Ground your positions ' +
      'in the research below. You are BLIND to the other proposers — do not hedge toward an imagined ' +
      'consensus; recommend decisively and defend it.\n\n' + researchBlock,
      { label: 'propose:' + role, phase: 'Propose', model: 'sonnet', effort: 'medium', agentType: 'general-purpose', schema: PROPOSAL_SCHEMA }
    )
  ))
  // 2026-08-13 spec 06 D6: proposer deaths were filtered silently — counted here into
  // `agentsFailed` on the return below.
  proposals = proposalsRaw.filter(Boolean)
  proposalsFailed = proposalsRaw.length - proposals.length
  assertProposalSurvival(proposals)
}

const proposalBlock = args.runProposers
  ? 'PROPOSER POSITIONS (independent, blind to each other; structured JSON):\n' + JSON.stringify(proposals)
  : 'Proposers were SKIPPED this round (all hard-to-reverse dimensions were user-constrained). ' +
    'Synthesize directly from the brief and research; the decision matrix is your validation of the ' +
    'user\'s constrained choices plus recommended defaults for any remaining open detail.'

phase('Aggregate')
const result = await dispatch(
  'You are the Fable aggregator for a genesis ' + args.stage + ' panel. Read the brief at ' + briefPath +
  '. ' + ctxLine + ' Integrate the research and proposer positions below into one decision package.\n' +
  '- original_goal: restate the goal from the brief VERBATIM (anti-drift).\n' +
  '- decision_matrix: one row per open dimension with options seen and a recommended default.\n' +
  '- hard_fork_list: ONLY genuine conflicts on hard-to-reverse dimensions (the brief\'s "## Open ' +
  'Dimensions" marks which are hard-to-reverse). These go to the user VERBATIM — never pre-decide them. ' +
  'Each conflicting_positions entry gets a consequence: one plain-English line stating what happens or ' +
  'what it costs if the user picks this option — apply the ten-second cold test (answerable by a ' +
  'product owner who has never seen this repo). Each hard_fork_list entry gets a ' +
  'recommended_first_reason: why recommended_first should win, in the same cold-test plain English.\n' +
  '- minority_positions: any proposer option you would otherwise suppress — record it verbatim with its ' +
  'rationale so the ADR preserves the full option space.\n' +
  '- research_gaps: angles that warrant a follow-up research round.\n\n' +
  researchBlock + '\n\n' + proposalBlock,
  { label: 'aggregate', phase: 'Aggregate', model: 'fable', effort: 'high', agentType: 'general-purpose', schema: AGGREGATE_SCHEMA }
)

if (!result) {
  // FAIL CLOSED: a dead aggregator must not read as an empty decision package.
  throw new Error('wf-panel: aggregator agent returned no result — re-invoke this round')
}
return { ...result, agentsFailed: researchFailed + proposalsFailed, tokens: budget.spent() }
