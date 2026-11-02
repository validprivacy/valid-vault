import * as store from './store.js'
import * as passwords from './passwords.js'
import * as webcreds from './webcreds.js'
import * as personalinfo from './personalinfo.js'
import * as bookmarks from './bookmarks.js'
import * as wallets from './wallets.js'
import { isContextBound } from './crypto.js'

const VAULT_FILE_FORMAT = 'valid-vault-vault'
const VAULT_FILE_VERSION = 2
const SYNC_LOCK = 'valid-vault-uni-vault-sync'
const UPGRADE_FAILED_MSG = 'Encryption upgrade could not be verified, and the previous data was put back'
const UPGRADE_SKIPPED_MSG = 'Encryption upgrade could not be verified, and newer data was left in place'
const SECTION_NAMES = ['vault', 'webcreds', 'personalInfo', 'bookmarks', 'wallets']
const KEY_MISMATCH_MSG = 'This vault was made with a different master key. Import that master key first, then import the vault.'
const LOCAL_MISMATCH_MSG = 'The saved data on this device uses a different master key than the one unlocked. Import the matching master key first.'
const NOT_VAULT_MSG = 'This is not a Valid Vault vault file. Nothing was changed.'
const NEWER_VERSION_MSG = 'This vault file was made by a newer version of Valid Vault. Update this device, then import it again. Nothing was changed.'
const DAMAGED_MSG = 'This vault file is damaged or incomplete. Nothing was changed.'

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isCipher(value) {
  return isObject(value) && Array.isArray(value.iv) && Array.isArray(value.ciphertext)
}

function isSealedRow(row) {
  return isObject(row) && typeof row.schemaVersion === 'number' && isObject(row.blob) && typeof row.blob.iv === 'string' && typeof row.blob.data === 'string'
}

function isVaultRow(row) {
  if (!isObject(row)) return false
  if (row.schemaVersion === undefined) return isObject(row.credentials)
  return typeof row.schemaVersion === 'number'
}

function isWebCredsVault(vault) {
  if (!isObject(vault) || !isObject(vault.meta) || !isObject(vault.credentials)) return false
  for (const list of Object.values(vault.credentials)) {
    if (!Array.isArray(list)) return false
    for (const cred of list) {
      if (!isObject(cred) || typeof cred.id !== 'string') return false
      if (cred.deleted) continue
      if (!isCipher(cred.name) || !isCipher(cred.value)) return false
    }
  }
  return true
}

function isPersonalInfoRecord(record) {
  return isObject(record) && isCipher(record.data)
}

function checkSections(obj) {
  const sections = {}
  for (const name of SECTION_NAMES) sections[name] = obj[name] === undefined ? null : obj[name]
  if (sections.vault !== null && !isVaultRow(sections.vault)) throw new Error(DAMAGED_MSG)
  if (sections.webcreds !== null && !isWebCredsVault(sections.webcreds)) throw new Error(DAMAGED_MSG)
  if (sections.personalInfo !== null && !isPersonalInfoRecord(sections.personalInfo)) throw new Error(DAMAGED_MSG)
  if (sections.bookmarks !== null && !isSealedRow(sections.bookmarks)) throw new Error(DAMAGED_MSG)
  if (sections.wallets !== null && !isSealedRow(sections.wallets)) throw new Error(DAMAGED_MSG)
  return sections
}

function parseBundle(input) {
  let obj = input
  if (typeof input === 'string') {
    try { obj = JSON.parse(input) } catch (e) { throw new Error(NOT_VAULT_MSG) }
  }
  if (!isObject(obj) || obj.format !== VAULT_FILE_FORMAT) throw new Error(NOT_VAULT_MSG)
  if (typeof obj.version !== 'number' || !Number.isInteger(obj.version) || obj.version < 1) throw new Error(DAMAGED_MSG)
  if (obj.version > VAULT_FILE_VERSION) throw new Error(NEWER_VERSION_MSG)
  return Object.assign({ format: VAULT_FILE_FORMAT, version: obj.version }, checkSections(obj))
}

function bundleFromPayload(payload) {
  if (!isObject(payload) || payload.kind !== 'vault') throw new Error(DAMAGED_MSG)
  const version = payload.version === undefined ? 1 : payload.version
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) throw new Error(DAMAGED_MSG)
  if (version > VAULT_FILE_VERSION) throw new Error(NEWER_VERSION_MSG)
  return Object.assign({ format: VAULT_FILE_FORMAT, version }, checkSections(payload))
}

function payloadFromBundle(bundle) {
  return { kind: 'vault', version: VAULT_FILE_VERSION, vault: bundle.vault || null, webcreds: bundle.webcreds || null, personalInfo: bundle.personalInfo || null, bookmarks: bundle.bookmarks || null, wallets: bundle.wallets || null }
}

async function rowOpensWith(row, key) {
  if (!row) return true
  try { await passwords.decryptAnyRowToTree(row, key); return true } catch (e) { return false }
}

async function webCredsOpenWith(vault, key) {
  if (!vault || !vault.credentials) return true
  try { await webcreds.verifyVault(vault, key); return true } catch (e) { return false }
}

async function personalInfoOpensWith(record, key) {
  if (!record || !record.data) return true
  try { await personalinfo.openRecord(record, key); return true } catch (e) { return false }
}

async function localVaultOpensWith(key) {
  if (!(await rowOpensWith(await store.getPasswordVault(), key))) return false
  if (!(await webCredsOpenWith(await store.getWebCredsVault(), key))) return false
  if (!(await personalInfoOpensWith(await store.getPersonalInfo(), key))) return false
  if (!(await bookmarks.rowOpensWith(await store.getBookmarksVault(), key))) return false
  return wallets.rowOpensWith(await store.getWalletVault(), key)
}

async function bundleOpensWith(bundle, key) {
  if (!(await rowOpensWith(bundle.vault, key))) return false
  if (!(await webCredsOpenWith(bundle.webcreds, key))) return false
  if (!(await personalInfoOpensWith(bundle.personalInfo, key))) return false
  if (!(await bookmarks.rowOpensWith(bundle.bookmarks, key))) return false
  return wallets.rowOpensWith(bundle.wallets, key)
}

async function buildBundle() {
  return {
    format: VAULT_FILE_FORMAT,
    version: VAULT_FILE_VERSION,
    vault: (await store.getPasswordVault()) || null,
    webcreds: (await store.getWebCredsVault()) || null,
    personalInfo: (await store.getPersonalInfo()) || null,
    bookmarks: (await store.getBookmarksVault()) || null,
    wallets: (await store.getWalletVault()) || null
  }
}

function bundleHasData(bundle) {
  return !!(bundle.vault || bundle.webcreds || bundle.personalInfo || bundle.bookmarks || bundle.wallets)
}

function emptyLoginTree() {
  return { meta: { version: 2, createdAt: Date.now(), lastAccess: Date.now() }, credentials: {} }
}

function emptyWebCreds() {
  return { meta: { version: 1, createdAt: Date.now(), lastAccess: Date.now() }, credentials: {} }
}


async function localLoginTree(key) {
  let row = await store.getPasswordVault()
  if (row && row.schemaVersion === undefined) {
    await passwords.migrateLegacyVault(key)
    row = await store.getPasswordVault()
  }
  return row ? passwords.decryptAnyRowToTree(row, key) : null
}

async function localVaultHasLiveData(key) {
  try {
    const row = await store.getPasswordVault()
    if (row) {
      const tree = await passwords.decryptAnyRowToTree(row, key)
      if (Object.values(tree.credentials).some((list) => list.some((cred) => !cred.deleted))) return true
    }
    const wc = await store.getWebCredsVault()
    if (wc && Object.values(wc.credentials || {}).some((list) => list.some((cred) => !cred.deleted))) return true
    const pi = await store.getPersonalInfo()
    if (pi && pi.data && personalinfo.profileHasData(await personalinfo.openRecord(pi, key))) return true
    const bm = await bookmarks.readTree(key)
    if (bm.items.some((item) => !item.deleted)) return true
    const wl = await wallets.readTree(key)
    if (wl.accounts.some((acct) => !acct.deleted)) return true
    return false
  } catch (e) {
    return true
  }
}

async function planMerge(bundle, key) {
  if (!(await bundleOpensWith(bundle, key))) throw new Error(KEY_MISMATCH_MSG)
  if (!(await localVaultOpensWith(key))) throw new Error(LOCAL_MISMATCH_MSG)
  const plan = { writes: [], sections: { logins: false, webcreds: false, personalInfo: false, bookmarks: false, wallets: false } }
  try {
    if (bundle.vault) {
      const incomingTree = await passwords.decryptAnyRowToTree(bundle.vault, key)
      const localTree = await localLoginTree(key)
      const base = localTree || emptyLoginTree()
      const merged = passwords.mergeVaults(base, incomingTree)
      if (!localTree || !passwords.sameCredentials(base, merged)) {
        plan.sections.logins = true
        plan.writes.push(() => passwords.writeVaultTree(merged, key))
      }
    }
    if (bundle.webcreds) {
      await webcreds.verifyVault(bundle.webcreds, key)
      const localWc = await store.getWebCredsVault()
      const base = localWc || emptyWebCreds()
      const merged = await webcreds.mergeWebCredsVaults(base, bundle.webcreds, key)
      if (!webcreds.sameWebCreds(base, merged)) {
        plan.sections.webcreds = true
        const bound = await webcreds.bindVault(merged, key)
        plan.writes.push(() => store.setWebCredsVault(bound))
      }
    }
    if (bundle.personalInfo) {
      const incomingProfile = await personalinfo.openRecord(bundle.personalInfo, key)
      const localPi = await store.getPersonalInfo()
      const localProfile = await personalinfo.openRecord(localPi, key)
      const merged = personalinfo.mergeProfiles(localProfile, incomingProfile)
      if (!personalinfo.sameProfiles(localProfile, merged)) {
        plan.sections.personalInfo = true
        const record = await personalinfo.sealRecord(merged, key, localPi)
        plan.writes.push(() => store.setPersonalInfo(record))
      }
    }
    if (bundle.bookmarks) {
      const incomingTree = await bookmarks.decryptRow(bundle.bookmarks, key)
      const localTree = await bookmarks.readTree(key)
      const merged = bookmarks.mergeTrees(localTree, incomingTree)
      if (!bookmarks.sameTrees(localTree, merged)) {
        plan.sections.bookmarks = true
        plan.writes.push(() => bookmarks.writeTree(merged, key))
      }
    }
    if (bundle.wallets) {
      const incomingTree = await wallets.decryptRow(bundle.wallets, key)
      const localTree = await wallets.readTree(key)
      const merged = wallets.mergeTrees(localTree, incomingTree)
      if (!wallets.sameTrees(localTree, merged)) {
        plan.sections.wallets = true
        plan.writes.push(() => wallets.writeTree(merged, key))
      }
    }
  } catch (e) {
    if (e && (e.message === KEY_MISMATCH_MSG || e.message === LOCAL_MISMATCH_MSG)) throw e
    throw new Error(DAMAGED_MSG)
  }
  return plan
}

async function mergeBundle(bundle, key) {
  const checked = Object.assign({}, bundle, checkSections(bundle))
  const plan = await planMerge(checked, key)
  for (const write of plan.writes) await write()
  if (plan.writes.length) await bindSections(key)
  return { changed: plan.writes.length > 0, sections: plan.sections }
}

function sealedRowIsBound(row) {
  return !row || !row.blob || isContextBound(row.blob)
}

async function localVaultIsBound() {
  if (!passwords.rowIsBound(await store.getPasswordVault())) return false
  if (!webcreds.vaultIsBound(await store.getWebCredsVault())) return false
  if (!personalinfo.recordIsContextBound(await store.getPersonalInfo())) return false
  if (!sealedRowIsBound(await store.getBookmarksVault())) return false
  return sealedRowIsBound(await store.getWalletVault())
}

async function putBack(snapshot, written, before, restore) {
  if (JSON.stringify(await snapshot()) !== JSON.stringify(written)) throw new Error(UPGRADE_SKIPPED_MSG)
  await restore(before)
  throw new Error(UPGRADE_FAILED_MSG)
}

async function rebind(read, write, restore, snapshot) {
  const before = await snapshot()
  const original = await read()
  const expected = JSON.stringify(original)
  if (JSON.stringify(await snapshot()) !== JSON.stringify(before)) return
  await write(original)
  const written = await snapshot()
  let check
  try { check = await read() } catch (e) { check = null }
  const same = check !== null && JSON.stringify(check) === expected
  if (!same && before !== null) await putBack(snapshot, written, before, restore)
}

async function withSyncLock(task) {
  if (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) return navigator.locks.request(SYNC_LOCK, task)
  return task()
}

async function bindLocalVault(key) {
  return withSyncLock(() => bindSections(key))
}

async function bindSections(key) {
  const loginRow = await store.getPasswordVault()
  if (loginRow && loginRow.schemaVersion === 2 && !passwords.rowIsBound(loginRow)) {
    await rebind(
      () => passwords.readVaultTree(key),
      (tree) => passwords.writeVaultTree(tree, key),
      (row) => store.setPasswordVault(row),
      () => store.getPasswordVault()
    )
  }
  const wc = await store.getWebCredsVault()
  if (wc && !webcreds.vaultIsBound(wc)) {
    const before = await webcreds.plainVault(wc, key)
    const bound = await webcreds.bindVault(wc, key)
    if (JSON.stringify(await store.getWebCredsVault()) !== JSON.stringify(wc)) return
    await store.setWebCredsVault(bound)
    const written = await store.getWebCredsVault()
    let after = null
    try { after = await webcreds.plainVault(written, key) } catch (e) {}
    if (after !== before) await putBack(() => store.getWebCredsVault(), written, wc, (row) => store.setWebCredsVault(row))
  }
  const pi = await store.getPersonalInfo()
  if (pi && !personalinfo.recordIsContextBound(pi)) {
    const expected = await personalinfo.openRecord(pi, key)
    const sealed = await personalinfo.sealRecord(expected, key, pi)
    if (JSON.stringify(await store.getPersonalInfo()) !== JSON.stringify(pi)) return
    await store.setPersonalInfo(sealed)
    const written = await store.getPersonalInfo()
    let after = null
    try { after = await personalinfo.openRecord(written, key) } catch (e) {}
    if (!after || !personalinfo.sameProfiles(after, expected)) await putBack(() => store.getPersonalInfo(), written, pi, (row) => store.setPersonalInfo(row))
  }
  const bm = await store.getBookmarksVault()
  if (bm && !sealedRowIsBound(bm)) {
    await rebind(
      () => bookmarks.readTree(key).then(stripAccess),
      (tree) => bookmarks.writeTree(tree, key),
      (row) => store.setBookmarksVault(row),
      () => store.getBookmarksVault()
    )
  }
  const wl = await store.getWalletVault()
  if (wl && !sealedRowIsBound(wl)) {
    await rebind(
      () => wallets.readTree(key).then(stripAccess),
      (tree) => wallets.writeTree(tree, key),
      (row) => store.setWalletVault(row),
      () => store.getWalletVault()
    )
  }
}

function stripAccess(tree) {
  if (tree && tree.meta) tree.meta.lastAccess = 0
  return tree
}

function describeMerge(result) {
  if (!result || !result.changed) return 'Already up to date. Nothing new in that vault.'
  const names = []
  if (result.sections.logins) names.push('logins')
  if (result.sections.webcreds) names.push('misc credentials')
  if (result.sections.personalInfo) names.push('personal info')
  if (result.sections.bookmarks) names.push('bookmarks')
  if (result.sections.wallets) names.push('crypto wallets')
  return 'Vault merged. Updated ' + names.join(', ') + '.'
}

export {
  SYNC_LOCK,
  VAULT_FILE_FORMAT,
  VAULT_FILE_VERSION,
  KEY_MISMATCH_MSG,
  LOCAL_MISMATCH_MSG,
  NOT_VAULT_MSG,
  NEWER_VERSION_MSG,
  DAMAGED_MSG,
  parseBundle,
  bundleFromPayload,
  payloadFromBundle,
  localVaultOpensWith,
  localVaultHasLiveData,
  bundleOpensWith,
  buildBundle,
  bundleHasData,
  mergeBundle,
  localVaultIsBound,
  bindLocalVault,
  describeMerge
}
