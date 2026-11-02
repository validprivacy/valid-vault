import { encrypt, decrypt, isContextBound } from './crypto.js'
import { getPersonalInfo, setPersonalInfo } from './store.js'

const PROFILE_SCHEMA = 2
const PROFILE_CONTEXT = 'personal:profile'
const LIST_KINDS = ['emails', 'phones', 'addresses']
const NAME_FIELDS = ['firstName', 'lastName']
const ADDRESS_FIELDS = ['street', 'city', 'state', 'zip', 'country']
const LEGACY_ID_PREFIX = 'legacy:'

function generateId() {
  return crypto.randomUUID()
}

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function stampOf(value) {
  return typeof value === 'number' && isFinite(value) ? value : 0
}

function emptyAddress() {
  return { street: '', city: '', state: '', zip: '', country: '' }
}

function emptyProfile() {
  return { schema: PROFILE_SCHEMA, firstName: '', lastName: '', firstNameAt: 0, lastNameAt: 0, emails: [], phones: [], addresses: [] }
}

function cleanAddress(value) {
  const out = {}
  for (const field of ADDRESS_FIELDS) out[field] = text(value && value[field])
  return out
}

function entryKey(kind, entry) {
  if (kind === 'emails') return text(entry.value).toLowerCase()
  if (kind === 'phones') return text(entry.value).replace(/[^0-9+]/g, '').replace(/(?!^)\+/g, '')
  return ADDRESS_FIELDS.map((field) => text(entry[field]).toLowerCase().replace(/\s+/g, ' ')).join('|')
}

function entryIsBlank(kind, entry) {
  if (kind === 'addresses') return ADDRESS_FIELDS.every((field) => !text(entry[field]))
  return !text(entry.value)
}

function cleanEntry(kind, raw, fallbackStamp) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id) return null
  const updatedAt = stampOf(raw.updatedAt) || fallbackStamp
  if (raw.deleted === true) {
    const tombstone = { id: raw.id, deleted: true, updatedAt }
    if (typeof raw.key === 'string') tombstone.key = raw.key
    return tombstone
  }
  const entry = kind === 'addresses' ? Object.assign({ id: raw.id }, cleanAddress(raw)) : { id: raw.id, value: text(raw.value) }
  if (entryIsBlank(kind, entry)) return null
  entry.position = typeof raw.position === 'number' && isFinite(raw.position) ? raw.position : 0
  entry.updatedAt = updatedAt
  return entry
}

function normalizeProfile(raw, recordStamp) {
  const stamp = stampOf(recordStamp)
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const profile = emptyProfile()
  for (const field of NAME_FIELDS) {
    profile[field] = text(source[field])
    profile[field + 'At'] = stampOf(source[field + 'At']) || (profile[field] ? stamp : 0)
  }
  for (const kind of LIST_KINDS) {
    const list = Array.isArray(source[kind]) ? source[kind] : []
    profile[kind] = list.map((item) => cleanEntry(kind, item, stamp)).filter(Boolean)
  }
  if (source.schema !== PROFILE_SCHEMA) {
    const phone = text(source.phone)
    if (phone && !profile.phones.some((p) => !p.deleted && entryKey('phones', p) === entryKey('phones', { value: phone }))) {
      profile.phones.push({ id: LEGACY_ID_PREFIX + 'phone:' + entryKey('phones', { value: phone }), value: phone, position: profile.phones.length, updatedAt: stamp })
    }
    const address = cleanAddress(source.address)
    if (!entryIsBlank('addresses', address)) {
      profile.addresses.push(Object.assign({ id: LEGACY_ID_PREFIX + 'address:' + entryKey('addresses', address) }, address, { position: profile.addresses.length, updatedAt: stamp }))
    }
  }
  for (const kind of LIST_KINDS) renumber(profile, kind)
  return profile
}

function liveEntries(profile, kind) {
  return (profile[kind] || []).filter((entry) => !entry.deleted).sort((a, b) => a.position - b.position)
}

function renumber(profile, kind) {
  const live = liveEntries(profile, kind)
  live.forEach((entry, index) => { entry.position = index })
  profile[kind] = live.concat((profile[kind] || []).filter((entry) => entry.deleted))
}

function nextStamp(previous) {
  return Math.max(Date.now(), stampOf(previous) + 1)
}

function setName(profile, field, value) {
  if (NAME_FIELDS.indexOf(field) === -1) throw new Error('Unknown name field')
  profile[field] = text(value)
  profile[field + 'At'] = nextStamp(profile[field + 'At'])
  return profile
}

function entryData(kind, data) {
  return kind === 'addresses' ? cleanAddress(data) : { value: text(data && typeof data === 'object' ? data.value : data) }
}

function addEntry(profile, kind, data) {
  if (LIST_KINDS.indexOf(kind) === -1) throw new Error('Unknown list')
  const entry = Object.assign({ id: generateId() }, entryData(kind, data))
  if (entryIsBlank(kind, entry)) throw new Error('Nothing to add')
  const live = liveEntries(profile, kind)
  if (live.some((existing) => entryKey(kind, existing) === entryKey(kind, entry))) return { profile, added: false }
  entry.position = live.length
  entry.updatedAt = nextStamp(0)
  profile[kind] = (profile[kind] || []).concat([entry])
  renumber(profile, kind)
  return { profile, added: true, id: entry.id }
}

function updateEntry(profile, kind, id, data) {
  const entry = (profile[kind] || []).find((item) => item.id === id && !item.deleted)
  if (!entry) throw new Error('Entry not found')
  const next = entryData(kind, data)
  if (entryIsBlank(kind, next)) throw new Error('Nothing to save')
  Object.assign(entry, next)
  entry.updatedAt = nextStamp(entry.updatedAt)
  return profile
}

function removeEntry(profile, kind, id) {
  const list = profile[kind] || []
  const index = list.findIndex((item) => item.id === id && !item.deleted)
  if (index === -1) return profile
  list[index] = { id, deleted: true, updatedAt: nextStamp(list[index].updatedAt), key: entryKey(kind, list[index]) }
  renumber(profile, kind)
  return profile
}

function moveEntry(profile, kind, id, direction) {
  const live = liveEntries(profile, kind)
  const index = live.findIndex((item) => item.id === id)
  const swap = index + direction
  if (index === -1 || swap < 0 || swap >= live.length) return profile
  const held = live[index]
  live[index] = live[swap]
  live[swap] = held
  live.forEach((entry, i) => { entry.position = i })
  return profile
}

function laterEntry(a, b) {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b
  if (a.deleted && !b.deleted) return a
  if (b.deleted && !a.deleted) return b
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b
}

function olderEntry(a, b) {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? a : b
  return a.id <= b.id ? a : b
}

function mergeList(kind, localList, incomingList) {
  const winners = new Map()
  for (const entry of localList.concat(incomingList)) {
    const current = winners.get(entry.id)
    winners.set(entry.id, current ? laterEntry(current, entry) : entry)
  }
  const removedAt = new Map()
  for (const entry of winners.values()) {
    if (!entry.deleted || typeof entry.key !== 'string') continue
    removedAt.set(entry.key, Math.max(removedAt.get(entry.key) || 0, entry.updatedAt))
  }
  const keepers = new Map()
  for (const entry of winners.values()) {
    if (entry.deleted) continue
    const key = entryKey(kind, entry)
    if ((removedAt.get(key) || 0) > entry.updatedAt) continue
    const current = keepers.get(key)
    if (!current || olderEntry(entry, current) === entry) keepers.set(key, entry)
  }
  const slotKeys = new Map()
  for (const entry of Array.from(winners.values())) {
    if (entry.deleted) continue
    const key = entryKey(kind, entry)
    const keeper = keepers.get(key)
    if (!keeper) continue
    slotKeys.set(entry.id, key)
    if (keeper.id !== entry.id) winners.set(entry.id, { id: entry.id, deleted: true, updatedAt: entry.updatedAt })
  }
  const localOrder = localList.filter((entry) => !entry.deleted).sort((a, b) => a.position - b.position).map((entry) => entry.id)
  const incomingOrder = incomingList.filter((entry) => !entry.deleted).sort((a, b) => a.position - b.position).map((entry) => entry.id)
  const placedKeys = new Set()
  const live = []
  for (const id of localOrder.concat(incomingOrder)) {
    const key = slotKeys.get(id)
    if (key === undefined || placedKeys.has(key)) continue
    placedKeys.add(key)
    live.push(Object.assign({}, keepers.get(key), { position: live.length }))
  }
  const tombstones = Array.from(winners.values()).filter((entry) => entry.deleted).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return live.concat(tombstones)
}

function mergeProfiles(localProfile, incomingProfile) {
  const local = localProfile || emptyProfile()
  const incoming = incomingProfile || emptyProfile()
  const merged = emptyProfile()
  for (const field of NAME_FIELDS) {
    const at = field + 'At'
    const useIncoming = incoming[at] > local[at] || (incoming[at] === local[at] && incoming[field] > local[field])
    merged[field] = useIncoming ? incoming[field] : local[field]
    merged[at] = useIncoming ? incoming[at] : local[at]
  }
  for (const kind of LIST_KINDS) merged[kind] = mergeList(kind, local[kind] || [], incoming[kind] || [])
  return merged
}

function canonicalProfile(profile) {
  const out = {}
  for (const field of NAME_FIELDS) { out[field] = profile[field]; out[field + 'At'] = profile[field + 'At'] }
  for (const kind of LIST_KINDS) out[kind] = (profile[kind] || []).slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return JSON.stringify(out)
}

function sameProfiles(a, b) {
  return canonicalProfile(a) === canonicalProfile(b)
}

function profileHasData(profile) {
  return !!(profile.firstName || profile.lastName || LIST_KINDS.some((kind) => liveEntries(profile, kind).length))
}

function fieldValues(profile, fieldType) {
  if (fieldType === 'firstName' || fieldType === 'lastName') return profile[fieldType] ? [profile[fieldType]] : []
  if (fieldType === 'email') return liveEntries(profile, 'emails').map((entry) => entry.value)
  if (fieldType === 'phone') return liveEntries(profile, 'phones').map((entry) => entry.value)
  if (fieldType.indexOf('address.') === 0) {
    const sub = fieldType.slice(8)
    if (ADDRESS_FIELDS.indexOf(sub) === -1) return []
    const out = []
    for (const entry of liveEntries(profile, 'addresses')) if (entry[sub] && out.indexOf(entry[sub]) === -1) out.push(entry[sub])
    return out
  }
  return []
}

async function openRecord(record, masterKey) {
  if (!record || !record.data) return emptyProfile()
  const json = await decrypt(record.data, masterKey, PROFILE_CONTEXT)
  return normalizeProfile(JSON.parse(json), record.updatedAt)
}

async function sealRecord(profile, masterKey, existing) {
  const now = Date.now()
  return {
    data: await encrypt(JSON.stringify(normalizeProfile(profile, now)), masterKey, PROFILE_CONTEXT),
    createdAt: existing && existing.createdAt ? existing.createdAt : now,
    updatedAt: now
  }
}

async function getProfile(masterKey) {
  try {
    const record = await getPersonalInfo()
    const profile = await openRecord(record, masterKey)
    return { success: true, profile, updatedAt: record && record.updatedAt ? record.updatedAt : 0 }
  } catch (error) {
    return { success: false, error: 'Decryption failed' }
  }
}

async function saveProfile(profile, masterKey) {
  const existing = await getPersonalInfo()
  await setPersonalInfo(await sealRecord(profile, masterKey, existing))
  return { success: true }
}

function recordIsContextBound(record) {
  return !record || !record.data || isContextBound(record.data)
}

export {
  PROFILE_SCHEMA,
  PROFILE_CONTEXT,
  LIST_KINDS,
  ADDRESS_FIELDS,
  emptyProfile,
  emptyAddress,
  normalizeProfile,
  liveEntries,
  setName,
  addEntry,
  updateEntry,
  removeEntry,
  moveEntry,
  mergeProfiles,
  sameProfiles,
  profileHasData,
  fieldValues,
  openRecord,
  sealRecord,
  getProfile,
  saveProfile,
  recordIsContextBound,
  generateId
}
