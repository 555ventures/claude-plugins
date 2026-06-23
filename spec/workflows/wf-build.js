export const meta = {
  name: 'wf-build',
  description: 'Implement a hardened spec: test authors, layered batches, deterministic gate + repair loop',
  whenToUse: 'Invoked by /spec:build with batches parsed from the spec File Plan',
  phases: [
    { title: 'TestAuthors', detail: 'failing tests derived from spec only' },
    { title: 'RedCheck', detail: 'confirm new tests fail before implementation' },
    { title: 'Implement', detail: 'layered batches, parallel within a layer group' },
    { title: 'Gate', detail: 'host gate command, repair loop (cap 2)' },
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
      throw new Error('wf-build: args arrived String()-coerced to "[object Object]" — the ' +
        'caller stringified the object with String()/template interpolation instead of passing a ' +
        'real JSON object (or JSON.stringify). Pass `args` as a plain object in the Workflow call.')
    }
    try {
      v = JSON.parse(s)
    } catch (e) {
      throw new Error('wf-build: args was a string but not valid JSON (' + s.length +
        ' chars). This is structural corruption — free text / a non-scalar reached `args`, which ' +
        'must carry only paths, ids, enums, booleans, and the gate command; prose belongs in the ' +
        'spec the agents Read. First 160 chars: ' + JSON.stringify(s.slice(0, 160)) +
        ' — parse error: ' + e.message)
    }
  }
  return v
}
args = normalizeArgs(args)
if (!args || typeof args !== 'object' || !Array.isArray(args.groups)) {
  throw new Error('wf-build: malformed args (expected the object documented below with a ' +
    '`groups` array, got ' + (args === undefined ? 'undefined' : typeof args) +
    ') — pass the full args object to the Workflow call')
}

// args carries ONLY paths, ids, enums, booleans, and the host's gate command — no free text.
// Any human/spec prose (per-file intent, batch notes, orchestrator rulings) is Read from the
// spec on disk by the agent that needs it. Free text in args corrupts the JSON (quotes/
// backslashes) against the harness's version-inconsistent string-vs-object encoding — see the
// normalizer above. args: {
//   specPath: string,
//   tdd: boolean,
//   testBatches: [{id, agentType, files: [{path, action}], acIds: [string]}],
//   groups: [[{id, agentType, files: [{path, action}]}]],  // ordered; parallel within
//   resolutions: {batchId: token},    // ruling token per blocked batch — its VALUE is an opaque
//                                     // cache-bust salt (a hash/counter, NOT prose); the ruling
//                                     // itself lives in the spec's Decisions table the worker
//                                     // re-reads. Cumulative across resumes.
//   agentMap: {kind: agentName},      // host .claude/spec.config.json agentMap; keys 'tests'
//                                     // and 'default' are the fallback agent types here —
//                                     // per-batch agentType (assigned by the orchestrator
//                                     // from the same map) always wins
//   doctrinePaths: {agentName: string},  // path to each HOST .claude/agents/<name>.md named in
//                                     // agentMap — the workflow agent registry resolves only
//                                     // built-in and plugin agents, so host roles dispatch on
//                                     // general-purpose and the worker READS this file for its
//                                     // doctrine. args is a control channel, not a data bus:
//                                     // bodies travel as paths, the agents do the file I/O.
//   gate: {
//     command: string,      // fully resolved deterministic gate command (host gateCommand
//                           // with {testDirs}/{scopeDirs} placeholders already substituted)
//     testCommand: string,  // host test-runner prefix for the red check; file paths appended
//   },
//   pipelineRulesPath: string,  // path to the host pipeline rules file; workers read its
//                               // '## Worker Rules' / '## Test Rules' sections. '' if none.
// }

const RECEIPT = {
  type: 'object',
  properties: {
    files: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          action: { type: 'string', enum: ['CREATE', 'MODIFY', 'DELETE'] },
          summary: { type: 'string' },
        },
        required: ['path', 'action', 'summary'],
      },
    },
    blocked: {
      type: ['object', 'null'],
      properties: {
        kind: { type: 'string', enum: ['design-fork', 'stale-assumption'] },
        detail: { type: 'string' },
        options: { type: 'array', items: { type: 'string' } },
        recommendation: { type: 'string' },
      },
      required: ['kind', 'detail'],
    },
  },
  required: ['files', 'blocked'],
}

const RED = {
  type: 'object',
  properties: {
    allRed: { type: 'boolean' },
    unexpectedlyPassing: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['allRed', 'unexpectedlyPassing', 'summary'],
}

const GATE = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' },
    failures: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string', description: 'File Plan path of the file that needs the fix' },
          summary: { type: 'string', description: 'one-line failure description incl. test/check name' },
        },
        required: ['file', 'summary'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['pass', 'failures', 'summary'],
}

const RULES_PATH = args.pipelineRulesPath || ''

const HARD_RULES = [
  `## Hard rules
- NEVER run any git command (checkout/stash/restore/reset/clean/add/commit/push). The orchestrator owns git.
- Read each referenced source file before editing. Edit files directly — do not return edit instructions.
- Touch NOTHING outside your assigned files.
- Do NOT query MCP servers — work from the spec's embedded references; if one is wrong against the
  installed version, return blocked {kind: "stale-assumption"}.
- No defensive code, fallbacks, or features beyond what the spec requires.
- If you hit a design fork not locked in the Decisions table, or a spec assumption that is wrong
  against the actual code: STOP editing and return blocked {kind, detail, options, recommendation}.
  Never guess, never pick "the simplest option".
- You may run scoped read-only checks to self-verify (lint/typecheck/tests on your own files only).`,
  RULES_PATH ? `## Host rules\nRead ${RULES_PATH} and follow its "## Worker Rules" section verbatim — host-specific hard rules (e.g. read-only/managed surfaces). Ignore the file's other sections; they are for the orchestrator, not you.` : '',
].filter(Boolean).join('\n\n')

const TEST_RULES = [
  `## Test rules
- Reference the covered AC-ID in each test (name, comment, or docstring — per the host convention below if given).
- Every test must FAIL on current code. If a test would already pass, the spec is wrong — return blocked {kind: "stale-assumption", detail: "<which test and why>"}.
- Test behavior, not implementation. Do not import internal helpers or assert on intermediate state.
- Write NO implementation code.`,
  RULES_PATH ? `## Host test conventions\nRead ${RULES_PATH} and follow its "## Test Rules" section verbatim (file placement, naming, AC-ID reference convention). Ignore the file's other sections.` : '',
].filter(Boolean).join('\n\n')

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

function fileList(b) {
  return b.files.map(f => `- ${f.action} ${f.path}`).join('\n')
}

function batchPrompt(b) {
  const resolution = (args.resolutions || {})[b.id]
  return [
    `You are implementing one batch of files for a hardened spec.`,
    doctrineBlock(b.agentType),
    `First, Read the spec at ${args.specPath}. The "Decisions" table is authoritative — apply it verbatim. The "Assumptions" section lists known fallbacks for surprises. Any embedded references (UI / Contracts sections) are the library and API shapes you build against.`,
    resolution ? `## Orchestrator ruling (revision ${resolution})\nA ruling for this batch is recorded in the spec's Decisions table — Read it there and apply it exactly.` : '',
    `## Files in this batch\n${fileList(b)}`,
    HARD_RULES,
  ].filter(Boolean).join('\n\n')
}

function testPrompt(b) {
  const resolution = (args.resolutions || {})[b.id]
  return [
    `You are writing FAILING tests for a hardened spec — tests come before implementation.`,
    doctrineBlock(b.agentType || AGENT_MAP.tests),
    `First, Read the spec at ${args.specPath}. Derive tests ONLY from the spec's Acceptance Criteria and Behavior sections — never from implementation code (it may not exist yet, and tests must not share its blind spots).`,
    resolution ? `## Orchestrator ruling (revision ${resolution})\nA ruling for this batch is recorded in the spec's Decisions table — Read it there and apply it exactly.` : '',
    `## Test files in this batch\n${fileList(b)}`,
    `## Acceptance criteria to cover\n${(b.acIds || []).map(id => `- ${id}`).join('\n')}`,
    TEST_RULES,
    HARD_RULES,
  ].filter(Boolean).join('\n\n')
}

const fileToBatch = {}
const batchById = {}
for (const group of args.groups) {
  for (const b of group) {
    batchById[b.id] = b
    for (const f of b.files) fileToBatch[f.path] = b.id
  }
}
for (const b of args.testBatches || []) {
  batchById[b.id] = b
  for (const f of b.files) fileToBatch[f.path] = b.id
}

// The gate agent is asked for File Plan paths, but it reads them out of gate-command output —
// which routinely prints absolute or ./-prefixed paths. Match the reported path against the
// File Plan scope keys tolerantly so an in-scope failure isn't misclassified out-of-scope and
// bounced to the orchestrator instead of through the repair loop. Exact match first, then a
// path-boundary suffix match in either direction (absolute→relative or basename→full).
const normPath = p => String(p).replace(/^\.\//, '').replace(/^\/+/, '')
const scopePaths = Object.keys(fileToBatch)
function resolveBatch(file) {
  if (fileToBatch[file]) return fileToBatch[file]
  const f = normPath(file)
  if (fileToBatch[f]) return fileToBatch[f]
  const hit = scopePaths.find(s => {
    const sn = normPath(s)
    return f === sn || f.endsWith('/' + sn) || sn.endsWith('/' + f)
  })
  return hit ? fileToBatch[hit] : null
}

const receipts = []

function collectBlocked(batches, results) {
  const blocked = []
  const missing = []
  batches.forEach((b, i) => {
    const r = results[i]
    if (!r) missing.push(b.id)
    else if (r.blocked) blocked.push({ batch: b.id, ...r.blocked })
    else receipts.push({ batch: b.id, files: r.files })
  })
  return { blocked, missing }
}

// ---- Phase: test authors (TDD) ----
if (args.tdd && (args.testBatches || []).length) {
  phase('TestAuthors')
  const out = await parallel(args.testBatches.map(b => () =>
    dispatch(testPrompt(b), {
      label: `tests:${b.id}`, phase: 'TestAuthors', schema: RECEIPT,
      agentType: resolveType(b.agentType || AGENT_MAP.tests), model: 'sonnet',
    })))
  const { blocked, missing } = collectBlocked(args.testBatches, out)
  if (blocked.length || missing.length) {
    return { stage: 'blocked', blocked, missing, completed: receipts }
  }

  phase('RedCheck')
  const testFiles = args.testBatches.flatMap(b => b.files.map(f => f.path)).join(' ')
  const red = await agent(
    `Run: ${args.gate.testCommand} ${testFiles}\n` +
    `These tests were just written for a spec whose implementation does not exist yet, so every ` +
    `newly written test MUST fail. Report allRed=true only if all of them fail; list any that pass ` +
    `in unexpectedlyPassing. Do not edit any file.`,
    { label: 'red-check', phase: 'RedCheck', schema: RED, model: 'sonnet' })
  if (red && !red.allRed) {
    return { stage: 'tdd-red-check', passing: red.unexpectedlyPassing, summary: red.summary, completed: receipts }
  }
}

// ---- Phase: implementation, layer group by layer group ----
phase('Implement')
for (const group of args.groups) {
  log(`Implementing group: ${group.map(b => b.id).join(', ')}`)
  const out = await parallel(group.map(b => () =>
    dispatch(batchPrompt(b), {
      label: `impl:${b.id}`, phase: 'Implement', schema: RECEIPT,
      agentType: resolveType(b.agentType), model: 'sonnet',
    })))
  const { blocked, missing } = collectBlocked(group, out)
  if (blocked.length || missing.length) {
    return { stage: 'blocked', blocked, missing, completed: receipts }
  }
}

// ---- Phase: deterministic gate + repair loop ----
phase('Gate')
const gateCmd = args.gate.command
let gate = null
for (let round = 0; round <= 2; round++) {
  gate = await agent(
    `Run these checks and report results. Do not edit any file.\n\n${gateCmd}\n\n` +
    `For each failure, identify the single file that most likely needs the fix (source file for ` +
    `implementation bugs, test file for bad tests) and summarize the failure in one line including ` +
    `the test/check name. pass=true only if every check is green.`,
    { label: `gate:round-${round}`, phase: 'Gate', schema: GATE, model: 'haiku' })
  if (!gate || gate.pass) break

  const byBatch = {}
  const outOfScope = []
  for (const f of gate.failures) {
    const bid = resolveBatch(f.file)
    if (!bid) { outOfScope.push(f); continue }
    if (!byBatch[bid]) byBatch[bid] = []
    byBatch[bid].push(f)
  }
  if (outOfScope.length) {
    return { stage: 'out-of-scope-failure', failures: outOfScope, gate, completed: receipts }
  }
  if (round === 2) break

  log(`Gate round ${round} failed — repairing batches: ${Object.keys(byBatch).join(', ')}`)
  await parallel(Object.entries(byBatch).map(([bid, fails]) => () =>
    dispatch(
      batchPrompt(batchById[bid]) +
      `\n\n## Repair (round ${round + 1})\nYour batch's previous output produced these gate failures. ` +
      `Fix them without changing unrelated code:\n` +
      fails.map(f => `- ${f.file} — ${f.summary}`).join('\n'),
      {
        label: `repair:${bid}:r${round + 1}`, phase: 'Gate', schema: RECEIPT,
        agentType: resolveType(batchById[bid].agentType), model: 'sonnet',
      })))
}

return {
  stage: gate && gate.pass ? 'complete' : 'gate-exhausted',
  gate,
  completed: receipts,
}
