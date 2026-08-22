# Operations runbook

## Open the operations console

Reload the Sheet, then choose:

```text
Marketing Hub → Open project control panel
```

You can also run `openMarketingHubControlPanel` from Apps Script. The sidebar
is the whole-project control panel; Dashboard is one module inside it.

## Daily operator check

1. Open **Overview** and confirm the last project run is `SUCCESS`.
2. Confirm the daily trigger is installed exactly once.
3. Check each enabled platform for a recent completed date.
4. Open **Payments** and review `WARNING` or `THRESHOLD_REACHED` accounts.
5. Review the sanitized project summary. Open detailed logs only when needed.

## Sync modes

| Mode | Use | Behavior |
|---|---|---|
| Daily scheduled | Normal production | Rolling three completed days to absorb late updates |
| Yesterday | Quick daily repair/test | One completed day |
| Last 3/7/14/30 days | Bounded backfill | Runs in sidebar background |
| Custom | Incident/backfill | Inclusive completed range, maximum 31 days |

The sidebar queues a background job and polls status; it does not show a
blocking OK dialog. Never launch overlapping runs from the editor while a
sidebar job is `QUEUED` or `RUNNING`.

## Account changes

- Enable only accounts that must be included in production.
- Verify currency and timezone after discovery.
- Disable an account before access is revoked when possible.
- Do not delete an account row solely to stop synchronization; disable it so
  history remains explainable.

## Payment monitoring

The system does not change credit limits or execute payments.

For each account, supply:

- payment threshold;
- billing cycle start;
- warning percentage (default 80%);
- optional manual current amount.

When billing permission is unavailable, the current amount is calculated from
`Spend_Daily` since the cycle start. A manual current amount overrides that
calculation. The `Data Source` column always identifies the basis; do not treat
a manual/spend-derived value as an API-confirmed billing balance.

States:

| State | Meaning | Action |
|---|---|---|
| `NOT_CONFIGURED` | Missing threshold/cycle inputs | Complete account configuration |
| `HEALTHY` | Below warning percentage | Monitor normally |
| `WARNING` | At or above warning percentage | Check platform billing UI and funding method |
| `THRESHOLD_REACHED` | At or above threshold | Escalate immediately; verify delivery and payment |

## Logs

- `Sync_Log`: one safe summary per whole-project run.
- `Platform_Log`: connector/account-level status and record counts.
- `Error_Log`: sanitized technical failures.

Logs are operationally confidential even after sanitizer processing. Do not
copy them to public Issues or the repository. Use a run ID and synthetic error
description when requesting help.

## Data-quality flow

1. Run `step190RunDataQualityAudit` or the equivalent panel action.
2. If a repair is recommended, create/confirm the automatic backups and run
   `step190RepairDataQuality`.
3. Confirm `auditErrors: 0`.
4. Run Dashboard functional QA and interactive/performance QA.
5. Do not adjust UI to hide a data discrepancy.

## Stop production safely

1. Run `step181RemoveDailyTrigger`.
2. Confirm `triggerInstalled: false` with `step181GetAutomationStatus`.
3. Leave source data and account history intact.
4. Revoke credentials only when the service is being retired or an incident
   requires it.

