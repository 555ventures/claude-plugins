#!/usr/bin/env node
'use strict'
// bootstrap.js — collapse per-machine provisioning to one pasted command
// (specs/20260810/05-service-bootstrap.md D7/D8). A thin composition over real subcommands,
// never a monolith: enroll-step -> plugin-enable -> service -> doctor. The first hard failure
// propagates VERBATIM (that step's own thrown error, never wrapped or swallowed) so fleet
// debugging at 2am is `doctor` -> the one failing line -> its remedy, never "re-run the whole
// bootstrap and hope". Every step is individually re-runnable.
//
// runBootstrap({args, deps}) — args: {hubUrl, code, reposRoot, machineName, force}. deps
//   (Contracts underspecifies this beyond "injected enroll/discover/service/doctor fns" — the
//   shape below is this module's own DI seam, § Test Rules mode 4):
//     enroll(opts)   — opts mirrors enroll.js's enroll() params; defaults to the real enroll()
//     discover(opts) — opts = {reposRoot, fsImpl}; defaults to the real discoverRepos()
//     service()      — the whole install-or-darwin-print step; defaults to a closure over
//                       installService() + the D1 platform check
//     doctor()       — defaults to a closure over runDoctor()
//     homedir/fsImpl/platform/execImpl/fetchImpl/log/checkoutRoot — environment seams; each
//       defaults to the real thing (os.homedir(), real fs, process.platform, undefined,
//       global fetch, console.log, this checkout's root).
//   The plugin-enable step (D8) is never injectable — it is plain local `fs` I/O against
//   `~/.claude/settings.json` with no external side effect to fake away.
//
// Enroll-step mechanism (D7, pinned): bootstrap checks hub.json existence itself BEFORE
// invoking `deps.enroll` — present and no --force means report `= already enrolled
// (<spokeId>)` and skip straight to plugin-enable, with NO EnrollError string-matching and NO
// network call; absent, or --force given, calls `deps.discover` (if --repos-root given) then
// `deps.enroll` with the discovered project names merged in (discovery-inside-enroll, same as
// `autopilot enroll --repos-root`'s CLI path). This exists because enroll's refusal is
// exit-2-with-message, not a machine-discriminated error — parsing that string to distinguish
// "already enrolled" from a real failure was the rejected design (refuter finding).
//
// Plugin-enable step (D8): merges extraKnownMarketplaces["555-tools"] and
// enabledPlugins["autopilot@555-tools"] into ~/.claude/settings.json, preserving every other
// top-level key and every other field already on the 555-tools entry (e.g. Claude Code's own
// `autoUpdate`). Already-set is a no-op — no write at all. A re-`stat` right before the write
// catches a settings.json mutated between read and write (accepted residual risk: a concurrent
// Claude Code write landing between the stat and the rename can still be lost — narrowed, not
// eliminated, by the no-op fast path and bootstrap's re-runnability).
//
// The returned object is self-describing (a `steps` log of {step, detail} plus the doctor
// result) so a caller that never injects `log` (e.g. these tests) can still assert on what
// happened by inspecting the return value alone.
//
// Deliberately does NOT: retry a failed step, parse a thrown step error's message to classify
// it, hand-edit .claude/settings.json's unrelated keys, or install a service on darwin (D1 —
// the default `service` dep prints the tmux line and reports success so doctor still runs).
//
// Exit codes: n/a — library module; BootstrapError.exitCode (and any propagated step error's
// own .exitCode/.exitCode-shaped field) carries the intended exit; autopilot/bin/autopilot
// owns rendering.

const fs = require('fs')
const os = require('os')
const path = require('path')

const { enroll } = require('./enroll')
const { discoverRepos } = require('./discover')
const { installService } = require('./service')
const { runDoctor } = require('./doctor')

class BootstrapError extends Error {
  constructor(message, exitCode) {
    super(message)
    this.exitCode = exitCode
  }
}

// D9's contract capability check (spec 01), performed here because the default `enroll` dep
// calls enroll() directly rather than going through bin/autopilot's `enroll` subcommand. Only
// invoked when no `deps.enroll` fake is supplied.
function loadContractVersion() {
  try {
    return require('../contract/constants.ts').CONTRACT_VERSION
  } catch (err) {
    throw new BootstrapError(
      `autopilot bootstrap: could not load the wire contract (${err.message}) — requires Node ` +
      `>= 22.18 (native TypeScript type stripping); upgrade Node`,
      2
    )
  }
}

async function enrollStep(args, ctx, steps) {
  const { homedir, fsImpl, log, enrollImpl, discoverImpl } = ctx
  const hubConfigPath = path.join(homedir, '.config', 'autopilot', 'hub.json')

  if (fsImpl.existsSync(hubConfigPath) && !args.force) {
    let existing
    try {
      existing = JSON.parse(fsImpl.readFileSync(hubConfigPath, 'utf8'))
    } catch (err) {
      throw new BootstrapError(
        `autopilot bootstrap: ${hubConfigPath} exists but is not valid JSON (${err.message}) — ` +
        `remove it or pass --force`,
        2
      )
    }
    const detail = `= already enrolled (${existing.spokeId})`
    steps.push({ step: 'enroll', detail })
    log(detail)
    return
  }

  let projects = []
  if (args.reposRoot) {
    try {
      const discovered = await discoverImpl({ reposRoot: args.reposRoot, fsImpl })
      projects = discovered.map((repo) => repo.name).sort()
    } catch (err) {
      throw new BootstrapError(err.message, 2)
    }
  }

  const result = await enrollImpl({
    hubUrl: args.hubUrl,
    code: args.code,
    machineName: args.machineName,
    projects,
    reposRoot: args.reposRoot,
    force: args.force,
  })
  const detail = `+ enrolled ${result.machineName} as spoke ${result.spokeId} (${result.projectCount} projects)`
  steps.push({ step: 'enroll', detail })
  log(detail)
}

// D8: preserve every unrelated top-level key and every other field already on the 555-tools
// entry; already-set is a no-op; a mtime change between read and the pre-write re-stat aborts
// rather than risking a lost concurrent write.
function pluginEnableStep(ctx, steps) {
  const { homedir, fsImpl, log, checkoutRoot } = ctx
  const settingsPath = path.join(homedir, '.claude', 'settings.json')

  let stat1, raw
  try {
    stat1 = fsImpl.statSync(settingsPath)
    raw = fsImpl.readFileSync(settingsPath, 'utf8')
  } catch (err) {
    throw new BootstrapError(
      `autopilot bootstrap: cannot read ${settingsPath} (${err.message}) — run \`claude\` once ` +
      `so Claude Code creates it, then re-run bootstrap`,
      2
    )
  }

  let settings
  try {
    settings = JSON.parse(raw)
  } catch (err) {
    throw new BootstrapError(
      `autopilot bootstrap: ${settingsPath} is not valid JSON (${err.message}) — fix it by hand, ` +
      `then re-run bootstrap`,
      2
    )
  }

  const marketEntry = settings.extraKnownMarketplaces && settings.extraKnownMarketplaces['555-tools']
  const marketOk = Boolean(
    marketEntry && marketEntry.source && marketEntry.source.source === 'directory' &&
    marketEntry.source.path === checkoutRoot
  )
  const pluginOk = Boolean(settings.enabledPlugins && settings.enabledPlugins['autopilot@555-tools'] === true)
  if (marketOk && pluginOk) {
    const detail = '= plugin already enabled'
    steps.push({ step: 'plugin-enable', detail })
    log(detail)
    return
  }

  const merged = {
    ...settings,
    extraKnownMarketplaces: {
      ...(settings.extraKnownMarketplaces || {}),
      '555-tools': { ...(marketEntry || {}), source: { source: 'directory', path: checkoutRoot } },
    },
    enabledPlugins: { ...(settings.enabledPlugins || {}), 'autopilot@555-tools': true },
  }

  let stat2
  try {
    stat2 = fsImpl.statSync(settingsPath)
  } catch (err) {
    throw new BootstrapError(`autopilot bootstrap: cannot re-stat ${settingsPath} (${err.message})`, 2)
  }
  if (stat2.mtimeMs !== stat1.mtimeMs) {
    throw new BootstrapError('autopilot bootstrap: settings.json changed underneath us — re-run bootstrap', 2)
  }

  const dir = path.dirname(settingsPath)
  const tempPath = path.join(dir, `.settings.json.${process.pid}.${Date.now()}.tmp`)
  fsImpl.writeFileSync(tempPath, JSON.stringify(merged, null, 2))
  fsImpl.renameSync(tempPath, settingsPath)
  const detail = '+ plugin enabled (autopilot@555-tools)'
  steps.push({ step: 'plugin-enable', detail })
  log(detail)
}

// The default `service` dep — D1's darwin refusal lives here (prints the tmux line and reports
// success so doctor still runs), D3's real install on linux.
function defaultServiceDep(ctx) {
  return async () => {
    const { platform, execImpl, fsImpl, log } = ctx
    if (platform !== 'linux') {
      log('⚠ darwin — run `autopilotd` in tmux (launchd support is a recorded deferral, brief 03)')
      return { ok: true, installed: false }
    }
    installService({ execImpl, fsImpl, platform, env: process.env })
    return { ok: true, installed: true }
  }
}

function defaultDoctorDep(ctx) {
  return () => {
    const { fsImpl, execImpl, fetchImpl, platform, homedir } = ctx
    return runDoctor({ fsImpl, execImpl, fetchImpl, platform, homedir })
  }
}

async function runBootstrap({ args, deps = {} }) {
  const homedir = deps.homedir || os.homedir()
  const fsImpl = deps.fsImpl || fs
  const platform = deps.platform || process.platform
  const execImpl = deps.execImpl
  const fetchImpl = deps.fetchImpl || fetch
  const log = deps.log || ((message) => console.log(message))
  const checkoutRoot = deps.checkoutRoot || path.resolve(__dirname, '..', '..')

  const ctx = { homedir, fsImpl, platform, execImpl, fetchImpl, log, checkoutRoot }

  const enrollImpl = deps.enroll || ((opts) => enroll({ ...opts, contractVersion: loadContractVersion(), fetchImpl }))
  const discoverImpl = deps.discover || ((opts) => discoverRepos(opts))
  const serviceImpl = deps.service || defaultServiceDep(ctx)
  const doctorImpl = deps.doctor || defaultDoctorDep(ctx)

  ctx.enrollImpl = enrollImpl
  ctx.discoverImpl = discoverImpl

  const steps = []

  // First hard failure at any step propagates verbatim — never caught/wrapped here.
  await enrollStep(args, ctx, steps)
  pluginEnableStep(ctx, steps)
  await serviceImpl()
  const doctorResult = await doctorImpl()
  for (const line of doctorResult.lines || []) {
    log(`${line.ok ? '✅' : '⚠'} ${line.name}: ${line.detail}`)
  }

  const manualStep = 'run `claude` once to log in — until then, lanes halt with the 🔑 line (spec 04 D9)'
  steps.push({ step: 'manual', detail: `👤 one manual step remains: ${manualStep}` })
  log(`👤 one manual step remains: ${manualStep}`)

  return { ok: doctorResult.ok, steps, doctor: doctorResult }
}

module.exports = { runBootstrap, BootstrapError }
