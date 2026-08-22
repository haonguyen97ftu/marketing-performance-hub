/**
 * Marketing Spend Hub — Normalized Performance Data Store
 *
 * Legacy column positions are preserved so existing Spend_Raw data and
 * spend-only connectors continue to work. New base performance metrics are
 * appended after Record Key.
 */

const SPEND_COLUMNS = Object.freeze([
  "Date",
  "Platform",
  "Account ID",
  "Account Name",
  "Campaign ID",
  "Campaign Name",
  "Currency",
  "Spend",
  "Imported At",
  "Record Key",
  "Impressions",
  "Clicks",
  "Conversions",
  "App Installs"
]);

const SPEND_COLUMN_INDEX = Object.freeze({
  DATE: 0,
  PLATFORM: 1,
  ACCOUNT_ID: 2,
  ACCOUNT_NAME: 3,
  CAMPAIGN_ID: 4,
  CAMPAIGN_NAME: 5,
  CURRENCY: 6,
  SPEND: 7,
  IMPORTED_AT: 8,
  RECORD_KEY: 9,
  IMPRESSIONS: 10,
  CLICKS: 11,
  CONVERSIONS: 12,
  APP_INSTALLS: 13
});

/**
 * Creates a deterministic key used to prevent duplicates.
 */
function createSpendRecordKey_(
  date,
  platform,
  accountId,
  campaignId
) {
  return [
    formatSpendDate_(date),
    String(platform).trim(),
    String(accountId).trim(),
    String(campaignId || "ACCOUNT_TOTAL").trim()
  ].join("|");
}

/**
 * Inserts new records and updates existing records by Record Key.
 *
 * @return {{inserted:number, updated:number}}
 */
function upsertSpendRows_(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return { inserted: 0, updated: 0 };
  }

  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);

  try {
    const sheet = requireSheet_(MSH.SHEETS.RAW);
    ensureRawPerformanceSchema_(sheet);
    const normalized = records.map(normalizeSpendRecord_);
    const existingRows = getExistingSpendRowMap_(sheet);

    const inserts = [];
    const updates = [];

    normalized.forEach(record => {
      const values = spendRecordToRow_(record);
      const existingRow = existingRows.get(record.recordKey);

      if (existingRow) {
        updates.push({
          row: existingRow,
          values
        });
      } else {
        inserts.push(values);
      }
    });

    // Update existing records.
    updates.forEach(update => {
      sheet
        .getRange(update.row, 1, 1, SPEND_COLUMNS.length)
        .setValues([update.values]);
    });

    // Insert new records in one batch.
    if (inserts.length) {
      sheet
        .getRange(
          sheet.getLastRow() + 1,
          1,
          inserts.length,
          SPEND_COLUMNS.length
        )
        .setValues(inserts);
    }

    return {
      inserted: inserts.length,
      updated: updates.length
    };

  } finally {
    lock.releaseLock();
  }
}

/**
 * Validates and normalizes one platform record.
 */
function normalizeSpendRecord_(record) {
  if (!record || typeof record !== "object") {
    throw new Error("Spend record must be an object.");
  }

  const platform = String(record.platform || "").trim();
  const accountId = String(record.accountId || "").trim();
  const currency = String(record.currency || "").trim().toUpperCase();
  const spend = normalizeNonNegativeMetric_(
    record.spend,
    "Spend"
  );
  const impressions = normalizeNonNegativeMetric_(
    record.impressions,
    "Impressions"
  );
  const clicks = normalizeNonNegativeMetric_(
    record.clicks,
    "Clicks"
  );
  const conversions = normalizeNonNegativeMetric_(
    record.conversions !== undefined
      ? record.conversions
      : record.conversion,
    "Conversions"
  );
  const appInstalls = normalizeNonNegativeMetric_(
    record.appInstalls !== undefined
      ? record.appInstalls
      : record.installs,
    "App Installs"
  );

  if (!MSH.PLATFORMS.includes(platform)) {
    throw new Error("Unsupported platform: " + platform);
  }

  if (!accountId) {
    throw new Error("Spend record is missing Account ID.");
  }

  if (!record.date) {
    throw new Error("Spend record is missing Date.");
  }

  const normalizedDate = formatSpendDate_(record.date);

  if (!currency || !/^[A-Z]{3}$/.test(currency)) {
    throw new Error(
      "Currency must be a three-letter code, for example USD."
    );
  }

  const campaignId = String(
    record.campaignId || "ACCOUNT_TOTAL"
  ).trim();

  return {
    date: normalizedDate,
    platform,
    accountId,
    accountName: String(record.accountName || "").trim(),
    campaignId,
    campaignName: String(record.campaignName || "").trim(),
    currency,
    spend,
    impressions,
    clicks,
    conversions,
    appInstalls,
    importedAt: new Date(),
    // Record Key is always derived from the normalized row dimensions.
    // Connector-supplied keys are intentionally not trusted because a stale
    // date/platform alias can make future upserts update the wrong row.
    recordKey: createSpendRecordKey_(
      normalizedDate,
      platform,
      accountId,
      campaignId
    )
  };
}

function spendRecordToRow_(record) {
  return [
    record.date,
    record.platform,
    record.accountId,
    record.accountName,
    record.campaignId,
    record.campaignName,
    record.currency,
    record.spend,
    record.importedAt,
    record.recordKey,
    record.impressions,
    record.clicks,
    record.conversions,
    record.appInstalls
  ];
}

/**
 * Missing optional metrics default to zero, which keeps existing spend-only
 * connectors compatible while they are upgraded platform by platform.
 */
function normalizeNonNegativeMetric_(value, label) {
  if (value === undefined || value === null || value === "") {
    return 0;
  }

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new Error(
      label + " must be a non-negative number."
    );
  }

  return numberValue;
}

/**
 * Safely appends the new performance headers to the legacy Spend_Raw schema.
 * Existing non-empty, conflicting headers are never overwritten.
 */
function ensureRawPerformanceSchema_(sheet) {
  ensureSheetColumnCapacity_(
    sheet,
    SPEND_COLUMNS.length
  );

  const currentHeaders = sheet
    .getRange(1, 1, 1, SPEND_COLUMNS.length)
    .getDisplayValues()[0];

  SPEND_COLUMNS.forEach((expected, index) => {
    const current = String(currentHeaders[index] || "").trim();

    if (current && current !== expected) {
      throw new Error(
        "Spend_Raw header mismatch at column " +
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
    .getRange(1, 1, 1, SPEND_COLUMNS.length)
    .setValues([SPEND_COLUMNS.slice()]);
}

function ensureSheetColumnCapacity_(sheet, requiredColumns) {
  const currentColumns = sheet.getMaxColumns();

  if (currentColumns < requiredColumns) {
    sheet.insertColumnsAfter(
      currentColumns,
      requiredColumns - currentColumns
    );
  }
}

/**
 * Maps existing Record Keys to their spreadsheet row numbers.
 */
function getExistingSpendRowMap_(sheet) {
  const map = new Map();

  if (sheet.getLastRow() < 2) {
    return map;
  }

  const keys = sheet
    .getRange(
      2,
      SPEND_COLUMN_INDEX.RECORD_KEY + 1,
      sheet.getLastRow() - 1,
      1
    )
    .getDisplayValues()
    .flat();

  keys.forEach((key, index) => {
    if (key) {
      map.set(key, index + 2);
    }
  });

  return map;
}

/**
 * Converts supported date input to yyyy-MM-dd.
 */
function formatSpendDate_(value) {
  let date;

  // A date-only API value is already canonical. Parsing it into a Date first
  // can shift it by one day when the Apps Script timezone is west of UTC.
  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return value;
  }

  if (
    Object.prototype.toString.call(value) === "[object Date]"
  ) {
    date = value;
  } else {
    date = new Date(value);
  }

  if (isNaN(date.getTime())) {
    throw new Error("Invalid spend date: " + value);
  }

  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    "yyyy-MM-dd"
  );
}

/**
 * Tests insert, deduplication, update, and validation.
 * Its temporary test record is removed afterward.
 */
function runDataStoreSelfTest() {
  const runId = createRunId_();
  const testAccountId = "SELF_TEST_" + runId;
  const testDate = "2000-01-01";

  const testRecord = {
    date: testDate,
    platform: "Meta",
    accountId: testAccountId,
    accountName: "Temporary self-test",
    campaignId: "TEST_CAMPAIGN",
    campaignName: "Temporary self-test",
    currency: "USD",
    spend: 10.25,
    impressions: 1000,
    clicks: 50,
    conversions: 5,
    appInstalls: 4
  };

  const key = createSpendRecordKey_(
    testDate,
    "Meta",
    testAccountId,
    "TEST_CAMPAIGN"
  );

  const results = [];

  try {
    const insertResult = upsertSpendRows_([testRecord]);

    results.push({
      name: "Insert new record",
      passed:
        insertResult.inserted === 1 &&
        insertResult.updated === 0
    });

    const updateResult = upsertSpendRows_([
      Object.assign({}, testRecord, {
        spend: 20.50,
        appInstalls: 8
      })
    ]);

    results.push({
      name: "Update existing record",
      passed:
        updateResult.inserted === 0 &&
        updateResult.updated === 1
    });

    const sheet = requireSheet_(MSH.SHEETS.RAW);
    const rowMap = getExistingSpendRowMap_(sheet);
    const rowNumber = rowMap.get(key);

    const storedSpend = rowNumber
      ? Number(
          sheet
            .getRange(
              rowNumber,
              SPEND_COLUMN_INDEX.SPEND + 1
            )
            .getValue()
        )
      : null;
    const storedAppInstalls = rowNumber
      ? Number(
          sheet
            .getRange(
              rowNumber,
              SPEND_COLUMN_INDEX.APP_INSTALLS + 1
            )
            .getValue()
        )
      : null;

    results.push({
      name: "Updated spend persisted",
      passed: storedSpend === 20.50
    });

    results.push({
      name: "Updated app installs persisted",
      passed: storedAppInstalls === 8
    });

    let invalidRejected = false;

    try {
      normalizeSpendRecord_({
        date: testDate,
        platform: "Unknown",
        accountId: "TEST",
        currency: "USD",
        spend: 1
      });
    } catch (error) {
      invalidRejected = true;
    }

    results.push({
      name: "Unsupported platform rejected",
      passed: invalidRejected
    });

    const failures = results.filter(item => !item.passed);

    writeSyncLog_({
      runId,
      startedAt: new Date(),
      finishedAt: new Date(),
      platform: "SYSTEM",
      status: failures.length ? "FAILED" : "SUCCESS",
      records: results.length,
      durationSeconds: 0,
      message: failures.length
        ? failures.map(item => item.name).join(", ")
        : "All data-store tests passed."
    });

    SpreadsheetApp.getUi().alert(
      failures.length
        ? "Data-store test failed"
        : "Data-store test passed",
      results.map(item =>
        (item.passed ? "✅ " : "❌ ") + item.name
      ).join("\n"),
      SpreadsheetApp.getUi().ButtonSet.OK
    );

  } finally {
    removeTestSpendRecord_(key);
  }
}

/**
 * Removes only the temporary row created by the self-test.
 */
function removeTestSpendRecord_(recordKey) {
  const sheet = requireSheet_(MSH.SHEETS.RAW);
  const row = getExistingSpendRowMap_(sheet).get(recordKey);

  if (row) {
    sheet.deleteRow(row);
  }
}
