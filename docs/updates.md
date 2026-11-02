# Updates and About

Help → Check for updates opens the installed/available versions, release notes, automatic-check
preference and download action. Help → About shows the running version, MIT license, a short
product description and the developer link: https://github.com/k1nosraty.

Native apps check on startup and at most every twelve hours while open, visible and online.
A persistent in-app notice offers View update; it does not interrupt reading or edit a document.
Automatic checks can be disabled. Browser/portable copies check only on request unless the user
opts in. These are in-app notices, not push notifications to a closed application. Existing
versions without this feature need to be upgraded once manually.

## Desktop installation

Windows NSIS, Linux AppImage and Linux deb builds use the official
[Tauri updater](https://v2.tauri.app/plugin/updater/). The app downloads the installer only after
Download and update is clicked. The plugin verifies its signature and the signed version before
installation. Next, the app runs the ordinary save/discard/cancel flow and flushes draft recovery.
Cancelling leaves the update available. Windows restarts via its installer; Linux offers Restart.
Package installation may require the OS's normal authorization.

Only stable versions newer than the installed version are offered. Pre-releases and downgrades
are excluded. The endpoint is fixed to this repository's `latest.json`. Native requests use the
OS TLS implementation and certificate store; legacy ZIP updater support is omitted because our
release assets are raw installers. Android does not link the desktop updater plugin.

Unsigned/older releases remain available through the official GitHub download flow. A failed
signature never falls back to executing an unverified file inside the app. Network errors remain
visible in the update dialog, with retry and release-history actions.

## One-time release setup

The public update key is committed in `src-tauri/tauri.conf.json`. Matching private material was
created outside the repository with owner-only permissions:

- `$HOME/.config/readme-viewer/updater.key`: desktop updater signing key (empty password).
- `$HOME/.config/readme-viewer/android-debug.keystore`: stable Android Preview PKCS#12 key,
  alias `androiddebugkey`, store/key password `android` (the standard debug signing configuration).

Back up these files securely. Keep the same keys for later releases. Do not commit them, include
them in a release asset, or paste them into issues/chat. Losing the desktop key breaks updates
for clients trusting its public key; changing the Android key prevents installing over old APKs.

Add two GitHub Actions repository secrets under Settings → Secrets and variables → Actions:

1. `TAURI_SIGNING_PRIVATE_KEY`: the contents of `updater.key`.
2. `ANDROID_DEBUG_KEYSTORE_BASE64`: single-line Base64 of `android-debug.keystore`.

For GitHub's web UI, open each local file in a text editor and copy its full contents into the
corresponding secret value. A ready-to-paste Android value is available in
`$HOME/.config/readme-viewer/android-debug.keystore.base64` (also owner-only). Line breaks in
Base64 values are accepted. Leave `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` unset for this key.

For example, on a machine with an authenticated GitHub CLI, from this repository:

```sh
gh secret set TAURI_SIGNING_PRIVATE_KEY < "$HOME/.config/readme-viewer/updater.key"
base64 -w0 "$HOME/.config/readme-viewer/android-debug.keystore" | gh secret set ANDROID_DEBUG_KEYSTORE_BASE64
```

The initially generated updater key has an empty password, so
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` can remain unset. Set that secret if you later use an
encrypted key. Never replace the public key of an already distributed app without a migration.
The Android key is a development Preview identity; production/Play Store signing is separate work.
An old APK signed with a different, temporary CI debug key requires a one-time reinstall. Save
user documents outside the app first; uninstalling can remove local drafts.

Secrets were not uploaded from this workspace. The workflow deliberately refuses to publish
from main until both signing identities are configured. Unpublished branch builds may remain
unsigned and keep producing ordinary test artifacts.

## Publishing the next version

1. Bump `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` and
   `src-tauri/tauri.conf.json` to the same stable version. Update `RELEASE-NOTES.md`.
   The prepared native/portable HTML version is filled from `package.json` during packaging.
2. Update main and develop to the same tested release commit and create an annotated version
   tag pointing to that commit. Push the branches and tag together, for example:
   `git push --atomic origin main develop refs/tags/v1.5.1` (substitute the release version).
   Main CI verifies the pushed tag resolves to its exact commit before building.
   The existing native workflow runs JavaScript/browser tests, native install/save
   checks and size budgets. It signs the Windows installer, AppImage and deb with version-bound
   signatures and restores the fixed Android signing identity before building per-ABI APKs.
3. After all platform checks pass, the release job uploads installers, checksums, signatures and
   `latest.json` together. It leaves already-published version tags unchanged; use a new version.

`node scripts/updater-manifest.js dist` refuses to produce the manifest without every signed
desktop asset. The manifest distinguishes NSIS, AppImage and deb targets so a Linux installation
receives its own package format. Do not manually publish a partial release or mark a prerelease
as the latest stable version. The old manual browser-package workflow does not produce a signed
native update feed.

## Android and browser download flow

Android opens the matching ARM64/X86_64 APK in the system browser, followed by Android's install
confirmation. It cannot silently install an APK. Unknown architectures use the official release
page instead of choosing an incompatible binary. The Preview key must stay fixed across builds.
Browser/portable copies use the portable download if published, or the release page.

The GitHub API metadata request omits credentials and never includes document content or paths.
Only `api.github.com` is added to the WebView's connection policy; general network access remains
restricted. Release notes are displayed as text, and external download links are constrained to
this repository's release URLs. Offline editing and rendering remain available when checks fail.

## Validation

`npm test` covers version comparison, metadata/privacy, signed installation ordering, cancellation,
verification failures, platform selection, URL restrictions and manifest requirements.
`npm run test:browser` additionally checks About/update dialogs in English/Persian, light/dark and
320 px/desktop viewports, including hit testing, focus, overflow and plain-text release notes.
A real end-to-end native upgrade still requires signed platform builds and a newer published feed.
