const SALT_LENGTH = 16
const IV_LENGTH = 12
const KEY_LENGTH = 256
const MASTER_KEY_LENGTH = 32
const PBKDF2_ITERATIONS = 600000
const LEGACY_PBKDF2_ITERATIONS = 100000
const CONTEXT_FORMAT = 1
const CONTEXT_PREFIX = 'valid-vault/'

async function generateSalt() {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
}

async function generateIV() {
  return crypto.getRandomValues(new Uint8Array(IV_LENGTH))
}

async function generateMasterKey() {
  return crypto.getRandomValues(new Uint8Array(MASTER_KEY_LENGTH))
}

async function deriveKeyFromSecret(secret, salt, iterations = PBKDF2_ITERATIONS) {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    typeof secret === 'string' ? encoder.encode(secret) : secret,
    'PBKDF2',
    false,
    ['deriveKey']
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['wrapKey', 'unwrapKey', 'encrypt', 'decrypt']
  )
}

async function deriveKeyFromPrfOutput(prfOutput, info) {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    prfOutput instanceof Uint8Array ? prfOutput : new Uint8Array(prfOutput),
    'HKDF',
    false,
    ['deriveKey']
  )

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: encoder.encode(info)
    },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['wrapKey', 'unwrapKey', 'encrypt', 'decrypt']
  )
}

async function masterKeyToCryptoKey(masterKeyBytes) {
  return crypto.subtle.importKey(
    'raw',
    masterKeyBytes,
    { name: 'AES-GCM', length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  )
}

async function wrapMasterKey(masterKeyBytes, wrappingKey) {
  const iv = await generateIV()
  const masterKey = await crypto.subtle.importKey(
    'raw',
    masterKeyBytes,
    { name: 'AES-GCM', length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  )

  const wrapped = await crypto.subtle.wrapKey(
    'raw',
    masterKey,
    wrappingKey,
    { name: 'AES-GCM', iv: iv }
  )

  return {
    iv: Array.from(iv),
    wrapped: Array.from(new Uint8Array(wrapped))
  }
}

async function unwrapMasterKey(wrappedData, unwrappingKey) {
  const iv = new Uint8Array(wrappedData.iv)
  const wrapped = new Uint8Array(wrappedData.wrapped)

  const masterKey = await crypto.subtle.unwrapKey(
    'raw',
    wrapped,
    unwrappingKey,
    { name: 'AES-GCM', iv: iv },
    { name: 'AES-GCM', length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  )

  return masterKey
}

function contextBytes(context) {
  if (typeof context !== 'string' || !context) throw new Error('Encryption context is required')
  return new TextEncoder().encode(CONTEXT_PREFIX + context)
}

function gcmParams(iv, context) {
  return context === null ? { name: 'AES-GCM', iv } : { name: 'AES-GCM', iv, additionalData: contextBytes(context) }
}

function isContextBound(encrypted) {
  return !!encrypted && encrypted.aad === CONTEXT_FORMAT
}

function boundContext(encrypted, context) {
  if (encrypted && encrypted.aad !== undefined && encrypted.aad !== CONTEXT_FORMAT) throw new Error('Unsupported encryption format')
  return isContextBound(encrypted) ? context : null
}

async function encrypt(plaintext, key, context) {
  const encoder = new TextEncoder()
  const additionalData = contextBytes(context)
  const iv = await generateIV()
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData },
    key,
    encoder.encode(plaintext)
  )
  return {
    iv: Array.from(iv),
    ciphertext: Array.from(new Uint8Array(ciphertext)),
    aad: CONTEXT_FORMAT
  }
}

async function decrypt(encrypted, key, context) {
  const decoder = new TextDecoder()
  const iv = new Uint8Array(encrypted.iv)
  const ciphertext = new Uint8Array(encrypted.ciphertext)

  const plaintext = await crypto.subtle.decrypt(
    gcmParams(iv, boundContext(encrypted, context)),
    key,
    ciphertext
  )

  return decoder.decode(plaintext)
}

export {
  PBKDF2_ITERATIONS,
  LEGACY_PBKDF2_ITERATIONS,
  generateSalt,
  generateIV,
  generateMasterKey,
  deriveKeyFromSecret,
  deriveKeyFromPrfOutput,
  masterKeyToCryptoKey,
  wrapMasterKey,
  unwrapMasterKey,
  CONTEXT_FORMAT,
  contextBytes,
  isContextBound,
  boundContext,
  encrypt,
  decrypt
}
