/**
 * Marketing Performance Hub — audience age reporting.
 *
 * Grain:
 *   Month × Platform × Account × Campaign × Age Range
 *
 * Apple Ads only returns aggregated age buckets. Low-volume demographic data
 * can be withheld by Apple, and withheld rows are kept instead of discarded.
 * For Apple rows, Conversions keeps totalInstalls while App Installs uses the
 * tap-through metric tapInstalls (view-through installs are excluded there).
 * The output schema includes Platform so other advertising channels can append
 * to the same Age_Monthly table later. Apple is queried at DAILY granularity
 * and the script aggregates those metrics into calendar months. This also
 * supports the current partial month, which Apple's MONTHLY granularity does
 * not reliably expose for recent reporting windows.
 *
 * Optional Script Properties for manual backfills:
 *   APPLE_ADS_AGE_START_DATE = yyyy-MM-dd
 *   APPLE_ADS_AGE_END_DATE   = yyyy-MM-dd
 */

const AGE_REPORTING_20261105 = Object.freeze({
  SHEET_NAME: "Age_Monthly",
  PLATFORM: "Apple Search Ads",
  REPORT_PATH: "/reports/campaigns",
  REPORT_TIME_ZONE: "ORTZ",
  PAGE_LIMIT: 1000,
  MAX_PAGES: 1000,
  MAX_DAYS_PER_CHUNK: 30,
  RECENT_MONTHS: 3,
  START_DATE_PROPERTY: "APPLE_ADS_AGE_START_DATE",
  END_DATE_PROPERTY: "APPLE_ADS_AGE_END_DATE",
  HEADERS: Object.freeze([
    "Month",
    "Platform",
    "Account ID",
    "Account Name",
    "Campaign ID",
    "Campaign Name",
    "Age Range",
    "Currency",
    "Spend",
    "Impressions",
    "Clicks",
    "Conversions",
    "App Installs",
    "Pulled At",
    "Record Key"
  ])
});


/** Read-only execution-API diagnostic; never returns secret values. */
function diagnoseAppleAdsAgeRuntime() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const properties = PropertiesService.getScriptProperties();
  return {
    status: "OK",
    spreadsheetBound: Boolean(spreadsheet),
    spreadsheetId: spreadsheet ? spreadsheet.getId() : "",
    credentialsPresent: [
      "APPLE_ADS_CLIENT_ID",
      "APPLE_ADS_TEAM_ID",
      "APPLE_ADS_KEY_ID",
      "APPLE_ADS_PRIVATE_KEY"
    ].every(function (key) {
      return Boolean(properties.getProperty(key));
    })
  };
}


/** Syncs the current month plus the previous two calendar months. */
function syncAppleAdsAgeRecentMonths() {
  return runAppleAdsAgeSync20261105_({
    runLabel: "Apple Ads age recent 3-month sync",
    dateResolver: function (account) {
      const endDate = getAppleAdsYesterday179B_(account.timezone);
      return {
        startDate: getAppleAdsAgeMonthStart20261105_(
          endDate,
          AGE_REPORTING_20261105.RECENT_MONTHS - 1
        ),
        endDate: endDate
      };
    }
  });
}


function syncAppleAdsAgeRecentMonthsFromMenu() {
  const result = syncAppleAdsAgeRecentMonths();
  SpreadsheetApp.getActiveSpreadsheet().toast(
    "Apple Ads monthly age sync completed: " +
      result.rowsWritten +
      " rows written to " +
      result.sheetName +
      ".",
    "Marketing Hub",
    8
  );
  return result;
}


/** Backward-compatible aliases retained for existing callers. */
function syncAppleAdsAgeLast30Days() {
  return syncAppleAdsAgeRecentMonths();
}


function syncAppleAdsAgeRecent() {
  return syncAppleAdsAgeRecentMonths();
}


function syncAppleAdsAgeLast30DaysFromMenu() {
  return syncAppleAdsAgeRecentMonthsFromMenu();
}


function syncAppleAdsAgeRecentFromMenu() {
  return syncAppleAdsAgeRecentMonthsFromMenu();
}


/** Manual backfill using APPLE_ADS_AGE_START_DATE / END_DATE. */
function syncAppleAdsAgeRange() {
  const properties = PropertiesService.getScriptProperties();
  const startDate = getRequiredAppleAdsProperty179A_(
    properties,
    AGE_REPORTING_20261105.START_DATE_PROPERTY
  );
  const endDate = getRequiredAppleAdsProperty179A_(
    properties,
    AGE_REPORTING_20261105.END_DATE_PROPERTY
  );

  validateAppleAdsDateRange179B_(startDate, endDate);

  return runAppleAdsAgeSync20261105_({
    runLabel: "Apple Ads age manual backfill",
    dateResolver: function () {
      return {startDate: startDate, endDate: endDate};
    }
  });
}


function runAppleAdsAgeSync20261105_(config) {
  assertAppleAdsAgeDependencies20261105_();

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    throw new Error("Another Marketing Hub operation is already running.");
  }

  try {
    const startedAt = new Date();
    const accounts = getEnabledAccounts_(
      AGE_REPORTING_20261105.PLATFORM
    );
    if (!accounts.length) {
      throw new Error(
        "No enabled Apple Search Ads account was found in Accounts."
      );
    }

    const properties = PropertiesService.getScriptProperties();
    const accessToken = getAppleAdsAccessToken179A_(
      getAppleAdsCredentials179A_(properties),
      false
    );
    const records = [];
    const scopes = [];
    const results = [];

    accounts.forEach(function (account) {
      const accountId = normalizeAppleAdsOrgId179B_(account.accountId);
      const range = config.dateResolver(account);
      validateAppleAdsDateRange179B_(range.startDate, range.endDate);

      try {
        const report = fetchAppleAdsAgeReport20261105_({
          account: account,
          accessToken: accessToken,
          startDate: range.startDate,
          endDate: range.endDate
        });
        const normalized = normalizeAppleAdsAgeRows20261105_(
          report.rows,
          account
        );

        Array.prototype.push.apply(records, normalized);
        scopes.push({
          accountId: accountId,
          startMonth: range.startDate.slice(0, 7),
          endMonth: range.endDate.slice(0, 7)
        });
        results.push({
          accountId: accountId,
          accountName: String(account.accountName || ""),
          status: "SUCCESS",
          apiRows: report.rows.length,
          outputRows: normalized.length,
          pagesFetched: report.pagesFetched
        });
      } catch (error) {
        results.push({
          accountId: accountId,
          accountName: String(account.accountName || ""),
          status: "FAILED",
          message: sanitizeAppleAdsMessage179A_(
            error && error.message ? error.message : String(error)
          )
        });
      }
    });

    if (!scopes.length) {
      throw new Error(
        "Apple Ads age sync failed for every enabled account: " +
        JSON.stringify(results)
      );
    }

    const writeResult = replaceAppleAdsAgeScopes20261105_(
      records,
      scopes
    );
    const failedAccounts = results.filter(function (result) {
      return result.status === "FAILED";
    });
    const summary = {
      status: failedAccounts.length ? "PARTIAL" : "SUCCESS",
      runLabel: config.runLabel,
      sheetName: AGE_REPORTING_20261105.SHEET_NAME,
      platform: AGE_REPORTING_20261105.PLATFORM,
      enabledAccounts: accounts.length,
      successfulAccounts: scopes.length,
      failedAccounts: failedAccounts.length,
      rowsWritten: writeResult.appleRows,
      totalSheetRows: writeResult.totalRows,
      results: results,
      durationSeconds: Math.round((new Date() - startedAt) / 100) / 10
    };

    console.log("Audience age reporting: " + summary.status);
    return summary;
  } finally {
    lock.releaseLock();
  }
}


function fetchAppleAdsAgeReport20261105_(config) {
  const chunks = splitAppleAdsDateRange179B_(
    config.startDate,
    config.endDate,
    AGE_REPORTING_20261105.MAX_DAYS_PER_CHUNK
  );
  const rows = [];
  let pagesFetched = 0;

  chunks.forEach(function (chunk) {
    const result = fetchAppleAdsAgeChunk20261105_({
      account: config.account,
      accessToken: config.accessToken,
      startDate: chunk.startDate,
      endDate: chunk.endDate
    });
    Array.prototype.push.apply(rows, result.rows);
    pagesFetched += result.pagesFetched;
  });

  return {rows: rows, pagesFetched: pagesFetched};
}


function fetchAppleAdsAgeChunk20261105_(config) {
  const accountId = normalizeAppleAdsOrgId179B_(
    config.account.accountId
  );
  const rows = [];
  let offset = 0;

  for (
    let page = 0;
    page < AGE_REPORTING_20261105.MAX_PAGES;
    page++
  ) {
    const response = fetchAppleAdsReportPage179B_({
      url:
        APPLE_ADS_179A.API_BASE_URL +
        AGE_REPORTING_20261105.REPORT_PATH,
      accessToken: config.accessToken,
      organizationId: accountId,
      payload: {
        startTime: config.startDate,
        endTime: config.endDate,
        timeZone: AGE_REPORTING_20261105.REPORT_TIME_ZONE,
        granularity: "DAILY",
        groupBy: ["ageRange"],
        selector: {
          orderBy: [
            {field: "campaignId", sortOrder: "ASCENDING"}
          ],
          pagination: {
            offset: offset,
            limit: AGE_REPORTING_20261105.PAGE_LIMIT
          }
        },
        returnRecordsWithNoMetrics: false,
        returnRowTotals: false,
        returnGrandTotals: false
      }
    });
    const pageRows = extractAppleAdsReportRows179B_(response);
    const pagination = extractAppleAdsPagination179B_(response);
    Array.prototype.push.apply(rows, pageRows);

    const totalResults = toOptionalAppleAdsNumber179B_(
      pagination.totalResults
    );
    const nextOffset = offset + pageRows.length;
    if (
      pageRows.length < AGE_REPORTING_20261105.PAGE_LIMIT ||
      (totalResults !== null && nextOffset >= totalResults)
    ) {
      return {rows: rows, pagesFetched: page + 1};
    }
    offset += AGE_REPORTING_20261105.PAGE_LIMIT;
  }

  throw new Error("Apple Ads age report exceeded pagination limit.");
}


function normalizeAppleAdsAgeRows20261105_(rows, account) {
  const accountId = normalizeAppleAdsOrgId179B_(account.accountId);
  const accountName = String(account.accountName || "").trim();
  const accountCurrency = String(account.currency || "")
    .trim()
    .toUpperCase();
  const pulledAt = Utilities.formatDate(
    new Date(),
    "UTC",
    "yyyy-MM-dd'T'HH:mm:ss'Z'"
  );
  const records = new Map();

  (rows || []).forEach(function (row) {
    const metadata = row && row.metadata ? row.metadata : {};
    const campaignId = String(
      metadata.campaignId || metadata.id || ""
    ).trim();
    const campaignName = String(
      metadata.campaignName || metadata.name || ""
    ).trim();
    const ageRange = normalizeAppleAdsAgeBucket20261105_(metadata);
    const granularMetrics = Array.isArray(row.granularity)
      ? row.granularity
      : [];

    granularMetrics.forEach(function (metric) {
      const date = normalizeAppleAdsMetricDate179B_(metric.date);
      if (!date || !campaignId || !ageRange) return;
      const month = date.slice(0, 7);

      const localSpend = getAppleAdsLocalSpend179B_(metric);
      const currency = String(
        localSpend.currency || accountCurrency
      ).trim().toUpperCase();
      const totalInstalls = getAppleAdsTotalInstalls179B_(metric);
      const tapThroughInstalls = toAppleAdsMetricNumber179B_(
        metric.tapInstalls,
        "tapInstalls"
      );
      const key = [
        month,
        AGE_REPORTING_20261105.PLATFORM,
        accountId,
        campaignId,
        ageRange
      ].join("|");
      const current = records.get(key) || {
        month: month,
        platform: AGE_REPORTING_20261105.PLATFORM,
        accountId: accountId,
        accountName: accountName,
        campaignId: campaignId,
        campaignName: campaignName,
        ageRange: ageRange,
        currency: currency,
        spend: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        appInstalls: 0,
        pulledAt: pulledAt,
        recordKey: key
      };

      current.spend += toAppleAdsMetricNumber179B_(
        localSpend.amount,
        "localSpend"
      );
      current.impressions += toAppleAdsMetricNumber179B_(
        metric.impressions,
        "impressions"
      );
      current.clicks += toAppleAdsMetricNumber179B_(
        metric.taps,
        "taps"
      );
      current.conversions += totalInstalls;
      current.appInstalls += tapThroughInstalls;
      records.set(key, current);
    });
  });

  return Array.from(records.values()).sort(compareAgeRecords20261105_);
}


function normalizeAppleAdsAgeBucket20261105_(metadata) {
  const raw =
    metadata.ageRange ||
    metadata.age ||
    (metadata.groupBy && metadata.groupBy.ageRange) ||
    "";
  const value = String(raw).trim();
  // Apple represents the privacy-threshold bucket with no ageRange value,
  // while the literal UNKNOWN value is a separate demographic bucket.
  if (!value) return "Low Volume";

  const normalized = value
    .replace(/\s+/g, " ")
    .replace(/_/g, "-")
    .toUpperCase();
  const aliases = {
    "18-24": "18-24",
    "25-34": "25-34",
    "35-44": "35-44",
    "45-54": "45-54",
    "55-64": "55-64",
    "65+": "65+",
    "65-PLUS": "65+",
    "USER-WITHHELD": "User Withheld",
    "USER WITHHELD": "User Withheld",
    "LOW-VOLUME": "Low Volume",
    "LOW VOLUME": "Low Volume",
    "UNKNOWN": "UNKNOWN"
  };
  return aliases[normalized] || value;
}


function replaceAppleAdsAgeScopes20261105_(records, scopes) {
  const sheet = getOrCreateAgeSheet20261105_();
  const headers = AGE_REPORTING_20261105.HEADERS;
  const existing = sheet.getLastRow() > 1
    ? sheet.getRange(
        2,
        1,
        sheet.getLastRow() - 1,
        headers.length
      ).getValues()
    : [];
  const scopeByAccount = new Map();
  scopes.forEach(function (scope) {
    scopeByAccount.set(String(scope.accountId), scope);
  });

  const retained = existing.filter(function (row) {
    if (String(row[1]) !== AGE_REPORTING_20261105.PLATFORM) {
      return true;
    }
    const scope = scopeByAccount.get(String(row[2]));
    if (!scope) return true;
    const month = normalizeAgeSheetMonth20261105_(row[0]);
    return month < scope.startMonth || month > scope.endMonth;
  });
  const incoming = records.map(ageRecordToRow20261105_);
  const output = retained.concat(incoming);
  output.sort(compareAgeRows20261105_);

  const requiredRows = Math.max(2, output.length + 1);
  if (sheet.getMaxRows() < requiredRows) {
    sheet.insertRowsAfter(
      sheet.getMaxRows(),
      requiredRows - sheet.getMaxRows()
    );
  }
  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      headers.length - sheet.getMaxColumns()
    );
  }
  if (sheet.getFilter()) sheet.getFilter().remove();

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  const oldDataRows = Math.max(0, sheet.getLastRow() - 1);
  if (oldDataRows) {
    sheet.getRange(2, 1, oldDataRows, headers.length).clearContent();
  }
  if (output.length) {
    sheet.getRange(2, 1, output.length, headers.length).setValues(output);
    sheet.getRange(2, 1, output.length, 1).setNumberFormat("yyyy-mm");
    sheet.getRange(2, 9, output.length, 1).setNumberFormat("#,##0.00");
    sheet.getRange(2, 10, output.length, 4).setNumberFormat("#,##0");
  }

  const usedRows = Math.max(1, output.length + 1);
  sheet.getRange(1, 1, usedRows, headers.length)
    .setFontFamily("Arial")
    .setFontSize(10)
    .setVerticalAlignment("middle");
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground("#eeeeee")
    .setFontWeight("bold")
    .setWrap(true)
    .setNote(
      "Monthly aggregated age-bucket performance from Apple Search Ads, " +
      "TikTok, and Meta. Platform privacy thresholds and different source " +
      "bucket definitions are preserved; Apple Low Volume, UNKNOWN, and " +
      "User Withheld remain separate values. " +
      "For Apple Search Ads, App Installs is tap-through installs."
    );
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 36);
  sheet.setColumnWidths(1, headers.length, 130);
  sheet.setColumnWidth(4, 220);
  sheet.setColumnWidth(6, 360);
  sheet.setColumnWidth(15, 420);
  sheet.getRange(1, 1, usedRows, headers.length).createFilter();
  SpreadsheetApp.flush();

  return {appleRows: incoming.length, totalRows: output.length};
}


function getOrCreateAgeSheet20261105_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  return (
    spreadsheet.getSheetByName(AGE_REPORTING_20261105.SHEET_NAME) ||
    spreadsheet.insertSheet(AGE_REPORTING_20261105.SHEET_NAME)
  );
}


function ageRecordToRow20261105_(record) {
  return [
    record.month,
    record.platform,
    record.accountId,
    safeAgeCell20261105_(record.accountName),
    record.campaignId,
    safeAgeCell20261105_(record.campaignName),
    record.ageRange,
    record.currency,
    Math.round(record.spend * 1000000) / 1000000,
    record.impressions,
    record.clicks,
    record.conversions,
    record.appInstalls,
    record.pulledAt,
    record.recordKey
  ];
}


function safeAgeCell20261105_(value) {
  const text = String(value == null ? "" : value);
  return /^[=+@]/.test(text) ? "'" + text : text;
}


function getAppleAdsAgeMonthStart20261105_(endDate, monthsBack) {
  validateAppleAdsDate179B_(endDate, "Apple Ads age end date");
  const parts = endDate.split("-").map(Number);
  const offset = Number(monthsBack);
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error("Apple Ads age month offset must be a nonnegative integer.");
  }

  const monthIndex = parts[0] * 12 + (parts[1] - 1) - offset;
  const year = Math.floor(monthIndex / 12);
  const month = monthIndex - year * 12 + 1;
  return year + "-" + String(month).padStart(2, "0") + "-01";
}


function normalizeAgeSheetMonth20261105_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, "UTC", "yyyy-MM");
  }
  return String(value || "").slice(0, 7);
}


function compareAgeRecords20261105_(left, right) {
  return compareAgeKeys20261105_([
    left.month,
    left.platform,
    left.accountId,
    left.campaignId,
    ageBucketOrder20261105_(left.ageRange)
  ], [
    right.month,
    right.platform,
    right.accountId,
    right.campaignId,
    ageBucketOrder20261105_(right.ageRange)
  ]);
}


function compareAgeRows20261105_(left, right) {
  return compareAgeKeys20261105_([
    normalizeAgeSheetMonth20261105_(left[0]),
    String(left[1]),
    String(left[2]),
    String(left[4]),
    ageBucketOrder20261105_(left[6])
  ], [
    normalizeAgeSheetMonth20261105_(right[0]),
    String(right[1]),
    String(right[2]),
    String(right[4]),
    ageBucketOrder20261105_(right[6])
  ]);
}


function compareAgeKeys20261105_(left, right) {
  return left.map(String).join("|").localeCompare(
    right.map(String).join("|")
  );
}


function ageBucketOrder20261105_(value) {
  const order = {
    "13-17": "01",
    "18-24": "02",
    "25-34": "03",
    "35-44": "04",
    "45-54": "05",
    "55-64": "06",
    "55+": "07",
    "65+": "08",
    "Low Volume": "97",
    "User Withheld": "98",
    "UNKNOWN": "99"
  };
  return order[String(value)] || "97-" + String(value);
}


function assertAppleAdsAgeDependencies20261105_() {
  const required = [
    ["getEnabledAccounts_", typeof getEnabledAccounts_],
    ["getAppleAdsCredentials179A_", typeof getAppleAdsCredentials179A_],
    ["getAppleAdsAccessToken179A_", typeof getAppleAdsAccessToken179A_],
    ["fetchAppleAdsReportPage179B_", typeof fetchAppleAdsReportPage179B_],
    ["extractAppleAdsReportRows179B_", typeof extractAppleAdsReportRows179B_],
    ["extractAppleAdsPagination179B_", typeof extractAppleAdsPagination179B_],
    ["splitAppleAdsDateRange179B_", typeof splitAppleAdsDateRange179B_]
  ];
  const missing = required.filter(function (entry) {
    return entry[1] !== "function";
  }).map(function (entry) {
    return entry[0];
  });
  if (missing.length) {
    throw new Error(
      "Apple Ads age reporting is missing dependencies: " +
      missing.join(", ")
    );
  }
}
