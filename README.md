# Bills Tracker

Windows tray app that checks Gmail twice a day for bills (via the Claude Agent SDK on your Claude subscription and Claude's Gmail connector) and lists them by due date and type.

**Platforms:** only Windows is supported at the moment. macOS support is a work in progress.

## Commands

```sh
npm install
npm run dev        # run with hot reload
npm test           # dedupe / RF checksum tests
npm run typecheck
npm run dist       # build release/Bills Tracker Setup <version>.exe
```

Dev only (the installed app ignores both):
- `BILLS_DEV_CLAUDE_CONFIG_DIR=%USERPROFILE%\.claude` reuses an existing Claude Code login instead of signing in through the app.
- `BILLS_DEV_USER_DATA=<folder>` keeps test runs away from the installed app's `%APPDATA%\Bills Tracker` data.

When you change what the scanner extracts, bump `EXTRACTION_VERSION` in `src/main/scanner.ts`. The next check then re-reads the lookback window once, because emails already read under the old rules are otherwise skipped. Bills already tracked are re-read too, but only gain fields they were missing.

## How it works

- **Sign-in**: the app runs the bundled `claude auth login --claudeai` (or `--sso`) with its own `CLAUDE_CONFIG_DIR` under `%APPDATA%\Bills Tracker\claude`, so it never shares settings, hooks or MCP servers with a Claude Code install.
- **Gmail**: finds the claude.ai Gmail connector on the account, then scans with only that server loaded and only its read-only tools allowed (`search_threads`, `get_thread`, `get_message`, `list_labels`). No built-in tools.
- **Scans**: at the configured times (default 08:00 and 20:00), plus a catch-up after the PC wakes or the app starts if a slot was missed. Failed scans retry in 30 minutes, up to 3 times.
- **Duplicates**: merged by Gmail message id, then vendor + RF / account + due date, with fuzzy matching for reminders (`src/main/dedupe.ts`). Removed bills are remembered so reminders don't bring them back.
- **Data**: `%APPDATA%\Bills Tracker\bills.json`, written atomically.

## Releasing

1. Move the notes under `## Unreleased` in `CHANGELOG.md` into a new `## <version> - <date>` section.
2. Bump the version: `npm version <version> --no-git-tag-version`.
3. Commit, then tag and push: `git tag v<version> && git push origin main v<version>`.

Pushing the tag runs `.github/workflows/release.yml`, which tests, builds and publishes the installer with that version's changelog notes. It stops before building if the tag doesn't match `package.json` or the notes are missing.

Installers aren't code-signed, so Windows SmartScreen warns on first run.

## Your account

Each user signs in with their own Claude account and connects their own Gmail through Claude's connector. Usage counts against that user's own plan. This project runs no server and never sees your email, bills or login.

This is an unofficial project, not affiliated with or endorsed by Anthropic or Google.

## License

The source code is [MIT](LICENSE). The Claude Agent SDK it depends on is proprietary and covered by [Anthropic's terms](https://code.claude.com/docs/en/legal-and-compliance), not by this license.
