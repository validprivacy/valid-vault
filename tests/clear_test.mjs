import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { EXTENSION_ROOT, startServer, launchBrowser, newExtensionContext, openPage, setUpPopup, seedLogins, openTab, settleDialogs, waitForText } from './harness.mjs'

let server
let browser
let context
const pages = []

async function manage() {
  const page = await openPage(context, server.url + '/manage.html')
  pages.push(page)
  return page
}

async function runClearVault(page) {
  await openTab(page, 'settings')
  await page.click('#btn-clear-vault')
  await settleDialogs(page)
  await page.waitForTimeout(1500)
  return page.textContent('#msg-settings')
}

async function mirrorKeys(page) {
  return page.evaluate(async () => Object.keys(await chrome.storage.local.get(null)).filter((k) => k.startsWith('vvMirror:')))
}

async function savedUsernames(page) {
  return page.evaluate(async () => {
    const passwords = await import('/passwords.js')
    const r = await passwords.getCredentials('site.com', await window.__testVaultKey())
    return r.success ? r.credentials.map((c) => c.username) : null
  })
}

async function popupView() {
  const popup = await openPage(context, server.url + '/popup.html')
  await popup.waitForTimeout(800)
  const view = await popup.evaluate(() => ['setup', 'locked', 'unlocked'].find((v) => { const el = document.getElementById('view-' + v); return el && !el.classList.contains('hidden') }) || '')
  await popup.close()
  return view
}

async function seedLink(page) {
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('ValidVaultLink', 1)
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('link')) request.result.createObjectStore('link') }
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction('link', 'readwrite')
      tx.objectStore('link').put({ handle: { name: 'test.vvault' }, name: 'test.vvault', linkedAt: Date.now() }, 'vaultFile')
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => reject(tx.error)
    }
    request.onerror = () => reject(request.error)
  }))
}

before(async () => {
  server = await startServer(EXTENSION_ROOT)
  browser = await launchBrowser()
  context = await newExtensionContext(browser)
  const popup = await setUpPopup(context, server.url)
  await seedLogins(popup)
  await popup.close()
})

after(async () => {
  await browser.close()
  await server.close()
})

test('a backup copy that cannot be removed stops Clear Vault and keeps the vault', async () => {
  const page = await manage()
  await page.evaluate(() => {
    const remove = chrome.storage.local.remove
    chrome.storage.local.remove = async (keys) => remove((Array.isArray(keys) ? keys : [keys]).filter((k) => !String(k).startsWith('vvMirror:')))
  })
  const message = await runClearVault(page)
  assert.match(message, /Clear Vault did not finish/)
  assert.doesNotMatch(message, /Vault cleared/)
  assert.deepEqual(await savedUsernames(page), ['alice'])
  assert.notEqual(await popupView(), 'setup')
  await page.close()
})

test('a Clear Vault that fails after the backup copy is removed keeps the vault and nothing comes back on its own', async () => {
  const page = await manage()
  await page.evaluate(() => {
    IDBObjectStore.prototype.clear = function () { throw new Error('disk failure') }
  })
  const message = await runClearVault(page)
  assert.match(message, /Clear Vault did not finish/)
  assert.deepEqual(await mirrorKeys(page), [])
  await page.close()
  const fresh = await manage()
  assert.deepEqual(await savedUsernames(fresh), ['alice'])
  assert.notEqual(await popupView(), 'setup')
  await fresh.close()
})

test('a vault data clear that fails partway rebuilds the backup copy on the next start', async () => {
  const page = await manage()
  const failed = await page.evaluate(async () => {
    const store = await import('/store.js')
    const clear = IDBObjectStore.prototype.clear
    IDBObjectStore.prototype.clear = function () { throw new Error('disk failure') }
    try {
      await store.clearVaultData()
      return false
    } catch (e) {
      return true
    } finally {
      IDBObjectStore.prototype.clear = clear
    }
  })
  assert.equal(failed, true)
  await page.close()
  const fresh = await manage()
  assert.deepEqual(await savedUsernames(fresh), ['alice'])
  const keys = await mirrorKeys(fresh)
  assert.ok(keys.some((k) => k.startsWith('vvMirror:passwords:')))
  assert.ok(keys.some((k) => k.startsWith('vvMirror:auth:')))
  await fresh.close()
})

test('a broken vault file link store does not block Clear Vault when no file is linked', async () => {
  const page = await manage()
  const result = await page.evaluate(async () => {
    const linked = await import('/linkedvault.js')
    const remove = IDBObjectStore.prototype.delete
    IDBObjectStore.prototype.delete = function () { throw new Error('link store failure') }
    try {
      await linked.clearLink()
      return 'resolved'
    } catch (e) {
      return 'rejected'
    } finally {
      IDBObjectStore.prototype.delete = remove
    }
  })
  assert.equal(result, 'resolved')
  await page.close()
})

test('a vault file link that cannot be removed stops Clear Vault and keeps the vault', async () => {
  const page = await manage()
  await seedLink(page)
  await page.evaluate(() => {
    const remove = IDBObjectStore.prototype.delete
    IDBObjectStore.prototype.delete = function (key) {
      if (this.transaction.db.name !== 'ValidVault') throw new Error('link store failure')
      return remove.call(this, key)
    }
  })
  const message = await runClearVault(page)
  assert.match(message, /Clear Vault did not finish/)
  assert.deepEqual(await savedUsernames(page), ['alice'])
  await page.close()
})

test('Clear Vault clears everything and nothing comes back after reopening', async () => {
  const page = await manage()
  const message = await runClearVault(page)
  assert.match(message, /Vault cleared/)
  assert.deepEqual(await mirrorKeys(page), [])
  assert.equal(await popupView(), 'setup')
  assert.equal(await popupView(), 'setup')
  const raw = await page.evaluate(async () => {
    const store = await import('/store.js')
    await store.openDB()
    return Object.keys(await chrome.storage.local.get(null)).filter((k) => k.startsWith('vvMirror:')).length
  })
  assert.equal(raw, 0)
})

test('Unlink reports a failure instead of claiming success', async () => {
  const popup = await setUpPopup(context, server.url)
  await popup.close()
  const page = await manage()
  await openTab(page, 'sync')
  await seedLink(page)
  const result = await page.evaluate(async () => {
    const linked = await import('/linkedvault.js')
    const remove = IDBObjectStore.prototype.delete
    IDBObjectStore.prototype.delete = function () { throw new Error('link store failure') }
    try {
      await linked.clearLink()
      return 'resolved'
    } catch (e) {
      return 'rejected'
    } finally {
      IDBObjectStore.prototype.delete = remove
    }
  })
  assert.equal(result, 'rejected')
  const linkedAfter = await page.evaluate(async () => !!(await (await import('/linkedvault.js')).getLink()))
  assert.equal(linkedAfter, true)
})

test('the clear pages raise no page errors', () => {
  assert.deepEqual(pages.flatMap((p) => p.errors), [])
})
