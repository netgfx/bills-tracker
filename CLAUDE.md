# Bills Tracker

Electron tray app for Windows. See `README.md` for commands and how it works.

The repo is public, so keep real data out of everything committed, including test fixtures, changelog entries and screenshots. That means no real bill amounts tied to a person, RF codes, account numbers, Gmail ids or email addresses. Changelog entries also shouldn't name the vendors from a real mailbox.

## Releasing

When asked to release, follow these steps. Pushing a `vX.Y.Z` tag publishes publicly and installed apps install it automatically, so only do it when the user has asked for a release. Use the version they give. If they don't give one, pick by semver from the unreleased changes and state your choice: patch for fixes only, minor for new features, major for breaking changes.

1. **Check the starting point.** Be on `main`, with a clean tree, up to date with `origin/main`. If there are uncommitted changes, ask whether they belong in this release. Stop if the tag already exists.
2. **Run the checks.** `npm test` and `npm run typecheck` must pass.
3. **Update `CHANGELOG.md`.** Move the notes under `## Unreleased` into a new `## X.Y.Z - YYYY-MM-DD` section directly below it, and leave `## Unreleased` in place and empty. If `## Unreleased` is empty, write the notes from the commits since the last tag (`git log <last-tag>..HEAD`). Write for users, using the `### Added`, `### Changed`, `### Fixed` and `### Security` headings. The heading format matters: `scripts/release-notes.mjs` looks for it exactly.
4. **Bump the version.** `npm version X.Y.Z --no-git-tag-version` updates `package.json` and `package-lock.json`.
5. **Commit and push.** Commit those files as `Release X.Y.Z`, then run `git tag vX.Y.Z && git push origin main vX.Y.Z`.
6. **Watch the workflow.** Find the run with `gh run list --workflow release.yml --limit 1`, then `gh run watch <id> --exit-status`. It takes a few minutes.
7. **Confirm the result.** `gh release view vX.Y.Z` should show the notes and three files: `Bills-Tracker-Setup-X.Y.Z.exe`, its `.blockmap` and `latest.yml`. Installed apps update from `latest.yml`, so it must be there. The release should be marked Latest. Give the user the release link.

`.github/workflows/release.yml` does the test, build and publish work. Don't build or upload the installer by hand unless the user asks.

### If something goes wrong

- **Workflow stops at "Read release notes":** the tag doesn't match `package.json`, or the changelog section is missing or empty.
- **Workflow fails on a temporary problem:** rerun it with `gh run rerun <id> --failed`.
- **The code needs a fix:** release the fix as the next patch version. Don't move or delete a pushed tag or a published release without the user's approval.
- **`gh` returns 401 "Bad credentials":** an invalid `GH_TOKEN` in the environment may be overriding the keyring login. Check `gh auth status`, and unset it for that command only.

### Don't change

Tags `v1.0.0` to `v1.2.0` point to the initial commit on purpose, because the source for those versions was never in git. Their releases are installer-only.
