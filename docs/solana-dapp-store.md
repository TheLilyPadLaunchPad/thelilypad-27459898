# Publishing The Lily Pad to the Solana dApp Store (Android)

1. `npm i -g @bubblewrap/cli`
2. `bubblewrap init --manifest https://th3lilypad.com/manifest.webmanifest` (package id: `com.th3lilypad.app`)
3. `bubblewrap build` → produces `app-release-signed.apk`
4. `keytool -list -v -keystore android.keystore` → copy the SHA-256 fingerprint into `public/.well-known/assetlinks.json`, then publish the site.
5. Verify: https://th3lilypad.com/.well-known/assetlinks.json loads.
6. Submit the APK at https://publish.solanamobile.com
