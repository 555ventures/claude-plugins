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
// @fragment:normalize-args
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
  'datetime', 'schema-validation', 'format', 'duplication', 'cycle',
]

// Ratchet categories: a per-host baseline snapshot quarantines existing violations at wiring
// time, and the gate fails only on violations not in the baseline. Candidates for these
// categories must support a baseline/known-violations mode (spec 20260810/06 D2).
const RATCHET_CATEGORIES = ['duplication', 'cycle']

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
    RATCHET_CATEGORIES.includes(cell.category)
      ? `- This is a RATCHET category: every candidate MUST support a baseline / known-violations / ignore-file mode (so existing violations are quarantined and the gate fails only on new ones); citations must show that mode, not just the underlying check.`
      : '',
    `Return the schema object. Do not edit any file. Do not install anything.`,
  ].filter(Boolean).join('\n\n')
}

// Pure, top-level, dependency-injected (no closure over CATEGORIES/sandbox `log`) so
// tests/enforce/taxonomy.test.js can extract and evaluate it standalone via extractFn/evalFns,
// which only matches named top-level functions and runs them without module scope.
function validateCells(cells, categories, log) {
  const skipped = []
  // Never silently drop a cell: every cell the command sent is accounted for in the return —
  // either accepted, or listed in `skipped` with a reason the command can reconcile against its
  // work list.
  const accepted = cells.filter(c => {
    if (!categories.includes(c.category)) {
      log(`skipping cell ${c.id || '?'}: unknown category '${c.category}' (not in the reserved set)`)
      skipped.push({ id: c.id || '?', category: c.category, reason: 'unknown-category' })
      return false
    }
    return true
  })
  return { accepted, skipped }
}

phase('Research')
const { accepted: cells, skipped } = validateCells(args.cells, CATEGORIES, log)

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
