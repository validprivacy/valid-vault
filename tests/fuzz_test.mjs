import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { EXTENSION_ROOT, startServer, launchBrowser, newExtensionContext, setUpPopup } from './harness.mjs'

const VAULT_ERRORS = [
  'This is not a Valid Vault vault file. Nothing was changed.',
  'This vault file is damaged or incomplete. Nothing was changed.',
  'This vault file was made by a newer version of Valid Vault. Update this device, then import it again. Nothing was changed.'
]
const PARSE_ROUNDS = 600
const MERGE_ROUNDS = 60
const KEY_ROUNDS = 300
const FRAME_ROUNDS = 600
const PASSPHRASE = 'copper-lantern-mosaic-drift7!'
const ANSWERS = ['rex', 'teddy', 'hobbit']

let server
let browser
let page

const FUZZ_HELPERS = () => {
  window.__fuzz = (seed) => {
    let state = seed >>> 0
    const next = () => {
      state = (state + 0x6d2b79f5) >>> 0
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const int = (max) => Math.floor(next() * max)
    const pick = (list) => list[int(list.length)]
    const randomText = (max) => {
      let out = ''
      const length = int(max)
      for (let i = 0; i < length; i++) out += String.fromCharCode(int(next() < 0.8 ? 128 : 65536))
      return out
    }
    const randomBytes = (max) => {
      const out = new Uint8Array(int(max))
      for (let i = 0; i < out.length; i++) out[i] = int(256)
      return out
    }
    const deep = (depth) => {
      let value = 1
      for (let i = 0; i < depth; i++) value = next() < 0.5 ? [value] : { a: value }
      return value
    }
    const oddValue = () => pick([
      () => null,
      () => undefined,
      () => true,
      () => -1,
      () => 0,
      () => 1.5,
      () => Number.MAX_SAFE_INTEGER,
      () => 1e308,
      () => '',
      () => randomText(40),
      () => 'x'.repeat(int(200000)),
      () => [],
      () => Array.from({ length: int(50) }, () => int(1000)),
      () => ({}),
      () => ({ blob: randomText(30) }),
      () => deep(int(400))
    ])()
    const paths = (value, prefix, out) => {
      if (value && typeof value === 'object') {
        for (const key of Object.keys(value)) {
          out.push(prefix.concat(key))
          if (out.length < 400) paths(value[key], prefix.concat(key), out)
        }
      }
      return out
    }
    const mutate = (original) => {
      const copy = JSON.parse(JSON.stringify(original))
      const all = paths(copy, [], [])
      const rounds = 1 + int(3)
      for (let r = 0; r < rounds && all.length; r++) {
        const path = pick(all)
        let parent = copy
        for (let i = 0; i < path.length - 1; i++) parent = parent ? parent[path[i]] : null
        if (!parent || typeof parent !== 'object') continue
        const key = path[path.length - 1]
        const action = int(4)
        if (action === 0) delete parent[key]
        else if (action === 1) parent[key] = oddValue()
        else if (action === 2 && typeof parent[key] === 'string' && parent[key].length) {
          const chars = parent[key].split('')
          chars[int(chars.length)] = String.fromCharCode(33 + int(90))
          parent[key] = chars.join('')
        } else if (action === 3 && Array.isArray(parent[key]) && parent[key].length) {
          parent[key][int(parent[key].length)] = oddValue()
        } else {
          parent[key] = oddValue()
        }
      }
      return copy
    }
    const garbage = (validText) => pick([
      () => randomText(300),
      () => validText.slice(0, int(validText.length)),
      () => validText.slice(int(validText.length)),
      () => validText.replace(/[{}[\]":,]/, ''),
      () => JSON.stringify(oddValue()),
      () => '{"format":"valid-vault","version":' + pick(['0', '-1', '2.5', '"2"', '999', 'null', '1e400']) + '}',
      () => validText.split('').reverse().join(''),
      () => '['.repeat(int(5000)) + ']'.repeat(int(5000))
    ])()
    return { next, int, pick, randomText, randomBytes, oddValue, mutate, garbage }
  }
}

before(async () => {
  server = await startServer(EXTENSION_ROOT)
  browser = await launchBrowser()
  const context = await newExtensionContext(browser)
  await context.addInitScript(FUZZ_HELPERS)
  page = await setUpPopup(context, server.url)
  await page.evaluate(async () => {
    const key = await window.__testVaultKey()
    const passwords = await import('/passwords.js')
    await passwords.ensureVault(key)
    await passwords.saveCredential('site.com', 'alice', 'alice-pw-1!', key, [], 'username')
    await passwords.saveCredential('other.org', 'bob', 'bob-pw-2!', key, [], 'username')
    const bookmarks = await import('/bookmarks.js')
    await bookmarks.saveBookmark('https://example.com/', 'Example', key)
  })
})

after(async () => {
  await browser.close()
  await server.close()
})

test('vault file parsing turns every malformed file into a clean refusal', async () => {
  const result = await page.evaluate(async ([rounds, allowed]) => {
    const vaultFile = await import('/vaultfile.js')
    const fuzz = window.__fuzz(1001)
    const valid = await vaultFile.buildBundle()
    const validText = JSON.stringify(valid)
    const bad = []
    let refused = 0
    for (let i = 0; i < rounds; i++) {
      const input = i % 2 ? fuzz.garbage(validText) : JSON.stringify(fuzz.mutate(valid))
      try {
        const parsed = vaultFile.parseBundle(input)
        if (!parsed || typeof parsed !== 'object') bad.push('returned ' + typeof parsed)
      } catch (e) {
        refused++
        if (!(e instanceof Error) || !allowed.includes(e.message)) bad.push(String(e && e.message).slice(0, 120))
      }
    }
    return { bad: bad.slice(0, 5), badCount: bad.length, refused }
  }, [PARSE_ROUNDS, VAULT_ERRORS])
  assert.deepEqual(result.bad, [])
  assert.equal(result.badCount, 0)
  assert.ok(result.refused > PARSE_ROUNDS / 4)
})

test('the vault QR payload parser refuses malformed payloads cleanly', async () => {
  const result = await page.evaluate(async ([rounds, allowed]) => {
    const vaultFile = await import('/vaultfile.js')
    const fuzz = window.__fuzz(2002)
    const valid = vaultFile.payloadFromBundle(await vaultFile.buildBundle())
    const bad = []
    for (let i = 0; i < rounds; i++) {
      const input = i % 3 === 0 ? fuzz.oddValue() : fuzz.mutate(valid)
      try {
        vaultFile.bundleFromPayload(input)
      } catch (e) {
        if (!(e instanceof Error) || !allowed.includes(e.message)) bad.push(String(e && e.message).slice(0, 120))
      }
    }
    return bad
  }, [PARSE_ROUNDS, VAULT_ERRORS])
  assert.deepEqual(result, [])
})

test('merging damaged vault files never changes the vault', async () => {
  const result = await page.evaluate(async (rounds) => {
    const vaultFile = await import('/vaultfile.js')
    const passwords = await import('/passwords.js')
    const bookmarks = await import('/bookmarks.js')
    const key = await window.__testVaultKey()
    const fuzz = window.__fuzz(3003)
    const snapshot = async () => {
      const tree = await passwords.readVaultTree(key)
      const marks = await bookmarks.readTree(key)
      return JSON.stringify({ credentials: tree.credentials, bookmarks: marks && marks.items ? marks.items : marks })
    }
    const before = await snapshot()
    const valid = await vaultFile.buildBundle()
    const bad = []
    let tried = 0
    for (let i = 0; i < rounds; i++) {
      let bundle
      try { bundle = vaultFile.parseBundle(JSON.stringify(fuzz.mutate(valid))) } catch (e) { continue }
      tried++
      try {
        await vaultFile.mergeBundle(bundle, key)
      } catch (e) {
        if (!(e instanceof Error)) bad.push('non-error thrown')
      }
      const after = await snapshot()
      if (after !== before) { bad.push('vault changed after round ' + i); break }
    }
    return { bad, tried }
  }, MERGE_ROUNDS)
  assert.deepEqual(result.bad, [])
  assert.ok(result.tried > 10)
})

test('key file checks refuse malformed key files without crashing', async () => {
  const result = await page.evaluate(async ([rounds, passphrase, answers]) => {
    const keypackage = await import('/keypackage.js')
    const fuzz = window.__fuzz(4004)
    const raw = crypto.getRandomValues(new Uint8Array(32))
    const masterKey = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
    const valid = await keypackage.buildPackage(masterKey, passphrase, [0, 1, 2], answers, 'Fuzz Key')
    const validText = JSON.stringify(valid)
    const bad = []
    let opened = 0
    let refused = 0
    for (let i = 0; i < rounds; i++) {
      let candidate
      if (i % 4 === 0) {
        try { candidate = JSON.parse(fuzz.garbage(validText)) } catch (e) { candidate = fuzz.oddValue() }
      } else {
        candidate = fuzz.mutate(valid)
      }
      let problem
      try {
        problem = keypackage.keyFileProblem(candidate)
        keypackage.isKeyPackage(candidate)
      } catch (e) {
        bad.push('check threw: ' + String(e && e.message).slice(0, 100))
        continue
      }
      if (problem !== null && typeof problem !== 'string') bad.push('odd problem value')
      if (problem !== null || i % 10) continue
      try {
        const back = await keypackage.openPackage(candidate, passphrase, answers)
        const bytes = back instanceof Uint8Array ? back : new Uint8Array(await crypto.subtle.exportKey('raw', back))
        if (Array.from(bytes).join(',') !== Array.from(raw).join(',')) bad.push('opened to a different key')
        opened++
      } catch (e) {
        refused++
        if (!(e instanceof Error)) bad.push('non-error thrown on open')
      }
    }
    const wrongAnswer = await keypackage.openPackage(valid, passphrase, ['rex', 'teddy', 'hobbits']).then(() => 'opened', () => 'refused')
    return { bad: bad.slice(0, 5), opened, refused, wrongAnswer }
  }, [KEY_ROUNDS, PASSPHRASE, ANSWERS])
  assert.deepEqual(result.bad, [])
  assert.equal(result.wrongAnswer, 'refused')
})

test('the QR frame decoder ignores damaged frames and still rebuilds the real payload', async () => {
  const result = await page.evaluate(async (rounds) => {
    const fountain = await import('/fountain.js')
    const vaultFile = await import('/vaultfile.js')
    const fuzz = window.__fuzz(5005)
    const payload = JSON.stringify(vaultFile.payloadFromBundle(await vaultFile.buildBundle()))
    const encoder = await fountain.createEncoder(payload)
    const real = []
    for (let i = 0; i < 400; i++) real.push(encoder.nextFrame())
    const decoder = fountain.createDecoder()
    const bad = []
    const damaged = (frame) => {
      const copy = new Uint8Array(frame)
      const choice = fuzz.int(5)
      if (choice === 0) return fuzz.randomBytes(400)
      if (choice === 1) return copy.slice(0, fuzz.int(copy.length))
      if (choice === 2) return fuzz.randomText(300)
      if (choice === 3) {
        const text = new TextDecoder().decode(copy.slice(0, 40))
        return text.replace(/:\d+:/, ':' + fuzz.pick(['0', '-5', '99999999', 'x', '']) + ':')
      }
      return fuzz.oddValue()
    }
    for (let i = 0; i < rounds; i++) {
      try {
        const reply = decoder.addFrame(damaged(fuzz.pick(real)))
        if (!reply || typeof reply.success !== 'boolean') bad.push('odd reply')
      } catch (e) {
        bad.push('addFrame threw: ' + String(e && e.message).slice(0, 100))
      }
    }
    const fresh = fountain.createDecoder()
    for (let i = 0; i < rounds; i++) {
      try { fresh.addFrame(damaged(fuzz.pick(real))) } catch (e) { bad.push('threw on fresh decoder') }
      if (i % 2 === 0) fresh.addFrame(real[i % real.length])
    }
    let rebuilt = null
    for (const frame of real) {
      const reply = fresh.addFrame(frame)
      if (reply.success && reply.complete) {
        const done = await fresh.assemble()
        rebuilt = done.success ? done.payload : 'failed: ' + done.error
        break
      }
    }
    let assembleEarly
    try { assembleEarly = await fountain.createDecoder().assemble() } catch (e) { assembleEarly = { threw: true } }
    return { bad: bad.slice(0, 5), matches: rebuilt === payload, rebuilt: rebuilt === null ? null : String(rebuilt).slice(0, 60), assembleEarly }
  }, FRAME_ROUNDS)
  assert.deepEqual(result.bad, [])
  assert.equal(result.assembleEarly.success, false)
  assert.equal(result.matches, true, 'rebuilt: ' + result.rebuilt)
})

test('the fuzz page raises no page errors', () => {
  assert.deepEqual(page.errors, [])
})
