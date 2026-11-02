import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { EXTENSION_ROOT, startServer, launchBrowser, newExtensionContext, openPage, setUpPopup, openTab, revealLogins, fillDialog, dialogError, waitForText } from './harness.mjs'

const SECRET = 'JBSWY3DPEHPK3PXP'
const OTP_TAG = 'div[title="Fill a 2FA code with Valid Vault"]'
const RFC_SEEDS = {
  SHA1: '12345678901234567890',
  SHA256: '12345678901234567890123456789012',
  SHA512: '1234567890123456789012345678901234567890123456789012345678901234'
}
const RFC_VECTORS = [
  [59, '94287082', '46119246', '90693936'],
  [1111111109, '07081804', '68084774', '25091201'],
  [1111111111, '14050471', '67062674', '99943326'],
  [1234567890, '89005924', '91819424', '93441116'],
  [2000000000, '69279037', '90698825', '38618901'],
  [20000000000, '65353130', '77737706', '47863826']
]

let server
let browser
let context
let page

function base32(text) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of Buffer.from(text)) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) { out += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5 }
  }
  if (bits) out += alphabet[(value << (5 - bits)) & 31]
  return out
}

function storedZip(name, text) {
  const nameBytes = Buffer.from(name)
  const data = Buffer.from(text)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt32LE(data.length, 18)
  local.writeUInt32LE(data.length, 22)
  local.writeUInt16LE(nameBytes.length, 26)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt32LE(data.length, 20)
  central.writeUInt32LE(data.length, 24)
  central.writeUInt16LE(nameBytes.length, 28)
  central.writeUInt32LE(0, 42)
  const centralAt = local.length + nameBytes.length + data.length
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(1, 8)
  end.writeUInt16LE(1, 10)
  end.writeUInt32LE(central.length + nameBytes.length, 12)
  end.writeUInt32LE(centralAt, 16)
  return Array.from(Buffer.concat([local, nameBytes, data, central, nameBytes, end]))
}

async function currentCodes(target, secret) {
  return target.evaluate(async (s) => {
    const totp = await import('/totp.js')
    const config = { secret: s, digits: 6, period: 30, algorithm: 'SHA1' }
    const now = Date.now()
    return [(await totp.generateCode(config, now)).code, (await totp.generateCode(config, now - 30000)).code]
  }, secret)
}

async function seedCode(target, domain, username) {
  await target.evaluate(async ([d, u, s]) => {
    const key = await window.__testVaultKey()
    const passwords = await import('/passwords.js')
    await passwords.ensureVault(key)
    const saved = await passwords.saveCredential(d, u, u + '-pw-9!', key, [], 'username')
    await passwords.updateCredential(saved.id, { totp: { secret: s, digits: 6, period: 30, algorithm: 'SHA1' } }, key)
  }, [domain, username, SECRET])
}

before(async () => {
  server = await startServer(EXTENSION_ROOT)
  browser = await launchBrowser()
  context = await newExtensionContext(browser, { openShadowRoots: true })
  page = (await setUpPopup(context, server.url))
})

after(async () => {
  await browser.close()
  await server.close()
})

test('codes match the RFC 6238 test vectors for SHA1, SHA256, and SHA512', async () => {
  const seeds = Object.fromEntries(Object.entries(RFC_SEEDS).map(([name, seed]) => [name, base32(seed)]))
  const results = await page.evaluate(async ([vectors, encoded]) => {
    const totp = await import('/totp.js')
    const out = []
    for (const [seconds, ...codes] of vectors) {
      for (const [i, algorithm] of ['SHA1', 'SHA256', 'SHA512'].entries()) {
        const result = await totp.generateCode({ secret: encoded[algorithm], digits: 8, period: 30, algorithm }, seconds * 1000)
        out.push(result.code === codes[i])
      }
    }
    return out
  }, [RFC_VECTORS, seeds])
  assert.equal(results.length, 18)
  assert.ok(results.every(Boolean))
})

test('setup keys are read with spaces and lower case, and setup links carry their settings', async () => {
  const results = await page.evaluate(async () => {
    const totp = await import('/totp.js')
    return {
      typed: totp.parseTotpInput('jbsw y3dp ehpk 3pxp').config,
      link: totp.parseTotpInput('otpauth://totp/Example:alice?secret=JBSWY3DPEHPK3PXP&issuer=Example&digits=8&period=60&algorithm=SHA256').config,
      counter: totp.parseTotpInput('otpauth://hotp/Example?secret=JBSWY3DPEHPK3PXP&counter=1').error || '',
      typo: totp.parseTotpInput('JBSW Y3DP EHPK 3PX0').error || '',
      short: totp.parseTotpInput('JBSWY3DP').error || '',
      steam: totp.parseTotpInput('steam://ABCDEFGH').error || ''
    }
  })
  assert.deepEqual(results.typed, { secret: SECRET, digits: 6, period: 30, algorithm: 'SHA1' })
  assert.deepEqual(results.link, { secret: SECRET, digits: 8, period: 60, algorithm: 'SHA256' })
  assert.match(results.counter, /time-based/)
  assert.match(results.typo, /A to Z and the numbers 2 to 7/)
  assert.match(results.short, /too short/)
  assert.match(results.steam, /Steam Guard/)
})

test('a 2FA code added in Manage shows the live code and can be removed', async () => {
  const manage = await openPage(context, server.url + '/manage.html')
  await manage.evaluate(async () => {
    const key = await window.__testVaultKey()
    const passwords = await import('/passwords.js')
    await passwords.ensureVault(key)
    await passwords.saveCredential('manage-2fa.com', 'erin', 'erin-pw-5!', key, [], 'username')
  })
  await manage.reload()
  await openTab(manage, 'manage')
  await revealLogins(manage)
  await manage.click('#credentials-list .btn-add-totp')
  await fillDialog(manage, ['JBSW Y3DP EHPK 3PX0'])
  assert.match(await dialogError(manage) || '', /A to Z and the numbers 2 to 7/)
  await fillDialog(manage, ['jbsw y3dp ehpk 3pxp'])
  await waitForText(manage, '#msg-manage', /2FA code saved/)
  await revealLogins(manage)
  await manage.waitForFunction(() => /^\d{3} \d{3}$/.test((document.querySelector('#credentials-list .totp-code') || {}).textContent || ''))
  const shown = (await manage.textContent('#credentials-list .totp-code')).replace(' ', '')
  assert.ok((await currentCodes(manage, SECRET)).includes(shown))
  assert.match(await manage.textContent('#credentials-list .totp-time'), /^\d+s$/)
  await manage.click('#credentials-list .btn-remove-totp')
  await fillDialog(manage, [])
  await waitForText(manage, '#msg-manage', /2FA code removed/)
  const stored = await manage.evaluate(async () => {
    const key = await window.__testVaultKey()
    const passwords = await import('/passwords.js')
    const tree = await passwords.readVaultTree(key)
    const cred = tree.credentials['manage-2fa.com'][0]
    return { totp: cred.totp, stamped: typeof cred.totpSetAt === 'number' }
  })
  assert.deepEqual(stored, { totp: null, stamped: true })
  assert.deepEqual(manage.errors, [])
  await manage.close()
})

test('a code box gets its own V tag and fills the current code for the site', async () => {
  const site = await openPage(context, server.url + '/__fixture/otp.html')
  await seedCode(site, '127.0.0.1', 'frank')
  await site.reload()
  await site.waitForTimeout(800)
  assert.equal(await site.locator(OTP_TAG).count(), 1)
  await site.locator(OTP_TAG).click()
  await site.waitForTimeout(800)
  const item = site.locator('.item', { hasText: 'frank' }).first()
  assert.equal(await item.count(), 1)
  await item.click()
  await site.waitForTimeout(400)
  const filled = await site.inputValue('#otp')
  assert.ok((await currentCodes(site, SECRET)).includes(filled))
  assert.deepEqual(site.errors, [])
  await site.close()
})

test('a code box found by its name gets a V tag, and other boxes do not', async () => {
  const site = await openPage(context, server.url + '/__fixture/otp-named.html')
  await site.waitForTimeout(800)
  const tagged = await site.evaluate((selector) => {
    const ids = []
    for (const tag of document.querySelectorAll(selector)) {
      const r = tag.getBoundingClientRect()
      for (const id of ['code', 'search']) {
        const b = document.getElementById(id).getBoundingClientRect()
        if (r.top >= b.top - 4 && r.bottom <= b.bottom + 4) ids.push(id)
      }
    }
    return ids
  }, OTP_TAG)
  assert.deepEqual(tagged, ['code'])
  await site.close()
})

test('a code box next to a leftover password field stays a code box', async () => {
  const site = await openPage(context, server.url + '/__fixture/otp-step.html')
  await site.waitForTimeout(800)
  assert.equal(await site.locator(OTP_TAG).count(), 1)
  assert.equal(await site.getAttribute('#otp', 'autocomplete'), 'one-time-code')
  await site.locator(OTP_TAG).click()
  await site.waitForTimeout(800)
  assert.equal(await site.locator('.item', { hasText: 'frank' }).count(), 1)
  await site.close()
})

test('six one-digit code boxes get no V tags yet', async () => {
  const site = await openPage(context, server.url + '/__fixture/otp-split.html')
  await site.waitForTimeout(800)
  assert.equal(await site.locator(OTP_TAG).count(), 0)
  await site.close()
})

test('web pages never receive the setup key, only a code', async () => {
  const site = await openPage(context, server.url + '/__fixture/otp.html')
  const answers = await site.evaluate(async () => {
    const logins = await chrome.runtime.sendMessage({ action: 'getCredentialsForDomain', domain: '127.0.0.1' })
    const codes = await chrome.runtime.sendMessage({ action: 'getTotpCodes' })
    return { logins, codes }
  })
  const frank = answers.logins.credentials.find((c) => c.username === 'frank')
  assert.equal(frank.hasTotp, true)
  assert.equal('totp' in frank, false)
  assert.ok(!JSON.stringify(answers).includes(SECRET))
  assert.ok(answers.codes.codes.some((c) => c.username === 'frank' && /^\d{6}$/.test(c.code)))
  await site.close()
})

test('a newer edit from an older version keeps the 2FA code, and a removal carries across', async () => {
  const result = await page.evaluate(async (secret) => {
    const { mergeVaults } = await import('/passwords.js')
    const config = { secret, digits: 6, period: 30, algorithm: 'SHA1' }
    const meta = { version: 2, createdAt: 1, lastAccess: 1 }
    const withCode = { meta, credentials: { 'site.com': [{ id: 'c1', username: 'gina', password: 'old-pw', updatedAt: 100, totp: config, totpSetAt: 100 }] } }
    const olderVersion = { meta, credentials: { 'site.com': [{ id: 'c1', username: 'gina', password: 'new-pw', updatedAt: 200 }] } }
    const kept = mergeVaults(withCode, olderVersion).credentials['site.com'][0]
    const keptOther = mergeVaults(olderVersion, withCode).credentials['site.com'][0]
    const removed = { meta, credentials: { 'site.com': [{ id: 'c1', username: 'gina', password: 'old-pw', updatedAt: 300, totp: null, totpSetAt: 300 }] } }
    const gone = mergeVaults(mergeVaults(withCode, olderVersion), removed).credentials['site.com'][0]
    const separate = { meta, credentials: { 'site.com': [{ id: 'c2', username: 'gina', password: 'other-pw', updatedAt: 400 }] } }
    const joined = mergeVaults(withCode, separate).credentials['site.com'].filter((c) => !c.deleted)
    return {
      kept: [kept.password, kept.totp && kept.totp.secret, kept.totpSetAt],
      keptOther: [keptOther.password, keptOther.totp && keptOther.totp.secret],
      gone: [gone.totp, gone.totpSetAt],
      joined: joined.map((c) => [c.password, c.totp && c.totp.secret])
    }
  }, SECRET)
  assert.deepEqual(result.kept, ['new-pw', SECRET, 100])
  assert.deepEqual(result.keptOther, ['new-pw', SECRET])
  assert.deepEqual(result.gone, [null, 300])
  assert.deepEqual(result.joined, [['other-pw', SECRET]])
})

test('a deleted login does not pass its 2FA code to a login saved again under the same name', async () => {
  const result = await page.evaluate(async (secret) => {
    const { mergeVaults } = await import('/passwords.js')
    const config = { secret, digits: 6, period: 30, algorithm: 'SHA1' }
    const meta = { version: 2, createdAt: 1, lastAccess: 1 }
    const otherDevice = { meta, credentials: { 'site.com': [{ id: 'old', username: 'nina', password: 'old-pw', updatedAt: 100, totp: config, totpSetAt: 100 }] } }
    const thisDevice = { meta, credentials: { 'site.com': [{ id: 'old', username: 'nina', deleted: true, updatedAt: 200 }, { id: 'new', username: 'nina', password: 'new-pw', updatedAt: 300 }] } }
    return mergeVaults(thisDevice, otherDevice).credentials['site.com'].filter((c) => !c.deleted).map((c) => [c.id, c.totp || null])
  }, SECRET)
  assert.deepEqual(result, [['new', null]])
})

test('a 2FA entry this version cannot read is set aside and the logins still open', async () => {
  const result = await page.evaluate(async () => {
    const key = await window.__testVaultKey()
    const passwords = await import('/passwords.js')
    const tree = await passwords.readVaultTree(key)
    tree.credentials['future.com'] = [{ id: 'f1', username: 'olga', password: 'olga-pw-1!', updatedAt: 5, totp: { secret: 'JBSWY3DPEHPK3PXP', digits: 10, period: 15, algorithm: 'SHA3' }, totpSetAt: 5 }]
    await passwords.writeVaultTree(tree, key)
    const read = await passwords.getCredentials('future.com', key)
    return read.success ? read.credentials.map((c) => [c.username, c.totp]) : read.error
  })
  assert.deepEqual(result, [['olga', null]])
})

test('saving a changed password from a site keeps the 2FA code', async () => {
  const kept = await page.evaluate(async (secret) => {
    const key = await window.__testVaultKey()
    const passwords = await import('/passwords.js')
    const saved = await passwords.saveCredential('keep-2fa.com', 'hank', 'hank-pw-1!', key, [], 'username')
    await passwords.updateCredential(saved.id, { totp: { secret, digits: 6, period: 30, algorithm: 'SHA1' } }, key)
    await passwords.saveCredential('keep-2fa.com', 'hank', 'hank-pw-2!', key, [], 'username')
    const result = await passwords.getCredentials('keep-2fa.com', key)
    return result.credentials.map((c) => [c.password, c.totp && c.totp.secret])
  }, SECRET)
  assert.deepEqual(kept, [['hank-pw-2!', SECRET]])
})

test('Bitwarden, 1Password, and CSV exports bring their 2FA codes', async () => {
  const bitwarden = JSON.stringify({ encrypted: false, items: [{ type: 1, name: 'Bit', login: { username: 'ivy', password: 'ivy-pw-1!', totp: 'otpauth://totp/Bit:ivy?secret=' + SECRET + '&issuer=Bit', uris: [{ uri: 'https://bit.example.com/login' }] } }] })
  const csv = 'name,url,username,password,note,totp,createTime,modifyTime,vault\nProton,https://proton.example.com,jack,jack-pw-2!,,' + SECRET + ',1700000000,1700000000,Personal\n'
  const onePassword = { accounts: [{ vaults: [{ items: [{ categoryUuid: '001', state: 'active', overview: { title: 'One', url: 'https://one.example.com' }, details: { loginFields: [{ designation: 'username', value: 'kate' }, { designation: 'password', value: 'kate-pw-3!' }], sections: [{ fields: [{ title: 'one-time password', value: { totp: 'otpauth://totp/One:kate?secret=' + SECRET } }] }] } }] }] }] }
  const onePasswordZip = storedZip('export.data', JSON.stringify(onePassword))
  const results = await page.evaluate(async ([bw, text, zip]) => {
    const key = await window.__testVaultKey()
    const files = await import('/exportfiles.js')
    const passwords = await import('/passwords.js')
    const encoder = new TextEncoder()
    const parsedBw = await files.readLoginFile({ name: 'bitwarden.json', bytes: encoder.encode(bw) }, async () => null)
    const parsedCsv = await files.readLoginFile({ name: 'proton.csv', bytes: encoder.encode(text) }, async () => null)
    const parsedOp = await files.readLoginFile({ name: 'export.1pux', bytes: new Uint8Array(zip) }, async () => null)
    const entries = parsedBw.entries.concat(parsedCsv.entries, parsedOp.entries)
    const out = { formats: [parsedBw.format, parsedCsv.format, parsedOp.format], preview: (await passwords.previewLoginImportFor(entries, key)).codes }
    const imported = await passwords.importLogins(entries, key, async () => 'incoming', [])
    out.codes = imported.codes
    const tree = await passwords.readVaultTree(key)
    out.stored = ['bit.example.com', 'proton.example.com', 'one.example.com'].map((site) => tree.credentials[site][0].totp)
    return out
  }, [bitwarden, csv, onePasswordZip])
  assert.deepEqual(results.formats, ['Bitwarden', 'Proton Pass', '1Password'])
  assert.equal(results.preview, 3)
  assert.equal(results.codes, 3)
  for (const stored of results.stored) assert.deepEqual(stored, { secret: SECRET, digits: 6, period: 30, algorithm: 'SHA1' })
})

test('a common master password is refused at setup', async () => {
  const fresh = await newExtensionContext(browser)
  const popup = await openPage(fresh, server.url + '/popup.html')
  await popup.fill('#setup-password', 'Password123!')
  await popup.click('#btn-setup-pw')
  assert.match(await waitForText(popup, '#msg-setup', /too common/), /That password is too common/)
  await popup.fill('#setup-password', 'Qwerty!2024ab')
  await popup.click('#btn-setup-pw')
  assert.match(await waitForText(popup, '#msg-setup', /enrolled/), /enrolled/)
  await fresh.close()
})
