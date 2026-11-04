# Changelog

All notable changes to Bills Tracker are recorded here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## Unreleased

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
