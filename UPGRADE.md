# Marketing Performance Hub — Step 21 upgrade

## Fixed

- Added the missing logged range path:
  `step181RunLoggedSyncRange` → `syncAllPlatformsPerformanceRange`.
- One validated custom range now reaches all five production connectors.
- Custom sync accepts completed dates only and at most 31 inclusive days.
- Sidebar/menu sync is queued in the background and connector summaries do not
  open blocking OK dialogs.
- A stale queued/running background job can recover after 30 minutes.
- The HTML file is normalized to `ProjectControlPanel.html` and the public
  opener is `openMarketingHubControlPanel`.

## Architecture cleanup

- `Sync_Log` now contains one row per whole-project run.
- `Platform_Log` contains connector/account-level detail.
- `step210CleanupProjectWorkbook` backs up and migrates mixed legacy log rows.
- Only `Dashboard`, `Accounts`, and `Payment_Monitor` remain visible after
  cleanup. System, QA, log, settings, helper, and backup tabs are hidden, never
  deleted. Unknown user-created tabs are left untouched.
- Old standalone Meta spend, Moloco report-job, and TikTok setup/test scripts
  are not part of production runtime and are excluded from the public release.

## Install

1. Replace the Apps Script files with the active `.gs` files in the root of
   this release. Do not restore legacy connector files from older bundles.
2. In Apps Script, create/replace the HTML file with the name
   `ProjectControlPanel` (the editor adds the HTML type) and paste the content
   of `ProjectControlPanel.html`.
3. Run `step200SetupProjectControlPanel` once.
4. Run `step210TestProjectUpgrade`.
5. Run `step210PreviewProjectCleanup`, inspect the returned plan, then run
   `step210CleanupProjectWorkbook`.

Expected upgrade test:

```text
status: SUCCESS
errors: 0
warnings: 0
rangeSyncReady: true
openFunction: openMarketingHubControlPanel
sidebarFile: ProjectControlPanel
mixedSyncLogRows: 0
secretsExposed: false
```

If the test reports only mixed log rows or a missing `Platform_Log`, run the
cleanup function and then rerun the test.

## Daily operation

- Open the panel from **Marketing Hub → Open project control panel**, or run
  `openMarketingHubControlPanel` directly.
- Rolling sync leaves the production three-day schedule unchanged.
- Range sync supports Yesterday, last 3/7/14/30 completed days, or Custom.
- To reverse tab cleanup, run `step210ShowAllProjectSheets`.
