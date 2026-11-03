import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { EXTENSION_ROOT, PASSWORD, startServer, launchBrowser, newExtensionContext, openPage, setUpPopup } from './harness.mjs'

const V_TAG = 'div[title="Fill with Valid Vault"]'
const HOST = '127.0.0.1'

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

async function unlockFromPopup() {
  const popup = await openPage(context, server.url + '/popup.html')
  await popup.fill('#input-password', PASSWORD)
  await popup.click('#btn-password')
  await popup.waitForSelector('#view-unlocked:not(.hidden)')
  await popup.close()
}

async function lockFromPopup() {
  const popup = await openPage(context, server.url + '/popup.html')
  await popup.click('#btn-lock')
  await popup.waitForSelector('#view-locked:not(.hidden)')
  await popup.close()
}

async function openLoginPicker(page) {
  await page.locator(V_TAG).first().click()
  await page.locator('.item', { hasText: 'zed' }).first().waitFor({ timeout: 10000 })
}

async function ensureUnlocked(page) {
  const state = await page.evaluate(() => chrome.runtime.sendMessage({ action: 'sessionState' }))
  if (!state || !state.unlocked) await unlockFromPopup()
}

async function lockDuringDecrypt(page, request) {
  await ensureUnlocked(page)
  return page.evaluate(async (message) => {
    const decrypt = crypto.subtle.decrypt.bind(crypto.subtle)
    let locked = false
    crypto.subtle.decrypt = async (...args) => {
      if (!locked) {
        locked = true
        await chrome.storage.session.remove('masterKeyBytes')
      }
      return decrypt(...args)
    }
    try {
      return await chrome.runtime.sendMessage(message)
    } finally {
      crypto.subtle.decrypt = decrypt
    }
  }, request)
}

before(async () => {
  server = await startServer(EXTENSION_ROOT)
  browser = await launchBrowser()
  context = await newExtensionContext(browser, { openShadowRoots: true })
  await setUpPopup(context, server.url)
  const page = await site('login.html')
  await page.evaluate(async (host) => {
    const passwords = await import('/passwords.js')
    const personalinfo = await import('/personalinfo.js')
    const key = await window.__testVaultKey()
    await passwords.saveCredential(host, 'zed', 'zed-pw-7!', key, [], 'username')
    const profile = personalinfo.emptyProfile()
    personalinfo.addEntry(profile, 'emails', 'zed@mail.com')
    await personalinfo.saveProfile(profile, key)
  }, HOST)
})

after(async () => {
  await browser.close()
  await server.close()
})

test('an unlocked picker still fills a login', async () => {
  const page = await site('login.html')
  await openLoginPicker(page)
  await page.locator('.item', { hasText: 'zed' }).first().click()
  await page.waitForTimeout(800)
  assert.equal(await page.inputValue('#u'), 'zed')
  assert.equal(await page.inputValue('#p'), 'zed-pw-7!')
})

test('locking closes an open login picker and clears its entries', async () => {
  const page = await site('login.html')
  await openLoginPicker(page)
  await lockFromPopup()
  await page.waitForTimeout(800)
  assert.equal(await page.locator('.item', { hasText: 'zed' }).count(), 0)
  await unlockFromPopup()
})

test('a picker entry clicked after a silent lock fills nothing', async () => {
  for (const open of pages) if (!open.isClosed()) await open.close()
  const page = await site('login.html')
  await openLoginPicker(page)
  await page.evaluate(() => {
    const session = JSON.parse(localStorage.getItem('__chrome_session') || '{}')
    delete session.masterKeyBytes
    localStorage.setItem('__chrome_session', JSON.stringify(session))
  })
  await page.locator('.item', { hasText: 'zed' }).first().click()
  await page.waitForTimeout(800)
  assert.equal(await page.inputValue('#u'), '')
  assert.equal(await page.inputValue('#p'), '')
  assert.equal(await page.locator('.item', { hasText: 'zed' }).count(), 0)
  assert.equal(await page.locator('.empty', { hasText: 'Vault is locked. Nothing was filled.' }).count(), 1)
  await unlockFromPopup()
})

test('a lock and unlock during a decrypt still returns locked', async () => {
  const page = await site('login.html')
  await ensureUnlocked(page)
  const result = await page.evaluate(async (host) => {
    const decrypt = crypto.subtle.decrypt.bind(crypto.subtle)
    let cycled = false
    crypto.subtle.decrypt = async (...args) => {
      if (!cycled) {
        cycled = true
        const stored = await chrome.storage.session.get('masterKeyBytes')
        await chrome.storage.session.remove('masterKeyBytes')
        await chrome.storage.session.set({ masterKeyBytes: stored.masterKeyBytes })
      }
      return decrypt(...args)
    }
    try {
      return await chrome.runtime.sendMessage({ action: 'getCredentialsForDomain', domain: host })
    } finally {
      crypto.subtle.decrypt = decrypt
    }
  }, HOST)
  assert.equal(result.locked, true)
  assert.deepEqual(result.credentials, [])
})

test('a picker throws away logins that arrive after the lock signal', async () => {
  const page = await site('login.html')
  await ensureUnlocked(page)
  await page.evaluate(() => {
    const send = chrome.runtime.sendMessage
    chrome.runtime.sendMessage = async (message) => {
      const response = await send(message)
      if (message && message.action === 'getCredentialsForDomain') await chrome.storage.local.set({ vaultLockedAt: Date.now() })
      return response
    }
  })
  await page.locator(V_TAG).first().click()
  await page.waitForTimeout(1500)
  assert.equal(await page.locator('.item', { hasText: 'zed' }).count(), 0)
  assert.equal(await page.locator('.empty', { hasText: 'Vault is locked' }).count(), 1)
})

test('a login decrypt that finishes after a lock returns locked', async () => {
  const page = await site('login.html')
  const result = await lockDuringDecrypt(page, { action: 'getCredentialsForDomain', domain: HOST })
  assert.equal(result.locked, true)
  assert.deepEqual(result.credentials, [])
  await unlockFromPopup()
})

test('a related logins decrypt that finishes after a lock returns locked', async () => {
  const page = await site('login.html')
  const result = await lockDuringDecrypt(page, { action: 'getRelatedCredentials', domain: HOST })
  assert.equal(result.locked, true)
  assert.deepEqual(result.groups, [])
  await unlockFromPopup()
})

test('a Personal Info read that finishes after a lock returns locked', async () => {
  const page = await site('login.html')
  const unlocked = await page.evaluate(() => chrome.runtime.sendMessage({ action: 'getPersonalInfoAllEmails' }))
  assert.deepEqual(unlocked.emails, ['zed@mail.com'])
  const result = await lockDuringDecrypt(page, { action: 'getPersonalInfoAllEmails' })
  assert.equal(result.locked, true)
  assert.deepEqual(result.emails, [])
  await unlockFromPopup()
})

test('a 2FA code read that finishes after a lock returns locked', async () => {
  const page = await site('login.html')
  const result = await lockDuringDecrypt(page, { action: 'getTotpCodes' })
  assert.equal(result.locked, true)
  assert.deepEqual(result.codes, [])
  await unlockFromPopup()
})

test('the session state check reports lock and unlock', async () => {
  const page = await site('login.html')
  assert.deepEqual(await page.evaluate(() => chrome.runtime.sendMessage({ action: 'sessionState' })), { unlocked: true })
  await lockFromPopup()
  assert.deepEqual(await page.evaluate(() => chrome.runtime.sendMessage({ action: 'sessionState' })), { unlocked: false })
  await unlockFromPopup()
  assert.deepEqual(await page.evaluate(() => chrome.runtime.sendMessage({ action: 'sessionState' })), { unlocked: true })
})

test('the picker fills again after unlocking', async () => {
  const page = await site('login.html')
  await openLoginPicker(page)
  await page.locator('.item', { hasText: 'zed' }).first().click()
  await page.waitForTimeout(800)
  assert.equal(await page.inputValue('#p'), 'zed-pw-7!')
})

test('restoring a previous password while locked says nothing was changed', async () => {
  const page = await site('login.html')
  await ensureUnlocked(page)
  await page.evaluate(async (host) => {
    const passwords = await import('/passwords.js')
    await passwords.saveCredential(host, 'zed', 'zed-pw-9!', await window.__testVaultKey(), [], 'username')
  }, HOST)
  await page.locator(V_TAG).first().click()
  const previous = page.locator('.item', { hasText: 'replaced' }).first()
  await previous.waitFor({ timeout: 10000 })
  await previous.click()
  const restore = page.locator('.item', { hasText: 'Make this the current password again' })
  await restore.waitFor({ timeout: 10000 })
  assert.equal(await page.inputValue('#p'), 'zed-pw-7!')
  await page.evaluate(async () => { await chrome.storage.session.remove('masterKeyBytes') })
  await page.waitForTimeout(500)
  await restore.click()
  await page.locator('.empty', { hasText: 'nothing was changed' }).waitFor({ timeout: 10000 })
  await unlockFromPopup()
  const current = await page.evaluate(async (host) => {
    const passwords = await import('/passwords.js')
    const r = await passwords.getCredentials(host, await window.__testVaultKey())
    return r.credentials.find((c) => c.username === 'zed').password
  }, HOST)
  assert.equal(current, 'zed-pw-9!')
})

test('the revocation pages raise no page errors', () => {
  assert.deepEqual(pages.flatMap((p) => p.errors), [])
})
