/**
 * Rebuilds Spend_Daily from normalized Spend_Raw performance records.
 *
 * Spend_Daily is derived data, so its body is safely regenerated
 * while its header remains intact.
 */
const DAILY_PERFORMANCE_COLUMNS = Object.freeze([
  "Date",
  "Platform",
  "Account ID",
  "Account Name",
  "Currency",
  "Spend",
  "Updated At",
  "Impressions",
  "Clicks",
  "Conversions",
  "App Installs",
  "CTR",
  "CPC",
  "CPM",
  "CPA",
  "CVR",
  "CPI"
]);

const DAILY_PERFORMANCE_INDEX = Object.freeze({
  DATE: 0,
  PLATFORM: 1,
  ACCOUNT_ID: 2,
  ACCOUNT_NAME: 3,
  CURRENCY: 4,
  SPEND: 5,
  UPDATED_AT: 6,
  IMPRESSIONS: 7,
  CLICKS: 8,
  CONVERSIONS: 9,
  APP_INSTALLS: 10,
  CTR: 11,
  CPC: 12,
  CPM: 13,
  CPA: 14,
  CVR: 15,
  CPI: 16
});

function rebuildSpendDaily(options) {
  const config = options || {};
  const runId = createRunId_();
  const startedAt = new Date();

  try {
    const rawSheet = requireSheet_(MSH.SHEETS.RAW);
    const dailySheet = requireSheet_(MSH.SHEETS.DAILY);
    const groups = new Map();

    ensureRawPerformanceSchema_(rawSheet);
    ensureDailyPerformanceSchema_(dailySheet);

    if (rawSheet.getLastRow() >= 2) {
      const rows = rawSheet
        .getRange(
          2,
          1,
          rawSheet.getLastRow() - 1,
          SPEND_COLUMNS.length
        )
        .getValues();

      rows.forEach(row => {
        const date = row[SPEND_COLUMN_INDEX.DATE];
        const platform = String(
          row[SPEND_COLUMN_INDEX.PLATFORM] || ""
        );
        const accountId = String(
          row[SPEND_COLUMN_INDEX.ACCOUNT_ID] || ""
        );
        const accountName = String(
          row[SPEND_COLUMN_INDEX.ACCOUNT_NAME] || ""
        );
        const currency = String(
          row[SPEND_COLUMN_INDEX.CURRENCY] || ""
        );
        const spend = Number(
          row[SPEND_COLUMN_INDEX.SPEND] || 0
        );

        if (
          !date ||
          !platform ||
          !accountId ||
          !Number.isFinite(spend)
        ) {
          return;
        }

        const formattedDate = formatSpendDate_(date);

        const key = [
          formattedDate,
          platform,
          accountId,
          currency
        ].join("|");

        if (!groups.has(key)) {
          groups.set(key, {
            date: formattedDate,
            platform,
            accountId,
            accountName,
            currency,
            spend: 0,
            impressions: 0,
            clicks: 0,
            conversions: 0,
            appInstalls: 0
          });
        }

        const group = groups.get(key);

        group.spend += spend;
        group.impressions += Number(
          row[SPEND_COLUMN_INDEX.IMPRESSIONS] || 0
        );
        group.clicks += Number(
          row[SPEND_COLUMN_INDEX.CLICKS] || 0
        );
        group.conversions += Number(
          row[SPEND_COLUMN_INDEX.CONVERSIONS] || 0
        );
        group.appInstalls += Number(
          row[SPEND_COLUMN_INDEX.APP_INSTALLS] || 0
        );
      });
    }

    const output = Array.from(groups.values())
      .sort((a, b) => {
        return (
          b.date.localeCompare(a.date) ||
          a.platform.localeCompare(b.platform) ||
          a.accountName.localeCompare(b.accountName)
        );
      })
      .map(item => {
        const derived =
          calculateDerivedPerformanceMetrics_(item);

        return [
          item.date,
          item.platform,
          item.accountId,
          item.accountName,
          item.currency,
          item.spend,
          new Date(),
          item.impressions,
          item.clicks,
          item.conversions,
          item.appInstalls,
          derived.ctr,
          derived.cpc,
          derived.cpm,
          derived.cpa,
          derived.cvr,
          derived.cpi
        ];
      });

    if (dailySheet.getLastRow() > 1) {
      dailySheet
        .getRange(
          2,
          1,
          dailySheet.getLastRow() - 1,
          dailySheet.getMaxColumns()
        )
        .clearContent();
    }

    if (output.length) {
      dailySheet
        .getRange(
          2,
          1,
          output.length,
          DAILY_PERFORMANCE_COLUMNS.length
        )
        .setValues(output);

      dailySheet
        .getRange(2, 6, output.length, 1)
        .setNumberFormat("#,##0.00");

      dailySheet
        .getRange(2, 8, output.length, 4)
        .setNumberFormat("#,##0.####");

      dailySheet
        .getRange(2, 12, output.length, 1)
        .setNumberFormat('0.00"%"');

      dailySheet
        .getRange(2, 13, output.length, 3)
        .setNumberFormat("#,##0.00");

      dailySheet
        .getRange(2, 16, output.length, 1)
        .setNumberFormat('0.00"%"');

      dailySheet
        .getRange(2, 17, output.length, 1)
        .setNumberFormat("#,##0.00");
    }

    const finishedAt = new Date();

    writeSyncLog_({
      runId,
      startedAt,
      finishedAt,
      platform: "SYSTEM",
      status: "SUCCESS",
      records: output.length,
      durationSeconds:
        (finishedAt - startedAt) / 1000,
      message:
        "Spend_Daily rebuilt from " +
        groups.size +
        " date/account/currency groups."
    });

    if (config.showUi !== false) {
      SpreadsheetApp.getUi().alert(
        "Daily spend rebuilt",
        "✅ Daily rows: " + output.length,
        SpreadsheetApp.getUi().ButtonSet.OK
      );
    }

  } catch (error) {
    writeErrorLog_({
      runId,
      platform: "SYSTEM",
      functionName: "rebuildSpendDaily",
      errorCode: "DAILY_AGGREGATION_FAILED",
      message: error.message,
      details: error.stack || ""
    });

    throw error;
  }
}

/**
 * Derived metrics are always recalculated from aggregate base totals.
 */
function calculateDerivedPerformanceMetrics_(metrics) {
  const spend = Number(metrics.spend || 0);
  const impressions = Number(metrics.impressions || 0);
  const clicks = Number(metrics.clicks || 0);
  const conversions = Number(metrics.conversions || 0);
  const appInstalls = Number(metrics.appInstalls || 0);

  return {
    ctr: impressions > 0
      ? roundPerformanceMetric_(
          clicks / impressions * 100,
          4
        )
      : 0,
    cpc: clicks > 0
      ? roundPerformanceMetric_(spend / clicks, 4)
      : 0,
    cpm: impressions > 0
      ? roundPerformanceMetric_(
          spend / impressions * 1000,
          4
        )
      : 0,
    cpa: conversions > 0
      ? roundPerformanceMetric_(spend / conversions, 4)
      : 0,
    cvr: clicks > 0
      ? roundPerformanceMetric_(
          conversions / clicks * 100,
          4
        )
      : 0,
    cpi: appInstalls > 0
      ? roundPerformanceMetric_(spend / appInstalls, 4)
      : 0
  };
}

function roundPerformanceMetric_(value, decimals) {
  const factor = Math.pow(10, decimals);

  return Math.round(
    (Number(value) + Number.EPSILON) * factor
  ) / factor;
}

/**
 * Safely extends the legacy seven-column Spend_Daily schema.
 */
function ensureDailyPerformanceSchema_(sheet) {
  ensureSheetColumnCapacity_(
    sheet,
    DAILY_PERFORMANCE_COLUMNS.length
  );

  const currentHeaders = sheet
    .getRange(
      1,
      1,
      1,
      DAILY_PERFORMANCE_COLUMNS.length
    )
    .getDisplayValues()[0];

  DAILY_PERFORMANCE_COLUMNS.forEach((expected, index) => {
    const current = String(currentHeaders[index] || "").trim();

    if (current && current !== expected) {
      throw new Error(
        "Spend_Daily header mismatch at column " +
        (index + 1) +
        ": expected '" +
        expected +
        "' but found '" +
        current +
        "'."
      );
    }
  });

  sheet
    .getRange(
      1,
      1,
      1,
      DAILY_PERFORMANCE_COLUMNS.length
    )
    .setValues([DAILY_PERFORMANCE_COLUMNS.slice()]);
}
