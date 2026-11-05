import { test, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { EXTENSION_ROOT, startServer, launchBrowser, newExtensionContext, openPage, setUpPopup } from './harness.mjs'

let server
let browser
let context
const pages = []

async function site(name) {
  const page = await openPage(context, server.url + '/__fixture/' + name)
  await page.waitForTimeout(800)
  pages.push(page)
  return page
}

async function promptShowing(page) {
  return page.evaluate(() => {
    const host = document.getElementById('local-vault-save-host')
    return !!host && host.style.display !== 'none'
  })
}

async function fillSignup(page) {
  await page.fill('#e', 'dana@mail.com')
  await page.fill('#d', 'Dana')
  await page.fill('#u', 'dana')
  await page.fill('#p', 'dana-pw-5!')
}

async function openPrompt() {
  const page = await site('signup.html')
  await fillSignup(page)
  await page.click('#go')
  await page.waitForSelector('#sp-save', { timeout: 10000 })
  await page.waitForTimeout(600)
  assert.equal(await promptShowing(page), true)
  return page
}

before(async () => {
  server = await startServer(EXTENSION_ROOT)
  browser = await launchBrowser()
  context = await newExtensionContext(browser, { openShadowRoots: true })
  const popup = await setUpPopup(context, server.url)
  await popup.close()
})

afterEach(async () => {
  for (const page of pages) {
    if (page.isClosed()) continue
    if (await promptShowing(page)) await page.click('#sp-cancel')
    await page.waitForTimeout(300)
    await page.evaluate(async () => {
      const all = await chrome.storage.session.get(null)
      const stale = Object.keys(all || {}).filter((k) => k.startsWith('pendingSave_'))
      if (stale.length) await chrome.storage.session.remove(stale)
    })
    await page.close()
  }
})

after(async () => {
  await browser.close()
  await server.close()
})

test('opening a dropdown that announces a list does not ask to save', async () => {
  const page = await site('signup.html')
  await fillSignup(page)
  await page.click('#month')
  await page.waitForTimeout(1200)
  assert.equal(await promptShowing(page), false)
})

test('a button inside a combobox does not ask to save', async () => {
  const page = await site('signup.html')
  await fillSignup(page)
  await page.click('#day')
  await page.waitForTimeout(1200)
  assert.equal(await promptShowing(page), false)
})

test('a plain non-submit button in a form with a submit button does not ask to save', async () => {
  const page = await site('signup.html')
  await fillSignup(page)
  await page.click('#year')
  await page.waitForTimeout(1200)
  assert.equal(await promptShowing(page), false)
})

test('the form submit button still asks to save after the dropdowns are used', async () => {
  const page = await site('signup.html')
  await fillSignup(page)
  await page.click('#month')
  await page.click('#day')
  await page.click('#year')
  await page.click('#go')
  await page.waitForSelector('#sp-save', { timeout: 10000 })
  assert.match(await page.textContent('#sp-user'), /dana/)
})

test('a formless page with an empty required field does not ask to save until it is filled', async () => {
  const page = await site('formless-required.html')
  await page.fill('#u', 'eli')
  await page.fill('#p', 'eli-pw-6!')
  await page.click('#pick')
  await page.waitForTimeout(1000)
  assert.equal(await promptShowing(page), false)
  await page.click('#go')
  await page.waitForTimeout(1200)
  assert.equal(await promptShowing(page), false)
  await page.fill('#code', 'ABC123')
  await page.click('#go')
  await page.waitForSelector('#sp-save', { timeout: 10000 })
  assert.match(await page.textContent('#sp-user'), /eli/)
})

test('clicking outside the save prompt closes it', async () => {
  const page = await openPrompt()
  await page.mouse.click(10, 10)
  await page.waitForTimeout(500)
  assert.equal(await promptShowing(page), false)
})

test('clicking inside the save prompt card keeps it open', async () => {
  const page = await openPrompt()
  await page.click('#sp-title')
  await page.waitForTimeout(500)
  assert.equal(await promptShowing(page), true)
})

test('pressing Escape closes the save prompt', async () => {
  const page = await openPrompt()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  assert.equal(await promptShowing(page), false)
})

test('a prompt closed by clicking outside saves nothing', async () => {
  const page = await openPrompt()
  await page.mouse.click(10, 10)
  await page.waitForTimeout(800)
  const saved = await page.evaluate(async () => {
    const passwords = await import('/passwords.js')
    const r = await passwords.getCredentials('127.0.0.1', await window.__testVaultKey())
    return r.success ? r.credentials.map((c) => c.username) : null
  })
  assert.deepEqual(saved, [])
})

test('the signup pages raise no page errors', () => {
  assert.deepEqual(pages.flatMap((p) => p.errors), [])
})
