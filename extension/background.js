import * as uniVault from './linkedvault.js'
import { masterKeyToCryptoKey } from './crypto.js'
import { openDB as openVaultStore } from './store.js'
import { saveCredential as passwordsSaveCredential, getCredentials as passwordsGetCredentials, getRelatedCredentials as passwordsGetRelated, noteCredentialUse as passwordsNoteUse, restorePreviousPassword as passwordsRestorePrevious } from './passwords.js'
import { generateCode as totpGenerateCode } from './totp.js'
import { openRecord as openProfileRecord, fieldValues as profileFieldValues } from './personalinfo.js'
import { bindLocalVault } from './vaultfile.js'

function readRawRecord(storeName, key) {
  return new Promise(function (resolve) {
    const req = indexedDB.open('ValidVault')
    req.onsuccess = function () {
      const db = req.result
      db.onversionchange = function () { db.close() }
      try {
        const tx = db.transaction(storeName, 'readonly')
        const get = tx.objectStore(storeName).get(key)
        get.onsuccess = function () { resolve(get.result || null) }
        get.onerror = function () { resolve(null) }
        tx.oncomplete = function () { db.close() }
        tx.onabort = function () { db.close() }
      } catch (e) {
        db.close()
        resolve(null)
      }
    }
    req.onerror = function () { resolve(null) }
  })
}

openVaultStore().catch(() => {})

async function getSessionKeyBytes() {
  try {
    const stored = await chrome.storage.session.get('masterKeyBytes')
    if (stored && stored.masterKeyBytes) return stored.masterKeyBytes
  } catch (e) {}
  return null
}

const LOCK_SIGNAL_KEY = 'vaultLockedAt'
const sessionState = { epoch: 0 }

function sameKeyBytes(a, b) {
  if (!a || !b || a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

async function withSessionKey(usages, lockedResult, fn) {
  const epoch = sessionState.epoch
  const bytes = await getSessionKeyBytes()
  if (!bytes) return lockedResult()
  const key = await crypto.subtle.importKey('raw', new Uint8Array(bytes), { name: 'AES-GCM', length: 256 }, false, usages)
  const result = await fn(key)
  if (epoch !== sessionState.epoch) return lockedResult()
  if (!sameKeyBytes(bytes, await getSessionKeyBytes())) return lockedResult()
  return result
}

function revokeSession() {
  sessionState.epoch++
  try { chrome.storage.local.set({ [LOCK_SIGNAL_KEY]: Date.now() }).catch(() => {}) } catch (e) {}
}

async function getPersonalInfoRecord() {
  try { await openVaultStore() } catch (e) {}
  return readRawRecord('personalInfo', 'profile')
}

async function loadDecryptedProfile() {
  return withSessionKey(['decrypt'], () => ({ success: false, locked: true }), async (key) => {
    const record = await getPersonalInfoRecord()
    if (!record || !record.data) return { success: true, profile: null }
    try {
      return { success: true, profile: await openProfileRecord(record, key) }
    } catch (e) {
      return { success: false, locked: true }
    }
  })
}

async function personalInfoField(fieldType) {
  const result = await loadDecryptedProfile()
  if (!result.success) return { success: false, value: null, values: [], locked: true }
  const values = result.profile ? profileFieldValues(result.profile, String(fieldType || '')) : []
  return { success: true, value: values.length ? values[0] : null, values }
}

async function personalInfoAllEmails() {
  const result = await loadDecryptedProfile()
  if (!result.success) return { success: false, emails: [], locked: true }
  return { success: true, emails: result.profile ? profileFieldValues(result.profile, 'email') : [] }
}

function pageCredential(cred) {
  const out = Object.assign({}, cred)
  delete out.totp
  out.hasTotp = !!cred.totp
  return out
}

async function bindAfterUnlock(bytes) {
  try {
    const key = await crypto.subtle.importKey('raw', new Uint8Array(bytes), { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    await bindLocalVault(key)
  } catch (e) {}
}

async function credentialsForDomainViaShared(domain) {
  const locked = () => ({ success: false, credentials: [], locked: true })
  return withSessionKey(['decrypt'], locked, async (key) => {
    const result = await passwordsGetCredentials(domain, key)
    if (!result.success) return locked()
    return { success: true, credentials: result.credentials.map(pageCredential) }
  })
}

async function relatedCredentialsViaShared(domain) {
  const locked = () => ({ success: false, groups: [], locked: true })
  return withSessionKey(['decrypt'], locked, async (key) => {
    const result = await passwordsGetRelated(domain, key)
    if (!result.success) return locked()
    return { success: true, groups: result.groups.map((group) => ({ domain: group.domain, credentials: group.credentials.map(pageCredential) })) }
  })
}

function senderHost(sender) {
  try {
    const url = new URL(sender && sender.url ? sender.url : '')
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return ''
    return url.hostname.toLowerCase()
  } catch (e) {
    return ''
  }
}

async function codeEntries(credentials, domain) {
  const out = []
  for (const cred of credentials) {
    if (!cred.totp) continue
    try {
      const result = await totpGenerateCode(cred.totp)
      out.push({ username: cred.username, domain, code: result.code, remaining: result.remaining })
    } catch (e) {}
  }
  return out
}

async function totpCodesForSender(sender) {
  const host = senderHost(sender)
  if (!host) return { success: false, codes: [], related: [] }
  const locked = () => ({ success: false, codes: [], related: [], locked: true })
  return withSessionKey(['decrypt'], locked, async (key) => {
    const exact = await passwordsGetCredentials(host, key)
    if (!exact.success) return locked()
    const codes = await codeEntries(exact.credentials, host)
    const related = []
    const groups = await passwordsGetRelated(host, key)
    if (groups.success) {
      for (const group of groups.groups) related.push(...(await codeEntries(group.credentials, group.domain)))
    }
    return { success: true, codes, related }
  })
}

async function saveCredentialViaShared(domain, username, password, extraFields, loginType) {
  const bytes = await getSessionKeyBytes()
  if (!bytes) return { success: false, locked: true }
  const key = await crypto.subtle.importKey('raw', new Uint8Array(bytes), { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  return passwordsSaveCredential(domain, username, password, key, extraFields, loginType)
}

async function sharedKey() {
  const bytes = await getSessionKeyBytes()
  if (!bytes) return null
  return crypto.subtle.importKey('raw', new Uint8Array(bytes), { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

async function noteCredentialUseViaShared(domain, username) {
  const key = await sharedKey()
  if (!key) return { success: false, locked: true }
  try { return await passwordsNoteUse(domain, username, key) } catch (e) { return { success: false } }
}

async function restorePreviousViaShared(domain, username) {
  const key = await sharedKey()
  if (!key) return { success: false, locked: true }
  try { return await passwordsRestorePrevious(domain, username, key) } catch (e) { return { success: false } }
}

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === 'noteCredentialUse') {
    noteCredentialUseViaShared(request.domain, request.username).then(sendResponse)
    return true
  }
  if (request.action === 'restorePreviousPassword') {
    restorePreviousViaShared(request.domain, request.username).then(sendResponse)
    return true
  }
  if (request.action === 'saveCredential') {
    saveCredentialViaShared(request.domain, request.username, request.password, request.extraFields, request.loginType).then(sendResponse)
    return true
  }
  if (request.action === 'getRelatedCredentials') {
    relatedCredentialsViaShared(request.domain).then(sendResponse)
    return true
  }
  if (request.action === 'getCredentialsForDomain') {
    credentialsForDomainViaShared(request.domain).then(sendResponse)
    return true
  }
  if (request.action === 'getTotpCodes') {
    totpCodesForSender(sender).then(sendResponse).catch(function () { sendResponse({ success: false, codes: [], related: [] }) })
    return true
  }
  if (request.action === 'getPersonalInfoField') {
    personalInfoField(request.fieldType).then(sendResponse)
    return true
  }
  if (request.action === 'getPersonalInfoAllEmails') {
    personalInfoAllEmails().then(sendResponse)
    return true
  }
  if (request.action === 'sessionState') {
    getSessionKeyBytes().then(function (bytes) { sendResponse({ unlocked: !!bytes }) })
    return true
  }
  if (request.action === 'persistSessionKey') {
    chrome.storage.session.set({ masterKeyBytes: request.masterKeyBytes, lastActivity: Date.now() })
      .then(function () { sendResponse({ success: true }); bindAfterUnlock(request.masterKeyBytes) })
      .catch(function () { sendResponse({ success: false }) })
    return true
  }
  if (request.action === 'requestUnlock') {
    requestUnlock(sender).then(sendResponse)
    return true
  }
  if (request.action === 'openManage') {
    chrome.tabs.create({ url: 'manage.html' })
    sendResponse({ success: true })
    return false
  }
  if (request.action === 'stagePendingSave') {
    stagePendingSave(sender, request.id, request.domain, request.username, request.password, request.extraFields, request.loginType)
      .then(function () { sendResponse({ success: true }) })
    return true
  }
  if (request.action === 'takePendingSave') {
    takePendingSave(sender).then(sendResponse)
    return true
  }
  if (request.action === 'resolvePendingSave') {
    resolvePendingSave(sender, request.id)
      .then(function () { sendResponse({ success: true }) })
    return true
  }
  return false
})

const UNLOCK_WINDOW_WIDTH = 380
const UNLOCK_WINDOW_HEIGHT = 440
const UNLOCK_TIMEOUT_MS = 180000
const unlockWaiters = []
let unlockWindowId = null

function settleUnlockWaiters(success) {
  while (unlockWaiters.length) {
    const waiter = unlockWaiters.shift()
    clearTimeout(waiter.timer)
    waiter.resolve({ success })
  }
}

async function openUnlockWindow(sender) {
  if (unlockWindowId !== null) {
    try {
      await chrome.windows.update(unlockWindowId, { focused: true })
      return
    } catch (e) {
      unlockWindowId = null
    }
  }
  let site = ''
  if (sender.url && !sender.url.startsWith(chrome.runtime.getURL(''))) {
    try { site = new URL(sender.url).hostname } catch (e) {}
  }
  const options = {
    url: 'unlock.html?site=' + encodeURIComponent(site),
    type: 'popup',
    width: UNLOCK_WINDOW_WIDTH,
    height: UNLOCK_WINDOW_HEIGHT,
    focused: true
  }
  try {
    const parent = await chrome.windows.get(sender.tab.windowId)
    options.left = Math.max(0, Math.round(parent.left + (parent.width - UNLOCK_WINDOW_WIDTH) / 2))
    options.top = Math.max(0, Math.round(parent.top + (parent.height - UNLOCK_WINDOW_HEIGHT) / 2))
  } catch (e) {}
  try {
    const win = await chrome.windows.create(options)
    unlockWindowId = win.id
  } catch (e) {
    settleUnlockWaiters(false)
  }
}

async function requestUnlock(sender) {
  if (await getSessionKeyBytes()) return { success: true }
  const result = new Promise(function (resolve) {
    const waiter = { resolve }
    waiter.timer = setTimeout(function () {
      const idx = unlockWaiters.indexOf(waiter)
      if (idx !== -1) unlockWaiters.splice(idx, 1)
      resolve({ success: false })
    }, UNLOCK_TIMEOUT_MS)
    unlockWaiters.push(waiter)
  })
  await openUnlockWindow(sender)
  return result
}

chrome.windows.onRemoved.addListener(async function (windowId) {
  if (windowId !== unlockWindowId) return
  unlockWindowId = null
  settleUnlockWaiters(!!(await getSessionKeyBytes()))
})

const PENDING_SAVE_TTL_MS = 45000
const PENDING_SAVE_MAX_PER_TAB = 5
const PENDING_SAVE_PREFIX = 'pendingSave_'

const tabPendingSaveLocks = new Map()
function withPendingSaveLock(tabId, fn) {
  const prevTail = tabPendingSaveLocks.get(tabId) || Promise.resolve()
  const result = prevTail.then(fn, fn)
  tabPendingSaveLocks.set(tabId, result.then(() => {}, () => {}))
  return result
}

async function stagePendingSave(sender, id, domain, username, password, extraFields, loginType) {
  const tabId = sender && sender.tab && sender.tab.id
  if (tabId === undefined || tabId === null || !id) return
  return withPendingSaveLock(tabId, async () => {
    const key = 'pendingSave_' + tabId
    try {
      const stored = await chrome.storage.session.get(key)
      const map = (stored && stored[key]) || {}
      map[id] = { domain, username, password, extraFields, loginType, ts: Date.now() }
      const ids = Object.keys(map)
      if (ids.length > PENDING_SAVE_MAX_PER_TAB) {
        ids.sort((a, b) => map[a].ts - map[b].ts)
        for (let i = 0; i < ids.length - PENDING_SAVE_MAX_PER_TAB; i++) delete map[ids[i]]
      }
      await chrome.storage.session.set({ [key]: map })
    } catch (e) {}
  })
}

async function takePendingSave(sender) {
  const tabId = sender && sender.tab && sender.tab.id
  if (tabId === undefined || tabId === null) return { found: false }
  return withPendingSaveLock(tabId, async () => {
    const key = 'pendingSave_' + tabId
    try {
      const stored = await chrome.storage.session.get(key)
      const map = (stored && stored[key]) || {}
      const now = Date.now()
      let changed = false
      let oldestId = null
      for (const id of Object.keys(map)) {
        if (now - map[id].ts > PENDING_SAVE_TTL_MS) { delete map[id]; changed = true; continue }
        if (!oldestId || map[id].ts < map[oldestId].ts) oldestId = id
      }
      if (changed) await chrome.storage.session.set({ [key]: map })
      if (!oldestId) return { found: false }
      const entry = map[oldestId]
      return { found: true, id: oldestId, domain: entry.domain, username: entry.username, password: entry.password, extraFields: entry.extraFields, loginType: entry.loginType }
    } catch (e) {
      return { found: false }
    }
  })
}

async function resolvePendingSave(sender, id) {
  const tabId = sender && sender.tab && sender.tab.id
  if (tabId === undefined || tabId === null || !id) return
  return withPendingSaveLock(tabId, async () => {
    const key = 'pendingSave_' + tabId
    try {
      const stored = await chrome.storage.session.get(key)
      const map = stored && stored[key]
      if (!map) return
      delete map[id]
      if (Object.keys(map).length === 0) await chrome.storage.session.remove(key)
      else await chrome.storage.session.set({ [key]: map })
    } catch (e) {}
  })
}

async function pendingSaveTabIds() {
  try {
    const all = await chrome.storage.session.get(null)
    return Object.keys(all || {}).filter((key) => key.startsWith(PENDING_SAVE_PREFIX)).map((key) => Number(key.slice(PENDING_SAVE_PREFIX.length)))
  } catch (e) {
    return []
  }
}

function dropPendingSaves(tabId) {
  return withPendingSaveLock(tabId, async () => {
    try { await chrome.storage.session.remove(PENDING_SAVE_PREFIX + tabId) } catch (e) {}
  }).then(() => {
    const tail = tabPendingSaveLocks.get(tabId)
    if (tail) tail.then(() => { if (tabPendingSaveLocks.get(tabId) === tail) tabPendingSaveLocks.delete(tabId) })
  })
}

async function clearAllPendingSaves() {
  const tabIds = await pendingSaveTabIds()
  await Promise.all(tabIds.map((tabId) => dropPendingSaves(tabId)))
}

async function sweepPendingSaves() {
  const tabIds = await pendingSaveTabIds()
  await Promise.all(tabIds.map((tabId) => withPendingSaveLock(tabId, async () => {
    const key = PENDING_SAVE_PREFIX + tabId
    try {
      const stored = await chrome.storage.session.get(key)
      const map = (stored && stored[key]) || {}
      const now = Date.now()
      let changed = false
      for (const id of Object.keys(map)) {
        if (!map[id] || typeof map[id].ts !== 'number' || now - map[id].ts > PENDING_SAVE_TTL_MS) { delete map[id]; changed = true }
      }
      if (Object.keys(map).length === 0) await chrome.storage.session.remove(key)
      else if (changed) await chrome.storage.session.set({ [key]: map })
    } catch (e) {}
  })))
}

chrome.tabs.onRemoved.addListener(function (tabId) {
  dropPendingSaves(tabId)
})

const DEFAULT_AUTOLOCK_SEC = 60
const AUTOLOCK_ALARM = 'autoLock'
const INACTIVITY_ALARM = 'inactivityCheck'

async function getAutoLockMs() {
  let seconds = DEFAULT_AUTOLOCK_SEC
  try {
    const r = await chrome.storage.local.get(['autoLockTimeout'])
    if (r.autoLockTimeout) seconds = r.autoLockTimeout
  } catch (e) {}
  return seconds * 1000
}

async function scheduleAutoLock() {
  try {
    const stored = await chrome.storage.session.get(['masterKeyBytes', 'lastActivity'])
    if (!stored || !stored.masterKeyBytes) return
    const last = stored.lastActivity || Date.now()
    chrome.alarms.create(AUTOLOCK_ALARM, { when: last + (await getAutoLockMs()) + 250 })
  } catch (e) {}
}

async function markActivity() {
  try { await chrome.storage.session.set({ lastActivity: Date.now() }) } catch (e) {}
  await scheduleAutoLock()
}

async function checkInactivity() {
  const stored = await chrome.storage.session.get(['masterKeyBytes', 'lastActivity'])
  if (!stored || !stored.masterKeyBytes) return
  const last = stored.lastActivity || Date.now()
  if (Date.now() - last >= (await getAutoLockMs())) {
    try { await chrome.storage.session.remove(['masterKeyBytes', 'softLocked']) } catch (e) {}
  } else {
    await scheduleAutoLock()
  }
}

const UNIVAULT_CHANGE_DELAY_MS = 800
const UNIVAULT_UNLOCK_DELAY_MS = 300
const uniVaultState = { timer: null }

async function backgroundUniVaultSync() {
  try {
    if (!(await uniVault.getLink())) return
    const bytes = await getSessionKeyBytes()
    if (!bytes) return
    const key = await masterKeyToCryptoKey(new Uint8Array(bytes))
    await uniVault.syncNow(key)
  } catch (e) {}
}

function queueUniVaultSync(delay) {
  if (uniVaultState.timer) clearTimeout(uniVaultState.timer)
  uniVaultState.timer = setTimeout(function () {
    uniVaultState.timer = null
    backgroundUniVaultSync()
  }, delay)
}

chrome.alarms.create(INACTIVITY_ALARM, { periodInMinutes: 0.5 })
chrome.alarms.onAlarm.addListener(function (alarm) {
  if (alarm.name === INACTIVITY_ALARM || alarm.name === AUTOLOCK_ALARM) checkInactivity()
  if (alarm.name === INACTIVITY_ALARM) backgroundUniVaultSync()
  if (alarm.name === INACTIVITY_ALARM) sweepPendingSaves()
})

chrome.storage.onChanged.addListener(function (changes, area) {
  if (area !== 'session' || !changes.masterKeyBytes || changes.masterKeyBytes.newValue) return
  revokeSession()
  if (changes.masterKeyBytes.oldValue) clearAllPendingSaves()
})

chrome.storage.onChanged.addListener(function (changes, area) {
  if (area === 'local' && changes.vaultChangedAt) queueUniVaultSync(UNIVAULT_CHANGE_DELAY_MS)
  if (area === 'session' && changes.masterKeyBytes && changes.masterKeyBytes.newValue) queueUniVaultSync(UNIVAULT_UNLOCK_DELAY_MS)
})

chrome.storage.onChanged.addListener(function (changes, area) {
  if (area !== 'session' || !changes.masterKeyBytes || !changes.masterKeyBytes.newValue) return
  settleUnlockWaiters(true)
  if (changes.lastActivity && changes.lastActivity.newValue) scheduleAutoLock()
  else markActivity()
})

chrome.runtime.onMessage.addListener(function (request) {
  if (request && request.action === 'activity') markActivity()
  return false
})
