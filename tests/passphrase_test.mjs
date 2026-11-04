import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { EXTENSION_ROOT, startServer, launchBrowser, newExtensionContext, openPage } from './harness.mjs'

const FIFTEEN = 'Qz7!mapleRivers'
const SIXTEEN = 'Qz7!mapleRiverss'
const TWELVE = 'Qz7!mapleRiv'

let server
let browser
let page

before(async () => {
  server = await startServer(EXTENSION_ROOT)
  browser = await launchBrowser()
  const context = await newExtensionContext(browser)
  page = await openPage(context, server.url + '/popup.html')
})

after(async () => {
  await browser.close()
  await server.close()
})

async function problem(pass, noun) {
  return page.evaluate(async ([value, kind]) => (await import('/keypackage.js')).passphraseProblem(value, kind || undefined), [pass, noun || ''])
}

test('the test passphrases have the lengths they claim', () => {
  assert.equal(FIFTEEN.length, 15)
  assert.equal(SIXTEEN.length, 16)
  assert.equal(TWELVE.length, 12)
})

test('a key passphrase needs at least 16 characters', async () => {
  assert.equal(await problem(FIFTEEN), 'Use at least 16 characters.')
  assert.equal(await problem(SIXTEEN), null)
})

test('the master password still needs at least 12 characters', async () => {
  assert.equal(await problem(TWELVE, 'password'), null)
  assert.equal(await problem(TWELVE.slice(0, 11), 'password'), 'Use at least 12 characters.')
})

test('a key file made with a shorter passphrase before 0.9.4.3 still opens', async () => {
  const opened = await page.evaluate(async (pass) => {
    const keypackage = await import('/keypackage.js')
    const raw = crypto.getRandomValues(new Uint8Array(32))
    const masterKey = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
    const pkg = await keypackage.buildPackage(masterKey, pass, [0, 1, 2], ['rex', 'teddy', 'hobbit'], 'Old Key')
    const back = await keypackage.openPackage(pkg, pass, ['rex', 'teddy', 'hobbit'])
    const bytes = back instanceof Uint8Array ? back : new Uint8Array(await crypto.subtle.exportKey('raw', back))
    return Array.from(bytes).join(',') === Array.from(raw).join(',')
  }, 'Qz7!mapleRiv1')
  assert.equal(opened, true)
})

test('the passphrase pages raise no page errors', () => {
  assert.deepEqual(page.errors, [])
})
