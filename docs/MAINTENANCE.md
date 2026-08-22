# Maintenance guide

## Routine schedule

| Frequency | Checks |
|---|---|
| Daily | Last run, trigger count, enabled-platform freshness, payment warnings |
| Weekly | Failed/partial runs, disabled/stale accounts, Dashboard QA sample |
| Monthly | Data-quality audit, Drive access review, log retention, credential health |
| Quarterly | Credential rotation policy, disaster-recovery test, API-version review |
| Before release | Backup, security scan, syntax validation, limited production sync |

## Release procedure

1. Update `MSH.VERSION`, the default `PROJECT_VERSION`, and `CHANGELOG.md`.
2. Run the repository gates:

   ```bash
   bash scripts/security-scan.sh
   node scripts/validate-apps-script.js
   ```

3. Copy the production Sheet as a private backup.
4. Remove the daily trigger.
5. Deploy source to a non-production copy and run upgrade/QA functions.
6. Deploy to production.
7. Run a one-day sync and reconciliation.
8. Reinstall the daily trigger and confirm exactly one trigger.
9. Create a GitHub release containing source only—never a workbook export.

## API maintenance

- Review platform API deprecation notices before changing API versions.
- Prefer additive connector changes and preserve normalized output fields.
- Test account discovery separately from performance synchronization.
- Treat permission errors differently from token-expiry and rate-limit errors.
- Keep platform-specific identifiers masked in console and persisted free-text
  messages; dedicated private Sheet columns may retain operational IDs.

## Schema maintenance

- Do not reorder existing `Spend_Raw` or `Spend_Daily` columns without a
  migration and backup.
- New metrics should be additive and have a defined zero/null policy.
- `Record Key` must be generated from normalized dimensions, not supplied by a
  connector.
- Rebuild daily output after raw-key or metric repairs.
- Update [DATA_DICTIONARY.md](DATA_DICTIONARY.md) with schema changes.

## Workbook cleanup

Use `step210PreviewProjectCleanup` before `step210CleanupProjectWorkbook`.
Cleanup hides known system, QA, helper, backup, and log sheets; it does not
delete them. Unknown user-created sheets remain untouched. To reverse the
visibility change, run `step210ShowAllProjectSheets`.

## Retention

`LOG_RETENTION_DAYS` defaults to 90. Confirm the implementation and your
organization's policy before automating deletion. Spend datasets are not
automatically purged by this release; define a retention period based on legal,
contractual, finance, and customer requirements, then archive or delete data
inside the private Google environment—not GitHub.

## Recovery

1. Stop triggers and active jobs.
2. Duplicate the damaged workbook before repair.
3. Restore the last known-good private Sheet copy or Apps Script version.
4. Re-enter credentials from the credential custodian; never recover them from
   Git history or documentation.
5. Run setup, upgrade test, data-quality audit, and Dashboard QA.
6. Backfill in ranges of no more than 31 completed days.
7. Re-enable the daily trigger after reconciliation.

## Maintainer handoff

Transfer these items through approved private channels:

- Sheet ownership and editor list;
- platform application/admin ownership;
- credential-custodian responsibility (not credential values in documentation);
- current API permissions and renewal dates;
- latest successful run ID and open incidents;
- recovery and retention policy.

