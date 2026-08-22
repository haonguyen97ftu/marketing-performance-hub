# Project brief

## Purpose

Marketing Performance Hub gives a marketing/finance operations team one private
Google Sheet for monitoring advertising spend and delivery across Meta, TikTok,
Google Ads, Apple Search Ads, and Moloco.

## Problem

Platform-native reports use different schemas, time zones, authentication
models, and account hierarchies. Manual consolidation is slow, hard to audit,
and can mix currencies or silently miss late-arriving data.

## Solution

The project connects to each platform from a bound Google Apps Script project,
normalizes campaign-level daily rows, builds account/day aggregates, and exposes
project operations through a sidebar. The source repository is public while all
credentials and business data remain in the operator's Google environment.

## In scope

- Five advertising-platform connectors.
- Account discovery and enable/disable controls.
- Rolling and bounded custom-range synchronization.
- Raw and daily normalized datasets.
- Dashboard, data-quality audit, reconciliation, and functional QA.
- Daily trigger status and sanitized operational logs.
- Manual payment-threshold monitoring when billing APIs are unavailable.

## Out of scope

- Storing credentials in GitHub or spreadsheet cells.
- Customer-level or end-user behavioral data.
- Automated payment, credit-limit change, or billing action.
- Cross-currency financial consolidation without an explicit FX policy.
- A public web application or public spreadsheet.

## Success criteria

- All enabled connectors complete without exposing secrets.
- Custom ranges reach all five connectors and are limited to 31 completed days.
- Raw and daily data reconcile with zero data-quality errors.
- Dashboard QA passes and chart count remains stable.
- A failed platform is visible without publishing raw API responses.
- Public-release validation finds no credentials or production data files.

## Ownership model

| Role | Responsibility |
|---|---|
| Repository maintainer | Reviews source, documentation, releases, and CI |
| Google Sheet owner | Controls Drive sharing and workbook recovery |
| Credential custodian | Creates, rotates, and revokes platform credentials |
| Operator | Monitors sync, payment warnings, logs, and QA |

One person may hold several roles, but production credentials should never be
shared through the repository or an issue tracker.

