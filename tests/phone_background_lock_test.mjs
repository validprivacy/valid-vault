import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { REPO_ROOT, PASSWORD, startServer, launchBrowser } from './harness.mjs'
import { newPhone, visible, waitMessage, phoneTab, setUpWithPassword } from './phone_harness.mjs'

let server
let browser
const pages = []

async function phone() {
  const created = await newPhone(browser, server.url, { noBiometrics: true })
  pages.push(created.page)
  await setUpWithPassword(created)
  await phoneTab(created.page, 'settings')
  await created.page.fill('#input-autolock-timeout', '7200')
  await created.page.dispatchEvent('#input-autolock-timeout', 'change')
  await waitMessage(created.page, 'msg-settings', /Auto-lock set/)
  return created
}

async function setHidden(page, hidden) {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => value })
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (value ? 'hidden' : 'visible') })
    document.dispatchEvent(new Event('visibilitychange'))
  }, hidden)
}

async function skipAhead(page, ms) {
  await page.evaluate((amount) => {
    window.__realNow = window.__realNow || Date.now.bind(Date)
    window.__nowOffset = (window.__nowOffset || 0) + amount
    Date.now = () => window.__realNow() + window.__nowOffset
  }, ms)
}

async function locked(page) {
  await page.waitForTimeout(400)
  return visible(page, '#view-locked')
}

async function choose(page, value) {
  await page.selectOption('#select-background-lock', value)
  await waitMessage(page, 'msg-settings', /locks/)
}

before(async () => {
  server = await startServer(REPO_ROOT)
  browser = await launchBrowser()
})

after(async () => {
  await browser.close()
  await server.close()
})

test('the vault locks 30 seconds after leaving the app by default', async () => {
  const created = await phone()
  const { page } = created
  assert.equal(await page.inputValue('#select-background-lock'), '30')
  await setHidden(page, true)
  await skipAhead(page, 31000)
  await setHidden(page, false)
  assert.equal(await locked(page), true)
  await created.context.close()
})

test('coming back within the grace period keeps the vault unlocked', async () => {
  const created = await phone()
  const { page } = created
  await setHidden(page, true)
  await skipAhead(page, 10000)
  await setHidden(page, false)
  assert.equal(await locked(page), false)
  assert.equal(await visible(page, '#view-app'), true)
  await created.context.close()
})

test('Right away locks as soon as the app is left', async () => {
  const created = await phone()
  const { page } = created
  await choose(page, '0')
  await setHidden(page, true)
  assert.equal(await locked(page), true)
  await setHidden(page, false)
  await created.context.close()
})

test('Only after the idle timeout never locks on leaving', async () => {
  const created = await phone()
  const { page } = created
  await choose(page, '-1')
  await setHidden(page, true)
  await skipAhead(page, 600000)
  await setHidden(page, false)
  assert.equal(await locked(page), false)
  await created.context.close()
})

test('choosing a file does not count as leaving the app', async () => {
  const created = await phone()
  const { page } = created
  await choose(page, '0')
  await phoneTab(page, 'sync')
  const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 15000 }), page.click('#btn-import-key')])
  await setHidden(page, true)
  await skipAhead(page, 60000)
  await setHidden(page, false)
  assert.equal(await locked(page), false)
  await chooser.setFiles({ name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('not a key') })
  await waitMessage(page, 'msg-sync', /Could not read the file|Not a key|not a Valid Vault/i)
  assert.equal(await locked(page), false)
  await setHidden(page, true)
  assert.equal(await locked(page), true)
  await created.context.close()
})

test('the lock choice is kept after a restart', async () => {
  const created = await phone()
  const { page } = created
  await choose(page, '120')
  await page.reload()
  await page.waitForFunction(() => document.getElementById('view-loading').classList.contains('hidden'))
  await page.fill('#input-unlock-password', PASSWORD)
  await page.click('#btn-unlock-pw')
  await page.waitForSelector('#view-app:not(.hidden)')
  await phoneTab(page, 'settings')
  assert.equal(await page.inputValue('#select-background-lock'), '120')
  await created.context.close()
})

test('the background lock pages raise no page errors', () => {
  assert.deepEqual(pages.flatMap((p) => p.errors), [])
})
