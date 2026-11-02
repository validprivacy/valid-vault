const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const MIN_SECRET_BYTES = 10
const MAX_SECRET_BYTES = 128
const DEFAULT_DIGITS = 6
const DEFAULT_PERIOD = 30
const DEFAULT_ALGORITHM = 'SHA1'
const ALLOWED_DIGITS = new Set([6, 7, 8])
const ALLOWED_PERIODS = new Set([30, 60])
const ALGORITHMS = { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA512: 'SHA-512' }
const TICK_MS = 1000
const DETACHED_TICKS = 3
const OTPAUTH_PREFIX = 'otpauth://'
const MAX_INPUT_CHARS = 2048

function cleanSecret(text) {
  return String(text || '').replace(/[\s\-]+/g, '').replace(/=+$/, '').toUpperCase()
}

function base32Bytes(text) {
  const clean = cleanSecret(text)
  if (!clean) return null
  let bits = 0
  let value = 0
  const out = []
  for (const ch of clean) {
    const index = BASE32_ALPHABET.indexOf(ch)
    if (index === -1) return null
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return new Uint8Array(out)
}

function secretProblem(secret) {
  const clean = cleanSecret(secret)
  if (!clean) return 'Enter the setup key from the site.'
  if (/[^A-Z2-7]/.test(clean)) return 'A setup key only uses the letters A to Z and the numbers 2 to 7. Check for a typo, such as 0 for O or 1 for I.'
  const bytes = base32Bytes(clean)
  if (!bytes || bytes.length < MIN_SECRET_BYTES) return 'That setup key is too short. Setup keys are usually 16 or 32 characters.'
  if (bytes.length > MAX_SECRET_BYTES) return 'That setup key is too long.'
  return null
}

function normalizeAlgorithm(value) {
  const name = String(value || DEFAULT_ALGORITHM).toUpperCase().replace(/[^A-Z0-9]/g, '')
  return ALGORITHMS[name] ? name : null
}

function isTotpConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  if (typeof value.secret !== 'string' || secretProblem(value.secret)) return false
  if (!ALLOWED_DIGITS.has(value.digits)) return false
  if (!ALLOWED_PERIODS.has(value.period)) return false
  if (!ALGORITHMS[value.algorithm]) return false
  return true
}

function buildConfig(secret, digits, period, algorithm) {
  const problem = secretProblem(secret)
  if (problem) return { error: problem }
  if (!ALLOWED_DIGITS.has(digits)) return { error: 'Valid Vault supports codes of 6, 7, or 8 digits.' }
  if (!ALLOWED_PERIODS.has(period)) return { error: 'Valid Vault supports codes that change every 30 or 60 seconds.' }
  if (!algorithm) return { error: 'Valid Vault supports SHA1, SHA256, and SHA512 codes.' }
  return { config: { secret: cleanSecret(secret), digits, period, algorithm } }
}

function numberParam(params, name, fallback) {
  const raw = params.get(name)
  if (raw === null || raw === '') return fallback
  return /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : NaN
}

function parseOtpauth(text) {
  const raw = String(text || '').trim()
  if (raw.toLowerCase().indexOf(OTPAUTH_PREFIX) !== 0) return { error: 'That is not a setup link.' }
  const rest = raw.slice(OTPAUTH_PREFIX.length)
  const slash = rest.indexOf('/')
  const kind = (slash === -1 ? rest.split('?')[0] : rest.slice(0, slash)).toLowerCase()
  if (kind === 'hotp') return { error: 'This code counts up with each use instead of changing over time. Valid Vault supports time-based codes, which almost every site uses.' }
  if (kind !== 'totp') return { error: 'That setup link is not for a time-based code.' }
  const query = raw.indexOf('?')
  const params = new URLSearchParams(query === -1 ? '' : raw.slice(query + 1))
  const secret = params.get('secret')
  if (!secret) return { error: 'That setup link has no secret in it.' }
  return buildConfig(secret, numberParam(params, 'digits', DEFAULT_DIGITS), numberParam(params, 'period', DEFAULT_PERIOD), normalizeAlgorithm(params.get('algorithm')))
}

function parseTotpInput(text) {
  const raw = String(text || '').trim()
  if (!raw) return { error: 'Enter the setup key from the site.' }
  if (raw.length > MAX_INPUT_CHARS) return { error: 'That is too long to be a setup key.' }
  if (/^steam:\/\//i.test(raw)) return { error: 'Steam Guard codes use their own format, which Valid Vault does not support.' }
  if (raw.toLowerCase().indexOf(OTPAUTH_PREFIX) === 0) return parseOtpauth(raw)
  return buildConfig(raw, DEFAULT_DIGITS, DEFAULT_PERIOD, DEFAULT_ALGORITHM)
}

function counterBytes(counter) {
  const bytes = new Uint8Array(8)
  let value = counter
  for (let i = 7; i >= 0; i--) {
    bytes[i] = value % 256
    value = Math.floor(value / 256)
  }
  return bytes
}

async function hotpCode(secretBytes, counter, digits, algorithm) {
  const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: ALGORITHMS[algorithm] }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, counterBytes(counter)))
  const offset = mac[mac.length - 1] & 0x0f
  const binary = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3]
  return String(binary % Math.pow(10, digits)).padStart(digits, '0')
}

async function generateCode(config, nowMs) {
  if (!isTotpConfig(config)) throw new Error('This 2FA code is damaged')
  const now = typeof nowMs === 'number' ? nowMs : Date.now()
  const seconds = Math.floor(now / 1000)
  const counter = Math.floor(seconds / config.period)
  const code = await hotpCode(base32Bytes(config.secret), counter, config.digits, config.algorithm)
  return { code, remaining: config.period - (seconds % config.period), period: config.period }
}

function formatCode(code) {
  const text = String(code || '')
  if (text.length === 6) return text.slice(0, 3) + ' ' + text.slice(3)
  if (text.length === 8) return text.slice(0, 4) + ' ' + text.slice(4)
  return text
}

function sameConfig(a, b) {
  if (!a || !b) return !a && !b
  return a.secret === b.secret && a.digits === b.digits && a.period === b.period && a.algorithm === b.algorithm
}

function startTicker(codeEl, timeEl, config) {
  let stopped = false
  let timer = null
  let shown = false
  let waits = 0
  const stop = () => {
    stopped = true
    if (timer) clearInterval(timer)
    timer = null
  }
  const tick = async () => {
    if (stopped) return
    if (codeEl.isConnected) shown = true
    else if (shown || ++waits > DETACHED_TICKS) { stop(); return }
    try {
      const result = await generateCode(config)
      if (stopped) return
      codeEl.textContent = formatCode(result.code)
      if (timeEl) timeEl.textContent = result.remaining + 's'
    } catch (e) {
      codeEl.textContent = 'Code unavailable'
      stop()
    }
  }
  setTimeout(tick, 0)
  timer = setInterval(tick, TICK_MS)
  return stop
}

export {
  DEFAULT_DIGITS,
  DEFAULT_PERIOD,
  DEFAULT_ALGORITHM,
  cleanSecret,
  base32Bytes,
  secretProblem,
  isTotpConfig,
  parseOtpauth,
  parseTotpInput,
  generateCode,
  formatCode,
  sameConfig,
  startTicker
}
