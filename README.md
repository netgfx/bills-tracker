# Bills Tracker

A tray app for Windows and macOS that checks Gmail twice a day, through the Claude Agent SDK on your Claude subscription and Claude's Gmail connector. It lists your bills by due date and type, and your theater, cinema, event and hotel bookings with their tickets.

**Platforms:** Windows 10/11 (x64) and macOS 12 or later on Apple Silicon.

## Commands

```sh
npm install
npm run dev        # run with hot reload
npm test           # dedupe, tickets, RF checksum and release script tests
npm run typecheck
npm run dist       # build an installer for this OS into release/
npm run dist:win   # release/Bills-Tracker-Setup-<version>.exe
npm run dist:mac   # release/Bills-Tracker-<version>-arm64.dmg and .zip (on a Mac)
npm run icons      # redraw build/icon.png and the macOS menu bar icons
```

Dev only (the installed app ignores all three):
- `BILLS_DEV_CLAUDE_CONFIG_DIR=%USERPROFILE%\.claude` (or `~/.claude`) reuses an existing Claude Code login instead of signing in through the app.
- `BILLS_DEV_USER_DATA=<folder>` keeps test runs away from the installed app's data.
- `BILLS_DEV_SCAN_WINDOW=2026-08-19..2026-08-22` scans only those days, to test one email without reading the whole lookback window.

When you change what the scanner extracts, bump `EXTRACTION_VERSION` in `src/main/scanner.ts`. The next check then re-reads the lookback window once, because emails already read under the old rules are otherwise skipped. Bills and tickets already tracked are re-read too, but only gain fields they were missing.

## How it works

- **Sign-in**: the app runs the bundled `claude auth login --claudeai` (or `--sso`) with its own `CLAUDE_CONFIG_DIR` inside the app's data folder. It never shares settings, hooks or MCP servers with a Claude Code install.
- **Gmail**: finds the claude.ai Gmail connector on the account, then scans with only that server loaded and only its read-only tools allowed (`search_threads`, `get_thread`, `get_message`, `list_labels`, `download_gmail_attachment`). No built-in tools. The connector's settings reach the CLI over stdin, not its command line.
- **Scans**: at the configured times (default 08:00 and 20:00), plus a catch-up after the computer wakes or the app starts if a slot was missed. Failed scans retry in 30 minutes, up to 3 times.
- **Duplicates**: merged by Gmail message id, then vendor + RF / account + due date, with fuzzy matching for reminders (`src/main/dedupe.ts`). Removed bills are remembered so reminders don't bring them back.
- **Tickets and bookings**: the same scan picks up confirmations for theater, cinema, concerts and other events, and hotel stays (`src/main/tickets.ts`). Each card shows:
  - the date and time, venue, seats and booking reference
  - links to the tickets, the wallet passes and the email
  - QR codes and barcodes, drawn on your computer from the values printed in the email, so nothing is loaded from the web. Click one to enlarge it for scanning.

  Ticket PDFs and images attached to the email are downloaded once and kept with the ticket, to open and print. **Print** puts the codes on a plain sheet. A notification arrives the day before each show or check-in, and tickets move to Past once they're over.
- **Data**: `bills.json` (written atomically) and a `tickets` folder, in `%APPDATA%\Bills Tracker` on Windows and `~/Library/Application Support/Bills Tracker` on macOS.
- **Updates**: when the app opens, it checks GitHub releases for a newer version. On Windows it downloads it, restarts to install it, then shows a notification with the new version number. It waits for a running scan or sign-in to finish first. On macOS, until releases are signed with an Apple Developer ID, it shows a notification linking to the new version instead. Turn this off with "Install updates automatically" in Settings.
- **Notifications**: for new bills, bills due soon, new tickets and the day before a booking. Settings › Test notifications checks they reach you. On macOS, the first notification asks for permission.

## Installing

Download the latest installer from [Releases](https://github.com/netgfx/bills-tracker/releases/latest): `Bills-Tracker-Setup-<version>.exe` for Windows, or `Bills-Tracker-<version>-arm64.dmg` for macOS.

The installers aren't code-signed yet (see [docs/code-signing.md](docs/code-signing.md)), so the first run needs one extra step:
- **Windows**: SmartScreen says "Windows protected your PC". Click **More info**, then **Run anyway**.
- **macOS**: drag Bills Tracker to Applications and open it. When macOS says it can't verify the app, open **System Settings › Privacy & Security**, click **Open Anyway** next to Bills Tracker, and confirm.

The app itself is locked down: the window runs sandboxed with no Node access, it accepts messages only from its own page, and it grants web pages no permissions. Links from email open in your browser only after the app checks they're plain `https`. Electron's fuses stop the app binary from being used to run other code.

## What leaves your computer

- **To Anthropic**: the scan runs Claude on your own Claude account, so the emails Claude reads to find bills and tickets go to Anthropic under your plan's terms.
- **To Google**: Gmail is read through Claude's Gmail connector, signed in with your account.
- **To GitHub**: the update check downloads release information from this repository.
- **To a ticket's barcode service**: only when a ticket email loads its barcode from the web without printing the code. The app then fetches that one image once, without cookies, like opening the email would.

Nothing goes to the project's authors. There's no server, analytics or crash reporting.

## Releasing

1. Move the notes under `## Unreleased` in `CHANGELOG.md` into a new `## <version> - <date>` section.
2. Bump the version: `npm version <version> --no-git-tag-version`.
3. Commit, then tag and push: `git tag v<version> && git push origin main v<version>`.

Pushing the tag runs `.github/workflows/release.yml`. It tests, builds the Windows installer and the macOS app, signs whatever it has credentials for, and publishes them with that version's changelog notes. Installed apps then update themselves the next time they open. It stops before building if the tag doesn't match `package.json` or the notes are missing. To build both apps without releasing, run the workflow by hand from the Actions tab.

## Your account

Each user signs in with their own Claude account and connects their own Gmail through Claude's connector. Usage counts against that user's own plan. This project runs no server and never sees your email, bills, tickets or login.

This is an unofficial project, not affiliated with or endorsed by Anthropic or Google.

## License

The source code is [MIT](LICENSE). The Claude Agent SDK it depends on is proprietary and covered by [Anthropic's terms](https://code.claude.com/docs/en/legal-and-compliance), not by this license.
