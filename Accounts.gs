/**
 * Marketing Spend Hub — Advertising Account Registry
 */

const ACCOUNT_COLUMNS = Object.freeze([
  "Platform",
  "Account ID",
  "Account Name",
  "Currency",
  "Timezone",
  "Enabled",
  "Status"
]);

function createAccountKey_(platform, accountId) {
  return String(platform).trim() + "|" + String(accountId).trim();
}

/**
 * Inserts or updates discovered advertising accounts.
 */
function upsertAccounts_(accounts) {
  if (!Array.isArray(accounts) || accounts.length === 0) {
    return { inserted: 0, updated: 0 };
  }

  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);

  try {
    const sheet = requireSheet_(MSH.SHEETS.ACCOUNTS);
    const existing = getExistingAccountRowMap_(sheet);
    const inserts = [];
    const updates = [];

    accounts.map(normalizeAccount_).forEach(account => {
      const key = createAccountKey_(
        account.platform,
        account.accountId
      );

      const existingRow = existing.get(key);
      const values = accountToRow_(account);

      if (existingRow) {
        /*
         * Preserve the user's current Enabled checkbox when an
         * account is rediscovered.
         */
        values[5] = Boolean(
          sheet.getRange(existingRow, 6).getValue()
        );

        updates.push({
          row: existingRow,
          values
        });
      } else {
        inserts.push(values);
      }
    });

    updates.forEach(update => {
      sheet
        .getRange(update.row, 1, 1, ACCOUNT_COLUMNS.length)
        .setValues([update.values]);
    });

    if (inserts.length) {
      const startRow = sheet.getLastRow() + 1;

      sheet
        .getRange(
          startRow,
          1,
          inserts.length,
          ACCOUNT_COLUMNS.length
        )
        .setValues(inserts);

      sheet
        .getRange(startRow, 6, inserts.length, 1)
        .insertCheckboxes();
    }

    return {
      inserted: inserts.length,
      updated: updates.length
    };

  } finally {
    lock.releaseLock();
  }
}

function normalizeAccount_(account) {
  if (!account || typeof account !== "object") {
    throw new Error("Account must be an object.");
  }

  const platform = String(account.platform || "").trim();
  const accountId = String(account.accountId || "").trim();
  const currency = String(account.currency || "")
    .trim()
    .toUpperCase();

  if (!MSH.PLATFORMS.includes(platform)) {
    throw new Error("Unsupported platform: " + platform);
  }

  if (!accountId) {
    throw new Error("Advertising account ID is required.");
  }

  if (currency && !/^[A-Z]{3}$/.test(currency)) {
    throw new Error(
      "Account currency must be a three-letter code."
    );
  }

  return {
    platform,
    accountId,
    accountName: String(account.accountName || "").trim(),
    currency,
    timezone: String(account.timezone || "").trim(),
    enabled: Boolean(account.enabled),
    status: String(account.status || "Discovered").trim()
  };
}

function accountToRow_(account) {
  return [
    account.platform,
    account.accountId,
    account.accountName,
    account.currency,
    account.timezone,
    account.enabled,
    account.status
  ];
}

function getExistingAccountRowMap_(sheet) {
  const map = new Map();

  if (sheet.getLastRow() < 2) {
    return map;
  }

  const values = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, 2)
    .getDisplayValues();

  values.forEach((row, index) => {
    if (row[0] && row[1]) {
      map.set(createAccountKey_(row[0], row[1]), index + 2);
    }
  });

  return map;
}

/**
 * Returns accounts explicitly enabled by the user.
 */
function getEnabledAccounts_(platform) {
  const sheet = requireSheet_(MSH.SHEETS.ACCOUNTS);

  if (sheet.getLastRow() < 2) {
    return [];
  }

  return sheet
    .getRange(
      2,
      1,
      sheet.getLastRow() - 1,
      ACCOUNT_COLUMNS.length
    )
    .getValues()
    .filter(row =>
      Boolean(row[5]) &&
      (!platform || String(row[0]) === platform)
    )
    .map(row => ({
      platform: String(row[0]),
      accountId: String(row[1]),
      accountName: String(row[2] || ""),
      currency: String(row[3] || ""),
      timezone: String(row[4] || ""),
      enabled: Boolean(row[5]),
      status: String(row[6] || "")
    }));
}

/**
 * Enables or disables a registered account.
 */
function setAccountEnabled_(
  platform,
  accountId,
  enabled
) {
  const sheet = requireSheet_(MSH.SHEETS.ACCOUNTS);
  const key = createAccountKey_(platform, accountId);
  const row = getExistingAccountRowMap_(sheet).get(key);

  if (!row) {
    throw new Error("Account is not registered: " + key);
  }

  sheet.getRange(row, 6).setValue(Boolean(enabled));
}

/**
 * Verifies insert, update, checkbox preservation, and filtering.
 */
function runAccountRegistrySelfTest() {
  const runId = createRunId_();
  const testId = "SELF_TEST_" + runId;
  const results = [];

  try {
    const inserted = upsertAccounts_([{
      platform: "Moloco",
      accountId: testId,
      accountName: "Temporary account",
      currency: "USD",
      timezone: "UTC",
      enabled: false,
      status: "Discovered"
    }]);

    results.push({
      name: "Insert discovered account",
      passed:
        inserted.inserted === 1 &&
        inserted.updated === 0
    });

    setAccountEnabled_("Moloco", testId, true);

    const updated = upsertAccounts_([{
      platform: "Moloco",
      accountId: testId,
      accountName: "Updated temporary account",
      currency: "USD",
      timezone: "UTC",
      enabled: false,
      status: "Active"
    }]);

    results.push({
      name: "Update existing account",
      passed:
        updated.inserted === 0 &&
        updated.updated === 1
    });

    const enabled = getEnabledAccounts_("Moloco");
    const testAccount = enabled.find(
      account => account.accountId === testId
    );

    results.push({
      name: "Preserve Enabled selection",
      passed: Boolean(testAccount)
    });

    results.push({
      name: "Persist updated metadata",
      passed:
        Boolean(testAccount) &&
        testAccount.accountName ===
          "Updated temporary account" &&
        testAccount.status === "Active"
    });

    let invalidRejected = false;

    try {
      normalizeAccount_({
        platform: "Unknown",
        accountId: "TEST"
      });
    } catch (error) {
      invalidRejected = true;
    }

    results.push({
      name: "Reject unsupported platform",
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
        : "All account-registry tests passed."
    });

    SpreadsheetApp.getUi().alert(
      failures.length
        ? "Account-registry test failed"
        : "Account-registry test passed",
      results
        .map(item =>
          (item.passed ? "✅ " : "❌ ") + item.name
        )
        .join("\n"),
      SpreadsheetApp.getUi().ButtonSet.OK
    );

  } finally {
    removeTestAccount_("Moloco", testId);
  }
}

function removeTestAccount_(platform, accountId) {
  const sheet = requireSheet_(MSH.SHEETS.ACCOUNTS);
  const row = getExistingAccountRowMap_(sheet).get(
    createAccountKey_(platform, accountId)
  );

  if (row) {
    sheet.deleteRow(row);
  }
}