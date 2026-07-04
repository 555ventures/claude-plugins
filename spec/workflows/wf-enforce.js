export const meta = {
  name: 'wf-enforce',
  description: 'Discover a deterministic enforcer per (stack x rule category) against live sources, with citations',
  whenToUse: 'Invoked by /spec:enforce for the read-only research fan-out over a runtime-classified (stack x category) work list',
  phases: [
    { title: 'Research', detail: 'one web-enabled agent per (stack x category) cell — discover-only, never from training memory' },
  ],
}

// Normalize `args` before any use. The harness convention has varied: some versions deliver the
// object verbatim, others JSON-encode it as a string on the scriptPath channel. We accept both,
// tolerate accidental double-encoding, and on failure throw a message that shows what actually
// arrived (length + preview) instead of a bare "Unable to parse JSON string" at the call site.
// (Same normalizer doctrine as wf-build — see CLAUDE.md "Workflow tool quirks".)
function normalizeArgs(raw) {
  let v = raw
  // Unwrap up to 2 layers of JSON-string encoding (single = older harness; double = caller bug).
  for (let i = 0; i < 2 && typeof v === 'string'; i++) {
    const s = v.trim()
    if (s === '[object Object]') {
      throw new Error('wf-enforce: args arrived String()-coerced to "[object Object]" — the ' +
        'caller stringified the object with String()/template interpolation instead of passing a ' +
        'real JSON object (or JSON.stringify). Pass `args` as a plain object in the Workflow call.')
    }
    try {
      v = JSON.parse(s)
    } catch (e) {
      throw new Error('wf-enforce: args was a string but not valid JSON (' + s.length +
        ' chars). This is structural corruption — free text / a non-scalar reached `args`, which ' +
        'must carry only paths, ids, enums, booleans, and command strings; prose lives on disk in ' +
        'the artifact the agents Read (spec / brief / rule docs). First 160 chars: ' +
        JSON.stringify(s.slice(0, 160)) + ' — parse error: ' + e.message)
    }
  }
  return v
}
args = normalizeArgs(args)
if (!args || typeof args !== 'object' || !Array.isArray(args.cells)) {
  throw new Error('wf-enforce: malformed args (expected the object documented below with a ' +
    '`cells` array, got ' + (args === undefined ? 'undefined' : typeof args) +
    ') — pass the full args object to the Workflow call')
}

// args carries ONLY paths, ids, enums, booleans — no free text. Each cell's rule clauses live in
// the host rule docs on disk; the research agent Reads them via `ruleRefs`. Free text in args
// corrupts the JSON (quotes/backslashes) against the harness's version-inconsistent
// string-vs-object encoding — see the normalizer above. args: {
//   configPath: string,             // host .claude/spec.config.json — agent reads stack/gate from it
//   pipelineRulesPath: string,      // host pipeline rules file ('' if none)
//   stackDescriptorPath: string,    // .claude/genesis/stack-descriptor.json, or '' (brownfield / no genesis stage)
//   enforcementManifestPath: string,// existing .claude/rules/enforcement.json to reconcile against, or ''
//   cells: [{                       // the (stack x category) work list — classified by the COMMAND
//     id: string,                   // stable cell id, e.g. "python:module-boundary"
//     stack: string,                // detected stack key (e.g. "python","typescript","dart","rust")
//     category: string,             // ONE of the reserved categories (see CATEGORIES below)
//     ruleRefs: [string],           // PATHS (rule doc files) or rule ids the agent Reads for clause text
//   }],
// }

// Stable, language-neutral rule categories. Encoded as a method/category vocabulary — never a tool
// name (a named tool anchors the agent and goes stale faster than the rules). The agent DISCOVERS
// the actual tool at runtime against live sources.
const CATEGORIES = [
  'module-boundary', 'naming', 'forbidden-symbol', 'structural-pattern',
  'datetime', 'schema-validation', 'format',
]

const CANDIDATE = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'echo the cell id' },
    stack: { type: 'string' },
    category: { type: 'string' },
    candidates: {
      type: 'array',
      description: 'ranked enforcer candidates, best first; empty if none plausible on this stack',
      items: {
        type: 'object',
        properties: {
          tool: { type: 'string', description: 'enforcer / mechanism name as discovered (not from memory)' },
          mechanism: { type: 'string', enum: ['native-linter', 'arch-tool', 'plugin', 'structural-matcher', 'schema-validator', 'custom-script'] },
          installCmd: { type: 'string', description: 'how the COMMAND would install it on this repo ("" if already-present/builtin)' },
          runCmd: { type: 'string', description: 'how the COMMAND would invoke it against this repo to verify' },
          citations: {
            type: 'array',
            description: 'LIVE sources backing existence + current usage — never training memory',
            items: {
              type: 'object',
              properties: {
                url: { type: 'string' },
                note: { type: 'string', description: 'what this source confirms (exists / current version / supports this check)' },
              },
              required: ['url', 'note'],
            },
          },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['tool', 'mechanism', 'installCmd', 'runCmd', 'citations', 'confidence'],
      },
    },
    fallback: {
      type: 'string',
      enum: ['none', 'sweep', 'review-check'],
      description: 'recommended fallback if every candidate fails verify: sweep = host pattern-sweep harness; review-check = reviewer severity prose (judgment clause only)',
    },
    notes: { type: 'string', description: 'one line: why this fallback, or what makes the category hard here' },
  },
  required: ['id', 'stack', 'category', 'candidates', 'fallback'],
}

function researchPrompt(cell) {
  const refs = (cell.ruleRefs || []).map(r => `- ${r}`).join('\n') || '- (none — infer the clause set from the pipeline rules file)'
  const stackDesc = args.stackDescriptorPath
    ? `Read ${args.stackDescriptorPath} for the chosen stack/toolchain (a HINT — verify it against the repo, do not assume it covers this category).`
    : `There is no genesis stack descriptor (brownfield repo) — confirm the stack from ${args.configPath} and the repo's manifest files.`
  return [
    `You are researching ONE deterministic enforcer cell: stack=${cell.stack}, category=${cell.category}.`,
    `Goal: find a DETERMINISTIC mechanism (linter / arch-tool / structural matcher / schema validator) that can check this rule category on THIS repo's stack — so the check runs in CI, not as a runtime LLM judgment.`,
    `## The rules this cell must enforce\nRead these host rule sources for the actual clauses (do not paraphrase from memory):\n${refs}`,
    `## Stack\n${stackDesc} Confirm the package manager and the existing gate command from ${args.configPath}.`,
    args.enforcementManifestPath
      ? `## Prior choice\nRead ${args.enforcementManifestPath}; if it already records an enforcer for this cell, evaluate whether it is still current (re-cite it) before proposing a replacement.`
      : '',
    `## Discovery rules (two-stage selection, stage 1 of 2 — DISCOVER)`,
    `- Discover against LIVE sources only: web search / fetch, the stack's package registry, and library-docs MCP (resolve-library-id then query-docs). NEVER propose a tool from training memory — your cutoff is stale for tooling.`,
    `- Every candidate MUST carry citations proving it (a) exists today and (b) actually performs this category of check on this stack. A candidate with no live citation is not a candidate.`,
    `- Prefer the repo's NATIVE ecosystem enforcer over a bolt-on; prefer a tool already in the repo's lockfile (cite where you saw it).`,
    `- Give installCmd + runCmd the COMMAND will use to VERIFY (stage 2 happens in the command, not here — you do NOT install or run anything; you only propose how).`,
    `- If no deterministic enforcer plausibly fits: return an empty candidates list and set fallback = "sweep" for a structural/textual clause, or "review-check" ONLY for a genuine-judgment clause (data-flow ordering, semantic intent, sentinel usage, "is this a sanctioned carve-out").`,
    `Return the schema object. Do not edit any file. Do not install anything.`,
  ].filter(Boolean).join('\n\n')
}

phase('Research')
// Never silently drop a cell: every cell the command sent is accounted for in the return — either
// researched, or listed in `skipped` with a reason the command can reconcile against its work list.
const skipped = []
const cells = args.cells.filter(c => {
  if (!CATEGORIES.includes(c.category)) {
    log(`skipping cell ${c.id || '?'}: unknown category '${c.category}' (not in the reserved set)`)
    skipped.push({ id: c.id || '?', category: c.category, reason: 'unknown-category' })
    return false
  }
  return true
})

const results = await parallel(cells.map(cell => () =>
  agent(researchPrompt(cell), {
    label: `research:${cell.id}`, phase: 'Research', schema: CANDIDATE, model: 'sonnet',
  })))
cells.forEach((c, i) => {
  if (!results[i]) skipped.push({ id: c.id, category: c.category, reason: 'agent-failed' })
})

return {
  stage: 'researched',
  cells: results.filter(Boolean),
  skipped,
  tokens: budget.spent(),
}
