import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { REPO_ROOT, launchBrowser } from './harness.mjs'

const ASSETS = path.join(REPO_ROOT, 'android/app/src/main/assets/browser')
const START_URL = 'https://start.test/'
const JAVA = fs.readFileSync(path.join(REPO_ROOT, 'android/app/src/main/java/com/valid/vault/BrowserScripts.java'), 'utf8')

function javaString(name) {
  const body = JAVA.match(new RegExp('String ' + name + ' =([\\s\\S]*?);\\n'))[1]
  return [...body.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\"/g, '"')).join('')
}

const HTML = javaString('START_HEAD')
  + fs.readFileSync(path.join(ASSETS, 'backgrounds.js'), 'utf8') + javaString('START_MIDDLE')
  + fs.readFileSync(path.join(ASSETS, 'paint.js'), 'utf8') + javaString('START_DRIVER')
  + fs.readFileSync(path.join(ASSETS, 'start.js'), 'utf8') + javaString('START_TAIL')

let browser

before(async () => { browser = await launchBrowser() })
after(async () => { await browser.close() })

async function openStart() {
  const page = await browser.newPage({ viewport: { width: 360, height: 640 } })
  page.errors = []
  page.on('pageerror', (e) => page.errors.push(e.message))
  await page.route(START_URL, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: HTML }))
  await page.goto(START_URL)
  return page
}

async function painted(page, seed) {
  await page.waitForFunction(() => paintedKey !== null, null, { timeout: 30000 })
  return page.evaluate(async () => {
    const id = Math.floor(Math.random() * 1e9)
    exportStart(id)
    for (let i = 0; i < 300; i++) {
      const result = takeExport(id)
      if (result) return result.error ? null : result.data.length
      await new Promise((r) => setTimeout(r, 50))
    }
    return null
  })
}

test('the start page paints in its background worker', async () => {
  const page = await openStart()
  assert.equal(await page.evaluate(() => worker !== null), true)
  assert.equal(await page.evaluate(() => paintStart(5, 'day')), 'worker')
  assert.ok(await painted(page) > 1000)
  assert.deepEqual(page.errors, [])
  await page.close()
})

test('coming back to a start page paints its background again', async () => {
  const page = await openStart()
  await page.evaluate(() => paintStart(5, 'day'))
  await page.waitForFunction(() => paintedKey !== null)
  assert.equal(await page.evaluate(() => paintStart(5, 'day')), 'same')
  const first = await page.evaluate(() => paintedKey)
  assert.equal(await page.evaluate(() => paintStart(5, 'day', true)), 'worker')
  await page.waitForFunction((before) => paintedKey !== before, first)
  assert.ok(await painted(page) > 1000)
  assert.deepEqual(page.errors, [])
  await page.close()
})

test('a background worker that stops answering is replaced, so the page is never left blank', async () => {
  const page = await openStart()
  await page.evaluate(() => paintStart(5, 'day'))
  await page.waitForFunction(() => paintedKey !== null)
  await page.evaluate(() => { worker.onmessage = null; worker.onerror = null; worker.terminate() })
  assert.equal(await page.evaluate(() => paintStart(5, 'day', true)), 'worker')
  await page.waitForFunction(() => worker === null, null, { timeout: 15000 })
  assert.match(await page.evaluate(() => paintedKey), /^5:day:/)
  assert.ok(await painted(page) > 1000)
  assert.deepEqual(page.errors, [])
  await page.close()
})
