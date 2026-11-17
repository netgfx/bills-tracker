# Changelog

All notable changes to Bills Tracker are recorded here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## Unreleased

### Added

- **macOS support** for Macs with Apple Silicon. The app lives in the menu bar, can open at login, and uses the usual shortcuts (⌘F to search, ⌘C and ⌘V in fields, ⌘Q to quit). Until the Mac app is signed by Apple, macOS asks you to allow it once in System Settings › Privacy & Security. Instead of installing updates itself, it tells you when a new version is out.
- **Tickets & bookings**: confirmation emails for theater, cinema, concerts and other events, and hotel stays, now show up in their own area with:
  - the date and time, venue, seats and booking reference
  - the ticket's QR codes or barcodes, drawn in the app from the codes in the email. Click one to show it large at the door.
  - links to your tickets, to add them to Apple or Google Wallet, and to the email
  - ticket PDFs and images attached to the email, ready to open and print, and a **Print** button that puts the codes on a plain page

  Tickets move to Past once the show or stay is over.
- A reminder notification the day before a show, screening or hotel check-in. Turn it off with "Remind me about tickets" in Settings.
- A "Test notifications" button in Settings, to check notifications reach you.

### Changed

- The first check after updating re-reads the lookback window once, to find tickets you already have. This uses more Claude usage than a normal check.
- "Pay online" and "Open tickets" show the site a link really goes to, rather than the email's link-tracking service.
- Notifications keep working when clicked a while after they appear.

### Security

- The app now accepts messages only from its own window, and refuses every permission a web page can ask for.
- The app binary can no longer be used to run other code: Electron's run-as-Node mode, `NODE_OPTIONS` and debugging flags are switched off, and only the app's own, unmodified files load.
- The Gmail connector's settings now reach Claude over a private channel instead of the command line, where other users of the same computer could read them.
- Ticket attachments are only kept when their content proves they're a PDF, an image or a wallet pass, and only open in your PDF or image viewer.
- The release workflow can now sign the Windows installer and the macOS app. Signing switches on once the signing accounts are set up.

## 1.5.0 - 2026-11-10

### Added

- When a bill's email has both an RF code and the company's own payment code, the card now shows both. Click either one to copy it without spaces. The next check re-reads recent emails once to fill in the code that's missing on bills you already have.

## 1.4.0 - 2026-11-04

### Added

- Automatic updates: when the app opens, it installs any new version and shows a notification with the version number. Turn this off with "Install updates automatically" in Settings. Updating to this version still needs a manual install.

## 1.3.0 - 2026-11-04

### Fixed

- "View email" no longer fails with Gmail's "Temporary Error (404)". Bills you already have get the fixed link without a new scan.

### Added

- MIT license, this changelog and automated GitHub releases.

## 1.2.0 - 2026-10-26

### Added

- Bills now keep the customer code and online payment link from the email. Click the customer code or account number on a card to copy it.
- A **Pay online** button that shows the site's domain, and a "Copy payment link" menu item. The button is hidden on paid bills and where there's nothing to pay.
- "View email" links to the bill's own message instead of the inbox. This link failed with a Gmail error until 1.3.0.

### Changed

- When a reminder arrives with a newer payment link, the newer link replaces the old one.
- The first scan after updating re-reads the last 60 days once to fill in the new fields, which uses more Claude usage than a normal scan. It only adds missing fields and never changes amounts, due dates or paid status.

### Security

- Payment links come from email content, so only plain `https` links without embedded credentials are kept.

## 1.1.0 - 2026-10-24

### Added

- Zero and credit statements now appear as "Nothing to pay". They don't count toward totals, reminders or the tray, and they move to Paid when the next statement for the same account arrives.
- When the scanning rules change, the next check re-reads the lookback window once, so emails read under the old rules aren't missed.

### Changed

- Automatic payments move to Paid as "Charged" once their charge date has passed.
- Failed automatic charges now go to To pay.

### Fixed

- Several emails about the same failed payment are merged into one bill.
- Undated charges from the same vendor and amount are no longer merged across months.

## 1.0.0 - 2026-10-24

First release.

### Added

- Windows tray app that checks Gmail twice a day through Claude's Gmail connector, using read-only tools, and catches up on missed checks.
- Sign-in with a Claude account, including single sign-on, through a guided setup.
- Bills grouped by due date and type, with automatic payments listed separately and duplicates merged.
- Click-to-copy payment codes with an RF checksum check, and "Mark as paid" with undo.
- Search across paid and unpaid bills that ignores accents and case, with date and amount filters. Press Ctrl+F from anywhere to start.
- Light and dark themes, and starting with Windows.
