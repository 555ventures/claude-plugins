// generated from fragments/gate-loop.js.frag — edit the fragment, then `npm run build:workflows`.
// WHY this exists (specs/20260813/05-workflow-correctness-repairs.md D5): wf-build's gate-repair
// loop (probe, repair-round loop with a hard ceiling, anti-oscillation history, phantom-failure
// hardening) was hand-copied into wf-design and drifted — wf-design never received the deviations
// tracking, the repair history, or the phantom-failure prompt hardening even though the
// justifying comments were copied over. This fragment is the ONE place the loop lives; both
// bodies splice it verbatim and thread only what genuinely differs (prompt context, how a
// repair round is dispatched) through `runGateLoop`'s parameters. wf-build is the extraction's
// behavior-preserving source of truth; wf-design gains the hardening it was missing.
// NOTE: `gateCmd` is the load-bearing interpolated variable name — tests/workflow-guards.test.js
// pins the literal `${gateCmd}` in both generated outputs. Never rename it.
// Must not use the per-workflow-name splice substitution token build-workflows.js applies to
// fragments — the spliced region must be byte-identical in wf-build.js and wf-design.js
// (tests/workflows/twin-parity.test.js AC-20260813-05-7).
const REPAIR_CEILING = 3

// Failure→batch routing. The gate agent reads File Plan paths out of gate-command output, which
// routinely prints absolute or ./-prefixed paths — match tolerantly (exact, then a path-boundary
// suffix match in either direction) so an in-scope failure isn't misclassified out-of-scope and
// bounced to the orchestrator instead of through the repair loop. Closured over the body's own
// `fileToBatch` (built identically — same variable name — by both wf-build and wf-design before
// this fragment's marker).
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

// The shared gate-repair loop. `repairFn(repairEntries, round, historySnapshot)` dispatches one
// repair round for the caller's batch shape and must return `{blocked, missing}` (the shape
// `collectBlocked` already returns in both bodies) — a non-empty `blocked` routes straight to the
// caller's blocked-return, exactly like the author/implement phase does.
async function runGateLoop({ gateCmd, phase, repairFn, contextLabel }) {
  const GATE_SENTINEL = '__GATE_PASS__'
  let gate = null
  // Repair loop terminates on PROGRESS, not a blind counter. After each failing round we compare
  // the failing file-SET (comparable across rounds because GATE requires `file` on every failure)
  // to the prior round's: an unchanged set means the repair waves are grinding the same files with
  // nothing to show — escalate now instead of burning another wave. The hard ceiling stays
  // load-bearing: it catches OSCILLATION (fix A -> break B -> fix B -> break A forever), which a
  // no-progress check on an ever-changing set never terminates.
  let prevFailKey = null
  // Per-batch failure history across repair rounds (bid -> [{round, fails}]), fed into repairFn so
  // a late-round worker can see what earlier rounds already tried — the anti-oscillation
  // counterpart to prevFailKey, which only TERMINATES on repetition and never warns the repairer.
  const repairHistory = {}
  // Sidecar rows accumulated across repair rounds for the report surface (spec 06 consumes this;
  // this spec only records it) — e.g. the self-contradiction guard firing is itself a deviation
  // from the clean path worth surfacing, not just silently corrected.
  const deviations = []
  for (let round = 0; round <= REPAIR_CEILING; round++) {
    gate = await agent(
      `Run this command exactly as written and report results. Do not edit any file.\n\n( ${gateCmd} ) && echo ${GATE_SENTINEL}\n\n` +
      `The subshell wrapper makes the trailing \`&& echo ${GATE_SENTINEL}\` fire ONLY when the WHOLE gate command exits 0 ` +
      `(even if it contains \`;\`); any non-zero exit means the sentinel never prints. Set pass=true ONLY if the ` +
      `exact string ${GATE_SENTINEL} appears in the command output — if it is absent, the gate failed, set pass=false. ` +
      `Put the raw exit code (or "non-zero, no ${GATE_SENTINEL}") and the error/failure count in summary. ` +
      `For each failure, identify the single file that most likely needs the fix${contextLabel ? ' ' + contextLabel : ''} and summarize the ` +
      `failure in one line including the test/check name. Enumerate a failure only where the runner itself attributes one (a ` +
      `failing test block, a compiler/lint error line). Error-shaped strings logged by passing tests ` +
      `(mocked-rejection messages, expected-error output) are never failures — cross-check the ` +
      `runner's own per-file pass/fail summary before listing a file.`,
      { label: `gate:round-${round}`, phase, schema: GATE, model: 'haiku', effort: 'low' })
    // Self-contradiction guard: a model may still report pass=true while listing failures (the
    // false-green this guard exists to kill). The workflow, not the model, decides — pass with any
    // failure listed is a fail. Enforced regardless of model behavior; recorded as a deviation so
    // the eventual report surface can see the correction happened, not just its silent effect.
    if (gate && gate.pass && gate.failures && gate.failures.length > 0) {
      deviations.push({ round, note: 'gate agent reported pass=true while listing failures — corrected to fail' })
      gate.pass = false
    }
    // FAIL CLOSED: a dead gate agent is neither a pass nor a genuine red state — record the
    // distinct cause so a consumer can tell a crashed gate agent apart from a real gate failure.
    if (!gate) return { pass: false, rounds: round, deviations, exhaustedBy: 'agent-died', gate }
    if (gate.pass) return { pass: true, rounds: round, deviations, exhaustedBy: null, gate }
    // A failed gate with NO per-file failures gives the repair loop nothing to route — an empty
    // repair wave would burn a round and then trip no-progress anyway. Escalate immediately.
    if (!gate.failures || !gate.failures.length) return { pass: false, rounds: round, deviations, exhaustedBy: 'no-attributable-failure', gate }

    const byBatch = {}
    const outOfScope = []
    for (const f of gate.failures) {
      const bid = resolveBatch(f.file)
      if (!bid) { outOfScope.push(f); continue }
      if (!byBatch[bid]) byBatch[bid] = []
      byBatch[bid].push(f)
    }
    if (outOfScope.length) return { pass: false, rounds: round, deviations, exhaustedBy: null, gate, outOfScope }

    // No-progress escalation: identical failing file-set to last round -> stop (oscillation; routes
    // to the caller's gate-exhausted return, no new exit path).
    const failKey = gate.failures.map(f => f.file).sort().join('\n')
    if (failKey === prevFailKey) return { pass: false, rounds: round, deviations, exhaustedBy: 'oscillation', gate }
    prevFailKey = failKey
    if (round === REPAIR_CEILING) return { pass: false, rounds: round, deviations, exhaustedBy: 'ceiling', gate }

    log(`Gate round ${round} failed — repairing batches: ${Object.keys(byBatch).join(', ')}`)
    const repairEntries = Object.entries(byBatch)
    // Snapshot each batch's PRIOR-round history for the prompt before recording this round — the
    // current failures belong in "to fix", not "already attempted".
    const historySnapshot = {}
    for (const [bid, fails] of repairEntries) {
      historySnapshot[bid] = (repairHistory[bid] || []).slice()
      if (!repairHistory[bid]) repairHistory[bid] = []
      repairHistory[bid].push({ round: round + 1, fails })
    }
    const repairStatus = await repairFn(repairEntries, round, historySnapshot)
    // A repair worker may hit the same fork/stale-assumption the author path surfaces — honor a
    // blocked return instead of discarding it and exiting as an opaque gate-exhausted. (A null/
    // empty repairStatus is not fatal: the next gate round re-measures what actually landed.)
    if (repairStatus && repairStatus.blocked && repairStatus.blocked.length) {
      return { pass: false, rounds: round, deviations, exhaustedBy: null, gate, blocked: repairStatus.blocked, missing: repairStatus.missing }
    }
  }
}
