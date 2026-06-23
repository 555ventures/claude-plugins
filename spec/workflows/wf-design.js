export const meta = {
  name: 'wf-design',
  description: 'Design-stage plumbing: foundation files, catalog entries, or spec reconcile — Sonnet workers behind a deterministic gate + repair loop. Taste authoring and the user iteration loop stay in the Fable session, never here.',
  whenToUse: 'Invoked by /spec:design for the mechanical, gate-verifiable phases only (stage = foundation | stories | reconcile). The designer authors components and runs the interactive iteration loop inline; this workflow never holds taste.',
  phases: [
    { title: 'Foundation', detail: 'types → schemas ∥ mocks, parallel within a layer group' },
    { title: 'Stories', detail: 'catalog entries per state in the host story format' },
    { title: 'Reconcile', detail: 'one worker updates the spec to approved reality' },
    { title: 'Gate', detail: 'host gate (typecheck / +lint) or spec re-read; repair loop (cap 2)' },
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
      throw new Error('wf-design: args arrived String()-coerced to "[object Object]" — the ' +
        'caller stringified the object with String()/template interpolation instead of passing a ' +
        'real JSON object (or JSON.stringify). Pass `args` as a plain object in the Workflow call.')
    }
    try {
      v = JSON.parse(s)
    } catch (e) {
      throw new Error('wf-design: args was a string but not valid JSON (' + s.length +
        ' chars). This is structural corruption — free text / a non-scalar reached `args`, which ' +
        'must carry only paths, ids, enums, booleans, and the gate command; prose belongs in the ' +
        'spec the agents Read. First 160 chars: ' + JSON.stringify(s.slice(0, 160)) +
        ' — parse error: ' + e.message)
    }
  }
  return v
}
args = normalizeArgs(args)
const STAGE = args && args.stage
if (!args || typeof args !== 'object' || !['foundation', 'stories', 'reconcile'].includes(STAGE)) {
  throw new Error('wf-design: malformed args (expected the object documented below with ' +
    '`stage` ∈ {foundation, stories, reconcile}, got stage=' + JSON.stringify(STAGE) + ') — ' +
    'pass the full args object to the Workflow call')
}

// args carries ONLY paths, ids, enums, booleans, and the host's gate command — no free text.
// Any human/spec prose (design doctrine, token rulings, per-surface intent) is Read from the spec
// or the doctrine doc on disk by the agent that needs it. Free text in args corrupts the JSON
// (quotes/backslashes) against the harness's version-inconsistent string-vs-object encoding — see
// the normalizer above. args: {
//   stage: 'foundation' | 'stories' | 'reconcile',  // which mechanical chunk this run covers
//   specPath: string,
//   designDoctrinePath: string,  // path to the design doctrine doc (config design.doctrine); '' if none
//   tokenPaths: [string],        // token/theme file paths — binding canon the workers extend, never fork
//   groups: [[{id, agentType, files: [{path, action}]}]],  // ordered; parallel within. foundation/stories.
//   landedFiles: [string],       // reconcile only: component/entry paths that landed in this design run —
//                                //   the approved reality the spec is reconciled to (read off disk, not args)
//   agentMap: {kind: agentName},      // host .claude/spec.config.json agentMap; key 'default' is the
//                                     // fallback agent type — per-batch agentType always wins
//   doctrinePaths: {agentName: string},  // path to each HOST .claude/agents/<name>.md named in agentMap —
//                                     // the workflow agent registry resolves only built-in and plugin
//                                     // agents, so host roles dispatch on general-purpose and the worker
//                                     // READS this file for its doctrine. args is a control channel, not a
//                                     // data bus: bodies travel as paths, the agents do the file I/O.
//   gate: {
//     command: string,   // fully resolved deterministic gate (foundation: host typecheck; stories:
//                        //   typecheck + lint; reconcile: '' — the gate there is a structural re-read)
//   },
//   pipelineRulesPath: string,  // path to the host pipeline rules file; workers read its
//                               // '## Worker Rules' section. '' if none.
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
const DOCTRINE_DOC = args.designDoctrinePath || ''
const TOKEN_PATHS = args.tokenPaths || []

const HARD_RULES = [
  `## Hard rules
- NEVER run any git command (checkout/stash/restore/reset/clean/add/commit/push). The designer session owns git.
- Read each referenced source file before editing. Edit files directly — do not return edit instructions.
- Touch NOTHING outside your assigned files.
- Do NOT query MCP servers — work from the spec's embedded references; if one is wrong against the
  installed version, return blocked {kind: "stale-assumption"}.
- No defensive code, fallbacks, or features beyond what the spec / design requires.
- You may run scoped read-only checks to self-verify (lint/typecheck on your own files only).`,
  `## Design canon (binding)
- **Stateless discipline:** the surfaces you touch use props + mock data ONLY — no data-layer
  imports, no state-management/store imports, no router/navigation access. Wiring is /spec:build's job.
- Tokens and the design doctrine are **binding canon**. Extending the token scale (new role) is normal;
  contradicting a token VALUE, or a doctrine ruling, is a **fork**, not a tweak.${DOCTRINE_DOC ? ` Read ${DOCTRINE_DOC} for the doctrine.` : ''}${TOKEN_PATHS.length ? ` Token files: ${TOKEN_PATHS.join(', ')}.` : ''}
- A fork, or a spec assumption wrong against the actual code: STOP editing and return
  blocked {kind, detail, options, recommendation}. Never guess, never silently overwrite a token,
  never override the doctrine — the designer resolves forks with the user, not you.`,
  RULES_PATH ? `## Host rules\nRead ${RULES_PATH} and follow its "## Worker Rules" section verbatim — host-specific hard rules (e.g. read-only/managed surfaces). Ignore the file's other sections; they are for the orchestrator, not you.` : '',
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

// ---- Stage: reconcile (single worker, gate = structural re-read) ----
// Foundation/stories share the batched-workers + host-gate path below; reconcile is its own shape:
// one worker rewrites the spec to match approved reality, then a verifier re-reads it against the
// landed files. No host command runs — the "gate" is whether the spec and disk agree.
if (STAGE === 'reconcile') {
  phase('Reconcile')
  const landed = (args.landedFiles || []).map(p => `- ${p}`).join('\n') || '(none reported)'
  const reconcilePrompt = [
    `You reconcile a hardened spec to the design that the user just approved in the component catalog.`,
    `First, Read the spec at ${args.specPath}, then Read the approved component/entry files now on disk:\n${landed}`,
    `Update the spec to match approved REALITY — never the other way round:`,
    `- **UI** section: final component APIs (props/types) and the states each renders.`,
    `- **File Plan**: the actual component/entry files that landed (CREATE rows that landed here stay listed — build sees them on disk and skips).`,
    `- **Contracts**: any shape changes the approved design forced.`,
    `- **Decisions**: add a row for each ruling the designer made during iteration (these are in the spec already if recorded inline; otherwise capture them from the divergence between the old spec and the landed files).`,
    `Change ONLY these sections of the spec file. Do not touch frontmatter (the designer sets \`designed:\`), Goal, Rationale, or Acceptance Criteria.`,
    HARD_RULES,
  ].filter(Boolean).join('\n\n')

  let receipt = null
  for (let round = 0; round <= 2; round++) {
    receipt = await dispatch(
      reconcilePrompt + (round === 0 ? '' :
        `\n\n## Repair (round ${round})\nThe previous reconcile left the spec inconsistent with disk — fix the items the verifier flagged below.`),
      { label: `reconcile:r${round}`, phase: 'Reconcile', schema: RECEIPT,
        agentType: resolveType(args.agentMap && args.agentMap.reconcile), model: 'sonnet' })
    if (!receipt) return { stage: 'reconcile-failed', summary: 'reconcile worker returned nothing' }
    if (receipt.blocked) return { stage: 'blocked', blocked: [{ batch: 'reconcile', ...receipt.blocked }], completed: [] }

    phase('Gate')
    const verify = await agent(
      `Verify the reconcile is faithful. Read the spec at ${args.specPath} and the landed files:\n${landed}\n\n` +
      `Confirm the spec's UI section, File Plan, and Contracts now describe what is actually on disk — ` +
      `every landed component/entry appears in the File Plan, and the component APIs in the UI section ` +
      `match the real props/states. Report pass=false with one failure per divergence (file = the spec ` +
      `path, summary = what disagrees). Do not edit any file.`,
      { label: `reconcile-verify:r${round}`, phase: 'Gate', schema: GATE, model: 'sonnet' })
    if (!verify || verify.pass) {
      return { stage: 'complete', completed: [{ batch: 'reconcile', files: receipt.files }] }
    }
    if (round === 2) return { stage: 'reconcile-unverified', failures: verify.failures, completed: [{ batch: 'reconcile', files: receipt.files }] }
    log(`Reconcile round ${round} inconsistent with disk — repairing`)
    reconcilePrompt += '\n\n## Verifier findings\n' + verify.failures.map(f => `- ${f.summary}`).join('\n')
  }
}

// ---- Stages: foundation & stories (batched workers + host gate + repair loop) ----
const STAGE_PHASE = STAGE === 'foundation' ? 'Foundation' : 'Stories'
const groups = args.groups || []

const fileToBatch = {}
const batchById = {}
for (const group of groups) {
  for (const b of group) {
    batchById[b.id] = b
    for (const f of b.files) fileToBatch[f.path] = b.id
  }
}

function workerPrompt(b) {
  const intent = STAGE === 'foundation'
    ? `You are building one batch of **foundation** files (types / schemas / mock data) for a hardened spec's design stage. Mock data must cover **every UI state the spec lists** — empty, loading, error, and edge content (long strings, extreme values in the host's domain types).`
    : `You are writing **catalog entries** for components the designer already authored. Render every state the spec lists (empty / loading / error / edge) in the host's story format. The component files exist on disk — Read them for their real props; entries import and compose them, they do not reimplement them.`
  return [
    intent,
    doctrineBlock(b.agentType),
    `First, Read the spec at ${args.specPath}. The "Decisions" table is authoritative — apply it verbatim. The "UI" section is the component inventory + the states to cover. The "Assumptions" section lists known fallbacks for surprises.`,
    `## Files in this batch\n${fileList(b)}`,
    HARD_RULES,
  ].filter(Boolean).join('\n\n')
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

phase(STAGE_PHASE)
for (const group of groups) {
  log(`${STAGE_PHASE}: ${group.map(b => b.id).join(', ')}`)
  const out = await parallel(group.map(b => () =>
    dispatch(workerPrompt(b), {
      label: `${STAGE}:${b.id}`, phase: STAGE_PHASE, schema: RECEIPT,
      agentType: resolveType(b.agentType), model: 'sonnet',
    })))
  const { blocked, missing } = collectBlocked(group, out)
  if (blocked.length || missing.length) {
    return { stage: 'blocked', blocked, missing, completed: receipts }
  }
}

// ---- Deterministic gate + repair loop (cap 2) ----
phase('Gate')
const gateCmd = args.gate && args.gate.command

// The gate agent reads paths out of gate-command output — which routinely prints absolute or
// ./-prefixed paths. Match tolerantly so an in-scope failure isn't misclassified out-of-scope.
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

if (!gateCmd) {
  // No gate command configured for this stage — nothing deterministic to run; return what landed.
  return { stage: 'complete', completed: receipts, note: 'no gate command — designer self-gates' }
}

let gate = null
for (let round = 0; round <= 2; round++) {
  gate = await agent(
    `Run these checks and report results. Do not edit any file.\n\n${gateCmd}\n\n` +
    `For each failure, identify the single file that most likely needs the fix and summarize the ` +
    `failure in one line including the check name. pass=true only if every check is green.`,
    { label: `gate:round-${round}`, phase: 'Gate', schema: GATE, model: 'sonnet' })
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
      workerPrompt(batchById[bid]) +
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
