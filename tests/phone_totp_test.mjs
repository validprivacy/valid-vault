import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { REPO_ROOT, PASSWORD, startServer, launchBrowser, fillDialog, dialogError } from './harness.mjs'
import { newPhone, waitMessage, setUpWithPassword, addLogin, revealAll } from './phone_harness.mjs'

const SECRET = 'JBSWY3DPEHPK3PXP'

let server
let browser

async function currentCodes(page) {
  return page.evaluate(async (s) => {
    const totp = await import('/extension/totp.js')
    const config = { secret: s, digits: 6, period: 30, algorithm: 'SHA1' }
    const now = Date.now()
    return [(await totp.generateCode(config, now)).code, (await totp.generateCode(config, now - 30000)).code]
  }, SECRET)
}

before(async () => {
  server = await startServer(REPO_ROOT)
  browser = await launchBrowser()
})

after(async () => {
  await browser.close()
  await server.close()
})

test('a 2FA code typed in on the phone shows the live code, and fills a code box through Android Autofill', async () => {
  const phone = await newPhone(browser, server.url, { noBiometrics: true })
  const { page } = phone
  await setUpWithPassword(phone)
  await addLogin(phone, 'example.com', 'lena', 'lena-pw-4!')
  await revealAll(phone)
  await page.locator('#credentials-list .totp-row button', { hasText: 'Type Key' }).click()
  await fillDialog(page, ['otpauth://hotp/Example?secret=' + SECRET])
  assert.match(await dialogError(page) || '', /time-based/)
  await fillDialog(page, ['jbsw y3dp ehpk 3pxp'])
  await waitMessage(page, 'msg-manage', /2FA code saved/)
  await revealAll(phone)
  await page.waitForFunction(() => /^\d{3} \d{3}$/.test((document.querySelector('#credentials-list .totp-code') || {}).textContent || ''))
  const shown = (await page.textContent('#credentials-list .totp-code')).replace(' ', '')
  assert.ok((await currentCodes(page)).includes(shown))
  assert.equal(await page.locator('#credentials-list .totp-row button', { hasText: 'Scan New QR' }).count(), 1)
  await phone.context.addInitScript(() => {
    window.__completed = null
    window.Capacitor.Plugins.AutofillBridge = {
      getRequest: async () => ({ mode: 'fill', domain: 'example.com', packageName: 'com.android.chrome', appLabel: 'Chrome', webDomain: 'example.com', isBrowser: true, appCert: '', hasUsername: false, hasPassword: false, hasOtp: true, browserReply: false, emailField: false }),
      complete: async (values) => { window.__completed = values },
      close: async () => { window.__closed = true }
    }
  })
  await page.reload()
  await fillDialog(page, [PASSWORD])
  await page.waitForFunction(() => window.__completed !== null, null, { timeout: 15000 })
  const completed = await page.evaluate(() => window.__completed)
  assert.equal(completed.username, '')
  assert.equal(completed.password, '')
  assert.ok((await currentCodes(page)).includes(completed.otp))
  assert.deepEqual(page.errors, [])
  await phone.context.close()
})

test('a login without a 2FA code is not offered for a code box', async () => {
  const phone = await newPhone(browser, server.url, { noBiometrics: true })
  const { page } = phone
  await setUpWithPassword(phone)
  await addLogin(phone, 'nocode.com', 'mike', 'mike-pw-5!')
  await phone.context.addInitScript(() => {
    window.__completed = null
    window.Capacitor.Plugins.AutofillBridge = {
      getRequest: async () => ({ mode: 'fill', domain: 'nocode.com', packageName: 'com.android.chrome', appLabel: 'Chrome', webDomain: 'nocode.com', isBrowser: true, appCert: '', hasUsername: false, hasPassword: false, hasOtp: true, browserReply: false, emailField: false }),
      complete: async (values) => { window.__completed = values },
      close: async () => {}
    }
  })
  await page.reload()
  await fillDialog(page, [PASSWORD])
  assert.match(await waitMessage(page, 'msg-fill', /2FA/), /no 2FA codes saved yet/)
  assert.equal(await page.evaluate(() => window.__completed), null)
  await phone.context.close()
})

test('a common master password is refused on the phone', async () => {
  const phone = await newPhone(browser, server.url, { noBiometrics: true })
  const { page } = phone
  await page.fill('#setup-password', 'Welcome2024!')
  await page.click('#btn-setup-pw')
  assert.match(await waitMessage(page, 'msg-setup', /too common/), /That password is too common/)
  await setUpWithPassword(phone)
  await phone.context.close()
})
