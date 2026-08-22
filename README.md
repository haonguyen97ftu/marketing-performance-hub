# Marketing Performance Hub

Privacy-first Google Apps Script operations hub for consolidating advertising
performance from Meta, TikTok, Google Ads, Apple Search Ads, and Moloco into a
single Google Sheet.

**Release:** 2.2.0  
**Runtime:** Google Apps Script V8  
**Data policy:** public source, private credentials and private business data

## What it provides

- One sidebar control panel for project health, synchronization, accounts,
  dashboard filters, payment warnings, data quality, and sanitized logs.
- Scheduled three-day rolling synchronization plus background custom-range
  synchronization for up to 31 completed days.
- Normalized `Spend_Raw` and `Spend_Daily` datasets with reconciliation and QA.
- A persistent, filterable dashboard that does not recreate its chart on every
  filter change.
- Payment-threshold monitoring based on manually supplied billing thresholds
  and synchronized spend when billing API permission is unavailable.
- Credential-presence health checks without writing secret values to Sheets.

## Security boundary

This repository contains **source code only**. It intentionally contains no
tokens, private keys, spreadsheet IDs, advertising-account IDs, customer names,
company data, campaign exports, or production logs.

Credentials are supplied by the operator in **Apps Script → Project Settings →
Script Properties**. Never put credentials in source files, spreadsheet cells,
GitHub Issues, screenshots, chat, or email.

> Anyone who can edit the Apps Script project may be able to inspect Script
> Properties. Grant editor access only to trusted operators.

Run the local public-release gate before every push:

```bash
bash scripts/security-scan.sh
node scripts/validate-apps-script.js
```

## Quick start

1. Create or choose a private Google Sheet owned by the operating organization.
2. Open **Extensions → Apps Script** to create a bound Apps Script project.
3. Add the root `.gs` files, `ProjectControlPanel.html`, and `appsscript.json`.
4. Add credentials as Script Properties by following
   [docs/CREDENTIALS.md](docs/CREDENTIALS.md).
5. Run `setupMarketingSpendHub` once.
6. Run `step200SetupProjectControlPanel` once.
7. Run `step210TestProjectUpgrade` and confirm `status: SUCCESS`.
8. Enable the required accounts in the sidebar, then install the daily trigger.

The complete installation procedure is in [docs/SETUP.md](docs/SETUP.md).

## Documentation

- [Project brief](docs/PROJECT_BRIEF.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Setup and deployment](docs/SETUP.md)
- [Credential setup and rotation](docs/CREDENTIALS.md)
- [Operations runbook](docs/OPERATIONS.md)
- [Maintenance](docs/MAINTENANCE.md)
- [Security and privacy](docs/SECURITY_AND_PRIVACY.md)
- [Data dictionary](docs/DATA_DICTIONARY.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Vietnamese guide](README.vi.md)

## Repository layout

```text
*.gs                         Apps Script production and QA modules
ProjectControlPanel.html     Whole-project operations sidebar
appsscript.json              Apps Script manifest
docs/                        Operator, maintenance, and security guides
scripts/                     Public-release validation tools
.github/                     CI and contribution templates
```

Legacy runtime files and real workbook exports are deliberately excluded from
the public repository.

## Deployment options

- **Manual:** paste the root files into the bound Apps Script editor. This is
  the most direct installation method.
- **clasp:** copy `.clasp.json.example` to `.clasp.json`, insert your own Script
  ID locally, and run `clasp push`. `.clasp.json` is ignored by Git.

Do not deploy this as a web app. It is designed as a bound Google Sheets
project and operates on the active spreadsheet.

## License

MIT. See [LICENSE](LICENSE).

