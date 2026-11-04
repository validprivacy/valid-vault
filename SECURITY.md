# Security Policy

Valid Vault is a local, encrypted password manager, and security reports are welcome. [THREAT_MODEL.md](THREAT_MODEL.md) describes what Valid Vault defends against and what it leaves to the device and its owner, which helps decide whether something is in scope.

## Supported versions

Security fixes go into the latest release of the Chrome extension and the Android app. Please update before reporting, and include the version from About.

## Reporting a vulnerability

Report privately, so a fix can ship before details are public:

* **GitHub:** open the repository's **Security** tab and choose **Report a vulnerability**
* **Email:** byrook@proton.me, with "Valid Vault security" in the subject

Please include the version, the platform (extension and browser, or Android version), the steps to reproduce, and what an attacker gains. A proof of concept helps but is not required.

Please do not open a public issue for a vulnerability, and do not test against vaults or devices that are not your own.

## What to expect

* An acknowledgement within 7 days
* An assessment, and a fix plan for confirmed issues, within 30 days
* A fix released as soon as it is ready and tested, credited in the CHANGELOG to the reporter who wants credit
* Public details after the fix ships, agreed with the reporter

There is no paid bounty at this time.

## In scope

* The Chrome extension in `extension/`, the Android app in `android/` and `phone/`, and the bundled `www/index.html`
* Encryption, key wrapping, key files and key QRs, vault files and the vault QR, sync and merge, autofill, the private browser, and anything that lets a web page, another app, or a stolen file reach vault data

## Out of scope

* Attacks that need an already unlocked device in hand, root access, or a compromised operating system, as described in [THREAT_MODEL.md](THREAT_MODEL.md)
* Weak passphrases or answers chosen by the owner
* Social engineering of the owner
* Issues in third-party software that Valid Vault does not ship
