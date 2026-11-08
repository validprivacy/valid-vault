import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { EXTENSION_ROOT, startServer, launchBrowser, newExtensionContext, openPage, setUpPopup, seedLogins, waitForText } from './harness.mjs'

let server
let browser
let context

async function fresh(name = '/manage.html') {
  return openPage(context, server.url + name)
}

async function failMirrorWrites(page) {
  await page.evaluate(() => {
    const set = chrome.storage.local.set
    window.__restoreSet = () => { chrome.storage.local.set = set }
    chrome.storage.local.set = async (entries) => {
      if (Object.keys(entries).some((k) => k.startsWith('vvMirror:'))) throw new Error('storage failure')
      return set(entries)
    }
  })
}

async function saveLogin(page, username) {
  await page.evaluate(async (name) => {
    const passwords = await import('/passwords.js')
    await passwords.saveCredential('site.com', name, name + '-pw-9!', await window.__testVaultKey(), [], 'username')
  }, username)
}

async function usernames(page) {
  return page.evaluate(async () => {
    const passwords = await import('/passwords.js')
    const r = await passwords.getCredentials('site.com', await window.__testVaultKey())
    return r.success ? r.credentials.map((c) => c.username).sort() : null
  })
}

async function loseDatabase(page) {
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase('ValidVault')
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('blocked'))
  }))
}

async function closeAll() {
  if (!context) return
  for (const page of context.pages()) await page.close()
}

async function notices(page) {
  await page.waitForTimeout(600)
  return page.evaluate(() => {
    const box = document.getElementById('vault-notice')
    return box && !box.classList.contains('hidden') ? box.textContent : ''
  })
}

async function resetVault() {
  await closeAll()
  if (context) await context.close()
  context = await newExtensionContext(browser)
  const popup = await setUpPopup(context, server.url)
  await seedLogins(popup)
  await popup.close()
}

before(async () => {
  server = await startServer(EXTENSION_ROOT)
  browser = await launchBrowser()
})

after(async () => {
  await browser.close()
  await server.close()
})

test('a failed backup copy write is repaired by the next save in the same session', async () => {
  await resetVault()
  const page = await fresh()
  await failMirrorWrites(page)
  await saveLogin(page, 'carol')
  await page.evaluate(() => window.__restoreSet())
  await page.evaluate(async () => {
    const bookmarks = await import('/bookmarks.js')
    await bookmarks.saveBookmark('https://news.example.com/', 'News', await window.__testVaultKey())
  })
  await loseDatabase(page)
  await closeAll()
  const restored = await fresh()
  assert.deepEqual(await usernames(restored), ['alice', 'carol'])
  assert.deepEqual(await bookmarkTitles(restored), ['News'])
  assert.match(await notices(restored), /That copy had your latest changes/)
  assert.deepEqual(restored.errors, [])
})

test('a failed backup copy write is repaired on the next start', async () => {
  await resetVault()
  const page = await fresh()
  await failMirrorWrites(page)
  await saveLogin(page, 'carol')
  await closeAll()
  const next = await fresh()
  assert.deepEqual(await usernames(next), ['alice', 'carol'])
  await loseDatabase(next)
  await closeAll()
  const restored = await fresh()
  assert.deepEqual(await usernames(restored), ['alice', 'carol'])
  assert.match(await notices(restored), /That copy had your latest changes/)
})

test('a restore from an out of date backup copy says what is missing', async () => {
  await resetVault()
  const page = await fresh()
  await failMirrorWrites(page)
  await saveLogin(page, 'carol')
  await loseDatabase(page)
  await closeAll()
  const restored = await fresh()
  assert.deepEqual(await usernames(restored), ['alice'])
  const text = await notices(restored)
  assert.match(text, /restored it from the backup copy made/)
  assert.match(text, /Changes made after that are missing on this device/)
  const popup = await fresh('/popup.html')
  await popup.waitForSelector('#view-unlocked:not(.hidden)')
  assert.match(await notices(popup), /Changes made after that are missing/)
})

test('the restore notice clears after a sync', async () => {
  await resetVault()
  const page = await fresh()
  await failMirrorWrites(page)
  await saveLogin(page, 'carol')
  const backup = await page.evaluate(async () => (await import('/vaultfile.js')).buildBundle())
  await loseDatabase(page)
  await closeAll()
  const restored = await fresh()
  assert.match(await notices(restored), /missing/)
  const result = await restored.evaluate(async (bundle) => {
    const vaultFile = await import('/vaultfile.js')
    return vaultFile.mergeBundle(bundle, await window.__testVaultKey())
  }, backup)
  assert.equal(result.changed, true)
  assert.deepEqual(await usernames(restored), ['alice', 'carol'])
  await closeAll()
  assert.equal(await notices(await fresh()), '')
})

async function bundleThenClear(page) {
  return page.evaluate(async () => {
    const key = await window.__testVaultKey()
    const bookmarks = await import('/bookmarks.js')
    await bookmarks.saveBookmark('https://news.example.com/', 'News', key)
    const vaultFile = await import('/vaultfile.js')
    const bundle = await vaultFile.buildBundle()
    const store = await import('/store.js')
    await store.clearVaultData()
    return bundle
  })
}

async function mergeWithFailingStore(page, bundle, storeName) {
  return page.evaluate(async ([data, name]) => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === name) throw new Error('disk failure')
      return put.apply(this, args)
    }
    try {
      const vaultFile = await import('/vaultfile.js')
      await vaultFile.mergeBundle(data, await window.__testVaultKey())
      return 'merged'
    } catch (e) {
      return e.message
    } finally {
      IDBObjectStore.prototype.put = put
    }
  }, [bundle, storeName])
}

async function bookmarkTitles(page) {
  return page.evaluate(async () => {
    const bookmarks = await import('/bookmarks.js')
    const tree = await bookmarks.readTree(await window.__testVaultKey())
    return tree.items.filter((item) => !item.deleted).map((item) => item.title)
  })
}

test('a sync that stops partway says so, keeps the vault readable, and finishes when run again', async () => {
  await resetVault()
  const page = await fresh()
  const bundle = await bundleThenClear(page)
  const message = await mergeWithFailingStore(page, bundle, 'bookmarks')
  assert.match(message, /Sync stopped partway/)
  assert.deepEqual(await usernames(page), ['alice'])
  assert.deepEqual(await bookmarkTitles(page), [])
  await closeAll()
  const next = await fresh()
  assert.match(await notices(next), /The last sync on this device did not finish/)
  const again = await next.evaluate(async (data) => {
    const vaultFile = await import('/vaultfile.js')
    return vaultFile.describeMerge(await vaultFile.mergeBundle(data, await window.__testVaultKey()))
  }, bundle)
  assert.match(again, /bookmarks/)
  assert.deepEqual(await bookmarkTitles(next), ['News'])
  assert.deepEqual(await usernames(next), ['alice'])
  await closeAll()
  assert.equal(await notices(await fresh()), '')
})

test('a sync that fails before anything is written leaves no unfinished notice', async () => {
  await resetVault()
  const page = await fresh()
  const bundle = await bundleThenClear(page)
  const message = await mergeWithFailingStore(page, bundle, 'passwords')
  assert.doesNotMatch(message, /Sync stopped partway/)
  assert.notEqual(message, 'merged')
  await closeAll()
  assert.equal(await notices(await fresh()), '')
})
