'use strict'
// lib/client-capture.js — captureScreen({ port, label, state, viewport, out }) → Promise<{ hash }>
// specs/20260907/10-client-review.md D5, AC-20260907-10-8. Screenshots a served mock through the
// same loopback URL form and viewport the look command already uses (a `/mocks/<label>.html`
// path, `?clean`, an optional `&state=<s>`), then sha256-hexes the written PNG — the one
// comparable before/after signal D6/D7 close a client note on.
//
// Called from INSIDE design-atlas.js's own serving process — a client's POST is the raise, so the
// capture must run in the same process that is still answering that very request. This is why the
// child process is always started with the async `spawn` and never `spawnSync`: a synchronous
// wait here would block the process's single event loop for the child's whole lifetime, and the
// child's own screenshot request against this same server could then never be serviced —
// deadlock (gotcha class: in-process fixture under spawnSync, specs/20260825/03).
//
// Does NOT: know about notes.json, design/mocks/captures/ file placement, or before/after
// comparison — the caller (design-atlas.js's client route, mocks-driver.js's `notes address
// --port`) owns every filesystem decision beyond the one PNG this function is told to write.
//
// Exit codes: none — this is a library, not an executable.

const { spawn } = require('child_process')
const crypto = require('crypto')
const fs = require('fs')

function captureScreen({ port, label, state, viewport, out }) {
  return new Promise((resolve, reject) => {
    const vp = viewport || { width: 1280, height: 800 }
    const url = 'http://127.0.0.1:' + port + '/mocks/' + label + '.html?clean' +
      (state ? '&state=' + state : '')
    const args = ['--no-install', 'playwright', 'screenshot',
      '--viewport-size=' + (vp.width | 0) + ',' + (vp.height | 0), url, out]
    let child
    try {
      child = spawn('npx', args)
    } catch (e) {
      reject(new Error('could not spawn npx (' + e.message + ') — run `npx playwright install chromium`'))
      return
    }
    let stderrBuf = ''
    if (child.stderr) child.stderr.on('data', (c) => { stderrBuf += c.toString('utf8') })
    child.on('error', (e) => {
      reject(new Error('npx playwright screenshot failed to start (' + e.message + ') — run `npx playwright install chromium`'))
    })
    child.on('close', (code) => {
      if (code !== 0 || !fs.existsSync(out)) {
        reject(new Error('npx playwright screenshot of ' + url + ' failed (exit ' + code + ') — run `npx playwright install chromium`' +
          (stderrBuf.trim() ? ': ' + stderrBuf.trim() : '')))
        return
      }
      let hash
      try {
        hash = crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex')
      } catch (e) {
        reject(new Error('could not read captured screenshot ' + out + ': ' + e.message))
        return
      }
      resolve({ hash })
    })
  })
}

module.exports = { captureScreen }
