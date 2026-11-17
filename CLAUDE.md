# Bills Tracker

Electron tray app for Windows and macOS (Apple Silicon). See `README.md` for commands and how it works, and `docs/code-signing.md` for signing.

The repo is public, so keep real data out of everything committed, including test fixtures, changelog entries and screenshots. That means no real bill amounts tied to a person, RF codes, account numbers, Gmail ids or email addresses. Changelog entries also shouldn't name the vendors from a real mailbox.

## Releasing

When asked to release, follow these steps. Pushing a `vX.Y.Z` tag publishes publicly and installed apps install it automatically, so only do it when the user has asked for a release. Use the version they give. If they don't give one, pick by semver from the unreleased changes and state your choice: patch for fixes only, minor for new features, major for breaking changes.

1. **Check the starting point.** Be on `main`, with a clean tree, up to date with `origin/main`. If there are uncommitted changes, ask whether they belong in this release. Stop if the tag already exists.
2. **Run the checks.** `npm test` and `npm run typecheck` must pass.
3. **Update `CHANGELOG.md`.** Move the notes under `## Unreleased` into a new `## X.Y.Z - YYYY-MM-DD` section directly below it, and leave `## Unreleased` in place and empty. If `## Unreleased` is empty, write the notes from the commits since the last tag (`git log <last-tag>..HEAD`). Write for users, using the `### Added`, `### Changed`, `### Fixed` and `### Security` headings. The heading format matters: `scripts/release-notes.mjs` looks for it exactly.
4. **Bump the version.** `npm version X.Y.Z --no-git-tag-version` updates `package.json` and `package-lock.json`.
5. **Commit and push.** Commit those files as `Release X.Y.Z`, then run `git tag vX.Y.Z && git push origin main vX.Y.Z`.
6. **Watch the workflow.** Find the run with `gh run list --workflow release.yml --limit 1`, then `gh run watch <id> --exit-status`. It takes 10 to 20 minutes. Once SignPath signing is set up, the Windows job also waits for someone to approve the signing request on SignPath. Tell the user if it's waiting.
7. **Confirm the result.** `gh release view vX.Y.Z` should show the notes and these files:
   - Windows: `Bills-Tracker-Setup-X.Y.Z.exe`, its `.blockmap`, and `latest.yml`.
   - macOS: `Bills-Tracker-X.Y.Z-arm64.dmg`, `Bills-Tracker-X.Y.Z-arm64.zip`, their `.blockmap` files, and `latest-mac.yml`.

   Installed apps update from `latest.yml` and `latest-mac.yml`, so both must be there. The release should be marked Latest. Give the user the release link.

`.github/workflows/release.yml` does the test, build, sign and publish work: `notes`, then `build-win` and `build-mac` in parallel, then `publish`. Don't build or upload installers by hand unless the user asks. To build both apps without publishing, run it with `gh workflow run release.yml --ref main`; the installers are attached to the run as artifacts.

### If something goes wrong

- **Workflow stops at "Read release notes":** the tag doesn't match `package.json`, or the changelog section is missing or empty.
- **`build-mac` fails at "Check the bundled Claude CLI":** the `claude` binary is missing from `app.asar.unpacked`, or won't run under the hardened runtime. Check `asarUnpack` in `electron-builder.yml` and `build/entitlements.mac.plist`.
- **Signing fails or times out:** nothing was published, because `publish` needs both builds. Ask the user to approve or check the request on SignPath, then rerun the failed jobs.
- **Workflow fails on a temporary problem:** rerun it with `gh run rerun <id> --failed`.
- **The code needs a fix:** release the fix as the next patch version. Don't move or delete a pushed tag or a published release without the user's approval.
- **`gh` returns 401 "Bad credentials":** an invalid `GH_TOKEN` in the environment may be overriding the keyring login. Check `gh auth status`, and unset it for that command only.

### Don't change

Tags `v1.0.0` to `v1.2.0` point to the initial commit on purpose, because the source for those versions was never in git. Their releases are installer-only.

## Agent skills

### Issue tracker

Issues are local markdown files under `.scratch/<feature>/` (gitignored, so they stay out of the public repo). See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the five default triage roles as-is, recorded as `Status:` lines in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
