# Valid Vault Threat Model

This page says what Valid Vault is built to protect against, what it deliberately leaves to the device and the person holding it, and which tradeoffs were chosen on purpose. The reasoning behind each choice is in the Design Decisions section of [ROADMAP.md](ROADMAP.md), and the cryptography is described in [README.md](README.md).

## What is protected

* Website logins and their 2FA setup keys, misc credentials, Personal Info, crypto wallet seed phrases, and bookmarks
* The master key, a random 256-bit key that encrypts all of the above with AES-256-GCM

## Where the data lives

* Only on your own devices, encrypted at rest. There is no Valid Vault server, account, or cloud copy, so there is no central database for anyone to breach
* Between devices, only as an encrypted vault file or QR, and a key file or key QR protected by a passphrase plus three Compound Questions

## In scope: what Valid Vault defends against

| Threat | Defense |
|---|---|
| A breach of a password manager's servers | There are no servers. Each vault exists only on its owner's devices |
| A lost or stolen device that is locked | The vault is encrypted at rest. Unlocking needs the device's fingerprint or PIN through the Android Keystore or WebAuthn, or the master password through 600,000 PBKDF2-SHA256 rounds. No password hash is stored to attack |
| A stolen vault file or vault QR | It is ciphertext and opens nothing without the master key |
| A stolen key file or key QR | The key inside is wrapped under a passphrase that must stand on its own (16 or more characters with a letter, a number, and a symbol, screened against common passwords) plus three Compound Questions. All four are joined into one secret and stretched through 1,000,000 PBKDF2-SHA256 rounds, so a guess must get all four right at once. Nothing is stored to check a guess against |
| Tampered or swapped records in storage | Every record is bound to its place in the vault as AES-GCM authenticated data, so a moved or edited record fails to decrypt |
| A malicious web page | Pages never receive the master key. The key stays in the extension's background, and a page only receives the one value you picked to fill, after a real click. The extension and the private browser ask first before filling a page without https |
| A look-alike phishing site | Logins fill only on the site address they were saved for. This needs no list of bad sites, so a phishing domain registered minutes ago gets nothing |
| Something reading the clipboard | Passwords and 2FA codes are filled directly and never copied to the clipboard |
| A vault left open | Auto-lock after idle time. On the phone, the vault also locks after you leave the app, right away or after a short grace period. Locking closes fill lists already open on a page and throws away anything still decrypting |
| Screenshots and the recent apps preview on the phone | Blocked by default in the app, the private browser, and the autofill screen |
| Tracking and supply-chain risk | The vault makes no network requests, extension pages block all connections, and every library is vendored into the package. Nothing is fetched at runtime |

## Phishing and malware protection in the private browser

The private browser leaves Google's Safe Browsing service off, so the pages you visit are never sent to Google. That is a privacy choice, and the browser has its own protection in its place, on for every page and working offline:

* **Logins fill only on the site address they were saved for.** A look-alike phishing page has a different address and gets nothing, including one registered minutes ago, since this check needs no list of bad sites, and the browser checks that the tab is still on the same scheme, address, and port before it fills. For a password manager, this is the protection that matters most against phishing
* **Every fill asks for fingerprint, device PIN, or password,** and only the one login you pick is handed to the page
* **Pages without https ask before anything fills,** and Tor mode refuses to fill them at all
* **Malicious ads and trackers are blocked** by the EasyList and EasyPrivacy domain lists and Valid Vault's own list, shipped inside the signed app and never downloaded at runtime, cutting off a common route for malware served through ad networks
* **Downloads always ask first,** showing the file name and size, and are off in Tor mode
* **Nothing persists.** Cookies, site data, cache, and history are wiped when the browser closes, and third-party cookies are blocked
* **It runs in its own process with its own storage,** so a page in the browser never touches the vault
* **Safe Browsing is still one tap away when you want it.** Any browser with Safe Browsing, such as Chrome, fills from Valid Vault through Android Autofill

The full reasoning is in [Why Safe Browsing is off in the private browser](ROADMAP.md#why-safe-browsing-is-off-in-the-private-browser).

## Out of scope: left to the device and its owner

* **Someone holding a device while it is unlocked.** They can see what you can see. Auto-lock and the background lock shorten that window, and nothing more is attempted
* **A compromised operating system, root access, or malware with access to the browser's or app's memory.** No app can protect secrets from the system it runs on
* **Other browser extensions with access to every page.** They can read a field after Valid Vault fills it, the same as for any password manager
* **Losing every copy at once.** You are the custodian of your vault: every device, every vault file, and every way to open the key file. A vault is gone only when all of them are gone together, so keep more than one copy. See [You Are the Custodian](README.md#you-are-the-custodian)
* **Watching the screen while a key QR or vault QR is shown.** Do transfers somewhere private. A captured key QR still needs the passphrase and the three Compound Question answers

## Tradeoffs chosen on purpose

* **PBKDF2 over Argon2id.** PBKDF2 runs natively in WebCrypto on every supported browser and Android WebView without adding WebAssembly to the extension. A guess still needs a stolen copy of the wrapped key and a full derivation
* **Matching by site address.** http and https pages, and different ports, on the same address share logins. Filling asks first on pages without https
* **Save prompts kept per tab for 45 seconds,** so a login survives a sign-in redirect through another site
* **The phone's idle timer is paused by Android in the background.** The background lock covers it: when you come back, the vault locks if you were gone longer than the grace period
* **Sync follows each device's clock and does not try to correct it.** The later change wins. Correcting clocks would need a server to referee, devices already set their time from the network, and a clock set far off is the owner's own choice, so guessing at a correction would let one device silently overrule another. Any edit made after a sync always wins. See [Why sync follows each device's clock](ROADMAP.md#why-sync-follows-each-devices-clock-and-does-not-try-to-correct-it)
* **One master key, wrapped separately for each unlock method,** and the same key required on every synced device. A mismatched key fails loudly instead of merging

## Self-custody

Valid Vault has no server, so your vault exists only where you keep it. That removes the largest risk a password manager carries, a central store of everyone's vaults, and it means no account, no lockout, and no company standing between you and your data. Redundancy comes from you: each device is a live copy, and each vault file on a drive is a cold one. The README's [You Are the Custodian](README.md#you-are-the-custodian) section covers what that gives you and what it asks of you.

## Not yet done

* An independent security audit. The source, the design decisions, and the automated tests are public in this repository, every push runs the tests on GitHub Actions, and [SECURITY.md](SECURITY.md) explains how to report a vulnerability
