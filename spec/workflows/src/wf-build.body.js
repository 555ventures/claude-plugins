export const meta = {
  name: 'wf-build',
  description: 'Implement a hardened spec: test authors, layered batches, deterministic gate + repair loop',
  whenToUse: 'Invoked by /spec:build with batches parsed from the spec File Plan',
  phases: [
    { title: 'TestAuthors', detail: 'failing tests derived from spec only' },
    { title: 'RedCheck', detail: 'confirm new tests fail before implementation' },
    { title: 'Implement', detail: 'layered batches, parallel within a layer group' },
    { title: 'Gate', detail: 'host gate command, repair loop: stop on no-progress (unchanged failure set) or hard ceiling' },
  ],
}

// Normalize `args` before any use. The harness convention has varied: some versions deliver the
// object verbatim, others JSON-encode it as a string on the scriptPath channel. We accept both,
// tolerate accidental double-encoding, and on failure throw a message that shows what actually
// arrived (length + preview) instead of a bare "Unable to parse JSON string" at the call site.
// @fragment:normalize-args

// @fragment:validate-groups

args = normalizeArgs(args)
if (!args || typeof args !== 'object' || !Array.isArray(args.groups)) {
  throw new Error('wf-build: malformed args (expected the object documented below with a ' +
    '`groups` array, got ' + (args === undefined ? 'undefined' : typeof args) +
    ') — pass the full args object to the Workflow call')
}
// Validate nested structure at the trust boundary, once, before any loop reads it.
args.groups = validateGroups(args.groups, 'wf-build')
;(args.testBatches || []).forEach((b, i) => {
  if (!isBatch(b)) {
    throw new Error('wf-build: testBatches[' + i + '] is not a batch (need an object with a ' +
      'string `id` and an array `files`) — same [{id,files}] shape as a groups batch')
  }
})

// Trust-boundary asserts (2026-08-13 spec 05 D8): named functions (not bare top-level statements)
// so tests/workflows/twin-parity.test.js can execute them standalone via evalFns. An unguarded
// `args.gate.testCommand` deref crashes cryptically the first time the red-check phase reaches it;
// free text in `resolutions` is the last open door in the 2026 args-corruption class (quotes/
// backslashes corrupting the JSON channel the same way the top-of-file normalizeArgs guard exists
// for) — both fail loud here, once, instead of wherever they happen to be first dereferenced.
function assertGateArgs(gate) {
  if (!gate || typeof gate.testCommand !== 'string') {
    throw new Error('wf-build: args.gate.testCommand must be a string (got ' +
      (gate ? typeof gate.testCommand : 'no gate object') + ') — malformed args.gate')
  }
  return gate
}
function assertResolutions(resolutions) {
  const TOKEN_RE = /^[A-Za-z0-9._\/:@=-]+$/
  for (const key of Object.keys(resolutions || {})) {
    const value = resolutions[key]
    if (typeof value !== 'string' || !TOKEN_RE.test(value)) {
      throw new Error('wf-build: resolutions["' + key + '"] is not a valid args token (must match ' +
        TOKEN_RE + ') — resolutions carries an opaque cache-bust token only, never the ruling prose')
    }
  }
  return resolutions
}
// RedCheck cross-check, hoisted to a named top-level function for the same reason as the guards
// above: tests/redcheck-sentinel-dual-leg.test.js executes it standalone via evalFns.
//
// Combines BOTH legs into one observation, because the `expect` it is compared against is itself
// dual-leg. A runtime-only observation is incommensurable with a dual-leg expectation and
// deadlocks compile-time-only carriers — see the RED schema note.
//
// Returns an array of mismatches (empty = every file matched). Every uncertain path fails CLOSED
// as 'not-collected'/UNVERIFIED rather than silently resolving to green.
function crossCheckSentinels(expectations, sentinels, hasTypecheckLeg) {
  const byPath = {}
  for (const s of sentinels || []) byPath[s.path] = s
  const unverified = (path, expect, detail) => ({
    path, expected: expect, observed: 'not-collected', leg: 'none',
    detail: detail + ' — UNVERIFIED red state',
  })
  const mismatches = []
  for (const f of expectations) {
    const s = byPath[f.path]
    if (!s) {
      mismatches.push(unverified(f.path, f.expect, 'no sentinel reported for ' + f.path))
      continue
    }
    const runtimeRed = s.sentinel === 'AUDIT_RED:' + f.path
    const runtimeGreen = s.sentinel === 'AUDIT_GREEN:' + f.path
    if (!runtimeRed && !runtimeGreen) {
      mismatches.push(unverified(f.path, f.expect,
        'malformed runtime sentinel for ' + f.path + ': expected "AUDIT_RED:' + f.path +
        '" or "AUDIT_GREEN:' + f.path + '", observed "' + s.sentinel + '"'))
      continue
    }
    // A typecheck attribution is a reading, not an exit code, so it is honoured only when it
    // carries the verbatim diagnostic naming the file — and it is impossible at all on a host
    // with no typecheck leg. Both fail closed rather than silently downgrading to green.
    if (s.typecheckRed && !hasTypecheckLeg) {
      mismatches.push(unverified(f.path, f.expect,
        'typecheckRed asserted for ' + f.path + ' but this host declares no typecheck leg'))
      continue
    }
    if (s.typecheckRed && !String(s.typecheckEvidence || '').includes(f.path)) {
      mismatches.push(unverified(f.path, f.expect,
        'typecheckRed asserted for ' + f.path + ' without a verbatim diagnostic naming it'))
      continue
    }
    const typecheckRed = hasTypecheckLeg && s.typecheckRed === true
    const observedRed = runtimeRed || typecheckRed
    if (observedRed !== (f.expect === 'red')) {
      const leg = runtimeRed === typecheckRed ? 'none' : (runtimeRed ? 'runtime' : 'typecheck')
      mismatches.push({
        path: f.path, expected: f.expect, observed: observedRed ? 'red' : 'green', leg,
        detail: 'expected ' + f.expect + ', observed ' + (observedRed ? 'red' : 'green') +
          ' (runtime: ' + (runtimeRed ? 'red' : 'green') + ' via "' + s.sentinel + '"; typecheck: ' +
          (typecheckRed ? 'red — ' + s.typecheckEvidence : hasTypecheckLeg ? 'clean' : 'no leg') + ')',
      })
    }
  }
  return mismatches
}

assertGateArgs(args.gate)
assertResolutions(args.resolutions)

// args carries ONLY paths, ids, enums, booleans, and the host's gate command — no free text.
// Any human/spec prose (per-file intent, batch notes, orchestrator rulings) is Read from the
// spec on disk by the agent that needs it. Free text in args corrupts the JSON (quotes/
// backslashes) against the harness's version-inconsistent string-vs-object encoding — see the
// normalizer above. args: {
//   specPath: string,
//   tdd: boolean,
//   testBatches: [{id, agentType, files: [{path, action, expect}], acIds: [string]}],
//                                     // expect: 'red' | 'green' — the orchestrator classifies
//                                     // each test file from the spec's AC vocabulary (see
//                                     // build.md Phase 0); absent = 'red' (pre-6.29.0 callers)
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
//     typecheckCommand: string,  // host typecheck leg for the red check ('' if the host has
//                           // none) — red = fails EITHER leg; a test red only under
//                           // typecheck is genuinely red (HEARWELL-20260721-01)
//   },
//   pipelineRulesPath: string,  // path to the host pipeline rules file; workers read its
//                               // '## Worker Rules' / '## Test Rules' sections. '' if none.
//   deviationsPath: string,     // sidecar file workers APPEND forced-but-unblocking departures
//                               // to (one line each); /spec:review folds it at close. '' = off.
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
        options: {
          type: 'array',
          items: {
            type: 'object', additionalProperties: false,
            required: ['option', 'consequence'],
            properties: {
              option: { type: 'string' },
              consequence: { type: 'string', description: 'one plain-English line: what happens / what it costs if the user picks this' },
            },
          },
        },
        recommendation: {
          type: 'string',
          description: 'the option to present first, labeled (Recommended) — include whenever any option is defensible; omission means the orchestrator must derive or consult before asking',
        },
      },
      required: ['kind', 'detail'],
    },
  },
  required: ['files', 'blocked'],
}

const RED = {
  type: 'object',
  properties: {
    allMatch: { type: 'boolean' },
    mismatches: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          expected: { type: 'string', enum: ['red', 'green'] },
          observed: { type: 'string', enum: ['red', 'green', 'not-collected'] },
          leg: { type: 'string', enum: ['runtime', 'typecheck', 'none'] },
          detail: { type: 'string' },
        },
        required: ['path', 'expected', 'observed', 'detail'],
      },
    },
    // 2026-08-13 spec 05 D4: the AUDIT_RED:<path> / AUDIT_GREEN:<path> sentinel line the agent
    // observed per file, cross-checked against its allMatch/mismatches reading below — the same
    // exit-code-only discipline the Gate phase's own sentinel already enforces. null ONLY for the
    // sanctioned-green-carriers path (no agent runs — pinned by tests/redcheck-green-carriers.test.js).
    //
    // Per-file evidence is DUAL-LEG, because the expectation it is cross-checked against is
    // dual-leg (a file is red if EITHER leg fails on it — HEARWELL-20260721-01). Carrying only
    // the runtime sentinel made the two measurements incommensurable and DEADLOCKED any
    // compile-time-only carrier: a type-level test (`expectTypeOf`, an assert-absence pin, a test
    // importing a module the implementation has not created yet) is ERASED at runtime, so it can
    // never be runtime-red by construction — `expect: 'red'` failed the sentinel cross-check while
    // `expect: 'green'` failed the dual-leg reading, and NO classification could pass. Observed on
    // dashboard spec 20260813/10, whose AC promise was itself a compile-time one.
    //
    // The runtime leg keeps its exit-code-only proof. The typecheck leg cannot have one: a host
    // typecheck is whole-repo, so its exit code says nothing about WHICH file failed. Attribution
    // is therefore a reading, and is made proof-bearing instead by requiring the verbatim
    // diagnostic — cross-checked below to actually name the file it is claimed against.
    sentinels: {
      type: ['array', 'null'],
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          // Runtime leg: verbatim `AUDIT_RED:<path>` or `AUDIT_GREEN:<path>`.
          sentinel: { type: 'string' },
          // Typecheck leg: did the typecheck run report a diagnostic against THIS file.
          typecheckRed: { type: 'boolean' },
          // Verbatim diagnostic line(s) naming this path. Non-empty iff typecheckRed is true.
          typecheckEvidence: { type: 'string' },
        },
        required: ['path', 'sentinel', 'typecheckRed', 'typecheckEvidence'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['allMatch', 'mismatches', 'summary', 'sentinels'],
}

const RULES_PATH = args.pipelineRulesPath || ''
const DEVIATIONS_PATH = args.deviationsPath || ''

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
  DEVIATIONS_PATH ? `- If reality forces a departure from the spec's plan that does NOT rise to blocked (no fork, no
  wrong assumption — an edge case the plan didn't anticipate): take the conservative option and
  APPEND one line to ${DEVIATIONS_PATH} — \`- [<your batch id>] <what forced it> → <what you did>\`.
  Never deviate silently; the log is how the next spec's map gets corrected.` : '',
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

// @fragment:dispatch

function fileList(b) {
  return b.files.map(f => `- ${f.action} ${f.path}`).join('\n')
}

function batchPrompt(b) {
  const resolution = (args.resolutions || {})[b.id]
  return [
    `You are implementing one batch of files for a hardened spec.`,
    doctrineBlock(b.agentType),
    `First, Read the spec at ${args.specPath}. You do not need the whole document — read these sections in full and you may skip the narrative prose (Rationale, Goals, Background): the "Decisions" table is authoritative — apply it verbatim; the "Assumptions" section lists known fallbacks for surprises; the "Contracts" and "UI" sections are the library and API shapes you build against; your rows in the "File Plan" table carry each file's intent. If anything you read points into a section not listed here, read that section too — never act on a reference you have not read.`,
    resolution ? `## Orchestrator ruling (revision ${resolution})\nA ruling for this batch is recorded in the spec's Decisions table — Read it there and apply it exactly.` : '',
    `## Files in this batch\n${fileList(b)}`,
    HARD_RULES,
  ].filter(Boolean).join('\n\n')
}

// Repair prompt is deliberately LEANER than batchPrompt: the worker already authored these files,
// so its working set is on disk, not in the original intent prose. We drop the full author intent
// and instead point at (a) the files to Read, (b) the spec sections a fix must honor — Decisions
// (authoritative) + the Contracts/UI for the failing files — and (c) the full HARD_RULES safety
// floor (no git, no out-of-scope edits, read-only/managed surfaces, blocked-on-fork). The
// self-correcting "if a failure points elsewhere, read that too" clause is what keeps the narrowed
// read from silently starving the fix of a contract it never saw — a green gate that violates an
// unread contract is a defect, not a repair. Tests authored independently from the spec are the
// backstop that makes this lean read safe here (build only); design's repair stays full-grounding.
function repairPrompt(b, fails, round, history) {
  const resolution = (args.resolutions || {})[b.id]
  // Prior-round failures are shown so a late-round worker can detect oscillation (its "fix" is a
  // re-proposal of an approach an earlier round already tried and the gate already rejected) —
  // without this, each wave is blind to the circle it may be walking. Files on disk carry the
  // prior fixes' STATE, but only this block carries their OUTCOME.
  const prior = (history || []).map(h =>
    `Round ${h.round}:\n${h.fails.map(f => `- ${f.file} — ${f.summary}`).join('\n')}`).join('\n')
  return [
    `You are repairing files you already authored for a hardened spec — the deterministic gate failed on them. Fix ONLY what the failures below name; do not re-author from scratch and do not touch unrelated code.`,
    doctrineBlock(b.agentType),
    `These files are already on disk — Read each one before editing it:\n${fileList(b)}`,
    `You do not need the whole spec. In the spec at ${args.specPath}, read the "Decisions" table (authoritative — apply it verbatim) and the "Contracts" / "UI" entries for the files above (the API and library shapes your fix must satisfy). If a failure or a referenced contract points into another section, read that section too — a green gate that violates a contract you did not read is a defect, not a fix.`,
    resolution ? `## Orchestrator ruling (revision ${resolution})\nA ruling for this batch is recorded in the spec's Decisions table — apply it exactly.` : '',
    prior ? `## Already attempted (earlier repair rounds)\nThese failures were repaired in earlier rounds and the gate re-ran afterward:\n${prior}\nIf a failure below matches one of these, the earlier approach was wrong or caused a regression elsewhere — do NOT repeat it; take a different approach. If your fix would undo an earlier round's fix, reconcile both instead of trading one failure for the other.` : '',
    `## Gate failures to fix (repair round ${round})\n${fails.map(f => `- ${f.file} — ${f.summary}`).join('\n')}`,
    // A test batch (it carries acIds) repairs under the SAME test discipline it was authored
    // under — without this, a repair could quietly turn a spec-derived test into an
    // implementation-shaped one.
    b.acIds ? TEST_RULES : '',
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

// @fragment:gate-loop

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
      agentType: resolveType(b.agentType || AGENT_MAP.tests), model: 'sonnet', effort: 'medium',
    })))
  const { blocked, missing } = collectBlocked(args.testBatches, out)
  if (blocked.length || missing.length) {
    return { stage: 'blocked', blocked, missing, completed: receipts, tokens: budget.spent() }
  }

  phase('RedCheck')
  // Verdict = per-file expectation × gate-equivalent observation (intake HEARWELL-20260721-01,
  // PRAX-20260726-01, UPWELL-20260718-01). Expectations arrive as DATA, classified by the
  // orchestrator from the spec's own AC vocabulary: sanctioned-green carriers — a
  // SHALL CONTINUE TO regression pin, a negative-invariant/absence pin, a tag-only AC
  // re-tagging an existing passing test, or a test against a component pre-landed at the
  // design stage — expect 'green'; everything else expects 'red'. This workflow never
  // re-derives the classification; it verifies each file matches its expectation.
  const expectations = args.testBatches.flatMap(b =>
    b.files.map(f => ({ path: f.path, expect: f.expect === 'green' ? 'green' : 'red' })))
  const redExpected = expectations.filter(f => f.expect === 'red')
  const greenExpected = expectations.filter(f => f.expect === 'green')
  let red = { allMatch: true, mismatches: [], summary: 'all carriers sanctioned-green; probe skipped', sentinels: null }
  if (redExpected.length === 0) {
    // Every carrier is sanctioned-green: there is no red-first state to verify, and under the
    // old allRed contract this exact spec shape looped the build into fastPath abandonment.
    log('RedCheck: every test file is a sanctioned-green carrier — probe skipped, proceeding')
  } else {
    red = await agent(
      `Verify the TDD state of newly authored test files against the same gate that will later ` +
      `judge the implementation. Run every command from the current working directory of this ` +
      `dispatch — never cd out of it, and never let a tool resolve upward to a parent checkout.\n` +
      `Expected RED (implementation does not exist yet — these MUST fail):\n` +
      redExpected.map(f => `- ${f.path}`).join('\n') + '\n' +
      (greenExpected.length
        ? `Expected GREEN (sanctioned carriers pinning existing behavior — these MUST pass; a ` +
          `failing one is a broken pin to report as a mismatch, never red-state success):\n` +
          greenExpected.map(f => `- ${f.path}`).join('\n') + '\n'
        : '') +
      `Observe with BOTH legs — a file is red if EITHER fails on it:\n` +
      `1. Runtime: ${args.gate.testCommand} <paths>\n` +
      (args.gate.typecheckCommand
        ? `2. Typecheck: ${args.gate.typecheckCommand} — a test red only under the typecheck ` +
          `leg (e.g. asserting a property the schema does not declare yet) is genuinely red; ` +
          `attribute typecheck failures to the test file that triggers them.\n`
        : `2. Typecheck: this host declares no standalone typecheck leg; runtime is the only leg.\n`) +
      `If the runner collects zero test files, that observation is INVALID, not green: the ` +
      `test command is likely workspace-filtered while the paths are repo-root-relative — ` +
      `rewrite the paths relative to the command's workspace and re-run before concluding; ` +
      `report observed "not-collected" only if no rewrite makes the runner collect them.\n` +
      `For EACH file (both RED- and GREEN-expected), report one \`sentinels\` entry carrying ` +
      `BOTH legs — {path, sentinel, typecheckRed, typecheckEvidence}:\n` +
      `- \`sentinel\`: run exactly ${args.gate.testCommand} <path> && echo AUDIT_GREEN:<path> ` +
      `|| echo AUDIT_RED:<path> and report the printed line verbatim. This is the runtime leg's ` +
      `exit-code-only proof, the same discipline the Gate phase's own sentinel already enforces, ` +
      `so the runtime verdict never rests on your reading of raw stdout alone.\n` +
      (args.gate.typecheckCommand
        ? `- \`typecheckRed\`: true iff the ${args.gate.typecheckCommand} run reported a ` +
          `diagnostic against THIS file. That leg is whole-repo, so its exit code cannot ` +
          `attribute a failure to one file — you must attribute it by reading. Set ` +
          `\`typecheckEvidence\` to the verbatim diagnostic line(s) naming this path (it is ` +
          `checked to actually contain the path; a claim without it is treated as UNVERIFIED), ` +
          `or "" when typecheckRed is false.\n` +
          `A file that PASSES at runtime but carries a typecheck diagnostic is RED — the normal ` +
          `shape for a compile-time-only carrier (a type-level assertion, an assert-absence pin, ` +
          `a test importing a module the implementation has not created yet), which is erased at ` +
          `runtime and therefore can never be runtime-red.\n`
        : `- \`typecheckRed\`: this host declares no standalone typecheck leg — report false and ` +
          `"" for every file; a true here is treated as UNVERIFIED.\n`) +
      `Report allMatch=true only when every file matches its expectation; list every mismatch ` +
      `with the leg that decided it. Do not edit any file.`,
      { label: 'red-check', phase: 'RedCheck', schema: RED, model: 'sonnet', effort: 'low' })
    // Cross-check each file's reported red/green state against its OWN observed evidence —
    // unproven or missing evidence means the agent's allMatch/mismatches reading is unverified,
    // never a silent pass-through. sentinels: null (the sanctioned-green-carriers path above,
    // where no agent runs) is exempt from this check by construction.
    //
    // The observation combined here is DUAL-LEG, matching the expectation it is compared
    // against: red iff the runtime sentinel is AUDIT_RED **or** the typecheck leg is attributed
    // to this file. Comparing a runtime-only sentinel against a dual-leg expectation is what
    // deadlocked compile-time-only carriers (see the RED schema note above).
    if (red && red.sentinels !== null) {
      const sentinelMismatches = crossCheckSentinels(
        expectations, red.sentinels, Boolean(args.gate.typecheckCommand))
      if (sentinelMismatches.length) {
        red = { ...red, allMatch: false, mismatches: [...red.mismatches, ...sentinelMismatches] }
      }
    }
  }
  // FAIL CLOSED: a null red-check (agent died) is an UNVERIFIED red state, not a match —
  // proceeding would build on tests nobody confirmed fail. Surface it like a red-check failure.
  if (!red || !red.allMatch) {
    return {
      stage: 'tdd-red-check',
      mismatches: red ? red.mismatches : [],
      summary: red ? red.summary : 'red-check agent returned no result — TDD state unverified; re-run',
      completed: receipts, tokens: budget.spent(),
    }
  }
}

// ---- Phase: implementation, layer group by layer group ----
phase('Implement')
for (const group of args.groups) {
  log(`Implementing group: ${group.map(b => b.id).join(', ')}`)
  const out = await parallel(group.map(b => () =>
    dispatch(batchPrompt(b), {
      label: `impl:${b.id}`, phase: 'Implement', schema: RECEIPT,
      agentType: resolveType(b.agentType), model: 'sonnet', effort: 'medium',
    })))
  const { blocked, missing } = collectBlocked(group, out)
  if (blocked.length || missing.length) {
    return { stage: 'blocked', blocked, missing, completed: receipts, tokens: budget.spent() }
  }
}

// ---- Phase: deterministic gate + repair loop (shared fragments/gate-loop.js.frag) ----
phase('Gate')
const gateCmd = args.gate.command
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
  contextLabel: '(source file for implementation bugs, test file for bad tests)',
  repairFn: async (repairEntries, round, historySnapshot) => {
    const repairOut = await parallel(repairEntries.map(([bid, fails]) => () =>
      dispatch(
        repairPrompt(batchById[bid], fails, round + 1, historySnapshot[bid]),
        {
          label: `repair:${bid}:r${round + 1}`, phase: 'Gate', schema: RECEIPT,
          agentType: resolveType(batchById[bid].agentType), model: 'sonnet', effort: 'medium',
        })))
    // A repair worker may hit the same fork/stale-assumption the author path surfaces — HARD_RULES
    // instructs it to return blocked, so honor that here instead of discarding it and exiting as an
    // opaque gate-exhausted. (A null repair result is not fatal: the next gate round re-measures.)
    const result = collectBlocked(repairEntries.map(([bid]) => batchById[bid]), repairOut)
    agentsFailed += result.missing.length
    return result
  },
})

if (loopResult.blocked && loopResult.blocked.length) {
  return { stage: 'blocked', blocked: loopResult.blocked, missing: loopResult.missing, gate: loopResult.gate, completed: receipts, tokens: budget.spent() }
}
if (loopResult.outOfScope && loopResult.outOfScope.length) {
  return { stage: 'out-of-scope-failure', failures: loopResult.outOfScope, gate: loopResult.gate, completed: receipts, tokens: budget.spent() }
}

return {
  stage: loopResult.pass ? 'complete' : 'gate-exhausted',
  gate: loopResult.gate,
  exhaustedBy: loopResult.exhaustedBy,
  agentsFailed: agentsFailed + (loopResult.exhaustedBy === 'agent-died' ? 1 : 0),
  deviations: loopResult.deviations,
  completed: receipts,
  tokens: budget.spent(),
}
