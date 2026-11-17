# Code signing

Signed installers are what make Windows and macOS trust the app on first run. The release workflow (`.github/workflows/release.yml`) already signs both. Each platform switches on by itself once its secrets exist, and until then releases go out unsigned.

## What users see until then

| | Unsigned (today) | Signed |
|---|---|---|
| **Windows** | SmartScreen: "Windows protected your PC". Click **More info**, then **Run anyway**. | Installs normally. SmartScreen builds trust for the certificate over the first downloads. |
| **macOS** | "Apple could not verify 'Bills Tracker' is free of malware". Open **System Settings › Privacy & Security**, scroll down, click **Open Anyway** next to Bills Tracker, then confirm. This is needed once. | Opens normally. |
| **Updates** | Windows installs updates itself. macOS shows a notification for each new version, linking to the download, because macOS only lets Developer ID-signed apps update themselves. | Both install updates themselves. |

## Windows: SignPath Foundation

[SignPath Foundation](https://signpath.org) signs open-source projects for free, with a certificate issued to the Foundation. Every release is signed in CI and approved by a person on SignPath before it goes out.

1. **Check eligibility first.** Read the current [terms](https://signpath.org/terms) and apply at [signpath.org/apply](https://signpath.org/apply). The installer bundles Anthropic's Claude Code CLI (inside the Agent SDK), which is proprietary. Ask SignPath directly whether a bundled third-party binary is acceptable before relying on this route. If it isn't, the fallback is [Azure Artifact Signing](https://learn.microsoft.com/azure/artifact-signing/), which electron-builder supports through `win.azureSignOptions`.
2. **Meet their project requirements.** They include an OSI license (MIT, done), MFA on GitHub and SignPath for everyone with release access, and a code signing policy on the project page. Once approved, add this section to `README.md`:

   ```markdown
   ## Code signing policy

   Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org).

   - Committers and reviewers: [repository members](https://github.com/netgfx/bills-tracker/graphs/contributors)
   - Approvers: the repository owner

   Privacy policy: see [What leaves your computer](#what-leaves-your-computer).
   ```
3. **In SignPath**, create the project with the GitHub Actions trusted build system, and an artifact configuration that signs the `.exe` at the root of the uploaded zip with Authenticode:

   ```xml
   <artifact-configuration xmlns="http://signpath.io/artifact-configuration/v1">
     <zip-file>
       <pe-file path="Bills-Tracker-Setup-*.exe">
         <authenticode-sign />
       </pe-file>
     </zip-file>
   </artifact-configuration>
   ```
   Make it the project's default artifact configuration.
4. **In GitHub** (Settings › Secrets and variables › Actions):
   - Secret `SIGNPATH_API_TOKEN`: an API token of a SignPath CI user with submitter rights on the signing policy.
   - Variables `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG` and `SIGNPATH_SIGNING_POLICY_SLUG`.
5. **Test it:** run the Release workflow by hand (Actions › Release › Run workflow). The Windows job waits up to an hour for the request to be approved on SignPath. It then swaps in the signed installer, checks its signature, and rebuilds `latest.yml` and the blockmap with `scripts/finalize-signed-installer.mjs`. Without that last step, installed apps would reject the update because its checksum changed.

Only the installer is signed. The app inside it isn't, which is what SmartScreen and the install prompt look at anyway.

## macOS: Developer ID and notarization

This needs an [Apple Developer Program](https://developer.apple.com/programs/) membership ($99 a year).

1. In Xcode › Settings › Accounts (or on developer.apple.com), create a **Developer ID Application** certificate. Export it with its private key from Keychain Access as a `.p12` file with a password.
2. Create an [app-specific password](https://account.apple.com/account/manage) for your Apple ID, and note your Team ID (Membership details on developer.apple.com).
3. Add these GitHub secrets:

   | Secret | Value |
   |---|---|
   | `MAC_CERTIFICATE_P12_BASE64` | `base64 -i DeveloperID.p12 \| pbcopy` |
   | `MAC_CERTIFICATE_PASSWORD` | the `.p12` password |
   | `APPLE_ID` | your Apple ID email |
   | `APPLE_APP_SPECIFIC_PASSWORD` | the app-specific password |
   | `APPLE_TEAM_ID` | your Team ID |

4. Run the Release workflow by hand. electron-builder signs the app and the bundled `claude` binary under the hardened runtime (`build/entitlements.mac.plist`), then notarizes and staples the app. The "Check the bundled Claude CLI" step runs the signed binary, which catches entitlement problems before release.

The next signed release still reaches existing Mac users as an "update available" notification, because their copy is unsigned. Every release after it installs itself.
