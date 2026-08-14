export const meta = {
  name: 'wf-design',
  description: 'Design-stage component authoring: one unified author pass that EXPANDS pre-authored per-surface skeletons (foundation files, components, catalog entries) behind one typecheck+lint gate. Sonnet workers behind a deterministic gate. Taste — the skeletons themselves, fork adjudication, the iteration loop, the visual review — stays in the Fable session, never here. (Comprehend is now a session-side deterministic extract script + warm skeleton-author; reconcile is an inline session dispatch. Neither is a stage here.)',
  whenToUse: 'Invoked by /spec:design for the one gate-verifiable phase (stage = author). The expensive model extracts, authors skeletons, adjudicates, and reviews in-session and never writes component code; this workflow holds no taste — workers transcribe skeletons to framework code.',
  phases: [
    { title: 'Author', detail: 'one gated run, coherence-group granular: foundation (one batch) first, then one warm worker per coherence group EXPANDING its surfaces’ skeletons into components AND their catalog entries, parallel across groups; the living showcase entry its own final batch' },
    { title: 'Gate', detail: 'host typecheck+lint; repair loop stops on no-progress (unchanged failure set) or hard ceiling' },
  ],
}

// Normalize `args` before any use. The harness convention has varied: some versions deliver the
// object verbatim, others JSON-encode it as a string on the scriptPath channel. We accept both,
// tolerate accidental double-encoding, and on failure throw a message that shows what actually
// arrived (length + preview) instead of a bare "Unable to parse JSON string" at the call site.
// @fragment:normalize-args

// @fragment:validate-groups

args = normalizeArgs(args)
const STAGE = args && args.stage
const STAGES = ['author']
if (!args || typeof args !== 'object' || !STAGES.includes(STAGE)) {
  throw new Error('wf-design: malformed args (expected the object documented below with ' +
    '`stage` ∈ {' + STAGES.join(', ') + '}, got stage=' + JSON.stringify(STAGE) + ') — ' +
    'pass the full args object to the Workflow call')
}

// args carries ONLY paths, ids, enums, booleans, and the host's gate command — no free text.
// Any human/spec prose (design doctrine, token rulings, per-surface intent) is Read from the spec,
// the skeletons.json plan, or the doctrine doc on disk by the agent that needs it. This workflow
// never touches DesignSync/MCP — the session extracted the mockup and authored the skeletons before
// this runs. args: {
//   stage: 'author',             // the only stage — comprehend is now a session-side deterministic
//                                //   extract script + warm skeleton-author; reconcile is an inline dispatch.
//   specPath: string,
//   designDoctrinePath: string,  // path to the design doctrine doc (config design.doctrine); '' if none
//   tokenPaths: [string],        // token/theme file paths — binding canon, extended never forked
//   componentManifestPath: string,  // path to design/components.json; '' if the host has none.
//                                //   Non-empty ⇒ workers read it as binding canon: a block the
//                                //   vocabulary names is bound/imported or authored to fulfil its
//                                //   entry, never re-invented as a lookalike; a `boundaries`
//                                //   contradiction is a fork, same standing as a token-value one.
//   skeletonPath: string,        // the on-disk skeletons.json the session's warm skeleton-author wrote: the
//                                //   binding plan implement-/stories-kind batches EXPAND from (never re-derive)
//   groups: [[{id, agentType, kind, files: [{path, action}]}]],  // author: array of WAVES; each wave is an
//                                //   array of BATCHES run in parallel; waves run in order. kind ∈
//                                //   {'foundation','implement','stories'} selects the worker intent. Wave 1 =
//                                //   foundation (one batch: types + schemas + mocks) [+ a shared-atom batch only
//                                //   if a real usedBy≥2 atom exists]; next wave = one 'implement' batch PER
//                                //   COHERENCE GROUP (each lists its components AND their catalog-entry files —
//                                //   one warm worker expands both), independent groups sharing the wave; final
//                                //   wave = the living showcase entry as its own 'stories' batch.
//   agentMap: {kind: agentName}, // host agentMap; key 'default' is the fallback; per-batch agentType wins
//   doctrinePaths: {agentName: string},  // path to each HOST .claude/agents/<name>.md — the workflow agent
//                                //   registry resolves only built-in/plugin agents, so host roles dispatch
//                                //   on general-purpose and the worker READS this file for its doctrine.
//   gate: {
//     command: string,   // resolved deterministic gate: host typecheck + lint, run once over the whole pass
//   },
//   pipelineRulesPath: string,  // host pipeline rules file; workers read its '## Worker Rules'. '' if none.
//   runId: string,              // this Workflow invocation's own run id (the orchestrator
//                                //   mints/persists it for resume and passes it back in);
//                                //   echoed verbatim into every return below (spec 06 D9).
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
const componentManifestPath = args.componentManifestPath || ''

const HARD_RULES = [
  `## Hard rules
- NEVER run any git command (checkout/stash/restore/reset/clean/add/commit/push). The designer session owns git.
- Read each referenced source file before editing. Edit files directly — do not return edit instructions.
- Touch NOTHING outside your assigned files.
- Do NOT query MCP servers — work from the spec's / digest's embedded references; if one is wrong against
  the installed version, return blocked {kind: "stale-assumption"}.
- No defensive code, fallbacks, or features beyond what the plan requires.
- You may run scoped read-only checks to self-verify (lint/typecheck on your own files only).`,
  `## Design canon (binding)
- **Stateless discipline:** the surfaces you touch use props + mock data ONLY — no data-layer
  imports, no state-management/store imports, no router/navigation access. Wiring is /spec:build's job.
- Tokens and the design doctrine are **binding canon**. Extending the token scale (new role) is normal;
  contradicting a token VALUE, or a doctrine ruling, is a **fork**, not a tweak.${DOCTRINE_DOC ? ` Read ${DOCTRINE_DOC} for the doctrine.` : ''}${TOKEN_PATHS.length ? ` Token files: ${TOKEN_PATHS.join(', ')}.` : ''}${componentManifestPath ? ` The component vocabulary at ${componentManifestPath} is also binding canon: a block it names is bound/imported or authored to fulfil that entry — never re-invented as a lookalike; a \`boundaries\` contradiction is a fork, same standing as a token-value contradiction.` : ''}
- **Mock supremacy on mock-bound surfaces:** when a skeleton carries \`regionRef\` (or legacy
  \`sliceRef\`), the bound region's slice is the design authority for copy, structure, order, and layout. A taste-grade doctrine habit (dialog
  conventions, button-order house style, copy tone) YIELDS to the mock — never silently normalize
  the mock to repo conventions. Only an externally-anchored (grounded) rule — a11y/contrast,
  legal/brand, destructive-action safety — binds, and it binds the VALUE, not the intent; if it
  genuinely conflicts with the mock, return blocked, never pick a side yourself.
- A fork, or a plan assumption wrong against the actual code: STOP editing and return
  blocked {kind, detail, options, recommendation}. Never guess, never silently overwrite a token,
  never override the doctrine — the designer resolves forks with the user, not you.`,
  RULES_PATH ? `## Host rules\nRead ${RULES_PATH} and follow its "## Worker Rules" section verbatim — host-specific hard rules (e.g. read-only/managed surfaces). Ignore the file's other sections; they are for the orchestrator, not you.` : '',
].filter(Boolean).join('\n\n')

// @fragment:dispatch

function fileList(b) {
  return b.files.map(f => `- ${f.action} ${f.path}`).join('\n')
}

// ---- Stage: author (foundation + components + catalog — one gated run, coherence-group granular) ----
// `groups` is an array of WAVES; each wave is an array of BATCHES run in parallel; waves run in order.
// The unit of authoring is the COHERENCE GROUP = one batch = one warm worker: an 'implement' batch
// lists every component in a group AND its catalog entries, and one Sonnet worker EXPANDS all of their
// skeletons in one warm context (canon read once). Independent coherence groups share a single wave. Foundation
// is one batch in wave 1 (so a later repair journal-caches it on resume); the living showcase entry is
// its own 'stories' batch in the final wave (a cross-spec file — its own batch avoids a write-race).
// The gate (host typecheck + lint) runs ONCE over the whole pass, and a single repair loop (stops on
// no-progress or a hard ceiling) routes each failure to its owning batch regardless of kind — at most one cold re-dispatch per
// coherence group, not per component. Each batch carries a `kind` ∈ {'foundation','implement','stories'}.
// `author` is the only stage, and it always iterates groups: a missing/malformed array is a producer
// bug, not a silent no-op, so validate the nested shape at the trust boundary before any loop reads it.
const groups = validateGroups(args.groups, 'wf-design')
// Trust-boundary assert (2026-08-13 spec 05 D8): a named function (not a bare top-level
// statement) so tests/workflows/twin-parity.test.js can execute it standalone via evalFns. An
// unvalidated batch `kind` today silently routes a batch to the wrong worker prompt instead of
// failing loud at the trust boundary.
function assertBatchKinds(batches) {
  const KINDS = ['foundation', 'implement', 'stories']
  for (const b of batches) {
    if (!KINDS.includes(b.kind)) {
      throw new Error('wf-design: batch "' + b.id + '" has kind ' + JSON.stringify(b.kind) +
        ' outside the closed set {' + KINDS.join(', ') + '}')
    }
  }
  return batches
}
assertBatchKinds(groups.flat())
// The on-disk plan every implement-/stories-kind worker EXPANDS from: skeletons.json, written by the
// session's warm skeleton-author (mockup or no-mockup path alike). Falls back to the spec only if a
// caller somehow omitted it (the worker still reads the spec for Decisions/UI regardless).
const PLAN_PATH = args.skeletonPath || args.specPath

const fileToBatch = {}
const batchById = {}
for (const group of groups) {
  for (const b of group) {
    batchById[b.id] = b
    for (const f of b.files) fileToBatch[f.path] = b.id
  }
}

// The progress tree groups batches by their kind's display phase, even though the high-level run is
// one Author pass — a group's phase is its dominant kind so the tree stays readable.
const KIND_PHASE = { foundation: 'Foundation', implement: 'Implement', stories: 'Stories' }
function groupPhase(group) {
  const counts = {}
  for (const b of group) counts[b.kind] = (counts[b.kind] || 0) + 1
  const dom = Object.keys(counts).sort((a, c) => counts[c] - counts[a])[0]
  return KIND_PHASE[dom] || 'Implement'
}

function workerPrompt(b) {
  const intent = b.kind === 'foundation'
    ? `You are building one batch of **foundation** files (types / schemas / mock data) for a hardened spec's design stage. Read the skeletons plan at ${PLAN_PATH}: each skeleton's \`mockRef\` names the fixture per state and \`states\` lists the states. Author mock data covering **every state the skeletons list** — empty, loading, error, and edge content (long strings, extreme values in the host's domain types). Never invent token VALUES; foundation authors types/schemas/fixtures, not styling.`
    : b.kind === 'implement'
    ? `You author one whole **coherence group** in one warm pass by **EXPANDING pre-authored skeletons** — you transcribe design decisions to framework code, you never re-derive taste. The plan is the skeletons.json at ${PLAN_PATH}: read its \`skeletons[]\` entries whose \`componentPath\` / \`catalogEntryPath\` appear in your batch \`files\` below. Each entry is the **binding design authority** for one surface.\n\n` +
      `For each entry, branch on \`decision\`:\n` +
      `- **\`decision: "bind"\`** — the surface maps to an EXISTING component. Do NOT author a new component file. Write ONLY its catalog entry: import \`bind.component\` from \`bind.from\` and render it with \`bind.propBindings\` across the listed states. (map-don't-generate: a surface an existing component already serves is reused, never regenerated.)\n` +
      `- **\`decision: "author"\`, \`regionRef\` (or legacy \`sliceRef\`) PRESENT (mock-bound)** — the bound REGION's slice file is the **binding design authority** for structure, element order, copy, and layout. TRANSCRIBE it: build the element hierarchy from the slice's markup, preserve sibling/child ORDER exactly (button order is a contract, not a suggestion), copy EVERY user-visible string VERBATIM (labels, buttons, placeholders, aria-labels, empty-state prose — never paraphrase, shorten, or "improve" copy; "Send invite" never becomes "Send"), and reproduce the layout primitives the slice declares (grid-template-columns / flex-direction / order). **Copy routes through the host's i18n catalog when one is declared** (\`design.copyCatalogs\` in .claude/spec.config.json): add/reuse a message key whose catalog VALUE is the mock copy VERBATIM and call it from the component — the fidelity gate accepts catalog values, and host i18n lint forbids literals in components; with no catalog declared, copy lands verbatim in the component. Styling VALUES never come from the slice: resolve each literal through the skeleton's \`tokenMap\` to a repo token ROLE; a styling value with no \`tokenMap\` entry is a gap → return \`blocked\`, never guess and never bake the literal. The slice's template semantics are contract, not decoration: \`{{ expr }}\` mustaches render from PROPS (never as literal text), \`<sc-for>\` rows are SAMPLE DATA rendered from list props (\`Remove \${member.name}\`, never a hardcoded "Remove Jamie Chen") with the mock's sample values carried VERBATIM into the catalog-entry fixtures — that keeps the rendered catalog comparable to the mock. A deterministic fidelity gate diffs your output against the bound region's strings/order/layout after this pass (it understands interpolation templates and catalogs; it does NOT accept shortened or paraphrased static copy) — divergence fails the run.\n` +
      `- **\`decision: "author"\`, NO region/slice ref (no-mock)** — the skeleton IS the design: build the \`tree\` structure node-for-node, and on each node emit its \`style\` map as token ROLES on that exact element (fill / border / radius / elevation / padding / gap / color / font are roles — emit each as its token, never a literal). A node or property the skeleton left without a role is a gap → return \`blocked\`, never guess.\n\n` +
      `**Common to both author shapes:** declare \`props\`; cover every \`states\` entry using \`mockRef\` (the foundation wrote those fixtures — import them, never invent values); import everything in \`imports\` (bound atoms + base primitives). \`tokens\` is your COMPLETE allowed token set — every role you emit must be in it, and you add none. props + mock data only.\n\n` +
      `**Shared atoms first.** A skeleton tagged \`shared\` (\`usedBy\` ≥2) is an atom authored once, in an earlier coherence group; if a surface you build consumes one, IMPORT it (it is in your \`imports\`) — never reimplement or fork it.\n\n` +
      `**Base primitives are import-only — never re-author one.** A skeleton tagged \`containment: true\` is an overlay SHELL (Sheet / Dialog / Popover / Drawer): a BASE PRIMITIVE that lives ONCE in the doctrine-named base dir behind its barrel${DOCTRINE_DOC ? ` (Read ${DOCTRINE_DOC} for that path)` : ' (named in the design doctrine doc)'}. IMPORT it from the barrel (it is in your \`imports\`); never hand-roll an overlay shell. ABSENT from the barrel → a foundation gap you do NOT fill here: return \`blocked {kind: "stale-assumption", detail: "missing base primitive <name>"}\`. Its behavioral/a11y contract (focus-trap, dismiss, portal) is the foundation's, never copied out of static markup.\n\n` +
      `**Then write this group's catalog entries in the SAME pass.** Your batch \`files\` include the catalog-entry (story) paths. Write each in the host's story format (Read an existing entry first), rendering every state the skeleton lists. COMPOSE the components you just authored — import them, do not reimplement them. Expanding a component and its entry together (you hold the real props in context) is the point of the coherence-group batch.`
    : `You are writing the **living showcase entry** — the single cross-spec catalog file (path in the batch files below) that sits the new surfaces next to existing ones; it is the cross-spec drift detector. The components and their per-group entries already exist on disk (the implement-kind workers wrote them this pass) — Read the components for their real props and COMPOSE them; do not reimplement them. Render the new surfaces in the host's story format (Read the existing showcase entry first for its format), covering the states the skeletons list.`
  return [
    intent,
    doctrineBlock(b.agentType),
    `First, Read the spec at ${args.specPath}. You do not need the whole document — read these sections in full and you may skip the narrative prose (Rationale, Goals, Background): the "Decisions" table is authoritative — apply it verbatim; the "UI" section is the component inventory + the states to cover; the "Assumptions" section lists known fallbacks for surprises. If anything you read points into a section not listed here, read that section too — never act on a reference you have not read.`,
    (b.kind === 'implement' || b.kind === 'stories') && PLAN_PATH !== args.specPath ? `Also read YOUR entries from the skeletons plan at ${PLAN_PATH} — the binding per-surface plan (decision, props, states, mockRef, and EITHER a regionRef/sliceRef + tokenMap [mock-bound: the bound region's slice file is the design authority] OR a tree with per-node style [no-mock]). The file covers every surface in the spec; you only need the entries whose componentPath/catalogEntryPath appear in your batch files, so on a large plan extract just those (e.g. \`jq '[.skeletons[] | select(...)]'\`) instead of reading the whole document — plus the top-level tokenForks. You EXPAND it; never re-derive what it already decided. The spec UI section and the skeletons agree (the skeletons seeded the spec at reconcile).` : '',
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

for (const group of groups) {
  const gp = groupPhase(group)
  phase(gp)
  log(`${gp}: ${group.map(b => b.id).join(', ')}`)
  // Expansion is transcription of a decided plan, not fresh design work — low effort is the
  // point of the skeleton contract (the taste already happened in the session).
  const out = await parallel(group.map(b => () =>
    dispatch(workerPrompt(b), {
      label: `${STAGE}:${b.id}`, phase: gp, schema: RECEIPT,
      agentType: resolveType(b.agentType), model: 'sonnet', effort: 'low',
    })))
  const { blocked, missing } = collectBlocked(group, out)
  if (blocked.length || missing.length) {
    return { stage: 'blocked', blocked, missing, completed: receipts, runId: args.runId, tokens: budget.spent() }
  }
}

// ---- Deterministic gate + repair loop (shared fragments/gate-loop.js.frag) ----
phase('Gate')
const gateCmd = args.gate && args.gate.command
// 2026-08-13 spec 05 D1/D2: spec-design-driver.js resolves config.gateCommand leg-by-leg and
// emits the literal sentinel __UNGATED__ when every leg drops for an unresolved {placeholder}
// (or when the host declares no gateCommand at all) — the raw unresolved command must never
// reach this workflow, so a gate that is missing or is the sentinel both mean the same thing:
// zero deterministic verification ran.
const UNGATED_GATE = '__UNGATED__'

// @fragment:gate-loop

// author's gate is typecheck+lint — it proves STRUCTURE, never that the result looks right. A green
// author means foundation + structure were authored by expanding the skeletons (token-closed, every
// state covered); the caller (/spec:design) clears it with the screenshot visual review when one is
// configured, otherwise straight through the human Storybook loop (Phase 3). The note attaches
// whenever the run authored any component (an implement-kind batch is present).
const hasImplement = Object.values(batchById).some(b => b.kind === 'implement')
const implementNote = hasImplement
  ? { note: 'structural (skeleton-expanded) — NOT visually approved; the screenshot visual review (if configured) or the human Storybook loop (Phase 3) is the gate that clears it' }
  : {}

if (!gateCmd || gateCmd === UNGATED_GATE) {
  // D2: no deterministic verification ran (either the host declares no gate for this stage, or
  // every gateCommand leg dropped for an unresolved placeholder) — 'complete-ungated' is a
  // DISTINCT stage from 'complete' so every consumer sees the degradation loudly instead of a
  // false-green mark; the driver routes this straight to /spec:review, never --mark author-green.
  return {
    stage: 'complete-ungated', completed: receipts, ...implementNote,
    note: implementNote.note ||
      (gateCmd === UNGATED_GATE
        ? 'gate resolved to __UNGATED__ — every gateCommand leg dropped for an unresolved placeholder; verification is absent'
        : 'no gate command configured — verification is absent'),
    runId: args.runId,
    tokens: budget.spent(),
  }
}

// 2026-08-13 spec 06 D6: repair-agent deaths inside the gate loop were silently absorbed (a
// null repair result is "not fatal" — the next round re-measures — but it was also never
// counted anywhere). Accumulated here (the repairFn closure lives in THIS file even though
// runGateLoop itself is the shared fragment) and folded into the exhaustion return's
// `agentsFailed` below, alongside the one gate-agent death `exhaustedBy: 'agent-died'` already
// signals — every reduced-assurance path gets a data carrier (audit E9).
let agentsFailed = 0
const loopResult = await runGateLoop({
  gateCmd,
  phase: 'Gate',
  contextLabel: '',
  repairFn: async (repairEntries, round, historySnapshot) => {
    // Repair rounds run at default effort (unlike first-pass expansion): the cheap transcription
    // already failed once here, so the retry gets full reasoning headroom.
    const repairOut = await parallel(repairEntries.map(([bid, fails]) => () => {
      // Prior-round failures are shown so a late-round worker can detect oscillation (its "fix" is
      // a re-proposal of an approach an earlier round already tried and the gate already rejected).
      // Files on disk carry the prior fixes' STATE, but only this block carries their OUTCOME.
      const prior = (historySnapshot[bid] || []).map(h =>
        `Round ${h.round}:\n${h.fails.map(f => `- ${f.file} — ${f.summary}`).join('\n')}`).join('\n')
      return dispatch(
        workerPrompt(batchById[bid]) +
        (prior
          ? `\n\n## Already attempted (earlier repair rounds)\nThese failures were repaired in earlier rounds and the gate re-ran afterward:\n${prior}\nIf a failure below matches one of these, the earlier approach was wrong or caused a regression elsewhere — do NOT repeat it; take a different approach. If your fix would undo an earlier round's fix, reconcile both instead of trading one failure for the other.`
          : '') +
        `\n\n## Repair (round ${round + 1})\nYour batch's previous output produced these gate failures. ` +
        `Fix them without changing unrelated code:\n` +
        fails.map(f => `- ${f.file} — ${f.summary}`).join('\n'),
        {
          label: `repair:${bid}:r${round + 1}`, phase: 'Gate', schema: RECEIPT,
          agentType: resolveType(batchById[bid].agentType), model: 'sonnet',
        })
    }))
    // A repair worker can hit a design fork / stale assumption exactly like an author worker —
    // HARD_RULES instructs it to return blocked; honor that instead of discarding the receipt and
    // exiting as an opaque gate-exhausted. (Null repair results are not fatal: the next gate round
    // re-measures what actually landed.)
    const result = collectBlocked(repairEntries.map(([bid]) => batchById[bid]), repairOut)
    agentsFailed += result.missing.length
    return result
  },
})

if (loopResult.blocked && loopResult.blocked.length) {
  return { stage: 'blocked', blocked: loopResult.blocked, missing: loopResult.missing, gate: loopResult.gate, completed: receipts, runId: args.runId, tokens: budget.spent() }
}
if (loopResult.outOfScope && loopResult.outOfScope.length) {
  return { stage: 'out-of-scope-failure', failures: loopResult.outOfScope, gate: loopResult.gate, completed: receipts, runId: args.runId, tokens: budget.spent() }
}

return {
  stage: loopResult.pass ? 'complete' : 'gate-exhausted',
  gate: loopResult.gate,
  exhaustedBy: loopResult.exhaustedBy,
  agentsFailed: agentsFailed + (loopResult.exhaustedBy === 'agent-died' ? 1 : 0),
  deviations: loopResult.deviations,
  completed: receipts,
  ...implementNote,
  runId: args.runId,
  tokens: budget.spent(),
}
