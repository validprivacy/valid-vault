import { encrypt, decrypt, isContextBound } from './crypto.js'
import { getWebCredsVault, setWebCredsVault } from './store.js'
import { mergeRecordLists } from './passwords.js'

function generateId() {
  return crypto.randomUUID()
}

function nameContext(id) {
  return 'webcreds:' + id + ':name'
}

function valueContext(id) {
  return 'webcreds:' + id + ':value'
}

async function openName(cred, masterKey) {
  return decrypt(cred.name, masterKey, nameContext(cred.id))
}

async function openValue(cred, masterKey) {
  return decrypt(cred.value, masterKey, valueContext(cred.id))
}

async function ensureVault() {
  const existing = await getWebCredsVault()
  if (existing) return { success: true }

  const vault = {
    meta: {
      version: 1,
      createdAt: Date.now(),
      lastAccess: Date.now()
    },
    credentials: {}
  }

  await setWebCredsVault(vault)
  return { success: true }
}

function isLive(cred) {
  return !cred.deleted
}

async function saveWebCredential(category, name, value, masterKey) {
  await ensureVault()
  const vault = await getWebCredsVault()

  if (!vault.credentials[category]) {
    vault.credentials[category] = []
  }

  const existing = []
  let previous = null
  for (const cred of vault.credentials[category]) {
    if (cred.deleted) {
      existing.push(cred)
      continue
    }
    const existingName = await openName(cred, masterKey)
    if (existingName === name) {
      if (!previous) previous = cred
      continue
    }
    existing.push(cred)
  }

  const now = Date.now()
  const id = previous ? previous.id : generateId()
  existing.push({
    id,
    name: await encrypt(name, masterKey, nameContext(id)),
    value: await encrypt(value, masterKey, valueContext(id)),
    createdAt: previous && previous.createdAt ? previous.createdAt : now,
    updatedAt: previous ? Math.max(now, (previous.updatedAt || 0) + 1) : now
  })

  vault.credentials[category] = existing
  vault.meta.lastAccess = Date.now()

  await setWebCredsVault(vault)
  return { success: true, id }
}

async function getWebCredentials(category, masterKey) {
  await ensureVault()
  const vault = await getWebCredsVault()

  const categoryCreds = vault.credentials[category]
  if (!categoryCreds || categoryCreds.length === 0) {
    return { success: true, credentials: [] }
  }

  const decrypted = []
  for (const cred of categoryCreds) {
    if (cred.deleted) continue
    try {
      decrypted.push({
        id: cred.id,
        name: await openName(cred, masterKey),
        value: await openValue(cred, masterKey),
        createdAt: cred.createdAt,
        updatedAt: cred.updatedAt
      })
    } catch (error) {
      return { success: false, error: 'Decryption failed' }
    }
  }

  return { success: true, credentials: decrypted }
}

async function getAllCategories() {
  await ensureVault()
  const vault = await getWebCredsVault()

  const categories = []
  for (const category of Object.keys(vault.credentials)) {
    const hasLive = vault.credentials[category].some(isLive)
    if (hasLive) categories.push(category)
  }

  return { success: true, categories }
}

async function updateWebCredential(credentialId, updates, masterKey) {
  const vault = await getWebCredsVault()
  if (!vault) return { success: false, error: 'No vault' }

  for (const category of Object.keys(vault.credentials)) {
    const creds = vault.credentials[category]
    function matchesId(candidate) {
      return candidate.id === credentialId
    }
    const index = creds.findIndex(matchesId)

    if (index !== -1) {
      if (creds[index].deleted) return { success: false, error: 'Credential deleted' }
      if (updates.name) {
        creds[index].name = await encrypt(updates.name, masterKey, nameContext(creds[index].id))
      }
      if (updates.value) {
        creds[index].value = await encrypt(updates.value, masterKey, valueContext(creds[index].id))
      }
      creds[index].updatedAt = Math.max(Date.now(), (creds[index].updatedAt || 0) + 1)
      vault.meta.lastAccess = Date.now()
      await setWebCredsVault(vault)
      return { success: true }
    }
  }

  return { success: false, error: 'Credential not found' }
}

async function deleteWebCredential(credentialId) {
  const vault = await getWebCredsVault()
  if (!vault) return { success: false, error: 'No vault' }

  for (const category of Object.keys(vault.credentials)) {
    const creds = vault.credentials[category]
    function matchesId(candidate) {
      return candidate.id === credentialId
    }
    const index = creds.findIndex(matchesId)

    if (index !== -1) {
      const now = Date.now()
      const tombstone = {
        id: creds[index].id,
        deleted: true,
        deletedAt: now,
        updatedAt: Math.max(now, (creds[index].updatedAt || 0) + 1)
      }
      if (creds[index].name) tombstone.name = creds[index].name
      creds[index] = tombstone

      vault.meta.lastAccess = Date.now()
      await setWebCredsVault(vault)
      return { success: true }
    }
  }

  return { success: false, error: 'Credential not found' }
}

async function identityFor(cred, masterKey) {
  if (!cred.name) return cred.deleted ? undefined : 'id:' + cred.id
  try {
    return 'name:' + (await openName(cred, masterKey))
  } catch (error) {
    return cred.deleted ? undefined : 'id:' + cred.id
  }
}

async function mergeWebCredsVaults(localVault, incomingVault, masterKey) {
  const merged = {
    meta: {
      version: localVault.meta.version,
      createdAt: Math.min(localVault.meta.createdAt || Date.now(), incomingVault.meta.createdAt || Date.now()),
      lastAccess: Date.now()
    },
    credentials: {}
  }

  const categories = new Set([
    ...Object.keys(localVault.credentials),
    ...Object.keys(incomingVault.credentials)
  ])

  for (const category of categories) {
    const localCreds = localVault.credentials[category] || []
    const incomingCreds = incomingVault.credentials[category] || []
    const identities = new Map()
    for (const cred of [...localCreds, ...incomingCreds]) identities.set(cred, await identityFor(cred, masterKey))
    const result = mergeRecordLists(localCreds, incomingCreds, identities)
    if (result.length > 0) merged.credentials[category] = result
  }

  return merged
}

function canonicalWebCreds(vault) {
  const out = {}
  for (const category of Object.keys((vault && vault.credentials) || {}).sort()) {
    const list = vault.credentials[category].slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    if (list.length > 0) out[category] = list
  }
  return JSON.stringify(out)
}

function sameWebCreds(a, b) {
  return canonicalWebCreds(a) === canonicalWebCreds(b)
}

async function verifyVault(vault, masterKey) {
  for (const list of Object.values(vault.credentials || {})) {
    for (const cred of list) {
      if (cred.deleted) continue
      await openName(cred, masterKey)
      await openValue(cred, masterKey)
    }
  }
}

function vaultIsBound(vault) {
  if (!vault || !vault.credentials) return true
  for (const list of Object.values(vault.credentials)) {
    for (const cred of list) {
      if (cred.name && !isContextBound(cred.name)) return false
      if (cred.value && !isContextBound(cred.value)) return false
    }
  }
  return true
}

async function bindVault(vault, masterKey) {
  const out = JSON.parse(JSON.stringify(vault))
  for (const list of Object.values(out.credentials || {})) {
    for (const cred of list) {
      if (cred.name && !isContextBound(cred.name)) cred.name = await encrypt(await openName(cred, masterKey), masterKey, nameContext(cred.id))
      if (cred.value && !isContextBound(cred.value)) cred.value = await encrypt(await openValue(cred, masterKey), masterKey, valueContext(cred.id))
    }
  }
  return out
}

async function plainVault(vault, masterKey) {
  const out = {}
  for (const category of Object.keys(vault.credentials || {}).sort()) {
    out[category] = []
    for (const cred of vault.credentials[category]) {
      const entry = { id: cred.id, deleted: !!cred.deleted, updatedAt: cred.updatedAt || 0 }
      if (!cred.deleted) { entry.name = await openName(cred, masterKey); entry.value = await openValue(cred, masterKey) }
      out[category].push(entry)
    }
  }
  return JSON.stringify(out)
}

export {
  verifyVault,
  vaultIsBound,
  bindVault,
  plainVault,
  ensureVault,
  saveWebCredential,
  getWebCredentials,
  getAllCategories,
  updateWebCredential,
  deleteWebCredential,
  mergeWebCredsVaults,
  sameWebCreds
}
