# Changelog

All notable changes are documented here. Versions follow Semantic Versioning.

## Unreleased

- Added shared monthly audience age reporting for Apple Ads, Meta, and TikTok.
- Added manual menu actions and an opt-in monthly trigger.
- Reset stale dashboard styling when rebuilding the dashboard.

## 2.2.0 — 2026-08-22

- Prepared a data-free public repository and complete operator documentation.
- Added repository security scan and Apps Script validation scripts.
- Redacted known Script Property secret values before log persistence.
- Added redaction for query tokens, JWTs, private keys, email addresses, long
  identifiers, and common customer/account/campaign name fields.
- Sanitized both error messages and platform-log messages.
- Removed legacy connector scripts from the public release.

## 2.1.0 — 2026-08-04

- Added safe custom-range sync for all five connectors.
- Added whole-project sidebar control panel and background sync jobs.
- Added payment monitoring, data quality repair, dashboard QA, and workbook
  cleanup functions.
- Split project-run logging from connector/account-level logging.
