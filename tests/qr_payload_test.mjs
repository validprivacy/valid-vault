import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { EXTENSION_ROOT, REPO_ROOT, PASSWORD, KEY_PROTECTION, KEY_ANSWERS, startServer, launchBrowser, newExtensionContext, openPage, setUpPopup, openTab, fillDialog, download } from './harness.mjs'
import { newPhone, phoneTab, pickFile } from './phone_harness.mjs'

const SEED_PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const BOOKMARK_COUNT = 40

let extensionServer
let repoServer
let browser
let payload
let keyFile

before(async () => {
  extensionServer = await startServer(EXTENSION_ROOT)
  repoServer = await startServer(REPO_ROOT)
  browser = await launchBrowser()
  const context = await newExtensionContext(browser)
  const popup = await setUpPopup(context, extensionServer.url)
  await popup.evaluate(async ([count, phrase]) => {
    const key = await window.__testVaultKey()
    const passwords = await import('/passwords.js')
    await passwords.ensureVault(key)
    await passwords.saveCredential('site.com', 'alice', 'alice-pw-1!', key, [], 'username')
    const bookmarks = await import('/bookmarks.js')
    for (let i = 0; i < count; i++) await bookmarks.saveBookmark('https://site' + i + '.example.com/', 'Site ' + i, key)
    const wallets = await import('/wallets.js')
    await wallets.addAccount({ wallet: 'Main', words: phrase.split(' ') }, key)
  }, [BOOKMARK_COUNT, SEED_PHRASE])
  const manage = await openPage(context, extensionServer.url + '/manage.html')
  await openTab(manage, 'sync')
  await manage.click('#btn-export-key')
  await fillDialog(manage, [PASSWORD])
  keyFile = await download(manage, async () => { await fillDialog(manage, KEY_PROTECTION) })
  payload = await manage.evaluate(async () => {
    const vaultFile = await import('/vaultfile.js')
    return JSON.stringify(vaultFile.payloadFromBundle(await vaultFile.buildBundle()))
  })
})

after(async () => {
  await browser.close()
  await extensionServer.close()
  await repoServer.close()
})

test('the Share Vault payload carries logins, bookmarks, and crypto wallets, all encrypted', () => {
  const data = JSON.parse(payload)
  assert.equal(data.kind, 'vault')
  assert.ok(data.vault && data.bookmarks && data.wallets)
  assert.doesNotMatch(payload, /alice-pw-1|abandon|site0\.example/)
})

test('a phone set up from the same key merges every section from the payload', async () => {
  const phone = await newPhone(browser, repoServer.url, { noBiometrics: true })
  const { page } = phone
  await pickFile(page, () => page.click('#btn-setup-file-key'), keyFile)
  await fillDialog(page, KEY_ANSWERS)
  await fillDialog(page, [PASSWORD, PASSWORD])
  await page.waitForSelector('#view-app:not(.hidden)')
  if (await page.locator('.wv-dialog-overlay').count()) await page.locator('.wv-dialog-overlay .wv-dialog-actions button').first().click()
  const summary = await page.evaluate(async ([text, password]) => {
    const auth = await import('/extension/auth.js')
    const vaultFile = await import('/extension/vaultfile.js')
    const unlocked = await auth.authenticatePassword(password)
    return vaultFile.describeMerge(await vaultFile.mergeBundle(vaultFile.bundleFromPayload(JSON.parse(text)), unlocked.masterKey))
  }, [payload, PASSWORD])
  assert.match(summary, /logins/)
  assert.match(summary, /bookmarks/)
  assert.match(summary, /crypto wallets/)
  await page.reload()
  await page.waitForTimeout(800)
  await page.fill('#input-unlock-password', PASSWORD)
  await page.click('#btn-unlock-pw')
  await page.waitForSelector('#view-app:not(.hidden)')
  await phoneTab(page, 'bookmarks')
  await page.waitForTimeout(500)
  assert.equal(await page.locator('.bm-title').count(), BOOKMARK_COUNT)
  await phoneTab(page, 'wallets')
  await page.click('#wallets-content .wv-gate button')
  await fillDialog(page, [PASSWORD])
  await page.waitForTimeout(400)
  assert.deepEqual(await page.locator('.wv-wallet-name').allTextContents(), ['Main'])
  assert.deepEqual(page.errors, [])
  await phone.context.close()
})
