export const meta = {
  name: 'wf-research',
  description: 'Live option-menu research for the discovery interview: parallel Sonnet web agents build a ranked, recency-stamped option set per opened dimension; an optional Haiku pass verifies currency on version-bearing dimensions. No proposers, no panel — the light sibling of wf-panel.',
  whenToUse: 'Invoked between AskUserQuestion rounds by /spec:genesis-architect and /spec:genesis-design to turn the user\'s last answer into research-backed option menus',
  phases: [
    { title: 'Research', detail: 'one Sonnet web agent per opened dimension → ranked option menu' },
    { title: 'Verify', detail: 'Haiku currency check on version-bearing dimensions only (skipped otherwise)' },
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
      throw new Error('wf-research: args arrived String()-coerced to "[object Object]" — the ' +
        'caller stringified the object with String()/template interpolation instead of passing a ' +
        'real JSON object (or JSON.stringify). Pass `args` as a plain object in the Workflow call.')
    }
    try {
      v = JSON.parse(s)
    } catch (e) {
      throw new Error('wf-research: args was a string but not valid JSON (' + s.length +
        ' chars). This is structural corruption — free text / a non-scalar reached `args`, which ' +
        'must carry only paths, ids, enums, booleans, and command strings; prose lives on disk in ' +
        'the artifact the agents Read (spec / brief / rule docs). First 160 chars: ' +
        JSON.stringify(s.slice(0, 160)) + ' — parse error: ' + e.message)
    }
  }
  return v
}
args = normalizeArgs(args)
if (!args || typeof args !== 'object' || !Array.isArray(args.dimensionKeys) || !args.dimensionKeys.length) {
  throw new Error('wf-research: malformed args (expected the object documented below with a ' +
    'non-empty `dimensionKeys` array, got ' + (args === undefined ? 'undefined' : typeof args) + ')')
}

// args carries ONLY paths, enum keys, and booleans — never free text. The project description, the
// intake answers so far, and the focus paragraph for each dimension key all live in the brief on
// disk (written by the command); the agents Read them. Each interview round is a FRESH invocation:
// the command passes the prior picks/research via contextPaths, and this round researches only the
// dimension(s) the user's last answer just opened. The command — not this script — stamps the
// wall-clock fetchedAt on each returned option set (Date.now()/new Date() are unavailable here).
// args: {
//   stage: "architect" | "explore" | "design",
//   dimensionKeys: [string],   // dimensions THIS answer opened (menu in genesis.md); batched parallel
//   briefPath: string,         // .claude/genesis/brief.md — goal + intake + Research Angles focus; Read
//   contextPaths: [string],    // prior interview-research/*.json + descriptors to Read; []
//   verifyKeys: [string],      // subset of dimensionKeys that are version-bearing → Haiku check; []
// }

const briefPath = args.briefPath
const ctx = Array.isArray(args.contextPaths) ? args.contextPaths : []
const verifyKeys = Array.isArray(args.verifyKeys) ? args.verifyKeys : []
const ctxLine = ctx.length
  ? 'Also Read this prior context (earlier interview rounds + descriptors): ' + ctx.join(', ') + '.'
  : 'There is no prior interview context this round.'

// The menu a single Sonnet agent builds for one dimension: 2–4 current options, ranked
// recommended-first, each with an honest tradeoff, a recency stamp drawn from sources, and a flag
// preserving any deliberately-contrarian option (MAINTAINED DISSENT, mirrored from the panel).
const OPTION_SET_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['dimension', 'options', 'version_bearing'],
  properties: {
    dimension: { type: 'string' },
    options: {
      type: 'array',
      description: '2–4 current options, ranked, rank 1 = recommended first',
      items: {
        type: 'object', additionalProperties: false,
        required: ['label', 'tradeoff', 'recency', 'rank'],
        properties: {
          label: { type: 'string', description: 'the choice, terse and neutral (no leading language)' },
          tradeoff: { type: 'string', description: 'one honest line — what you give up by choosing this' },
          recency: { type: 'string', description: 'how current, grounded in sources — e.g. "stable as of 2026-05" or a version number; "unverified — model knowledge" if no source' },
          sources: { type: 'array', items: { type: 'string' } },
          rank: { type: 'integer', description: '1 = recommended first; ascending' },
          is_minority: { type: 'boolean', description: 'true for a deliberately-preserved contrarian/underdog option research surfaced' },
        },
      },
    },
    watch_outs: { type: 'array', items: { type: 'string' }, description: 'pitfalls / things to deliberately exclude' },
    version_bearing: { type: 'boolean', description: 'true if any option carries a library/framework/runtime version whose staleness would corrupt the choice' },
  },
}

const RECENCY_VERDICT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['dimension', 'verdicts'],
  properties: {
    dimension: { type: 'string' },
    verdicts: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['label', 'still_current'],
        properties: {
          label: { type: 'string' },
          still_current: { type: 'boolean' },
          note: { type: 'string', description: 'e.g. "superseded by X as of 2026-04" or "latest stable is N, not what was cited"' },
        },
      },
    },
  },
}

phase('Research')
// Keys are carried BY INDEX from here on: the parallel() result is index-aligned with
// dimensionKeys, and `dimension` is overwritten with the key — never trusted from the agent's
// echo. Joining on agent-authored free text (the old behavior) silently skipped verification
// whenever the model paraphrased the key.
const menusRaw = await parallel(args.dimensionKeys.map(key => () =>
  agent(
    'You are the option-research agent for the "' + key + '" dimension of a ' + args.stage +
    ' discovery interview. Read the brief at ' + briefPath + ' for this project\'s goal, archetype, ' +
    'audience/locale, and the focus paragraph for "' + key + '" under "## Research Angles" (if present). ' +
    ctxLine + ' Research the CURRENT trend / best practice / industry standard for this dimension — use ' +
    'WebSearch/WebFetch if available; if not, rely on your knowledge and stamp those options ' +
    '"unverified — model knowledge". Return 2–4 genuinely current options the user should choose ' +
    'between, ranked recommended-first FOR THIS PROJECT (its archetype, audience, goals). Each option ' +
    'gets an honest one-line tradeoff and a recency stamp grounded in a source. Phrase every label ' +
    'neutrally — do NOT lead the user. If research surfaces a credible contrarian/underdog option, ' +
    'include it and set is_minority (never average it away). Set version_bearing=true if any option ' +
    'carries a library/framework/runtime version whose staleness would corrupt the choice.',
    { label: 'menu:' + key, phase: 'Research', model: 'sonnet', agentType: 'general-purpose', schema: OPTION_SET_SCHEMA }
  )
))
let menus = menusRaw
  .map((m, i) => (m ? { ...m, dimension: args.dimensionKeys[i] } : null))
  .filter(Boolean)

// 2026-08-13 spec 06 D6, amended 06a D5: enforce the 2–4 cap HERE — a researcher may return more
// than 4 options despite the schema's guidance, and nothing previously trimmed it. Cut before the
// Haiku verify pass (no point spending a currency check on an option about to be dropped).
// Minority-preserving: an `is_minority: true` option is a deliberately-preserved contrarian pick
// the research prompt orders kept ("never average it away") — cut only when minority options
// alone exceed the cap. Cut order per group: ascending-rank STABLE sort (ties keep researcher
// order), then cut worst-(highest-)rank-first from the end; the non-minority group is exhausted
// before the minority group is touched at all. Each cut is recorded as {dimension, label}.
//
// A named top-level function (not inlined) so tests/report/return-slots.test.js can execute it
// standalone via evalFns. LAYOUT REQUIREMENT (test-mode constraint, per wf-review's auditKilled
// precedent): OPTION_CAP is declared INSIDE this function's braces — tests/helpers.js extractFn
// brace-matches a single named top-level function with no mode for adjacent top-level consts.
function capOptions(menus) {
  const OPTION_CAP = 4
  const alsoConsidered = []
  const cappedMenus = menus.map(m => {
    if (!Array.isArray(m.options) || m.options.length <= OPTION_CAP) return m
    const sorted = [...m.options].sort((a, b) => (a.rank || 0) - (b.rank || 0))
    const nonMinority = sorted.filter(o => o.is_minority !== true)
    const minority = sorted.filter(o => o.is_minority === true)
    const cutQueue = [...nonMinority].reverse().concat([...minority].reverse())
    const cutCount = sorted.length - OPTION_CAP
    const cut = cutQueue.slice(0, cutCount)
    const cutSet = new Set(cut)
    for (const o of cut) alsoConsidered.push({ dimension: m.dimension, label: o.label })
    return { ...m, options: sorted.filter(o => !cutSet.has(o)) }
  })
  return { menus: cappedMenus, alsoConsidered }
}
const capResult = capOptions(menus)
menus = capResult.menus
const alsoConsidered = capResult.alsoConsidered

// Haiku currency check for version-bearing dimensions. Triggered by the UNION of the command's
// verifyKeys flag and the researcher's own version_bearing discovery — the command knows which
// dimensions are stacks/libraries up front, but a researcher can legitimately surface versioned
// options on a dimension the command didn't anticipate; either signal alone suffices.
const toVerify = menus.filter(m => verifyKeys.includes(m.dimension) || m.version_bearing)
// 2026-08-13 spec 06 D6: true when at least one currency verifier died — a stale-versus-current
// stamp on those options was never actually confirmed, and it must not silently read as fresh.
let verifyFailed = false
if (toVerify.length) {
  phase('Verify')
  const verdicts = await parallel(toVerify.map(m => () =>
    agent(
      'Narrow currency check. For the "' + m.dimension + '" dimension, verify whether each option below ' +
      'is STILL CURRENT or has been superseded/deprecated. Use WebSearch/WebFetch for latest stable ' +
      'versions and maintenance status; do not re-rank or editorialize — only report still_current and a ' +
      'terse note where it changed. Keep each verdict\'s `label` EXACTLY as given, in the SAME order.\n\nOPTIONS:\n' +
      JSON.stringify(m.options.map(o => ({ label: o.label, recency: o.recency }))),
      { label: 'verify:' + m.dimension, phase: 'Verify', model: 'haiku', agentType: 'general-purpose', schema: RECENCY_VERDICT_SCHEMA, effort: 'low' }
    )
  ))
  verifyFailed = verdicts.some(v => !v)
  // Merge BY INDEX (toVerify[i] ↔ verdicts[i]); within a menu, match options by exact label echo
  // with a positional fallback so a paraphrased label degrades to positional, never to silence.
  const verdictFor = new Map(toVerify.map((m, i) => [m, verdicts[i]]))
  menus = menus.map(m => {
    const v = verdictFor.get(m)
    if (!v) return m
    const options = m.options.map((o, oi) => {
      const vd = v.verdicts.find(x => x.label === o.label) || v.verdicts[oi]
      if (!vd) return o
      return { ...o, still_current: vd.still_current, verify_note: vd.note || '' }
    })
    return { ...m, options, verified: true }
  })
}

// One option set per opened dimension. The command writes each to interview-research/{dimension}.json
// (stamping fetchedAt), curates from the (already ≤4) menu into a recommended-first
// AskUserQuestion, and records the pick + sources to the brief. Stale options
// (still_current === false) should be demoted or dropped there.
return { stage: args.stage, menus, verifyFailed: verifyFailed, alsoConsidered: alsoConsidered, tokens: budget.spent() }
