# Valid Vault Overview

Valid Vault is a local, encrypted password manager for Chrome, Brave, Edge, and Android. It works without a cloud service, an account, or a sync server. Your data stays on your own devices, encrypted under a key only you can unlock, and moves between devices by QR code or encrypted file.

**Status:** late beta, published on the [Chrome Web Store](https://chromewebstore.google.com/detail/valid-vault-password-mana/fkpfaemmphmakebhejhaegjgcnieeoab). The Android app is built from the same code and is in preparation for Google Play.

The full detail is in [README.md](README.md), the plan in [ROADMAP.md](ROADMAP.md), and every release in [CHANGELOG.md](CHANGELOG.md).

## What it stores

* Website logins, grouped by site, each with its 2FA code if you add one
* Personal info for forms: name, plus ranked phone numbers, emails, and addresses
* Misc credentials, such as Wi-Fi passwords and license keys
* Crypto wallet seed phrases, checked offline against the standard word list
* Encrypted bookmarks

## How it protects your data

* **One master key.** A random 256-bit key encrypts the vault with AES-256-GCM. It is never stored as is. Each unlock method holds its own wrapped copy.
* **Verify by unwrap.** No password hash is stored anywhere. A wrong fingerprint, PIN, or password simply fails to unwrap the key, so testing a guess means running the full key derivation.
* **Unlock methods.** Fingerprint or device PIN through WebAuthn in the browser or the Android Keystore on the phone, with a master password (PBKDF2-SHA256, 600,000 rounds) as the fallback.
* **Sealed sections.** Logins, crypto wallets, and bookmarks are each encrypted as one blob, so not even a site name or wallet name is readable at rest. Every record is tied to its place in the vault as authenticated data.
* **Pages never see secrets.** The session key stays in the extension's background. A web page only receives the one value you chose to fill, and passwords and codes never touch the clipboard.

## Moving between devices

* **Vault QR.** One device shows the encrypted vault as an animated QR code and the other scans it.
* **Key transfer.** The master key only leaves a device wrapped under a passphrase plus three Compound Questions, joined into one secret and stretched with 1,000,000 rounds.
* **Files.** The vault and the key export as separate encrypted files, for backups or a USB drive.
* **Uni-Vault.** Browsers on one computer can share one encrypted vault file and stay in sync on their own.
* **Merging.** Every merge is checked in full before anything is written, deletes carry to every device, and both devices must hold the same master key. A merge that stops partway is reported and finished by the next sync.

## Platform

* A Manifest V3 extension for Chromium browsers, and an Android app through Capacitor with native plugins for fingerprint unlock, autofill, file saving, and a private browser
* One shared codebase, bundled by build.js into a single self-contained file for the phone, with every library vendored and no network requests from the vault
* 193 automated tests, run with `npm test`, and 27 unit tests for the Android app's native code

## Build and test

```bash
git clone https://github.com/validprivacy/valid-vault.git
cd valid-vault
node build.js
npm install
npx playwright install chromium
npm test
```

Load the `extension` folder unpacked in Chrome, or run `npx cap sync` and `npx cap open android` for the phone app.

## License

Valid Vault is licensed under FSL-1.1-ALv2. You may read, run, modify, and share the code for any purpose other than a competing product or service, and each version becomes available under the Apache License, Version 2.0 two years after it is released. See [LICENSE.md](LICENSE.md).

## Links

* [Valid Vault on the Valid Privacy site](https://validprivacy.github.io/vault.html)
* [User Guide](https://validprivacy.github.io/vault-guide.html)
* [Privacy Policy](https://validprivacy.github.io/vault-privacy.html)
* [Threat model](THREAT_MODEL.md)
* [Security policy](SECURITY.md)
* [Valid Discord](https://discord.gg/2SP383cJs9)

Copyright (c) 2025-2026 Michael Carter
