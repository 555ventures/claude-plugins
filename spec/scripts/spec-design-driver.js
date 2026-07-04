#!/usr/bin/env node
// Deterministic state-machine driver for /spec:design.
//
// WHY: the design stage's process shape (which phase you are in, what artifacts must exist
// before the next step, what to do now) is deterministic — paying a judgment-priced session to
// re-read 400 lines of phase prose every invocation, and to re-infer "where was I" on resume,
// was the stage's largest fixed cost. This driver owns the state machine: it inspects the
// on-disk state (spec frontmatter, the .design/ sidecar, progress marks), decides the CURRENT
// step, and prints ONLY that step's instructions. The session executes the step, records
// progress with --mark, and re-runs the driver. Instructions arrive incrementally (~40 lines a
// step instead of a ~440-line prefix), and re-entry is correct by construction — the driver
// refuses to print a later step until the earlier step's artifacts verifiably exist.
//
// What stays with the model: ALL taste (skeleton authoring, fork adjudication, visual review,
// iteration rulings). The driver never reads mockups, never judges design, never edits.
//
// CONTRACT:
//   spec-design-driver <spec.md>                 -> print current state + step instructions
//   spec-design-driver <spec.md> --mark <mark>   -> record progress, then print the next step
//     marks: author-green [--run-id <wf id>] | visual-done | round-green | approved
//   spec-design-driver <spec.md> --state         -> print the state name only (scripting)
// Exit codes: 0 = step printed; 2 = precondition failure (wrong status, no design block, bad args).
// State lives in <spec>.design/design-state.json + the artifacts themselves. Deleting the
// sidecar resets to the start of the design stage (the spec is never touched by this script).

'use strict'
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

function die(msg) { process.stderr.write('spec-design-driver: ' + msg + '\n'); process.exit(2) }

const argv = process.argv.slice(2)
const specPath = argv[0]
if (!specPath || specPath.startsWith('--')) die('usage: spec-design-driver <spec.md> [--mark <m>] [--run-id <id>] [--state]')
if (!fs.existsSync(specPath)) die('spec not found: ' + specPath)

const flag = (name) => { const i = argv.indexOf(name); return i > -1 ? (argv[i + 1] || true) : null }
const MARK = flag('--mark')
const RUN_ID = flag('--run-id')
const STATE_ONLY = argv.includes('--state')

// ---- read the world ----------------------------------------------------------------------------
const spec = fs.readFileSync(specPath, 'utf8')
const fmMatch = /^---\n([\s\S]*?)\n---/.exec(spec)
const fm = fmMatch ? fmMatch[1] : ''
const fmVal = (k) => { const m = new RegExp('^' + k + ':\\s*(.+)$', 'm').exec(fm); return m ? m[1].trim() : '' }

const status = fmVal('status')
const designFlag = fmVal('design')
const designed = fmVal('designed')
const designSource = fmVal('design_source')

const repoRoot = (() => {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', cwd: path.dirname(path.resolve(specPath)) })
  return r.status === 0 ? r.stdout.trim() : process.cwd()
})()
const configPath = path.join(repoRoot, '.claude/spec.config.json')
let config = {}
try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')) } catch (e) { die('cannot read ' + configPath + ' — run /spec:init first (' + e.message + ')') }
// Legacy key mapping (shared § Design Stage)
const design = config.design || (config.storybook ? { tool: 'storybook', command: config.storybookCommand, storyFormat: 'CSF3 stories' } : null)
if (!design) die('host config declares no design block (nor legacy storybook keys) — the design stage does not apply to this repo; STOP')

const PLUGIN = path.resolve(__dirname, '..')
const sidecar = specPath.replace(/\.md$/, '.design')
const inSidecar = (f) => path.join(sidecar, f)
const exists = (f) => fs.existsSync(inSidecar(f))
const stateFile = inSidecar('design-state.json')
let marks = {}
try { marks = JSON.parse(fs.readFileSync(stateFile, 'utf8')) } catch { marks = {} }

// ---- record a mark (validated against the artifacts, then fall through to print next step) ------
if (MARK) {
  const valid = ['author-green', 'visual-done', 'round-green', 'approved']
  if (!valid.includes(MARK)) die('unknown mark "' + MARK + '" (' + valid.join(' | ') + ')')
  fs.mkdirSync(sidecar, { recursive: true })
  if (MARK === 'round-green') {
    marks.rounds = (marks.rounds || 0) + 1
  } else {
    marks[MARK] = true
    if (MARK === 'author-green' && RUN_ID) marks.runId = RUN_ID
  }
  fs.writeFileSync(stateFile, JSON.stringify(marks, null, 2) + '\n')
}

// ---- derive the current state (artifact-verified, never trust marks alone) ----------------------
function skeletonsValid() {
  if (!exists('skeletons.json')) return false
  const r = spawnSync(process.execPath, [path.join(PLUGIN, 'scripts/skeletons-check.js'), inSidecar('skeletons.json')], { encoding: 'utf8' })
  return { ok: r.status === 0, out: (r.stdout + r.stderr).trim() }
}

let state, detail = ''
if (designed) state = 'DONE'
else if (status !== 'hardened') state = 'BLOCKED'
else if (designSource && !exists('extract.json')) state = 'FETCH_EXTRACT'
else {
  const sk = exists('skeletons.json') ? skeletonsValid() : false
  if (!sk) state = 'SKELETONS'
  else if (!sk.ok) { state = 'SKELETONS_INVALID'; detail = sk.out }
  else if (!marks['author-green']) state = 'AUTHOR'
  else if (design.screenshot && !marks['visual-done']) state = 'VISUAL'
  else if (!marks.approved) state = 'ITERATE'
  else state = 'RECONCILE'
}

if (STATE_ONLY) { process.stdout.write(state + '\n'); process.exit(state === 'BLOCKED' ? 2 : 0) }

// ---- step fragments ------------------------------------------------------------------------------
const doctrinePath = design.doctrine || ''
const gateCmd = [config.gateCommand].filter(Boolean).join(' ')
const wfDesign = path.join(PLUGIN, 'workflows/wf-design.js')
const dcExtract = path.join(PLUGIN, 'scripts/dc-extract.js')
const skCheck = path.join(PLUGIN, 'scripts/skeletons-check.js')
const logPath = inSidecar('design-log.md')
const mockLine = designSource ? 'design_source: ' + designSource : 'no design_source — the no-mockup path (skeletons from doctrine + tokens + the spec ## UI section)'

const STEPS = {
  BLOCKED: () => `Spec status is "${status || '<missing>'}" — /spec:design requires status: hardened.
${designed ? 'designed: is already set — a re-design; confirm with the user before deleting it.' : 'Run /spec:plan first.'}`,

  FETCH_EXTRACT: () => `## Step: fetch the mockup + deterministic extract
${mockLine}

1. Parse projectId (segment after /p/) and file (?file=<name>, URL-decoded) from design_source.
2. Delegate the fetch to a one-shot Sonnet Agent (top-level, NOT the workflow — top-level agents
   inherit session MCP): it loads DesignSync (ToolSearch select:DesignSync), get_file's the
   .dc.html READ-ONLY, writes the markup to a SCRATCHPAD path (never under specs/), and returns
   only {path, sha256, bytes}. 256 KiB cap; DesignSync unavailable / unreachable / over cap →
   STOP (suggest /design-login). The markup never enters this session.
3. Run: node ${dcExtract} <scratchpad markup path> ${sidecar}/
   Non-zero exit → fall back ONCE to a one-shot Sonnet agent writing the same extract.json +
   slice-*.html by hand; if that fails too, STOP with the stderr. Never author from a partial extract.
4. Re-run this driver.`,

  SKELETONS: () => `## Step: author skeletons.json (the taste concentration — expensive model, warm)
${mockLine}

1. Dispatch a Haiku match-first pass (Agent {model:"haiku"}, report-only): planned surfaces
   (spec ## UI) × catalog/source roots → a match-map (bind: existing component + import path +
   prop-bindings | net-new), an on-disk inventory (skip done work), per-slice file sizes, and
   the base-barrel report (which overlay primitives exist to import; nearest-match for absent ones).
2. Warm inputs to read yourself: ${designSource ? sidecar + '/extract.json + each slice-*.html, ' : ''}token files +
   the design doctrine${doctrinePath ? ' (' + doctrinePath + ')' : ''}, the spec ## UI section, the match-map.
3. Resolve BEFORE emitting skeletons (batch, never mid-authoring): token forks alias-first
   (new-role → extend after the near-match dedup check; same role/different value = fork →
   AskUserQuestion local-exception vs token-change); doctrine tensions by the ruling's grounding
   (taste → mock wins silently; grounded → snap value to constraint, ask only if irreconcilable);
   confirm each match-map bind against its slice. Absent base primitive → AskUserQuestion
   author-as-foundation vs near-match reuse (default-author when no near-match).
4. Write ${sidecar}/skeletons.json — per surface: { id, decision: author|bind, componentPath,
   storyPath, bind{component,from,propBindings}, imports[], tree[{el,slot,children,bind,
   style:{property: tokenROLE}}], props[], states[], mockRef{state:fixture}, tokens[closed
   allowlist], sliceRef, shared, usedBy, containment, coherenceGroup, waveOrder } plus top-level
   {schemaVersion, source:{sha256}, tokenForks[]}. Every style value is a ROLE, never a literal.
   coherenceGroup/waveOrder are session-side scratch for building the workflow groups arg.
5. Validate: node ${skCheck} ${sidecar}/skeletons.json — fix and re-run until clean.
6. Re-run this driver. You write NO framework code in this step.`,

  SKELETONS_INVALID: () => `## Step: fix skeletons.json — structural check failed
${detail}

Fix the listed entries in ${sidecar}/skeletons.json (the plan, not the code), re-run
node ${skCheck} ${sidecar}/skeletons.json until clean, then re-run this driver.`,

  AUTHOR: () => `## Step: expand skeletons via wf-design (one gated run; Sonnet workers)
Build the groups arg from skeletons.json coherenceGroup/waveOrder: array of WAVES, each wave an
array of BATCHES {id, agentType, kind: foundation|implement|stories, files:[{path,action}]}.
Wave 1 = foundation (one batch: types+schemas+mocks) [+ shared-atom batch only if a real
usedBy≥2 atom exists]; next wave = one implement batch PER coherence group (its components AND
their catalog entries); final wave = the living showcase entry as its own stories batch. Even a
single batch is [[{...}]]. Unsure → more waves (serial), never a fatter wave.

Invoke Workflow {scriptPath: "${wfDesign}", args: {stage: "author",
  specPath: "${specPath}", skeletonPath: "${sidecar}/skeletons.json", groups: <built above>,
  tokenPaths: [<from doctrine doc>], designDoctrinePath: "${doctrinePath}",
  agentMap: <config agentMap>, doctrinePaths: {<host agent name: .claude/agents/<name>.md>},
  gate: {command: "${gateCmd}"}, pipelineRulesPath: "${config.pipelineRules || ''}"}}
args = real JSON object; paths/ids/enums only — no prose.

Returns: complete → checkpoint-commit, then run:  spec-design-driver ${specPath} --mark author-green --run-id <runId>
blocked → resolve within the skeleton's intent (write the ruling to the on-disk plan: the
skeleton entry / tokenForks / token file / spec Decisions) or AskUserQuestion for a genuine
fork; then re-invoke the same Workflow with resumeFromRunId. Anything else (gate-exhausted /
out-of-scope) → read the failures, fix on disk (dispatch Sonnet), re-invoke. A green author is
"structural (skeleton-expanded) — NOT visually approved."`,

  VISUAL: () => `## Step: screenshot visual review (one round — raises the floor)
Run the host screenshot command: ${design.screenshot}
Scope: first pass renders everything this spec landed; any re-render covers ONLY changed
entries + the showcase. Read the images and critique for real — alignment, contrast, spacing
rhythm, empty/error/long-string states, showcase coherence. Issue correction notes and
dispatch Sonnet to apply them (you edit nothing), re-run the gate (${gateCmd || 'host gate'}),
checkpoint-commit when green. Then:  spec-design-driver ${specPath} --mark visual-done`,

  ITERATE: () => `## Step: human catalog loop (round ${(marks.rounds || 0) + 1}; cold between rounds by design)
Tell the user: run \`${design.command}\`, review the catalog entries (showcase first).
AskUserQuestion: Approve / Iterate (notes via Other). Dismissed → STOP (state is on disk).

Iterate round protocol:
- Append every ruling to ${logPath} (one line each: note → ruling → files touched). The log is
  the loop's memory — the next round's judge reads it instead of a warm session remembering.
- ONE warm Sonnet iteration worker: first round spawn it (it reads canon once); later rounds
  SendMessage to the SAME worker with the round's notes batched per owning surface. Micro-edit
  exception: a one-line change with exact old/new strings → apply directly via Edit.
- A note demanding a data-shape change, or contradicting a locked Decision / the doctrine, is
  not a tweak: AskUserQuestion (doctrine: local exception recorded in spec Decisions, or
  doctrine change with older surfaces recorded as a known gap). Apply the ruling to the plan
  (skeleton entry / tokenForks / token file / Decisions) and re-expand affected surfaces.
- Gate (${gateCmd || 'host gate'}) + checkpoint-commit per round; every round ends green, then:
  spec-design-driver ${specPath} --mark round-green
On Approve:  spec-design-driver ${specPath} --mark approved`,

  RECONCILE: () => `## Step: reconcile & promote (inline dispatches — no workflow boot)
1. Sonnet Agent (paths only): update the spec to approved reality — ONLY the UI section (final
   APIs + states), File Plan (landed files; CREATE rows stay listed), Contracts (shape changes),
   new Decisions rows for Phase-3 rulings. Never frontmatter/Goal/Rationale/ACs.
2. Haiku Agent structural re-read: every landed file in the File Plan; UI APIs match real
   props/states; edits nothing. Divergence → ONE Sonnet repair, re-verify; still divergent →
   surface to the user and STOP (cap 1).
3. Promote: generalizable taste rulings → the doctrine doc (keep it one page; prune as you
   promote); tokens stay in token files; one-offs stay in spec Decisions. Read ${logPath} for
   the rounds' rulings.
4. AFTER the re-read verifies clean and BEFORE the final commit: rm -rf ${sidecar}/ and any
   leftover scratchpad .dc.html (the session owns this rm; reconcile folded the plan into the spec).
5. Set designed: <today> in frontmatter (status stays hardened). Final checkpoint-commit.
6. Report: components/entries landed, reuse-gate hits, fork rulings, rounds, spec deltas,
   doctrine promotions, workflow token spend. Next: /spec:build ${specPath}`,

  DONE: () => `designed: ${designed} is set — the design stage is complete for this spec.
Next: /spec:build ${specPath}. (Re-design: confirm with the user, remove designed:, delete any
${sidecar}/ leftovers, re-invoke.)`,
}

const designFlagNote = (designFlag === 'false' && state !== 'DONE' && state !== 'BLOCKED')
  ? 'NOTE: frontmatter says design: false — confirm intent with the user before proceeding.\n'
  : ''
process.stdout.write(`[spec-design-driver] state: ${state}  spec: ${specPath}\n` +
  `(re-run this driver after completing the step; it verifies artifacts and prints the next one)\n` +
  designFlagNote + '\n' +
  STEPS[state]() + '\n')
process.exit(state === 'BLOCKED' ? 2 : 0)
