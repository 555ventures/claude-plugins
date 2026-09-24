// usage: node structsnap.mjs <url> <out.json>
import { chromium } from '/Users/jj/Projects/salon-os-spike-structdiff/node_modules/@playwright/test/index.mjs'
import { writeFileSync } from 'node:fs'

const [url, out] = process.argv.slice(2)
const PROPS = ['padding-top','padding-right','padding-bottom','padding-left','margin-top','margin-right','margin-bottom','margin-left','row-gap','column-gap','font-size','font-weight','line-height','color','background-color','border-top-left-radius','border-top-right-radius','border-bottom-left-radius','border-bottom-right-radius','border-top-color','border-right-color','border-bottom-color','border-left-color','display','flex-direction','align-items','justify-content']
const t0 = Date.now()
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, reducedMotion: 'reduce', timezoneId: 'Asia/Tokyo', locale: 'ja-JP' })
await page.goto(url, { waitUntil: 'load', timeout: 120000 })
await page.waitForSelector('#storybook-root > *', { timeout: 120000 })
await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' })
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(150)
const snap = await page.evaluate((PROPS) => {
  const root = document.querySelector('#storybook-root') || document.body
  const rows = []
  const walk = (el, path) => {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') return
    const r = el.getBoundingClientRect()
    const styles = {}
    for (const p of PROPS) styles[p] = cs.getPropertyValue(p)
    rows.push({ path, tag: el.tagName.toLowerCase(), testid: el.getAttribute('data-testid') || undefined,
      box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], styles })
    const counts = {}
    for (const c of el.children) {
      const t = c.tagName.toLowerCase(); counts[t] = (counts[t] || 0) + 1
      walk(c, `${path}>${t}[${counts[t] - 1}]`)
    }
  }
  walk(root, 'root')
  return rows
}, PROPS)
await browser.close()
writeFileSync(out, JSON.stringify(snap, null, 1))
console.log(`${out}: ${snap.length} elements, ${Date.now() - t0}ms`)
