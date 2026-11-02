import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { EXTENSION_ROOT, startServer, launchBrowser, newExtensionContext, openPage } from './harness.mjs'

let server
let browser
let page

before(async () => {
  server = await startServer(EXTENSION_ROOT)
  browser = await launchBrowser()
  const context = await newExtensionContext(browser)
  page = await openPage(context, server.url + '/popup.html')
  await page.evaluate(() => {
    window.__freshKey = async () => {
      const { generateMasterKey, masterKeyToCryptoKey } = await import('/crypto.js')
      return masterKeyToCryptoKey(await generateMasterKey())
    }
    window.__legacySeal = async (value, key) => {
      const plain = new TextEncoder().encode(JSON.stringify(value))
      const stream = new Blob([plain]).stream().pipeThrough(new CompressionStream('deflate'))
      const compressed = new Uint8Array(await new Response(stream).arrayBuffer())
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, compressed))
      const b64 = (bytes) => btoa(String.fromCharCode.apply(null, bytes))
      return { iv: b64(iv), data: b64(data) }
    }
    window.__legacyEncrypt = async (text, key) => {
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text)))
      return { iv: Array.from(iv), ciphertext: Array.from(data) }
    }
    window.__wipe = async () => {
      const store = await import('/store.js')
      await store.clearVaultData()
    }
  })
})

after(async () => {
  await browser.close()
  await server.close()
})

test('a ciphertext moved into another context does not decrypt', async () => {
  const result = await page.evaluate(async () => {
    const { encrypt, decrypt } = await import('/crypto.js')
    const key = await window.__freshKey()
    const sealed = await encrypt('secret-value', key, 'webcreds:a:value')
    const right = await decrypt(sealed, key, 'webcreds:a:value')
    let wrong = 'opened'
    try { await decrypt(sealed, key, 'webcreds:b:value') } catch (e) { wrong = 'refused' }
    let unbound = 'opened'
    try { await decrypt(Object.assign({}, sealed, { aad: undefined }), key, 'webcreds:a:value') } catch (e) { unbound = 'refused' }
    return [sealed.aad, right, wrong, unbound]
  })
  assert.deepEqual(result, [1, 'secret-value', 'refused', 'refused'])
})

test('new data cannot be encrypted without saying where it belongs', async () => {
  const result = await page.evaluate(async () => {
    const { encrypt } = await import('/crypto.js')
    const key = await window.__freshKey()
    try { await encrypt('secret-value', key); return 'encrypted' } catch (e) { return 'refused' }
  })
  assert.equal(result, 'refused')
})

test('swapping a misc item name and value is caught', async () => {
  const result = await page.evaluate(async () => {
    await window.__wipe()
    const key = await window.__freshKey()
    const webcreds = await import('/webcreds.js')
    const store = await import('/store.js')
    await webcreds.saveWebCredential('Wi-Fi', 'Home', 'wifi-secret', key)
    await webcreds.saveWebCredential('Wi-Fi', 'Office', 'office-secret', key)
    const vault = await store.getWebCredsVault()
    const [a, b] = vault.credentials['Wi-Fi']
    const swapped = JSON.parse(JSON.stringify(vault))
    swapped.credentials['Wi-Fi'][0].value = b.value
    swapped.credentials['Wi-Fi'][1].value = a.value
    let outcome = 'opened'
    try { await webcreds.verifyVault(swapped, key) } catch (e) { outcome = 'refused' }
    const crossed = JSON.parse(JSON.stringify(vault))
    crossed.credentials['Wi-Fi'][0].name = a.value
    let crossedOutcome = 'opened'
    try { await webcreds.verifyVault(crossed, key) } catch (e) { crossedOutcome = 'refused' }
    return [outcome, crossedOutcome]
  })
  assert.deepEqual(result, ['refused', 'refused'])
})

test('a bookmarks blob cannot stand in for the wallets row', async () => {
  const result = await page.evaluate(async () => {
    await window.__wipe()
    const key = await window.__freshKey()
    const bookmarks = await import('/bookmarks.js')
    const sealed = await import('/sealed.js')
    await bookmarks.saveBookmark('https://news.example.com/', 'News', key)
    const store = await import('/store.js')
    const row = await store.getBookmarksVault()
    const own = (await sealed.openJson(row.blob, key, 'sealed:bookmarks')).items.length
    let outcome = 'opened'
    try { await sealed.openJson(row.blob, key, 'sealed:wallets') } catch (e) { outcome = 'refused' }
    return [own, outcome]
  })
  assert.deepEqual(result, [1, 'refused'])
})

test('records written before 0.9.4.1 still open and are upgraded in place', async () => {
  const result = await page.evaluate(async () => {
    await window.__wipe()
    const key = await window.__freshKey()
    const store = await import('/store.js')
    const passwords = await import('/passwords.js')
    const vaultFile = await import('/vaultfile.js')
    const personalinfo = await import('/personalinfo.js')
    const bookmarks = await import('/bookmarks.js')
    const wallets = await import('/wallets.js')
    const webcreds = await import('/webcreds.js')
    const now = Date.now()
    const tree = { meta: { version: 2, createdAt: now, lastAccess: now }, credentials: { 'site.com': [{ id: 'c1', username: 'alice', password: 'alice-pw', createdAt: now, updatedAt: now }] } }
    await store.setPasswordVault({ id: 'vault', schemaVersion: 2, blob: await window.__legacyEncrypt(JSON.stringify(tree), key) })
    await store.setWebCredsVault({ meta: { version: 1, createdAt: now, lastAccess: now }, credentials: { 'Wi-Fi': [{ id: 'w1', name: await window.__legacyEncrypt('Home', key), value: await window.__legacyEncrypt('wifi-secret', key), createdAt: now, updatedAt: now }] } })
    await store.setPersonalInfo({ data: await window.__legacyEncrypt(JSON.stringify({ firstName: 'Alice', lastName: 'Smith', phone: '555-0100', address: { street: '1 Main St', city: 'Springfield', state: 'IL', zip: '62701', country: 'US' }, emails: [{ id: 'e1', value: 'alice@example.com', position: 0 }] }), key), createdAt: now, updatedAt: now })
    await bookmarks.saveBookmark('https://news.example.com/', 'News', key)
    const bmTree = await bookmarks.readTree(key)
    await store.setBookmarksVault({ schemaVersion: (await store.getBookmarksVault()).schemaVersion, blob: await window.__legacySeal(bmTree, key) })
    const wlTree = await wallets.readTree(key)
    await wallets.writeTree(wlTree, key)
    const wlRow = await store.getWalletVault()
    await store.setWalletVault({ schemaVersion: wlRow.schemaVersion, blob: await window.__legacySeal(await wallets.readTree(key), key) })
    const boundBefore = await vaultFile.localVaultIsBound()
    const opensBefore = await vaultFile.localVaultOpensWith(key)
    await vaultFile.bindLocalVault(key)
    const boundAfter = await vaultFile.localVaultIsBound()
    const login = (await passwords.readVaultTree(key)).credentials['site.com'][0].password
    const wc = await webcreds.getWebCredentials('Wi-Fi', key)
    const profile = (await personalinfo.getProfile(key)).profile
    const bm = (await bookmarks.listBookmarks(key)).map((b) => b.url)
    return {
      boundBefore,
      opensBefore,
      boundAfter,
      login,
      misc: wc.credentials[0].name + '=' + wc.credentials[0].value,
      name: profile.firstName + ' ' + profile.lastName,
      phones: personalinfo.fieldValues(profile, 'phone'),
      cities: personalinfo.fieldValues(profile, 'address.city'),
      emails: personalinfo.fieldValues(profile, 'email'),
      bm
    }
  })
  assert.equal(result.boundBefore, false)
  assert.equal(result.opensBefore, true)
  assert.equal(result.boundAfter, true)
  assert.equal(result.login, 'alice-pw')
  assert.equal(result.misc, 'Home=wifi-secret')
  assert.equal(result.name, 'Alice Smith')
  assert.deepEqual(result.phones, ['555-0100'])
  assert.deepEqual(result.cities, ['Springfield'])
  assert.deepEqual(result.emails, ['alice@example.com'])
  assert.deepEqual(result.bm, ['https://news.example.com/'])
})

test('a vault file from 0.9.4 still imports, and a file from a newer version is refused', async () => {
  const result = await page.evaluate(async () => {
    const vaultFile = await import('/vaultfile.js')
    const empty = { kind: 'vault', vault: null, webcreds: null, personalInfo: null, bookmarks: null, wallets: null }
    const old = vaultFile.bundleFromPayload(empty).version
    const current = vaultFile.payloadFromBundle({}).version
    let newer = 'accepted'
    try { vaultFile.bundleFromPayload(Object.assign({}, empty, { version: current + 1 })) } catch (e) { newer = e.message }
    let newerFile = 'accepted'
    try { vaultFile.parseBundle(JSON.stringify({ format: 'valid-vault', version: current + 1 })) } catch (e) { newerFile = e.message }
    return { old, current, newer, newerFile }
  })
  assert.equal(result.old, 1)
  assert.equal(result.current, 2)
  assert.match(result.newer, /newer/i)
  assert.notEqual(result.newerFile, 'accepted')
})

test('a device still holding pre-0.9.4.1 records merges cleanly with an upgraded one', async () => {
  const result = await page.evaluate(async () => {
    await window.__wipe()
    const key = await window.__freshKey()
    const store = await import('/store.js')
    const passwords = await import('/passwords.js')
    const vaultFile = await import('/vaultfile.js')
    const personalinfo = await import('/personalinfo.js')
    const now = Date.now()
    const oldTree = { meta: { version: 2, createdAt: now, lastAccess: now }, credentials: { 'old.com': [{ id: 'o1', username: 'olduser', password: 'old-pw', createdAt: now, updatedAt: now }] } }
    const oldBundle = {
      format: 'valid-vault',
      version: 1,
      vault: { id: 'vault', schemaVersion: 2, blob: await window.__legacyEncrypt(JSON.stringify(oldTree), key) },
      webcreds: null,
      personalInfo: { data: await window.__legacyEncrypt(JSON.stringify({ firstName: '', lastName: 'Smith', phone: '555-0199', address: {}, emails: [] }), key), createdAt: now - 5000, updatedAt: now - 5000 },
      bookmarks: null,
      wallets: null
    }
    await passwords.ensureVault(key)
    await passwords.saveCredential('new.com', 'newuser', 'new-pw', key, [], 'username')
    const profile = personalinfo.emptyProfile()
    personalinfo.setName(profile, 'firstName', 'Alice')
    personalinfo.addEntry(profile, 'phones', '555-0100')
    await personalinfo.saveProfile(profile, key)
    const merged = await vaultFile.mergeBundle(oldBundle, key)
    const tree = await passwords.readVaultTree(key)
    const after = (await personalinfo.getProfile(key)).profile
    const again = await vaultFile.mergeBundle(oldBundle, key)
    return {
      changed: merged.changed,
      domains: Object.keys(tree.credentials).sort(),
      first: after.firstName,
      last: after.lastName,
      phones: personalinfo.fieldValues(after, 'phone'),
      bound: await vaultFile.localVaultIsBound(),
      againChanged: again.changed
    }
  })
  assert.equal(result.changed, true)
  assert.deepEqual(result.domains, ['new.com', 'old.com'])
  assert.equal(result.first, 'Alice')
  assert.equal(result.last, 'Smith')
  assert.deepEqual(result.phones, ['555-0100', '555-0199'])
  assert.equal(result.bound, true)
  assert.equal(result.againChanged, false)
})

test('names merge field by field with the newest edit winning', async () => {
  const result = await page.evaluate(async () => {
    const pi = await import('/personalinfo.js')
    const local = pi.normalizeProfile({ schema: 2, firstName: 'Al', firstNameAt: 100, lastName: 'Smith', lastNameAt: 300 }, 0)
    const incoming = pi.normalizeProfile({ schema: 2, firstName: 'Alice', firstNameAt: 200, lastName: 'Smyth', lastNameAt: 250 }, 0)
    const a = pi.mergeProfiles(local, incoming)
    const b = pi.mergeProfiles(incoming, local)
    return [a.firstName, a.lastName, b.firstName, b.lastName]
  })
  assert.deepEqual(result, ['Alice', 'Smith', 'Alice', 'Smith'])
})

test('list merges keep the receiving order and add new entries at the bottom', async () => {
  const result = await page.evaluate(async () => {
    const pi = await import('/personalinfo.js')
    const entry = (id, value, position, updatedAt) => ({ id, value, position, updatedAt })
    const local = pi.normalizeProfile({ schema: 2, phones: [entry('p2', '555-0002', 0, 10), entry('p1', '555-0001', 1, 10)], emails: [entry('e1', 'a@x.com', 0, 10)] }, 0)
    const incoming = pi.normalizeProfile({ schema: 2, phones: [entry('p1', '555-0001', 0, 10), entry('p3', '555-0003', 1, 20), entry('p9', '(555) 000-2', 2, 20)], emails: [entry('e2', 'b@x.com', 0, 20), entry('e3', 'A@X.com', 1, 20)] }, 0)
    const merged = pi.mergeProfiles(local, incoming)
    return [pi.fieldValues(merged, 'phone'), pi.fieldValues(merged, 'email')]
  })
  assert.deepEqual(result, [['555-0002', '555-0001', '555-0003'], ['a@x.com', 'b@x.com']])
})

test('deleting an address carries to the other device and an old copy does not bring it back', async () => {
  const result = await page.evaluate(async () => {
    const pi = await import('/personalinfo.js')
    let phone = pi.emptyProfile()
    pi.addEntry(phone, 'addresses', { street: '1 Main St', city: 'Springfield', state: 'IL', zip: '62701', country: 'US' })
    pi.addEntry(phone, 'addresses', { street: '9 Oak Ave', city: 'Shelbyville', state: 'IL', zip: '62565', country: 'US' })
    const laptop = pi.normalizeProfile(JSON.parse(JSON.stringify(phone)), 0)
    const oldBackup = pi.normalizeProfile(JSON.parse(JSON.stringify(phone)), 0)
    const target = pi.liveEntries(phone, 'addresses')[0]
    await new Promise((r) => setTimeout(r, 5))
    pi.removeEntry(phone, 'addresses', target.id)
    const synced = pi.mergeProfiles(laptop, phone)
    const restored = pi.mergeProfiles(synced, oldBackup)
    const readded = pi.normalizeProfile(JSON.parse(JSON.stringify(oldBackup)), 0)
    readded.addresses = readded.addresses.map((a) => Object.assign({}, a, { id: a.id + '-copy' }))
    const copied = pi.mergeProfiles(synced, readded)
    return [pi.fieldValues(synced, 'address.city'), pi.fieldValues(restored, 'address.city'), pi.fieldValues(copied, 'address.city')]
  })
  assert.deepEqual(result, [['Shelbyville'], ['Shelbyville'], ['Shelbyville']])
})

test('the same email added on two devices settles on one entry, and editing it later does not bring the old value back', async () => {
  const result = await page.evaluate(async () => {
    const pi = await import('/personalinfo.js')
    const copy = (p) => pi.normalizeProfile(JSON.parse(JSON.stringify(p)), 0)
    let a = pi.emptyProfile()
    pi.addEntry(a, 'emails', 'shared@x.com')
    await new Promise((r) => setTimeout(r, 5))
    let b = pi.emptyProfile()
    pi.addEntry(b, 'emails', 'Shared@X.com')
    const a1 = pi.mergeProfiles(a, copy(b))
    const b1 = pi.mergeProfiles(b, copy(a))
    const sameId = pi.liveEntries(a1, 'emails')[0].id === pi.liveEntries(b1, 'emails')[0].id
    await new Promise((r) => setTimeout(r, 5))
    pi.updateEntry(a1, 'emails', pi.liveEntries(a1, 'emails')[0].id, 'new@x.com')
    const b2 = pi.mergeProfiles(b1, copy(a1))
    const a2 = pi.mergeProfiles(a1, copy(b2))
    return { sameId, a: pi.fieldValues(a2, 'email'), b: pi.fieldValues(b2, 'email'), settled: pi.sameProfiles(a2, b2) }
  })
  assert.deepEqual(result, { sameId: true, a: ['new@x.com'], b: ['new@x.com'], settled: true })
})

test('a pre-0.9.4.1 profile migrates its phone and address into the lists', async () => {
  const result = await page.evaluate(async () => {
    const pi = await import('/personalinfo.js')
    const legacy = { firstName: 'Alice', lastName: 'Smith', phone: '555-0100', address: { street: '1 Main St', city: 'Springfield', state: 'IL', zip: '62701', country: 'US' }, emails: [{ id: 'e1', value: 'alice@example.com', position: 0 }] }
    const a = pi.normalizeProfile(legacy, 1000)
    const b = pi.normalizeProfile(legacy, 2000)
    const merged = pi.mergeProfiles(a, b)
    return {
      phones: pi.fieldValues(a, 'phone'),
      zip: pi.fieldValues(a, 'address.zip'),
      sameIds: a.phones[0].id === b.phones[0].id && a.addresses[0].id === b.addresses[0].id,
      mergedCount: [pi.liveEntries(merged, 'phones').length, pi.liveEntries(merged, 'addresses').length]
    }
  })
  assert.deepEqual(result, { phones: ['555-0100'], zip: ['62701'], sameIds: true, mergedCount: [1, 1] })
})

test('autofill offers every saved value in ranked order with the primary first', async () => {
  const result = await page.evaluate(async () => {
    const pi = await import('/personalinfo.js')
    const p = pi.emptyProfile()
    pi.addEntry(p, 'phones', '555-0001')
    const second = pi.addEntry(p, 'phones', '555-0002').id
    pi.addEntry(p, 'addresses', { street: '1 Main St', city: 'Springfield', state: 'IL', zip: '62701', country: 'US' })
    const office = pi.addEntry(p, 'addresses', { street: '9 Oak Ave', city: 'Shelbyville', state: 'IL', zip: '62565', country: 'US' }).id
    pi.moveEntry(p, 'phones', second, -1)
    pi.moveEntry(p, 'addresses', office, -1)
    return [pi.fieldValues(p, 'phone'), pi.fieldValues(p, 'address.street'), pi.fieldValues(p, 'address.state')]
  })
  assert.deepEqual(result, [['555-0002', '555-0001'], ['9 Oak Ave', '1 Main St'], ['IL']])
})

test('a reveal that finishes after the vault locks is thrown away', async () => {
  const result = await page.evaluate(async () => {
    const session = await import('/session.js')
    session.setMasterKey(await window.__freshKey())
    const before = session.generation()
    const slow = new Promise((r) => setTimeout(r, 30)).then(() => session.isCurrent(before))
    session.lockAll()
    const stillCurrent = await slow
    session.setMasterKey(await window.__freshKey())
    const fresh = session.generation()
    return [stillCurrent, session.isCurrent(before), session.isCurrent(fresh)]
  })
  assert.deepEqual(result, [false, false, true])
})

test('a device with a fast clock wins a true conflict, and the next local edit still beats it', async () => {
  const result = await page.evaluate(async () => {
    await window.__wipe()
    const key = await window.__freshKey()
    const passwords = await import('/passwords.js')
    const store = await import('/store.js')
    await passwords.ensureVault(key)
    await passwords.saveCredential('site.com', 'alice', 'first-pw', key, [], 'username')
    const tree = await passwords.readVaultTree(key)
    const local = JSON.parse(JSON.stringify(tree))
    const ahead = JSON.parse(JSON.stringify(tree))
    const HOUR = 3600000
    ahead.credentials['site.com'][0].password = 'fast-clock-pw'
    ahead.credentials['site.com'][0].updatedAt = Date.now() + HOUR
    local.credentials['site.com'][0].password = 'local-pw'
    local.credentials['site.com'][0].updatedAt = Date.now()
    const conflict = passwords.mergeVaults(local, ahead)
    await passwords.writeVaultTree(conflict, key)
    const id = conflict.credentials['site.com'][0].id
    await passwords.updateCredential(id, { password: 'edited-after-sync' }, key)
    const edited = await passwords.readVaultTree(key)
    const resync = passwords.mergeVaults(edited, ahead)
    return [conflict.credentials['site.com'][0].password, resync.credentials['site.com'].find((c) => !c.deleted).password]
  })
  assert.deepEqual(result, ['fast-clock-pw', 'edited-after-sync'])
})

test('re-saving a login from the save prompt beats a synced copy with a fast clock', async () => {
  const result = await page.evaluate(async () => {
    await window.__wipe()
    const key = await window.__freshKey()
    const passwords = await import('/passwords.js')
    await passwords.ensureVault(key)
    await passwords.saveCredential('site.com', 'alice', 'first-pw', key, [], 'username')
    const tree = await passwords.readVaultTree(key)
    tree.credentials['site.com'][0].updatedAt = Date.now() + 3600000
    await passwords.writeVaultTree(tree, key)
    const ahead = JSON.parse(JSON.stringify(tree))
    await passwords.saveCredential('site.com', 'alice', 'prompt-pw', key, [], 'username')
    const merged = passwords.mergeVaults(await passwords.readVaultTree(key), ahead)
    return merged.credentials['site.com'].find((c) => !c.deleted).password
  })
  assert.equal(result, 'prompt-pw')
})

test('several offline edits on one device beat one older edit on another', async () => {
  const result = await page.evaluate(async () => {
    const passwords = await import('/passwords.js')
    const base = { meta: { version: 2, createdAt: 1, lastAccess: 1 }, credentials: { 'site.com': [{ id: 'c1', username: 'alice', password: 'pw-0', createdAt: 1, updatedAt: 1000 }] } }
    const copy = () => JSON.parse(JSON.stringify(base))
    const phone = copy()
    phone.credentials['site.com'][0].password = 'pw-1'
    phone.credentials['site.com'][0].updatedAt = 2000
    const phoneLater = JSON.parse(JSON.stringify(phone))
    phoneLater.credentials['site.com'][0].password = 'pw-3'
    phoneLater.credentials['site.com'][0].updatedAt = 4000
    const laptop = copy()
    laptop.credentials['site.com'][0].password = 'pw-2'
    laptop.credentials['site.com'][0].updatedAt = 3000
    const viaMiddle = passwords.mergeVaults(passwords.mergeVaults(laptop, phone), phoneLater)
    const direct = passwords.mergeVaults(laptop, phoneLater)
    const other = passwords.mergeVaults(phoneLater, laptop)
    return [viaMiddle, direct, other].map((t) => t.credentials['site.com'][0].password)
  })
  assert.deepEqual(result, ['pw-3', 'pw-3', 'pw-3'])
})

test('restoring an old backup after a delete keeps the login deleted', async () => {
  const result = await page.evaluate(async () => {
    await window.__wipe()
    const key = await window.__freshKey()
    const passwords = await import('/passwords.js')
    const vaultFile = await import('/vaultfile.js')
    await passwords.ensureVault(key)
    await passwords.saveCredential('site.com', 'alice', 'alice-pw', key, [], 'username')
    await passwords.saveCredential('site.com', 'bob', 'bob-pw', key, [], 'username')
    const backup = await vaultFile.buildBundle()
    const alice = (await passwords.readVaultTree(key)).credentials['site.com'].find((c) => c.username === 'alice')
    await new Promise((r) => setTimeout(r, 5))
    await passwords.deleteCredential(alice.id, key)
    const merged = await vaultFile.mergeBundle(backup, key)
    const live = (await passwords.readVaultTree(key)).credentials['site.com'].filter((c) => !c.deleted).map((c) => c.username)
    return { changed: merged.changed, live }
  })
  assert.deepEqual(result, { changed: false, live: ['bob'] })
})

test('repeated, partly overlapping imports settle on the same vault in any order', async () => {
  const result = await page.evaluate(async () => {
    const passwords = await import('/passwords.js')
    const cred = (id, username, updatedAt) => ({ id, username, password: username + '-pw', createdAt: 1, updatedAt })
    const tree = (list) => ({ meta: { version: 2, createdAt: 1, lastAccess: 1 }, credentials: { 'site.com': list } })
    const a = tree([cred('1', 'one', 10), cred('2', 'two', 10)])
    const b = tree([cred('2', 'two', 20), cred('3', 'three', 10)])
    const c = tree([cred('3', 'three', 10), cred('4', 'four', 10), { id: '1', deleted: true, username: 'one', updatedAt: 30 }])
    const fold = (order) => order.reduce((acc, t) => passwords.mergeVaults(acc, t))
    const orders = [[a, b, c], [c, b, a], [b, a, c, b, a], [a, c, a, b, c]]
    const results = orders.map((o) => fold(o))
    const live = results.map((t) => t.credentials['site.com'].filter((x) => !x.deleted).map((x) => x.username).sort().join(','))
    const settled = results.every((t) => passwords.sameCredentials(t, results[0]))
    const idempotent = passwords.sameCredentials(passwords.mergeVaults(results[0], b), results[0])
    return { live, settled, idempotent }
  })
  assert.deepEqual(result.live, ['four,three,two', 'four,three,two', 'four,three,two', 'four,three,two'])
  assert.equal(result.settled, true)
  assert.equal(result.idempotent, true)
})

test('repeated profile imports settle on the same lists in any order', async () => {
  const result = await page.evaluate(async () => {
    const pi = await import('/personalinfo.js')
    const entry = (id, value, position, updatedAt) => ({ id, value, position, updatedAt })
    const a = pi.normalizeProfile({ schema: 2, emails: [entry('1', 'one@x.com', 0, 10), entry('2', 'two@x.com', 1, 10)] }, 0)
    const b = pi.normalizeProfile({ schema: 2, emails: [entry('2', 'two@x.com', 0, 10), entry('3', 'three@x.com', 1, 10)] }, 0)
    const c = pi.normalizeProfile({ schema: 2, emails: [entry('3', 'three@x.com', 0, 10), { id: '1', deleted: true, updatedAt: 20, key: 'one@x.com' }] }, 0)
    const fold = (order) => order.reduce((acc, p) => pi.mergeProfiles(acc, p))
    const sets = [[a, b, c], [c, b, a], [b, a, c, b, a]].map((o) => pi.fieldValues(fold(o), 'email').slice().sort().join(','))
    const once = fold([a, b, c])
    const twice = pi.mergeProfiles(once, b)
    return { sets, order: pi.fieldValues(once, 'email'), idempotent: pi.sameProfiles(once, twice) }
  })
  assert.deepEqual(result.sets, ['three@x.com,two@x.com', 'three@x.com,two@x.com', 'three@x.com,two@x.com'])
  assert.deepEqual(result.order, ['two@x.com', 'three@x.com'])
  assert.equal(result.idempotent, true)
})

test('separate cloud storage addresses are kept apart while other hosted sites still group their own parts', async () => {
  const result = await page.evaluate(async () => {
    const { siteOf } = await import('/passwords.js')
    return [
      siteOf('alpha.s3.amazonaws.com') === siteOf('bravo.s3.amazonaws.com'),
      siteOf('alice.github.io') === siteOf('bob.github.io'),
      siteOf('www.alice.github.io') === siteOf('alice.github.io'),
      siteOf('login.example.com') === siteOf('www.example.com')
    ]
  })
  assert.deepEqual(result, [false, false, true, true])
})

test('an unreadable extra field in a very old vault is kept through the upgrade', async () => {
  const result = await page.evaluate(async () => {
    await window.__wipe()
    const key = await window.__freshKey()
    const otherKey = await window.__freshKey()
    const store = await import('/store.js')
    const passwords = await import('/passwords.js')
    const now = Date.now()
    const broken = { label: await window.__legacyEncrypt('Old PIN', otherKey), value: await window.__legacyEncrypt('1111', otherKey) }
    await store.setPasswordVault({
      id: 'vault',
      meta: { createdAt: now, lastAccess: now },
      credentials: { 'site.com': [{
        id: 'c1',
        username: await window.__legacyEncrypt('alice', key),
        password: await window.__legacyEncrypt('alice-pw', key),
        extraFields: [{ label: await window.__legacyEncrypt('PIN', key), value: await window.__legacyEncrypt('4321', key) }, broken],
        createdAt: now,
        updatedAt: now
      }] }
    })
    const tree = await passwords.readVaultTree(key)
    const cred = tree.credentials['site.com'][0]
    const shown = (await passwords.getCredentials('site.com', key)).credentials[0]
    return {
      password: cred.password,
      fields: cred.extraFields.map((f) => f.label + '=' + f.value),
      kept: (cred.unreadableExtraFields || []).length,
      sameCipher: JSON.stringify((cred.unreadableExtraFields || [])[0]) === JSON.stringify(broken),
      shownFields: shown.extraFields.length,
      schema: (await store.getPasswordVault()).schemaVersion
    }
  })
  assert.deepEqual(result, { password: 'alice-pw', fields: ['PIN=4321'], kept: 1, sameCipher: true, shownFields: 1, schema: 2 })
})

test('the hardening checks raise no page errors', () => {
  assert.deepEqual(page.errors, [])
})
