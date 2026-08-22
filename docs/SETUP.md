# Setup and deployment

## Prerequisites

- A Google account allowed to create/edit the target Sheet and Apps Script.
- A private Google Sheet dedicated to this project.
- API access for each platform you intend to enable.
- Trusted operators only; Apps Script editors can potentially inspect Script
  Properties.
- The spreadsheet and Apps Script timezone set consistently, normally
  `Asia/Ho_Chi_Minh` for this manifest.

## Recommended: bound-project installation

1. Make a backup copy of an existing production workbook before upgrading.
2. In the target Sheet, open **Extensions → Apps Script**.
3. Create/replace each root `.gs` file using the same filename.
4. Create one HTML file named `ProjectControlPanel` and paste the contents of
   `ProjectControlPanel.html`.
5. Replace the manifest with `appsscript.json`. Enable manifest visibility in
   Apps Script settings if needed.
6. Add Script Properties from [CREDENTIALS.md](CREDENTIALS.md). Do not paste any
   credential into the Sheet or source editor.
7. Save the project and run `setupMarketingSpendHub`.
8. Accept only the Google authorization scopes shown by the bound project.
9. Run `step200SetupProjectControlPanel`.
10. Run `step210TestProjectUpgrade` and require `status: SUCCESS`.
11. Run `step210PreviewProjectCleanup`, inspect the returned plan, then run
    `step210CleanupProjectWorkbook`. Unknown user-created sheets are untouched.
12. Reload the Sheet and open **Marketing Hub → Open project control panel**.
13. Discover or register accounts, then enable only the required accounts.
14. Run a one-day/yesterday sync and reconcile the result before installing the
    daily trigger with `step181InstallDailyTrigger`.

## Optional: deploy with clasp

Install and authenticate the official Apps Script CLI locally:

```bash
npm install --global @google/clasp
clasp login
cp .clasp.json.example .clasp.json
```

Replace `<YOUR_BOUND_APPS_SCRIPT_ID>` in the local `.clasp.json`, then run:

```bash
clasp push
```

`.clasp.json` is ignored because the Script ID identifies a private deployment.
Never commit `.clasprc.json` or any local OAuth material.

## First-run validation

Run these Apps Script functions in order:

```text
setupMarketingSpendHub
step200SetupProjectControlPanel
step210TestProjectUpgrade
step190RepairDataQuality          # only if audit reports repairable legacy data
step191RunDashboardFunctionalQA
step193RunInteractiveDashboardQA
step181GetAutomationStatus
```

The production gate is:

```text
status: SUCCESS
errors: 0
secretsExposed: false
```

## Upgrade an existing installation

1. Copy the production spreadsheet as a backup.
2. Pause the daily trigger with `step181RemoveDailyTrigger`.
3. Replace source files; do not add files from old `archive/` folders.
4. Run setup and the Step 21 upgrade test.
5. Preview and apply workbook cleanup.
6. Run a one-day sync, data-quality audit, and Dashboard QA.
7. Reinstall the daily trigger only after all checks pass.

## Never commit

- `.clasp.json` or `.clasprc.json`
- credentials, private keys, OAuth codes, tokens, or token metadata
- Sheet/CSV/XLSX exports, production logs, screenshots, or backups
- advertising-account, campaign, customer, employee, company, or project data

