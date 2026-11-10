'use strict'
// lib/briefs.js — the text run.js prints: the builder, reviewer, question, look and rebase briefs, the report, the commit
// message and the checkpoint line. Pure text from
// what run.js hands it; nothing here reads or writes a file. A spec and a fix take the same path: a fix's
// document is lib/spec.js `fixDoc`. No CLI.
//
// b = {wt, specPath?, doc, cfg, runFile(name), attempt, opus, plugin, rulings[], gate?, review?, fixFor?,
//      lookReply?, proto?: {pins[], e2eFile, stem, pictures[]}, base, outside[], redCheck?, evidence, asBuilt}

const S = require('./spec')
const { render } = require('./report')
const { firstRedLine, resolveUrl } = require('./host')
const { retiredLines } = require('./criteria')
const { shq } = require('./driver')

const OTHER_SECTIONS = 'Other sections (File Plan, Contracts, UI, Behavior, Canonical Delta) are not printed here — read them in the spec file; a Canonical Delta is applied by the builder.'
const loc = (f) => `${f.file || ''}${f.file && f.line ? ':' + f.line : ''}`
const finding = (f) => `- ${loc(f)} ${f.summary || ''}${f.evidence ? ` (evidence: ${f.evidence})` : ''}`.replace(/^- {2}/, '- ')
const intentText = (doc) => S.section(doc.sections, 'Intent') || S.section(doc.sections, 'Goal') // a v7 spec carries only ## Goal
const decisions = (doc) => {
  const rows = S.decisionRows(S.section(doc.sections, 'Decisions'))
  return rows.length ? rows.map((c) => `- ${c[0]}: ${c[1]}${c.length > 2 && c[c.length - 1] ? ` — ${c[c.length - 1]}` : ''}`) : ['- none']
}
const assumptions = (doc) => {
  const l = S.section(doc.sections, 'Assumptions').split('\n').map((x) => x.trim()).filter((x) => /^- +A\d+:/.test(x))
  return l.length ? l : ['- none']
}
const pinLines = (p) => (p.pins.length ? p.pins.map((x) => `- ${x.id} (${x.kind}): ${x.sentence}`) : ['- none'])

const isFix = (doc) => doc.acs.length === 1 && doc.acs[0].id === 'FIX-1'

// What the build is held to, in the order both agents read it.
function contract(b, { plan }) {
  return [
    '## Intent', intentText(b.doc), '',
    '## Decisions', ...decisions(b.doc), '',
    ...(b.rulings.length ? ['## Rulings (the user\'s answers during this run; they bind like Decisions)', ...b.rulings.map((r) => `- ${r}`), ''] : []),
    ...(plan && !isFix(b.doc) ? ['## File Plan', ...b.doc.filePlan.map((r) => `- ${r.action} ${r.path} — ${r.summary}`), ''] : []),
    '## Acceptance Criteria', ...b.doc.acs.map((a) => `- ${a.id}: ${a.text}`), '',
    ...(retiredLines(b.doc).length ? ['## Retired criteria', ...retiredLines(b.doc), ''] : []), // ADR-0048
    '## Assumptions', ...assumptions(b.doc), '',
    ...(b.proto ? ['## Pins', ...pinLines(b.proto), ''] : []),
  ]
}

function builder(b, kind) {
  const spec = !!b.specPath; const fix = isFix(b.doc)
  const out = [`Worktree: ${b.wt}`, ...(spec ? [`Spec: ${b.specPath}`] : []), `Test command: ${b.cfg.testCommand} (run it in the worktree)`, '', ...contract(b, { plan: true })]
  if (b.proto) out.push(`Behaviour pins: one browser test per pin in ${b.proto.e2eFile} (create it if absent; keep the pin tests earlier specs put there), titled \`pin pN: <sentence>\`, locating by role and visible text, seeding the given precondition in production terms. The gate runs them against the app at APP_URL after the test command. Never copy a selector or a line of code from proto/${b.proto.stem}.`, '')
  if (spec) out.push(OTHER_SECTIONS, '')
  const tail = (b.gate && b.gate.output_tail) || ''
  if (kind === 'repair') {
    out.push(`${/^git commit was rejected/.test(tail) ? 'The commit hook rejected the build' : /^pin tests red:/.test(tail) ? 'The pin tests are red' : 'The gate is red'}. Repair the code (never weaken a test). Failure tail:`, '```', tail, '```',
      'A failing test the diff does not touch, a timeout, or a flake under load is not yours to fix: say so in your reply and stop; the driver re-runs the gate. Never raise a host test timeout, retry count or worker limit to pass.', '')
  } else if (kind === 'fix' && b.fixFor === 'look') {
    out.push(`The user looked at the running app and said: ${b.lookReply}. Treat it as the symptom: find the cause, fix it, keep every pin test green.`, '')
  } else if (kind === 'fix') {
    const decided = b.fixFor === 'decision'
    out.push(decided ? 'The reviewer found choices the spec did not make; the user said to undo them. For each: undo this choice; follow the spec.' : 'The reviewer found blocking issues. Fix each one:',
      ...b.review.findings.filter((x) => x.severity === (decided ? 'needs-decision' : 'blocking')).map(finding), '')
  }
  out.push(kind === 'build' && !fix ? `Write failing tests first, then code, and run \`${b.cfg.testCommand}\` until green.` : `Run \`${b.cfg.testCommand}\` until green.`,
    fix ? 'List every file you changed in your final summary.' : 'Do not touch files outside the File Plan without listing them in your final summary.',
    ...(spec ? ['If a Decision cannot be honoured as written, or an Assumption with an `ask` arm proves false, stop and say which in your reply — do not pick.'] : []),
    `Evidence an AC asks to record (listings, renders, counts) goes in ${b.runFile('evidence.md')}; the driver appends it to the build commit.`,
    ...(spec && !fix ? [`Anything you built differently from the spec, and why, goes in ${b.runFile('as-built.md')} (one line each); the driver adds it to the build commit message.`] : []))
  const model = b.attempt >= 2 || b.opus ? 'opus' : b.cfg.seats.builder.model // Opus from the second attempt
  return { head: `Dispatch ONE \`builder\` agent (spec:builder, ${b.plugin}/agents/builder.md) — model ${model}, effort ${b.cfg.seats.builder.effort}, attempt ${b.attempt}, in ${b.wt}.`, body: out }
}

// The reviewer seat: an `architecture: true` spec gets Opus at xhigh, every other review the config seat.
const reviewSeat = (doc, cfg) =>
  doc.frontmatter.architecture === true ? { model: 'opus', effort: 'xhigh' } : cfg.seats.reviewer

// A later round: the last review recorded its tree, so this one checks the fix delta against what that review found.
function laterRound(b) {
  const r = b.review; const open = r.findings.filter((f) => ['blocking', 'needs-decision'].includes(f.severity))
  return [`Later round: review only the fix. Delta since the last review: git -C ${shq(b.wt)} diff ${r.tree} ` +
    b.gate.tree,
    ...(r.base !== b.base ? ['The base moved (a rebase onto trunk): the delta also holds trunk\'s changes; ' +
      'review only files the run\'s diff touches.'] : []),
    'Decide each finding below closed or not closed (one not closed is written again with its severity). ' +
      'The driver keeps earlier advisories and notes.',
    ...(open.length ? open.map(finding) : ['- none']), '']
}

function reviewer(b) {
  const spec = !!b.specPath
  const body = [
    `Worktree: ${b.wt}`, `Base: ${b.base}`, `Diff (working tree vs base): ${b.runFile('diff.patch')}`,
    `Gate: green on this tree (run ${b.gate.runId}). Do not run the test command again; ` +
      'run one test file or a probe when you need output.',
    ...(b.evidence ? [`Evidence the builder recorded (not in the diff): ${b.runFile('evidence.md')}`] : []),
    ...(b.asBuilt ? [`Departures the builder recorded: ${b.runFile('as-built.md')}`] : []),
    ...(spec ? [`Spec: ${b.specPath}`] : []),
    `Write the findings JSON to: ${b.runFile('findings.json')}`,
    b.outside ? `Files changed outside the File Plan: ${b.outside.join(', ') || 'none'}` : 'Files changed outside the File Plan: n/a (a fix has no File Plan)',
    ...(b.redCheck ? [b.redCheck] : []),
    ...(spec ? ["The spec's frontmatter status line changes during the run; that is bookkeeping, not a finding."] : []),
    ...(isFix(b.doc) ? ['A fix: check that the test evidence.md names fails for the stated cause without the fix and that the fix is at the root, not around the symptom.'] : []),
    '', ...(b.review && b.review.tree ? laterRound(b) : []), ...contract(b, { plan: false }),
    ...(b.proto ? [`For each behaviour pin open its test in ${b.proto.e2eFile}: a missing test, a title without \`pin pN:\`, or an assertion that does not establish the sentence (asserts less, a selector or structure, or skips the given) is blocking.`,
      ...(b.proto.pictures.length ? ['Pictures of the pinned routes (a reference for the look, never a gate):', ...b.proto.pictures.map((f) => `- ${f}`)] : []), ''] : []),
    ...(spec ? [OTHER_SECTIONS] : []),
  ]
  const seat = reviewSeat(b.doc, b.cfg)
  return { head: `Dispatch ONE \`reviewer\` agent (spec:reviewer, ${b.plugin}/agents/reviewer.md) — model ${seat.model}, effort ${seat.effort}, in ${b.wt}.`, body }
}

// The three questions a run asks, each in the agent's own words: {kind, q, options}; amend only where a spec can be amended.
// An unmet Decision (or an Assumption with no options) leads with amend; retry only while Opus has not run, park last.
function escalation(state, amendable) {
  const lock = `with /spec:plan ${state.spec}; the build resumes from its kept work once the amended spec is locked`
  const amend = { label: 'amend', description: `amend the spec ${lock}` }
  const retry = { label: 'retry', description: `re-run ${state.from || 'the step'} on Opus with fresh attempts` }
  const list = (what) => [{ ...amend, description: `amend ${what} ${lock}` }, ...(state.opus ? [] : [retry]),
    { label: 'park', description: 'stop here and queue a /spec:fix item' }]
  let e
  if (state.why === 'decision') {
    e = { kind: 'decision', q: state.review.findings.filter((f) => f.severity === 'needs-decision').map((f) => f.summary || '').join('\n'),
      options: [{ label: 'keep', description: 'keep what the build did, record your yes in the commit, carry on' }, { label: 'fix', description: 'one more builder round that undoes it and follows the spec' }, amend] }
  } else if (state.why === 'assumption') {
    const a = state.assumption
    const rule = (o) => ({ label: o, description: `rule "${a.id}: ${o}" and continue at ${state.from} on Opus` })
    const own = [...a.options.filter((o) => o !== 'amend').map(rule), amend]
    e = { kind: 'assumption', q: a.note || a.text, options: a.options.length ? own : list(a.id) }
  } else e = { kind: 'unmet', q: state.unmet.text, options: list(state.unmet.decision) }
  return { ...e, options: e.options.filter((o) => amendable || o.label !== 'amend') }
}

// The question for the session to ask; the options carry their consequence.
const question = (q, options) => [`Ask the user ONE question (AskUserQuestion), recommended option first: ${q}`,
  ...options.map((o) => `- ${o.label} — ${o.description}`),
  'If the user dismisses the question, mark `dismissed` instead: the run stops and the question is queued as a decide item; nothing is answered for them.'].join('\n')

function look({ state, wt, cfg, contract, pictures, looked, failed }) {
  const rt = cfg.runtime; const url = rt.publicUrl ? resolveUrl(rt.publicUrl, state.appPort) : state.app.url
  const pins = ((contract || {}).pins || []).filter((x) => x.status === 'active' && x.kind === 'look')
  return [
    `👀 look — ${url}`, ...(pins.length ? pins.map((x) => `- ${x.id}: ${x.sentence}`) : ['(no look pins)']),
    ...(pictures.length ? ['Pictures:', ...pictures.map((f) => `- ${wt}/${f}`)] : []), '',
    'Print the url and these lines, then END YOUR TURN.',
    `A literal \`close enough\` → ${looked} (the driver stops the app).`,
    `Anything else → ${failed} --why "<the reply verbatim>"`,
  ].join('\n')
}

const regate = (gate, cmd) => `Gate tree ${String((gate && gate.tree) || '').slice(0, 7)}. If the builder replied that the failure is not its to fix (no change to the tree), re-run the gate without counting a repair: ${cmd} (once per tree).`

// red-check.js's JSON as the reviewer's one line: information, never a block.
function redCheckLine(stdout) {
  let doc = null
  try { doc = JSON.parse(stdout) } catch { return 'red-check: no verdict (unreadable output)' }
  if (doc.error) return `red-check: no verdict (${doc.error})`
  return doc.vacuousGreen.length ? `red-check: vacuous green — ${doc.vacuousGreen.join(', ')} pass on base too` : `red-check: ${doc.files.length} new test file(s), none vacuous`
}

const rebase = ({ wt, trunk, files }) => `A rebase onto trunk ${trunk} is in progress in ${wt}, conflicting in ${files.join(', ')}: edit each conflicted file to both sides' intent (no markers left), then re-run this driver — it continues the rebase, then gates and reviews the result in this same dispatch. If a resolution cannot keep a Decision, mark \`unmet --decision <id> --why <text>\` instead of deciding.`

// ---- the run's report, commit message and checkpoint line ----------------------------------------------

const secs = (ms) => Math.round(ms / 1000)
const lookLine = (state) => (state.look ? [`pin tests green · look accepted after ${state.look.rounds} round(s)`] : [])
// The 📌 slot: what the spec says users will notice, then every line a rule decided without the user.
const pins = (state) => [...(state.notice ? [`Users will notice: ${state.notice}`] : []), ...(state.pin ? [state.pin] : []), ...(state.decided || []).map((l) => `📌 ${l}`)]

function report(state, outcome, next) {
  const findings = (state.review && state.review.findings) || []; const g = state.gate || {}
  return render({
    outcome, next, artifacts: state.spec, pins: pins(state),
    bullets: [`commit ${state.commit || 'none (nothing changed)'}${state.mergeSha ? `, merged as ${state.mergeSha}` : ''}`,
      `gate green (run ${g.runId}); review ${state.review.verdict}, ${findings.length} finding(s); ${state.attempts.repair} repair(s), ${state.attempts.fix} fix round(s)`,
      ...lookLine(state), ...(g.reruns || g.lockWaitMs >= 1000 ? [`load: ${g.reruns || 0} gate rerun(s), ${secs(g.lockWaitMs || 0)}s waiting for a slot`] : [])],
    warns: [...(state.commitWarns || []), ...findings.filter((f) => f.severity !== 'blocking').map((f) => `${f.severity}: ${loc(f)} ${f.summary || ''}`)],
  })
}

// Rulings and as-built lines live in the commit, never in the spec.
const block = (title, lines) => (lines.length ? [`${title}:\n` + lines.map((l) => `- ${l}`).join('\n')] : [])
const notes = (state) => ((state.review || {}).findings || []).filter((f) => f.severity === 'note')
  .map((f) => `${loc(f)} ${f.summary || ''}`.trim())
const commitMessage = (state, subject, asBuilt, evidence) => [subject, ...lookLine(state),
  ...block('Rulings', state.rulings || []), ...block('Reviews', state.reviews || []),
  ...block('Review notes', notes(state)),
  ...block('As built', asBuilt), ...(evidence ? [evidence] : [])].join('\n\n')

// One line under the checkpoint: what the mark led to.
function checkpoint(verb, state, stopLine) {
  const g = state.gate
  if (['built', 'repaired', 'regate', 'fixed'].includes(verb) && g) {
    const cost = `${g.reruns === 1 ? ' · rerun' : ''}${g.lockWaitMs >= 1000 ? ` · waited ${secs(g.lockWaitMs)}s for a gate slot` : ''}`
    return g.status === 'red' ? `gate: red — ${firstRedLine(g.output_tail)}${cost}` : `gate: green (${g.cached ? 'cached' : `ran ${g.ms}ms`})${state.commit ? ` · commit ${state.commit.slice(0, 7)}` : ''}${cost}`
  }
  if (verb === 'unmet' && stopLine) return stopLine
  if (verb !== 'reviewed' || !state.review) return null
  const n = state.review.findings.filter((f) => f.severity === 'blocking').length
  return n ? `review: ${n} blocking → ${state.step}` : state.review.verdict === 'decision' ? 'review: needs-decision → ESCALATE' : 'review: clean'
}

module.exports = {
  builder, reviewer, reviewSeat, escalation, question, look, regate, redCheckLine, rebase, pins, report,
  commitMessage, checkpoint,
}
