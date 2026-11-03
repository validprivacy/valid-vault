# Valid Vault - Development Roadmap

**Current Version:** v0.9.4.3 - **Status: Late Beta**

---

## Version History (Completed)

### v0.9.4.3 - Lock and Clear Hardening (Nov 2026)

* ✅ Locking closes any fill list already open on a page, and an entry picked from one fills nothing
* ✅ Logins, Personal Info, and 2FA codes that finish decrypting after a lock are thrown away before they reach the page
* ✅ Clear Vault removes the backup copy before the vault, and reports an error instead of success if anything is left
* ✅ Unlinking a vault file reports a failure instead of claiming success
* ✅ The extension asks before filling a page without https, the same as the private browser
* ✅ A failed restore of a previous password, and key protection that could not be saved after a key import, are reported
* ✅ Third-party notices for jsQR and the EasyList domain list
* ✅ Docs corrected on how logins are matched, what Android Autofill reads, and where the Keystore key is held
* ✅ 149 automated tests

### v0.9.4.2 - A New Home (Nov 2026)

* ✅ Source code at github.com/validprivacy/valid-vault, and the User Guide and Privacy Policy on validprivacy.github.io
* ✅ About, the popup menu, and the User Guide link to the new home
* ✅ Licensed under FSL-1.1-ALv2, with each version becoming Apache 2.0 after two years
* ✅ 121 automated tests

### v0.9.4.1 - Ranked Personal Info and Sync Hardening (Nov 2026)

* ✅ Phone numbers and addresses ranked like emails, with the primary on top, new entries added at the bottom, and reorder, edit, and delete
* ✅ Every saved phone number and address offered in ranked order when filling, primary first
* ✅ Personal Info merged entry by entry: names by the newest edit per field, lists in the receiving device's order with new entries added at the bottom, and deletes carried to every device
* ✅ Every encrypted record tied to its place in the vault as AES-GCM authenticated data, with older records upgraded and verified on unlock
* ✅ Vault files and the vault QR at version 2, refused cleanly by older versions
* ✅ Decrypted results that finish after a lock are thrown away
* ✅ Edits made after a sync always stick
* ✅ Tests for clock drift, consecutive offline edits, restoring an old backup after a delete, overlapping imports, and devices on different versions
* ✅ 119 automated tests

### v0.9.4 - Two-Factor Codes (Nov 2026)

* ✅ 2FA codes on logins, added by typing the site's setup key or, on the phone, scanning its QR code
* ✅ Live codes with the seconds left in Manage and the phone app
* ✅ A V tag on a site's code box that fills the current code for a login on that site, never through the clipboard
* ✅ Android Autofill fills code boxes in apps and browsers
* ✅ Setup keys sealed in the encrypted login, kept from web pages, and merged by their own timestamp so an older version can't erase them
* ✅ 2FA codes brought in from Bitwarden, 1Password, and CSV exports
* ✅ A new master password is checked against common passwords, the same way the key passphrase is
* ✅ 97 automated tests

### v0.9.3.1 - Public Tests and Review Fixes (Oct 2026)

* ✅ 80 automated tests for the extension and the phone app, public in `tests/` and run with `npm test`
* ✅ A delete and an edit made in the same moment on two devices now resolve to the delete for logins and bookmarks, matching crypto wallets
* ✅ The save prompt lists each extra field with a checkbox, and a field left out is not asked about again
* ✅ Android Autofill recognizes trusted browsers by signing certificate as well as package name
* ✅ Share Vault carries crypto wallets too, so every section of the vault travels in the vault QR, encrypted under the master key
* ✅ README wording on offline password guessing corrected, and the private browser's Safe Browsing setting documented

### v0.9.3 - The Extension's New Look (Oct 2026)

* ✅ Ink for day and Platinum for night in the extension, switched with the sun and moon button and shared by every extension page
* ✅ Popup, unlock window, Manage, bookmarks side panel, and User Guide redrawn with raised buttons, recessed panels, and the striped V
* ✅ Valid Vault dialogs replace the browser's confirm boxes in Manage
* ✅ V tags on websites redrawn as a white circle with the striped V, and a charcoal one for generating passwords, with the login picker and save prompt following day and night mode
* ✅ New toolbar and store icon, the white striped V
* ✅ Logins found on sites whose username box has no type
* ✅ Revealed logins, misc credentials, and personal info cleared from Manage when the vault locks
* ✅ Leftover code removed

### v0.9.2 - A New Look (Oct 2026)

* ✅ Ink for day and Platinum for night, switched with the sun and moon button, with the app and the private browser sharing the choice
* ✅ Raised buttons and recessed panels drawn with one line weight, with embossed labels and icons
* ✅ The striped V and a serif wordmark replace the globe logos and the green, with a new white app icon and a one-color themed version
* ✅ Private browser restyled for day and night, with matching system bars and Tor mode's purple kept in both
* ✅ Start page backgrounds redrawn and split by mode, 11 for day and 12 for night, with rare versions hidden in some
* ✅ Day and night versions of the search and 4x2 widgets, and 1x1 icon widgets that open the app
* ✅ Encrypted backup copy in the extension that restores the vault after the browser clears site data, with a linked Uni-Vault file reconnected after unlock
* ✅ Renaming the key and vault offers new key and vault files under the new name
* ✅ Uni-Vault writes merged changes back to the linked file right away
* ✅ Drawn lock icons, neutral success messages, and more leftover code removed

### v0.9.1 - Bookmarks in the Vault QR (Oct 2026)

* ✅ Share Vault carries bookmarks along with logins, misc credentials, and personal info, with crypto wallets still kept to vault files
* ✅ Extension password generator no longer stalls on empty password rules, and fits a site's required pattern like the phone browser does
* ✅ Code left over from retired features cleaned out

### v0.9.0 - Import From More Apps (Oct 2026)

* ✅ Import Passwords lists every file and works out the format from its contents
* ✅ Samsung Pass .spass files, opened with the export password, which is used once and never saved
* ✅ Bitwarden JSON, plain and protected with a file password, with account-locked and Argon2 files refused and explained
* ✅ 1Password .1pux files and Dashlane's zipped export
* ✅ Logins saved for phone apps matched to a website from the file, the vault, or a site you confirm, and linked so they fill in the app
* ✅ A linked app asks once before its first fill, then fills only into that exact app
* ✅ Autofill button in other apps redrawn with the logo and the site or app it fills, replacing a blank white box

### v0.8.8 - Faster Vault QR (Oct 2026)

* ✅ Vault QR about twice as fast: frames carry raw bytes, a third more per frame at the same density, and change every 0.2 seconds
* ✅ Scanner reads on up to three processor cores at once and checks the whole camera image as well as the scan box, so off-center aim keeps reading
* ✅ Live readout while scanning: pieces received, share of frames caught, and reads per second
* ✅ Extension QR drawn as large as the window allows, and the phone at full brightness with the screen kept on while showing a QR
* ✅ Master Key Name is now Key and Vault Name, with an offer on the extension to save a Uni-Vault file under the new name

### v0.8.7.1 - Private Browser Autofill Parity (Oct 2026)

* ✅ Personal Info V tags on name, email, phone, and address fields, including dropdowns, with only the tapped field checked
* ✅ Inverted V on new password boxes that generates into the new and confirm boxes, following length settings and site rules
* ✅ Email fields on login forms offer saved emails when the site has no saved login
* ✅ Forms that ask for a name treated as sign-up forms, and login pages that mark a password as new keep the fill V
* ✅ Larger V tags that step left of a site's own icons
* ✅ Pull down from the top of a page to reload
* ✅ Menu trimmed to Add to new tab quick view, the tracker switch, Tor mode, Valid Vault settings, and About, with the Tor options at the top in Tor mode
* ✅ Edit the name and address of sites in new tab quick view
* ✅ Top bar and widget frames drawn with the same line weight and color as the toolbar icons, and a dog-eared tab counter

### v0.8.7 - Private Browser Autofill (Oct 2026)

* ✅ V tags on login fields in the private browser, and Fill login in the menu, filled from Valid Vault after fingerprint, device PIN, or password on every fill
* ✅ Save new logins and changed passwords from the browser, without asking again for a login just filled or declined that session
* ✅ Logins saved on other parts of a site offered first when the exact address has none, in the browser and in Android Autofill
* ✅ A login fills only the page it was requested for, matched by scheme, address, and port, and pages without https ask first
* ✅ Tor mode: no V tags or save prompts, Fill login on https pages only, and a once-per-session reminder that signing in identifies you
* ✅ Phone User Guide section for browser autofill

### v0.8.6 - Private Browser Tabs and Start Page (Oct 2026)

* ✅ Tabs, up to 15, with a tab count beside the address bar and a tab list to switch, close, or close them all
* ✅ Start page on every new tab with one of 20 generated backgrounds, the landscape logo shown turned sideways, and a rare cherry blossom
* ✅ Pin up to 12 sites from the menu or by name and address, drag them into any order, and remove them
* ✅ Save the current background to Downloads as a picture
* ✅ Press and hold a link to open it in a new tab, copy it, or share it
* ✅ Valid Vault settings in the browser menu, and New tab in the bottom toolbar in place of Home
* ✅ The browser opens without the keyboard now, and the tracker count moved from the address bar to the start page
* ✅ Tor mode closes every tab when it turns on or off, and pins and the tracker switch are off while it is on

### v0.8.5 - Private Browser Tor Mode and Downloads (Oct 2026)

* ✅ EasyPrivacy and EasyList domain lists added beside Valid Vault's own tracker list, as a separate data file under their own license, applied when a page loads them from another site
* ✅ Empty space left by blocked ads removed from the page
* ✅ Global Privacy Control on every page
* ✅ Downloads to the Downloads folder after a confirm
* ✅ Tor mode in the menu through Orbot, with no direct fallback, an Orbot check before it turns on, and purple bars while it is on
* ✅ WebRTC removed, downloads off, and Safer with JavaScript off in Tor mode
* ✅ New identity, and a full wipe when switching in or out of Tor mode
* ✅ The startup wipe finishes before the first page loads

### v0.8.4.1 - Sign-In Pages Across a Site (Oct 2026)

* ✅ Logins saved on one part of a site fill on its other parts, such as a separate sign-in page, listed in their own labeled section
* ✅ Shared hosting addresses keep each subdomain's logins apart

### v0.8.4 - Import From Another App (Oct 2026)

* ✅ Import passwords from another password manager's CSV export, on the extension and the phone, read on the device and encrypted straight into the vault; no unencrypted export, ever
* ✅ Exports from Chrome, Edge, Brave, Firefox, Bitwarden, LastPass, Proton Pass, Dashlane, Apple Passwords, 1Password, KeePassXC, and NordPass recognized, and any other CSV matched by column
* ✅ A different password for a saved login shows both, masked, with last changed and last used dates and the newer one marked; the one not picked is kept as the previous password for 30 days
* ✅ The same login twice in one file with different passwords asks which one to import
* ✅ Stopping an import saves nothing, deleted logins stay deleted unless the file's password is newer, and changes made while a choice is open are never overwritten
* ✅ Import bookmarks straight from the browser the extension runs in, with bookmark access asked for on the click and given back right after, or from any browser's HTML export, into one list, skipping links already saved and bookmarks you deleted
* ✅ Previous passwords kept a flat 30 days everywhere, with the date shown in the picker and in Manage
* ✅ Each login records when it was last filled, shown in Manage and on the phone, and synced without counting as an edit
* ✅ Editing a password in Manage keeps the old one as the previous password
* ✅ Import sections in the extension User Guide, the website guide, and the phone User Guide

### v0.8.3 - Private Browser and Widgets (Oct 2026)

* ✅ Modified Chromium browser in the phone app, through the Android System WebView, in its own process apart from the vault
* ✅ Tracker and ad script blocking from a bundled list, with a blocked count and a per-site switch
* ✅ Tracking tags stripped from links, and redirect wrappers from Google, Facebook, Instagram, YouTube, Steam, and Reddit skipped
* ✅ Third-party cookies blocked, app identity header hidden, and cookies, site data, cache, and history wiped on close
* ✅ Startpage search by default, with DuckDuckGo and Brave Search in Settings
* ✅ Address bar with tracker count and menu, bottom toolbar with Back, Bookmarks, Home, Share, and Forward, and bars that slide away as you scroll
* ✅ New tab page with the full-size logo, a Search privately box, and trackers blocked this session
* ✅ 4x1 and 4x2 home screen widgets for search, bookmarks, logins, wallets, and personal info, one fingerprint each, and a Search shortcut with the logo
* ✅ Bookmarks open in the browser, and the browser's Bookmarks button opens them in Valid Vault
* ✅ Globe V logo as the app icon
* ✅ Browser settings and a User Guide section on the phone
* ✅ Key files with the default name no longer overwrite a name you set, and key import prompts say the password stays on the device, on the extension and the phone
* ✅ Extension dialogs stop Chrome from offering to save passphrases and answers

### v0.8.2 - Android Autofill and Share to Bookmarks (Oct 2026)

* ✅ Valid Vault as the Android autofill service: tap Valid Vault in the suggestions, confirm with fingerprint or device PIN, and the login fills
* ✅ Every fill asks for fingerprint, device PIN, or password, and only the chosen login is handed to Android
* ✅ Save new and changed logins when Android offers, with the old password kept as the previous password
* ✅ Linked apps: the first fill in an app links it to a saved site, stored in the encrypted vault so it syncs, and tied to the app's signature
* ✅ Websites trusted only from known browsers; web pages inside other apps never use a link
* ✅ Share a link from any app to save it as an encrypted bookmark
* ✅ Autofill status and Turn on in Settings, linked apps with Unlink, and a User Guide section

### v0.8.1.1 - Key File Validation Hotfix (Oct 2026)

* ✅ Key files and key QRs checked against the exact format Valid Vault writes before any key derivation, so a crafted file can't stall an import with an enormous round count

### v0.8.1 - Vault QR Rebuilt (Oct 2026)

* ✅ Vault and key QR drawn larger and at the same size, with less data per frame and the stream compressed first
* ✅ Missed frames filled in by later ones, so a scan finishes a few frames after enough are read, wherever it joins the stream
* ✅ Scanner asks for a sharper camera feed, reads only the visible square, and skips damaged frames; 0.8.0 codes still read
* ✅ Dead fingerprint setting removed after a password unlock when Android has reset the fingerprint key
* ✅ Imported keys take on their exported nickname, and shared or exported keys carry the current one
* ✅ Extension key import asks every question before writing, and clears the old vault only after the new unlock methods are saved
* ✅ Phone globe animates only while on screen

### v0.8.0 - Phone App Rebuilt (Oct 2026)

* ✅ Phone app rebuilt on the extension's own modules, bundled by build.js; the old copies of the core modules removed, so both clients share one copy of the vault, crypto, unlock, key, and merge code
* ✅ Every extension tab on the phone: Website Credentials, Personal Info, Misc Credentials, Crypto Wallets, Bookmarks, Sync, Settings, a phone User Guide, and About
* ✅ Protected key transfer on the phone: key QR and key file in both directions with the passphrase and questions, and raw key QRs refused
* ✅ Key import that survives lock and unlock, with the warning before a different key clears local data
* ✅ Fingerprint, device PIN, or password required for transfers, unlock method changes, Clear Vault, and each section on the phone
* ✅ Phone setup from an existing key, and key-file recovery on the lock screen when fingerprint is reset and no password is set
* ✅ Password generator, 2 hour auto-lock, and per-method Edit and Delete on the phone
* ✅ Imports checked in full before anything is written; a different key, a damaged section, or a newer file version is refused with nothing changed
* ✅ No duplicates on merge: separately created logins, renamed usernames, and re-saved misc credentials stay single, and deletes stay deleted
* ✅ Re-enrolling fingerprint uses a second Keystore slot, so a cancelled re-enroll keeps the working fingerprint; device PIN limited to Android 11 and up
* ✅ Extension Misc Credentials and extra field values entered in masked boxes
* ✅ Verified in use: phone upgraded in place from the old app, and the key carried from the extension to the phone over QR

### v0.7.4.3 - Security Hardening (Oct 2026)

* ✅ The three-try unlock limit is shared by every Valid Vault window and kept in storage, so reopening the popup no longer resets it
* ✅ Websites can no longer load or frame the Manage page, or use it to detect that Valid Vault is installed

### v0.7.4.2 - Capability-Aware Unlock (Oct 2026)

* ✅ Setup checks whether the browser has a built-in fingerprint or device PIN, and shows a clean password setup where it doesn't, as in Chrome on Linux
* ✅ Unlock screens show the fingerprint button only when fingerprint is enrolled in that browser
* ✅ Re-enroll and Delete on the Fingerprint card ask for the master password first, so a browser with a missing passkey can be fixed
* ✅ Unlock and key import wording no longer names Windows Hello, so it reads correctly on every system

### v0.7.4.1 - Fingerprint Across Browsers Hotfix (Oct 2026)

* ✅ Each browser registers its own fingerprint passkey, so Chrome, Brave, and Edge can all unlock with fingerprint on one computer; before, enrolling in one browser replaced another's passkey
* ✅ Fingerprint unlock asks for this computer's built-in reader only, and a missing or cancelled fingerprint shows a clear message to unlock with the password and re-enroll
* ✅ Microsoft Edge supported through the Chrome Web Store, with install steps in the README
* ✅ Verified in use: the encrypted vault and key carried device to device on a USB drive, imported and unlocked with no network involved

### v0.7.4 - Transfer Authentication and Autofill Fixes (Oct 2026)

* ✅ Export and import now require fingerprint authentication: Export Key, Import Key, Export Vault, Import Vault, Share Master Key, Share Vault, and QR receive ask for fingerprint, device PIN, or password first
* ✅ Autofill finds password fields inside open and closed shadow roots, skips a lone confirm field, and fires fill events web components register
* ✅ V tags hide when their field is slid, clipped, or made invisible, and reposition after animations and clicks
* ✅ Password generator style choice: with special characters, or letters and numbers only; symbols narrowed to `!@#$%^&*`
* ✅ Three security questions replaced with less public ones, in the same positions, on the extension and the phone
* ✅ Published on the Chrome Web Store

### v0.7.3 - Uni-Vault and User Guide (Sep 2026)

* ✅ Uni-Vault: every browser on one computer linked to one encrypted vault file and kept in sync automatically
* ✅ Uni-Vault refuses damaged, replaced, or wrong-key files and never overwrites them; Reconnect and Unlink in Sync, Reconnect in the popup
* ✅ Brave detection with a User Guide section explaining the one Brave setting Uni-Vault needs
* ✅ Searchable User Guide opened from the popup menu, covering setup, every setting, security, transport, backups, and recommended setups
* ✅ Key import offers fingerprint or device PIN first, with a password as the fallback
* ✅ Changing unlock methods and Clear Vault require re-authentication; remaining password prompts masked
* ✅ Discord link in About, and About links open in a new tab

### v0.7.2 - Password Generator (Sep 2026)

* ✅ Inverted V on new password and change password fields generates a random password and fills both the new and confirm boxes
* ✅ Generated passwords always mix upper, lower, digits, and symbols, and follow any length, pattern, or password rules the site declares
* ✅ Password Generator settings: minimum 16 or 20, maximum 24, 32, 48, or 64, each maximum with its own range (minimum to 24, 25 to 32, 33 to 48, 49 to 64)
* ✅ Change password forms: the current password field fills the saved login, and the save prompt updates the right account
* ✅ Previous password kept after a change, shown as a labeled second choice with one-click restore, dropped after 3 uses and 14 days
* ✅ Settings shows auto-lock as hours, minutes, and seconds and QR stream timeout as minutes and seconds; auto-lock limit raised to 2 hours
* ✅ Revealed passwords in Manage no longer run under the edit and delete buttons, up to 64 characters
* ✅ Popup border on the sides and bottom with rounded bottom corners

### v0.7.1 - Protected Master Key Transfer (Sep 2026)

* ✅ Share Master Key and Export Key carry the master key wrapped under a passphrase and three security questions (PBKDF2-SHA256, 1,000,000 iterations); the raw key never leaves the device
* ✅ The receiving device must enter the passphrase and all three answers before a scanned key or key file is accepted; wrong answers change nothing
* ✅ Users pick their three questions; the protection is set once and reused, so sharing stays one click; Change Key Passphrase replaces it
* ✅ Common passwords refused as a key passphrase, with a four-random-words recommendation
* ✅ Raw key QR codes from older versions refused
* ✅ Every password prompt in Manage moved to masked Valid Vault dialogs; Personal Info edits try fingerprint or device PIN first
* ✅ Crypto Wallets locks itself on Manage or browser tab switch and after the auto-lock time
* ✅ Auto-lock resets on real activity anywhere in the browser, and an open Manage tab no longer locks the vault while you work elsewhere
* ✅ About shows the version from the extension manifest

### v0.7.0 - Crypto Wallets and Encrypted Bookmarks (Sep 2026)

* ✅ Crypto Wallets tab: seed phrases organized by wallet and account, 1 to 24 numbered words per account plus one optional note
* ✅ Offline seed word checking against the bundled 2048-word BIP-39 English list (SHA-256 verified against the official list), with suggestions, unknown-word warnings, and a full-phrase checksum check
* ✅ Seed words only render while shown, and hide on window blur, browser tab switch, Manage tab switch, lock, or the auto-lock timer
* ✅ Encrypted bookmarks: popup bookmark icon (hollow or filled), side panel list with search, rename, remove, and drag reorder
* ✅ Wallets and bookmarks each sealed as one compressed AES-GCM blob; nothing about them readable at rest
* ✅ Both travel in the encrypted vault file with deterministic merges: permanent IDs, newest edit wins, tombstoned deletes, no duplicates, and the same account labels on every device
* ✅ On-page unlocks open a Valid Vault window with Windows Hello or password, handled in the extension's own origin
* ✅ Popup lock button fixed, and the popup picks up an unlock done anywhere else
* ✅ Globe-in-a-V extension icons, centered Manage layout, and the login email picker keeps saved logins when the form loads late

### v0.6.4 - Extension Hotfix for v0.6.3 (Sep 2026)

* ✅ Master key import (file and QR) warns when the browser's vault uses a different key, clears it on confirmation, and saves the imported key under the browser's unlock methods so it survives lock and unlock
* ✅ Key file import no longer always reports a wrong passphrase
* ✅ Deletes now propagate through sync - merges keep tombstones for logins and Web Credentials
* ✅ Migration journal stores a SHA-256 fingerprint instead of a plaintext copy of the vault
* ✅ Manage lists Website Credentials again under single-blob storage
* ✅ Background auto-lock follows the seconds setting; a fresh unlock and Manage activity count as activity
* ✅ Click-to-fill V tags on Personal Info, login email/username, and password fields; no fill on page load and no focus popup
* ✅ Locked save prompt unlocks in place with a masked password box and show/hide toggle; clicking outside no longer discards the capture
* ✅ Extension-only; the phone app got the same key import, QR, and whole-vault fixes when it was rebuilt in v0.8.0

### v0.6.3 - Single-Blob Vault Encryption and Migration Hardening (Sep 2026)

* ✅ Website Credentials sealed as a single AES-GCM vault blob - domain names, credential IDs, timestamps, login types, usernames, passwords, and per-site extra fields all stay encrypted at rest
* ✅ Vaults migrate automatically on first unlock: backed up encrypted under a short-lived migration journal, converted to the blob, and verified against a full-tree fingerprint before the journal clears
* ✅ Unsupported or malformed vault rows now fail closed instead of being misread - an unrecognized `schemaVersion` or a `schemaVersion: 2` row missing its blob throws rather than being treated as an empty legacy vault
* ✅ Decrypted vault-tree validation deepened to check every domain's credential list, not just the top-level shape, so a malformed blob is caught immediately instead of crashing later
* ✅ Unknown fields on a legacy credential now survive migration into the new tree instead of being silently dropped
* ✅ Pairing and sync require both devices to share the same master key - a mismatched key fails with a clear error
* ✅ `loginType` field (username/email/phone) on Website Credentials for more reliable autofill matching

### v0.6.2 - Website Credentials Save Fix and Autofill Hardening (Sep 2026)

* ✅ Website Credentials save regression resolved at the root - `detectLoginForm()`/`matchSignupFieldType()` now use per-form closures instead of shared mutable globals, fixing the multi-form state collision that caused the v0.6.1 rollback
* ✅ Submit-triggered navigation losing the save prompt - captured credentials now stage in `background.js` synchronously and are recovered on whatever page loads next in the same tab, surviving cross-domain SSO/MFA redirects and multi-hop flows, with a stage/resolve ordering race closed via per-tab serialization
* ✅ False-positive personal-info classification fixed - bare single-word keywords (state, city, zip) now only match against structured signals (name/id/autocomplete), never free text
* ✅ Autofill now compatible with React/Vue-style controlled inputs via the native value-property setter
* ✅ Duplicate save prompts from one submission collapsed via an in-flight capture guard
* ✅ Fields reclassified when a framework sets their identifying attributes after insertion, instead of staying unrecognized
* ✅ Detached SPA forms and personal-info field tags no longer leak listeners indefinitely after removal
* ✅ Formless (no wrapping `<form>`) login widgets no longer cross-trigger each other's capture on a single click
* ✅ Personal Info autofill and per-site extra fields extended to `<select>` and `<textarea>`
* ✅ Activity tracking extended to ordinary typing, passive autofill, dropdown opens, and pending-save recovery, closing gaps that could lock the vault mid-use
* ✅ Pending-save recovery is tab-scoped with a 45s window, so a save survives cross-domain SSO/MFA redirects

### v0.6.1 - Autofill Injection Foundation (Sep 2026)

* ✅ Personal Info autofill on page load: empty, matched fields populate via a three-tier heuristic (autocomplete match, then keyword match, then nearby label text)
* ✅ Email fields are click-to-pick from a small on-field picker listing every saved, ranked email - never auto-filled silently
* ✅ Website Credentials autofill shows a picker of saved usernames for the current site; injection only, no password reveal
* ✅ Visible field tag marks anything Valid Vault has matched, repositioning on scroll/resize
* ✅ Inline unlock directly on a locked page when a tagged field is clicked - password-only, since a WebAuthn platform credential can't be triggered from a page's own origin
* ✅ Fixed a `VersionError` bug: background.js had `indexedDB.open('ValidVault', 1)` hardcoded in three places, silently breaking background vault access once the database reached version 3
* ✅ Fixed a popup/background race condition that could drop the session key on a fast tab switch, by delegating the session-key write to background.js
* ✅ Saving new logins from real signup flows, rolled back here after a regression, was fixed at the root in v0.6.2

### v0.6.0 - Web Credentials, Personal Info, Uni-Vault Key Fix (Sep 2026)

* ✅ Personal Info tab: name, phone, address, ranked/reorderable emails; view unlocks normally, edit requires the master password specifically
* ✅ Web Credentials gained a working Edit (previously add/delete only)
* ✅ Website Credentials and Web Credentials both require their own explicit re-unlock inside Manage
* ✅ Personal Info, Web Credentials, and logins all now travel together through Share/Export/Import/QR sync
* ✅ Fixed persistent key import - an imported master key now re-wraps under the browser's own unlock methods, so it genuinely becomes the browser's key going forward instead of silently reverting on next unlock. This was the real gap in using one vault file across multiple browsers with a shared master key.
* ✅ Save-on-submit prompt now checks existing saved state first - silent on an unchanged login, a save prompt for a new username, an update prompt for a changed password
* ✅ Tracked down and resolved a Windows Hello / passkey chooser issue during this cycle, confirmed via actual commit history to be Windows account state, not the extension's code

### v0.5.5 - Export Fix and Native File Saving (Sep 2026)

* ✅ Fixed Export Vault appearing to silently fail; added native Filesystem/Share-based file saving

### v0.5.4 - Phone De-Drift to Extension Parity (Sep 2026)

* ✅ About synced to match the extension; collapsible view/delete-only credentials list; inline unlock overlay

### v0.5.3 - Extension De-Drift to Phone Parity (Sep 2026)

* ✅ Custom app PIN removed from the extension; Sync tab rebuilt to Share/Backup/Scan model

### v0.5.0-v0.5.2 and earlier

* ✅ Native biometric auth, phone QR sync and encrypted backup, sovereign QR scanner, terminal-green rebrand - see CHANGELOG.md for full detail

---

## Upcoming After v0.9.4.3

### Before 1.0

* Bring the new look to the website
* Filling apps that Android Autofill can't reach
* Scanner reliability across more phones and cameras, tuned from what the live readout shows
* Imports from more password managers, added as people ask for them
* Final bug fixes and polish

### Autofill Hardening

* Custom div-based combobox and `contenteditable` field support - no standard attribute signal exists for either, so this needs its own approach rather than an extension of the current classifier
* Broader real-world testing of the heuristic field matcher across more sites
* Forms built from web components (shadow DOM) in the private browser, which the extension already reaches

## Future Considerations (Post-1.0)

### Two-Factor Codes

* Filling codes split across six one-digit boxes, which needs its own approach to find and fill each box in order
* Showing codes in the extension popup
* Filling codes in the phone's private browser

### Passkeys

* Valid Vault as a passkey manager, with passkeys sealed in the vault and moved between devices by vault file and vault QR like every other secret
* Android first, built on the Credential Manager provider that lets Valid Vault fill apps Android Autofill can't reach, then the extension, which answers a site's passkey request itself and signs in its background, so the private key never enters a web page
* Import and export in FIDO's Credential Exchange format once it settles
* Held for after 1.0 because a passkey's private key is as valuable as a seed phrase, so it gets its own security review, and Credential Manager needs Android 14 or newer and a library that will be discussed before it is added

### Extended Personal Info

* Social Security number and credit/debit card storage - deliberately held back for now, pending additional security work

### Platform Hardening

* Native background-lifecycle lock guarantees on Android

---

## Design Decisions

### Why the master password uses PBKDF2-SHA256 and not Argon2id

Argon2id resists GPU guessing better than PBKDF2, and it was evaluated for Valid Vault. It was set aside because of what it would cost the rest of the design:

* Browsers' built-in WebCrypto has no Argon2, so it would ship as a WebAssembly build. Running WebAssembly in the extension requires adding `wasm-unsafe-eval` to its content security policy, which today allows only Valid Vault's own scripts and blocks every network connection
* That build would be a compiled binary in a bundle that is otherwise readable source, sitting in the one path where every line needs to be auditable
* A key file made on one device has to open on every other device, including older phones running the app through Android's WebView, so Argon2id's memory setting would have to fit the weakest phone, which gives back much of its advantage
* WebCrypto runs PBKDF2 natively and hands back a key that script cannot read out, while a WebAssembly version holds the password and the derived key in ordinary memory as it works

What stands in front of a password guess today:

* The master password never encrypts the vault. It unwraps a random 256-bit master key, and no hash is stored, so every guess needs a stolen copy of the wrapped key and a full 600,000-round PBKDF2-SHA256 derivation, the current OWASP recommendation
* Key files and key QRs use 1,000,000 rounds under a passphrase screened against common passwords, plus three additional answers
* Day-to-day unlock is fingerprint or device PIN through Android Keystore or WebAuthn, which involves no password derivation at all

Argon2id will be reconsidered if browsers add it to WebCrypto. The switch would follow the same pattern as the single-blob migration: an encrypted backup first, then conversion, verification, and rollback on any mismatch.

### Why key files add three answers to the passphrase

A key file or key QR carries the master key, so it gets the strongest protection Valid Vault applies anywhere: a passphrase, plus three additional answers the owner picks.

Security questions have a poor reputation for good reason. Banks and websites used them to reset a forgotten password, so anyone who learned a mother's maiden name could take over the account. Valid Vault uses its answers in a different role:

* The passphrase must stand on its own. It needs at least 12 characters with a letter, a number, and a symbol, it is screened against common passwords, and four or more random words are recommended
* The passphrase and the three answers are joined into one input to a single 1,000,000-round PBKDF2-SHA256 derivation. An attacker has to guess all four together, so the answers can only add work, and the key is never weaker than the passphrase alone
* The answers never recover, reset, or bypass anything. Nothing is stored to check them against, and a wrong answer fails exactly like a wrong passphrase, by failing to unwrap the key
* The key file is only one half of a transfer. Without the separately exported vault file it opens nothing

For comparison, Chrome and Google Password Manager export passwords as a plain CSV file, and Samsung Pass protects its export with a single password.

### Why 2FA codes live on the login

A 2FA setup key is stored on the login it belongs to, inside the sealed Website Credentials blob.

* Two-factor authentication protects you when a site's password list leaks or a phishing page captures your password. Both protections still hold with the code on the login: a leaked password alone still fails at the code, and codes fill only on the site the login belongs to, so a phishing page gets neither
* Getting both factors would take the unlocked vault itself, which is behind your master key and a separate unlock in Manage
* Keeping the key on the login means one lookup fills the password and the code, and the key is encrypted at rest and travels in vault files and the vault QR with no new storage to protect
* Codes are never put on the clipboard. Filling covers the same need, and the clipboard is readable by other software

### Why Safe Browsing is off in the private browser

Android's Safe Browsing service checks pages through Google Play services and contacts Google when a page matches its list. The private browser exists to keep your browsing between you and the sites you visit, so the service is off, in line with keeping Google SDKs out of Valid Vault entirely.

What covers the gap:

* Logins fill only on the site address they were saved for, so a look-alike phishing page never gets a login, and the browser checks that the tab is still on the same scheme, address, and port before it fills. Against phishing, this is the protection that matters most in a password manager
* Ad and tracker scripts from other sites, a common route for malicious ads, are blocked by the EasyList and EasyPrivacy domain lists and Valid Vault's own list, all stored on the phone
* Downloads always ask first and are off in Tor mode, and pages without https ask before a login fills
* For a site you are unsure of, any browser with Safe Browsing, such as Chrome, still fills from Valid Vault through Android Autofill

### Why records are tied to their place in the vault

Since 0.9.4.1, every AES-GCM encryption in the vault includes a short label for where the record belongs as authenticated data: the login vault, a misc credential's name or value by its ID, the Personal Info profile, bookmarks, or crypto wallets. The label is not stored secretly and adds no new key. AES-GCM checks it on every read, so a ciphertext copied into another slot, such as one misc credential's value pasted over another's, fails to decrypt.

* Labels name places, never devices, so a vault file opens the same on every device that holds the key
* The master key wraps are unchanged, and verify-by-unwrap still applies to every unlock method
* Records written before 0.9.4.1 carry no label. They are read without one and rewritten with one on the next unlock or merge, using the migration pattern from the single-blob change: write, read back, compare, and put the previous record back on any mismatch
* Until every older record has been rewritten, an attacker who could already write to the device's storage and held an old copy of it could still swap in one of those older, unlabeled records. Once all devices are on 0.9.4.1 and have unlocked once, a later version can refuse unlabeled records entirely

### Why deleted items leave a marker that never expires

Deleting a login, misc credential, bookmark, wallet account, phone number, email, or address leaves a small marker in its place, holding the item's ID, the time, and for Personal Info the value that was removed. The marker travels with every sync, and deletes the item on any device it reaches, however late.

* A delete wins over any older edit and over an edit made in the same moment. An edit made on another device after the delete wins, because that is a newer, deliberate change
* An old backup, or a device that saved the same phone number or email on its own, cannot bring a deleted Personal Info entry back
* Markers never expire. Each is under a hundred bytes inside an encrypted blob, and an expiry would let a device that stayed offline past the cutoff bring deleted items back on its next sync

### Why Clear Vault removes the backup copy first

The extension keeps an encrypted backup copy of the vault in browser storage, so the vault comes back if the browser clears site data. On start, a vault with no unlock record is restored from that copy. Clear Vault used to remove the vault first and the backup copy second, so a crash or storage error between the two could bring a cleared vault back on the next start.

* The backup copy is removed first and checked to be gone, then the vault itself is cleared
* If the backup copy cannot be removed, nothing else is touched and Clear Vault reports an error
* If clearing the vault fails after the backup copy is gone, the vault is still there and visible, the backup copy is rebuilt from it on the next start, and Clear Vault reports an error
* A crash at any point leaves either the whole vault or nothing, never a vault that was reported cleared and comes back later
* A marker saying a clear is pending was considered and left out. If a marker could not be removed, every later start would clear the vault again, including a new vault set up afterward

---

## Known Limitations

⚠️ **Autofill matching quality varies site to site** - this is something I am very aware of. The foundation works, polish is ongoing and improves with each site reported to have issues

⚠️ **Save prompts are matched to your browser tab, not the exact page** - so they survive a login redirect (like SSO or MFA) instead of getting lost. In rare cases, navigating elsewhere in that same tab within the 45-second window could bring the prompt up there too - a minor UX quirk, not a credential leak.

⚠️ **Auto-lock is a foreground inactivity timer** on the phone - exact timing while backgrounded is subject to OS suspension

⚠️ **SSN and card storage deliberately deferred**, pending security work

⚠️ **Saved logins are matched by site address** - http and https pages, and different ports, on the same address share the same logins. The extension and the private browser ask before filling a page without https, and Android Autofill in other browsers relies on that browser's own warnings

⚠️ **The unlocked phone app can appear in the recent apps preview** - the autofill screen is hidden from screenshots and previews, the main app and the private browser are not yet

⚠️ **Tor mode checks that a proxy answers on Orbot's port** - it confirms a SOCKS5 proxy at 127.0.0.1:9050, not that the proxy is Orbot or that it is connected to Tor


⚠️ **Android Autofill needs a setting in Chrome** - Chrome needs its Autofill using another service setting turned on, and browsers without support for third-party autofill do not ask Valid Vault at all

⚠️ **The private browser needs Android 9 or newer**

⚠️ **Sync trusts each device's clock** - when two devices change the same item before syncing, the change with the later timestamp wins, so a device whose clock runs well ahead can win that conflict even if its change was made first. Any edit made after a sync always wins over what the sync brought in. Leaving the date and time set automatically keeps this from coming up

⚠️ **2FA codes fill a single code box** - codes split across one-digit boxes, and code boxes in the private browser, are typed from the code shown in Valid Vault for now

⚠️ **Delete export files after importing** - CSV, JSON, and zip exports hold your passwords unencrypted, and a protected file like a Samsung Pass export is only as safe as its export password. Cards, addresses, and notes in a Samsung Pass file are not imported

⚠️ **Uni-Vault needs a browser setting in Brave** - Brave ships the File System Access API switched off; Chrome and Edge work out of the box, and Brave users can switch it on or keep using Export and Import

⚠️ **Uni-Vault syncs browsers on one computer** - moving the vault between devices is still Export and Import, by USB drive or any file transfer, or QR

⚠️ **A lost key-file passphrase and answers cannot be recovered, although access is still possible if you can unlock your vault/vaults. Writing these credentials down and storing them safely is highly recommended.**

**These are intentional staging decisions or known open bugs, not oversights or knowledge gaps.**

---

## Contributing

Valid Vault is currently in solo development by Michael Carter.

---

## License

FSL-1.1-ALv2 - See LICENSE.md for details

---

**Last Updated:** Nov 2, 2026