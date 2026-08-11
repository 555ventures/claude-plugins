#!/usr/bin/env node
'use strict'
// atomic.js — one shared tmp-file-then-rename primitive for every daemon module that persists
// state to disk. Before this (specs/20260810/05-service-bootstrap.md review), enroll.js's
// writeConfigAtomic, service.js's writeUnitAtomic, and bootstrap.js's inline pluginEnableStep
// write each hand-rolled the same tmp+rename mechanics with only the temp-file basename, dir
// mode, and file mode varying — three near-identical blocks the reviewer flagged (§ Review
// Checks "Duplication calibration").
//
// atomicWrite(targetPath, content, opts): mkdir the target's directory (recursive; `opts.dirMode`
// if given, matching enroll.js's 0o700 hub-config-dir precedent), write `content` to a same-dir
// temp file named `.<basename>.<pid>.<now>.tmp` (never a partial file visible under the real
// name), chmod'ing it via `opts.mode` when given (enroll.js's 0o600 credential precedent), then
// rename it onto `targetPath` (POSIX rename is atomic and the mode survives it). `opts.fsImpl`
// lets callers inject a fake fs (service.js/bootstrap.js's DI seam) — defaults to the real `fs`
// (enroll.js's own call sites never injected one).
//
// Deliberately does NOT: retry on a failed write/rename, validate `content`'s shape (callers
// stringify JSON themselves — this module takes a string/Buffer only), or own the mtime-guard
// sequencing bootstrap.js's D8 plugin-enable step performs — that stat-before-write race check
// stays at the call site; only the tmp+rename mechanics live here.
//
// Exit codes: n/a — library module; a failed mkdir/write/rename throws the underlying fs error
// verbatim and the caller decides how to render/wrap it.

const fs = require('fs')
const path = require('path')

function atomicWrite(targetPath, content, opts = {}) {
  const { fsImpl = fs, mode, dirMode } = opts
  const dir = path.dirname(targetPath)
  const mkdirOpts = dirMode === undefined ? { recursive: true } : { recursive: true, mode: dirMode }
  fsImpl.mkdirSync(dir, mkdirOpts)

  const tempPath = path.join(dir, `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.tmp`)
  if (mode === undefined) {
    fsImpl.writeFileSync(tempPath, content)
  } else {
    fsImpl.writeFileSync(tempPath, content, { mode })
  }
  fsImpl.renameSync(tempPath, targetPath)
}

module.exports = { atomicWrite }
