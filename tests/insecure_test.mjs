import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { EXTENSION_ROOT, PASSWORD, startServer, launchBrowser, newExtensionContext, openPage, setUpPopup } from './harness.mjs'

const V_TAG = 'div[title="Fill with Valid Vault"]'
const HOST = '127.0.0.1'

let server
let browser
let context
const pages = []

async function insecureSite() {
  const page = await context.newPage()
  page.errors = []
  page.on('pageerror', (e) => page.errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) page.errors.push(m.text()) })
  await page.addInitScript(() => { Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true }) })
  await page.goto(server.url + '/__fixture/login.html')
  await page.waitForTimeout(1300)
  pages.push(page)
  return page
}

async function secureSite() {
  const page = await openPage(context, server.url + '/__fixture/login.html')
  await page.waitForTimeout(800)
  pages.push(page)
  return page
}

async function openPicker(page) {
  await page.locator(V_TAG).first().click()
  await page.locator('.item', { hasText: 'nina' }).first().waitFor({ timeout: 10000 })
  await page.locator('.item', { hasText: 'nina' }).first().click()
  await page.waitForTimeout(800)
}

before(async () => {
  server = await startServer(EXTENSION_ROOT)
  browser = await launchBrowser()
  context = await newExtensionContext(browser, { openShadowRoots: true })
  const popup = await setUpPopup(context, server.url)
  await popup.evaluate(async (host) => {
    const passwords = await import('/passwords.js')
    await passwords.saveCredential(host, 'nina', 'nina-pw-8!', await window.__testVaultKey(), [], 'username')
  }, HOST)
  await popup.close()
})

after(async () => {
  await browser.close()
  await server.close()
})

test('the test page reports itself as not secure', async () => {
  const page = await insecureSite()
  assert.equal(await page.evaluate(() => window.isSecureContext), false)
})

test('a secure page fills without asking', async () => {
  const page = await secureSite()
  await openPicker(page)
  assert.equal(await page.inputValue('#u'), 'nina')
  assert.equal(await page.inputValue('#p'), 'nina-pw-8!')
})

test('on a page without https, picking a login asks before filling', async () => {
  const page = await insecureSite()
  await openPicker(page)
  assert.equal(await page.inputValue('#p'), '')
  assert.match(await page.locator('.empty').first().textContent(), /This page is not using https/)
  assert.equal(await page.locator('.item', { hasText: 'Fill anyway' }).count(), 1)
})

test('Fill anyway fills the login', async () => {
  const page = await insecureSite()
  await openPicker(page)
  await page.locator('.item', { hasText: 'Fill anyway' }).click()
  await page.waitForTimeout(800)
  assert.equal(await page.inputValue('#u'), 'nina')
  assert.equal(await page.inputValue('#p'), 'nina-pw-8!')
})

test('Cancel fills nothing', async () => {
  const page = await insecureSite()
  await openPicker(page)
  await page.locator('.item', { hasText: 'Cancel' }).click()
  await page.waitForTimeout(800)
  assert.equal(await page.inputValue('#u'), '')
  assert.equal(await page.inputValue('#p'), '')
})

test('locking while the warning is open fills nothing', async () => {
  const page = await insecureSite()
  await openPicker(page)
  const popup = await openPage(context, server.url + '/popup.html')
  await popup.click('#btn-lock')
  await popup.waitForSelector('#view-locked:not(.hidden)')
  await popup.close()
  await page.waitForTimeout(800)
  assert.equal(await page.locator('.item', { hasText: 'Fill anyway' }).count(), 0)
  assert.equal(await page.inputValue('#p'), '')
  const unlock = await openPage(context, server.url + '/popup.html')
  await unlock.fill('#input-password', PASSWORD)
  await unlock.click('#btn-password')
  await unlock.waitForSelector('#view-unlocked:not(.hidden)')
  await unlock.close()
})

test('the insecure pages raise no page errors', () => {
  assert.deepEqual(pages.flatMap((p) => p.errors), [])
})
