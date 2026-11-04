import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { REPO_ROOT, PASSWORD, startServer, launchBrowser, fillDialog } from './harness.mjs'
import { newPhone, visible, waitMessage, phoneTab, setUpWithPassword } from './phone_harness.mjs'

let server
let browser
const pages = []

async function phone(options = {}) {
  const created = await newPhone(browser, server.url, { noBiometrics: true, ...options })
  pages.push(created.page)
  return created
}

before(async () => {
  server = await startServer(REPO_ROOT)
  browser = await launchBrowser()
})

after(async () => {
  await browser.close()
  await server.close()
})

test('screenshots and app previews are blocked by default', async () => {
  const created = await phone()
  const { page } = created
  await setUpWithPassword(created)
  await phoneTab(page, 'settings')
  assert.equal(await visible(page, '#screenshot-setting'), true)
  assert.equal(await page.inputValue('#select-screenshots'), 'blocked')
  assert.deepEqual(await page.evaluate(() => window.__screenshotCalls), [])
  await created.context.close()
})

test('allowing screenshots saves the choice natively and it survives a restart', async () => {
  const created = await phone()
  const { page } = created
  await setUpWithPassword(created)
  await phoneTab(page, 'settings')
  await page.selectOption('#select-screenshots', 'allowed')
  await waitMessage(page, 'msg-settings', /Screenshots allowed/)
  assert.deepEqual(await page.evaluate(() => window.__screenshotCalls), [true])
  await page.reload()
  await page.waitForFunction(() => document.getElementById('view-loading').classList.contains('hidden'))
  assert.equal(await page.evaluate(() => localStorage.getItem('__screenshotsAllowed')), 'yes')
  await page.fill('#input-unlock-password', PASSWORD)
  await page.click('#btn-unlock-pw')
  await page.waitForSelector('#view-app:not(.hidden)')
  await phoneTab(page, 'settings')
  await page.waitForFunction(() => document.getElementById('select-screenshots').value === 'allowed')
  assert.equal(await page.inputValue('#select-screenshots'), 'allowed')
  await created.context.close()
})

test('blocking screenshots again clears the native setting', async () => {
  const created = await phone()
  const { page } = created
  await setUpWithPassword(created)
  await phoneTab(page, 'settings')
  await page.selectOption('#select-screenshots', 'allowed')
  await waitMessage(page, 'msg-settings', /Screenshots allowed/)
  await page.selectOption('#select-screenshots', 'blocked')
  await waitMessage(page, 'msg-settings', /Screenshots and app previews blocked/)
  assert.deepEqual(await page.evaluate(() => window.__screenshotCalls), [true, false])
  assert.equal(await page.evaluate(() => localStorage.getItem('__screenshotsAllowed')), null)
  await created.context.close()
})

test('a setting that cannot be saved reports an error and shows the real state', async () => {
  const created = await phone()
  const { page } = created
  await setUpWithPassword(created)
  await phoneTab(page, 'settings')
  await page.evaluate(() => localStorage.setItem('__screenshotFail', 'yes'))
  await page.selectOption('#select-screenshots', 'allowed')
  await waitMessage(page, 'msg-settings', /Could not save the screenshot setting/)
  await page.waitForFunction(() => document.getElementById('select-screenshots').value === 'blocked')
  assert.equal(await page.inputValue('#select-screenshots'), 'blocked')
  await created.context.close()
})

test('the setting is hidden where the native plugin is missing', async () => {
  const created = await phone()
  const { page } = created
  await page.evaluate(() => localStorage.setItem('__noScreenPrivacy', 'yes'))
  await page.reload()
  await page.waitForFunction(() => document.getElementById('view-loading').classList.contains('hidden'))
  await setUpWithPassword(created)
  await phoneTab(page, 'settings')
  assert.equal(await visible(page, '#screenshot-setting'), false)
  await created.context.close()
})

test('Clear Vault blocks screenshots again', async () => {
  const created = await phone()
  const { page } = created
  await setUpWithPassword(created)
  await phoneTab(page, 'settings')
  await page.selectOption('#select-screenshots', 'allowed')
  await waitMessage(page, 'msg-settings', /Screenshots allowed/)
  await page.click('#btn-clear-vault')
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(600)
    const open = await page.locator('.wv-dialog-overlay').count()
    if (!open) break
    const title = await page.locator('.wv-dialog-overlay .wv-dialog-title').last().textContent()
    if (/Unlock|password|Confirm it's you/i.test(title)) await fillDialog(page, [PASSWORD])
    else await fillDialog(page, [])
  }
  await waitMessage(page, 'msg-setup', /Vault cleared/)
  assert.equal(await page.evaluate(() => localStorage.getItem('__screenshotsAllowed')), null)
  assert.deepEqual(await page.evaluate(() => window.__screenshotCalls), [true, false])
  await created.context.close()
})

test('the screenshot pages raise no page errors', () => {
  assert.deepEqual(pages.flatMap((p) => p.errors), [])
})
