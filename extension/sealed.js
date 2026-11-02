import { CONTEXT_FORMAT, contextBytes, boundContext } from './crypto.js'

const IV_LENGTH = 12
const BASE64_CHUNK = 32768

function bytesToBase64(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + BASE64_CHUNK))
  }
  return btoa(binary)
}

function base64ToBytes(text) {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function streamBytes(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function sealJson(value, key, context) {
  const plain = new TextEncoder().encode(JSON.stringify(value))
  const compressed = await streamBytes(plain, new CompressionStream('deflate'))
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: contextBytes(context) }, key, compressed))
  return { iv: bytesToBase64(iv), data: bytesToBase64(ciphertext), aad: CONTEXT_FORMAT }
}

async function openJson(blob, key, context) {
  const iv = base64ToBytes(blob.iv)
  const ciphertext = base64ToBytes(blob.data)
  const bound = boundContext(blob, context)
  const params = bound === null ? { name: 'AES-GCM', iv } : { name: 'AES-GCM', iv, additionalData: contextBytes(bound) }
  const compressed = new Uint8Array(await crypto.subtle.decrypt(params, key, ciphertext))
  const plain = await streamBytes(compressed, new DecompressionStream('deflate'))
  return JSON.parse(new TextDecoder().decode(plain))
}

export { sealJson, openJson }
