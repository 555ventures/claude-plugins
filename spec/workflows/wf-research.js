export const meta = {
  name: 'wf-research',
  description: 'Live option-menu research for the discovery interview: parallel Sonnet web agents build a ranked, recency-stamped option set per opened dimension, each option\'s packages resolvable by registry-check.js. Independent per-dimension research only — no synthesis, no debate, no vote.',
  whenToUse: 'Invoked between AskUserQuestion rounds by the genesis commands to turn the user\'s last answer into research-backed option menus',
  phases: [
    { title: 'Research', detail: 'one Sonnet web agent per opened dimension → ranked option menu' },
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
// }

const briefPath = args.briefPath
const ctx = Array.isArray(args.contextPaths) ? args.contextPaths : []
const ctxLine = ctx.length
  ? 'Also Read this prior context (earlier interview rounds + descriptors): ' + ctx.join(', ') + '.'
  : 'There is no prior interview context this round.'

// The menu a single Sonnet agent builds for one dimension: 2–4 current options, ranked
// recommended-first, each with an honest tradeoff, a recency stamp drawn from sources, and a flag
// preserving any deliberately-contrarian option (MAINTAINED DISSENT: a genuinely credible
// underdog option research surfaced, kept and flagged `is_minority` rather than averaged away).
//
// specs/20260825/02 D6: `because` (the coverage keys/answers that drove this option's rank) and
// `priced` (a consequence priced at the brief's stated scale, or the literal "n/a — no number in
// the brief") are REQUIRED string fields — a schema requirement the harness enforces on the
// agent's return, not a prompt suggestion the agent can silently skip.
//
// specs/20260825/03 D6: `packages` is a REQUIRED array per option (an empty array is legal, for
// taste/UX dimensions with nothing to resolve) — each entry names a registry package
// {registry, name, version} that registry-check.js (this spec's deterministic replacement for
// the deleted Haiku "still current?" pass) resolves by one GET against that registry's own
// per-version JSON endpoint. The check is only as good as this input: an option that names no
// package is honestly `unverified`; an option that names one is verified or gone.
//
// A named top-level function (not a bare top-level const) so tests/genesis/research-menu.test.js
// can extract it standalone via evalFns. LAYOUT REQUIREMENT (test-mode constraint, per
// capOptions' precedent below and spec 20260825/02 Assumption A1): the schema is a single
// `return {…}` — tests/helpers.js extractFn brace-matches a single named top-level function with
// no mode for adjacent top-level consts, so nothing this function needs may live outside its own
// braces.
function optionSetSchema() {
  return {
    type: 'object', additionalProperties: false,
    required: ['dimension', 'options', 'version_bearing', 'why_recommended'],
    properties: {
      dimension: { type: 'string' },
      why_recommended: { type: 'string', description: 'why rank 1 wins for THIS project, one line' },
      options: {
        type: 'array',
        description: '2–4 current options, ranked, rank 1 = recommended first',
        items: {
          type: 'object', additionalProperties: false,
          required: ['label', 'tradeoff', 'recency', 'rank', 'because', 'priced', 'packages'],
          properties: {
            label: { type: 'string', description: 'the choice, terse and neutral (no leading language)' },
            tradeoff: { type: 'string', description: 'one honest line — what you give up by choosing this' },
            recency: { type: 'string', description: 'how current, grounded in sources — e.g. "stable as of 2026-05" or a version number; "unverified — model knowledge" if no source' },
            sources: { type: 'array', items: { type: 'string' } },
            rank: { type: 'integer', description: '1 = recommended first; ascending' },
            is_minority: { type: 'boolean', description: 'true for a deliberately-preserved contrarian/underdog option research surfaced' },
            because: { type: 'string', description: 'the coverage keys and answers that drove this rank, e.g. "because residency=EU-only and tenancy=organisations"' },
            priced: { type: 'string', description: 'one concrete consequence at the brief\'s stated scale — a monthly figure and where it jumps, a migration cost, or the literal "n/a — no number in the brief"' },
            packages: {
              type: 'array',
              description: 'registry packages this option names, for registry-check.js to resolve; [] for a taste/UX dimension with nothing to check',
              items: {
                type: 'object', additionalProperties: false,
                required: ['registry', 'name', 'version'],
                properties: {
                  registry: { type: 'string', description: 'npm | pypi | crates | endoflife' },
                  name: { type: 'string' },
                  version: { type: 'string' },
                },
              },
            },
          },
        },
      },
      watch_outs: { type: 'array', items: { type: 'string' }, description: 'pitfalls / things to deliberately exclude' },
      version_bearing: { type: 'boolean', description: 'true if any option carries a library/framework/runtime version whose staleness would corrupt the choice' },
    },
  }
}
const OPTION_SET_SCHEMA = optionSetSchema()

phase('Research')
// Keys are carried BY INDEX from here on: the parallel() result is index-aligned with
// dimensionKeys, and `dimension` is overwritten with the key — never trusted from the agent's
// echo. Joining on agent-authored free text (the old behavior) silently skipped verification
// whenever the model paraphrased the key.
const menusRaw = await parallel(args.dimensionKeys.map(key => () =>
  agent(
    'You are the option-research agent for the "' + key + '" dimension of a ' + args.stage +
    ' discovery interview. Read the brief at ' + briefPath + ' for this project\'s goal, archetype, ' +
    'audience/locale, its "## Coverage" section (the ten business/legal/product answers — payer, ' +
    'tenancy, data-sensitivity, residency, ai-use, unattended, integrations, scale-outage, ' +
    'vendor-budget, offline-mobile), and the focus paragraph for "' + key + '" under "## Research ' +
    'Angles" (if present). ' + ctxLine + ' Research the CURRENT trend / best practice / industry ' +
    'standard for this dimension — use WebSearch/WebFetch if available; if not, rely on your ' +
    'knowledge and stamp those options "unverified — model knowledge". Return 2–4 genuinely current ' +
    'options the user should choose between, ranked recommended-first FOR THIS PROJECT (its ' +
    'archetype, audience, goals). Each option gets an honest one-line tradeoff and a recency stamp ' +
    'grounded in a source. Phrase labels neutrally; the ranking and `why_recommended` carry the ' +
    'recommendation — the interview shows rank 1 as (Recommended) with your reason. Set ' +
    'why_recommended to one line: why rank 1 wins for THIS project. Each option also gets `because` ' +
    '(the "## Coverage" keys and answers that drove ITS rank, e.g. "because residency=EU-only and ' +
    'tenancy=organisations") and `priced` (one concrete consequence at the brief\'s stated scale, ' +
    'priced against the "## Coverage" answers for scale-outage and vendor-budget — a monthly figure ' +
    'and where it jumps, or a migration cost; if the brief states no number, use the literal ' +
    '"n/a — no number in the brief"). If research surfaces a credible contrarian/underdog option, ' +
    'include it and set is_minority (never average it away). Set version_bearing=true if any option ' +
    'carries a library/framework/runtime version whose staleness would corrupt the choice. For ' +
    'each option, name the registry package and the EXACT version you cite in `packages` — ' +
    '{registry: "npm"|"pypi"|"crates"|"endoflife", name, version} — sourced from a release page ' +
    'or the registry itself, never a blog roundup (a fake major like "Bun 2.0" or "Deno 3.0" ' +
    'must never be cited as if it shipped). A version you cannot source this way gets NO package ' +
    'entry and `recency` set to "unverified — model knowledge"; a taste/UX option with nothing to ' +
    'check gets `packages: []`.',
    { label: 'menu:' + key, phase: 'Research', model: 'sonnet', effort: 'medium', agentType: 'general-purpose', schema: OPTION_SET_SCHEMA }
  )
))
let menus = menusRaw
  .map((m, i) => (m ? { ...m, dimension: args.dimensionKeys[i] } : null))
  .filter(Boolean)

// 2026-08-13 spec 06 D6, amended 06a D5: enforce the 2–4 cap HERE — a researcher may return more
// than 4 options despite the schema's guidance, and nothing previously trimmed it. Cut before the
// registry-check.js currency pass the command runs on the written file (no point resolving
// packages for an option about to be dropped). Minority-preserving: an `is_minority: true` option is a deliberately-preserved contrarian pick
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

// One option set per opened dimension. The command writes each to interview-research/{dimension}.json
// (stamping fetchedAt), then runs registry-check.js --write over the file — this spec's
// deterministic replacement for the deleted Haiku currency pass — before curating from the
// (already ≤4, now currency-checked) menu into a recommended-first AskUserQuestion and recording
// the pick + sources to the brief.
return { stage: args.stage, menus, alsoConsidered: alsoConsidered, tokens: budget.spent() }
