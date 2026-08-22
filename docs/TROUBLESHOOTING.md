# Troubleshooting

| Symptom | Likely cause | Safe action |
|---|---|---|
| Sidebar does not open | Missing/misnamed HTML or setup not run | Ensure HTML filename is `ProjectControlPanel`; run `step200SetupProjectControlPanel` |
| Missing dependency in panel setup | Source files from different versions | Replace all release files together; run upgrade test |
| Sync waits for an OK popup | Legacy manual connector path | Start from the sidebar/background wrapper and deploy current orchestrator files |
| Range rejected | Future/incomplete date or more than 31 inclusive days | Choose completed dates and split the backfill |
| Job stuck `QUEUED`/`RUNNING` | Previous execution stopped or timed out | Wait for active execution; stale state can recover after 30 minutes |
| Credential missing | Script Property absent/misspelled | Add the exact property name in Project Settings; never use a sheet cell |
| 401/unauthorized | Expired/revoked token or wrong app | Rotate/reauthorize and run platform auth test |
| 403/permission | Token valid but account/API permission missing | Grant minimum reporting/account access; do not broaden unrelated permissions |
| Google customer inaccessible | MCC route or enabled account mismatch | Verify login customer ID, hierarchy, and enabled `Accounts` rows |
| Payment value unavailable | No billing permission and no manual threshold | Enter threshold/cycle; verify against the platform billing UI |
| 21 daily QA errors | Old QA date comparison | Deploy current `DashboardFunctionalQA.gs` and rerun |
| `Spend_Daily` header mismatch | Legacy `Last Updated` header | Run current data-quality repair/migration once |
| Dashboard empty | Filters exclude data or account disabled | Reset filters, verify date/currency/account, then check daily data |
| Multiple daily triggers | Setup repeated across versions | Remove triggers, then install once and verify count = 1 |

## Safe diagnostic bundle

When asking for help, share only:

- release version;
- failing function name;
- sanitized status/error code;
- counts and durations;
- masked account suffix if essential;
- whether the problem affects one or all platforms.

Never share raw `Error_Log`, full API responses, Script Properties, Sheet URLs,
account/campaign names, customer/company data, or screenshots of production.

## Recovery order

1. Stop the daily trigger if repeated failure risks rate limits or bad writes.
2. Preserve the workbook by making a private copy.
3. Check credentials/permissions without printing values.
4. Run one platform or one completed day where supported.
5. Run data-quality audit and reconciliation.
6. Restore normal sync only after the limited test passes.

