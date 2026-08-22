/**
 * Marketing Spend Hub — Core Framework
 * Provides menus, configuration access, logging, and health checks.
 */

const MSH = Object.freeze({
  NAME: "Marketing Spend Hub",
  VERSION: "2.2.0",

  SHEETS: Object.freeze({
    DASHBOARD: "Dashboard",
    CONTROL: "Control_Panel",
    ACCOUNTS: "Accounts",
    OAUTH: "OAuth_Config",
    SETTINGS: "Settings",
    RAW: "Spend_Raw",
    DAILY: "Spend_Daily",
    SYNC_LOG: "Sync_Log",
    PLATFORM_LOG: "Platform_Log",
    PAYMENT: "Payment_Monitor",
    ERROR_LOG: "Error_Log"
  }),

  REQUIRED_SHEETS: Object.freeze([
    "Dashboard",
    "Accounts",
    "Spend_Raw",
    "Spend_Daily",
    "Sync_Log",
    "Platform_Log",
    "Error_Log",
    "Payment_Monitor"
  ]),

  PLATFORM_LOG_HEADERS: Object.freeze([
    "Run ID",
    "Started At",
    "Finished At",
    "Platform",
    "Account ID",
    "Status",
    "Records",
    "Duration Seconds",
    "Message"
  ]),

  PLATFORMS: Object.freeze([
    "Meta",
    "TikTok",
    "Google Ads",
    "Apple Search Ads",
    "Moloco"
  ])
});

/**
 * Creates the custom spreadsheet menu whenever the file opens.
 */
function onOpen() {
  if (typeof buildMarketingProjectMenu200_ === "function") {
    buildMarketingProjectMenu200_();
    return;
  }

  SpreadsheetApp.getUi()
    .createMenu("Marketing Hub")
    .addItem("Open project control panel", "openControlPanel")
    .addItem("Run setup / repair", "setupMarketingSpendHub")
    .addToUi();
}

/**
 * Backward-compatible public opener. The project is now operated from HTML.
 */
function openControlPanel() {
  if (typeof openMarketingHubControlPanel !== "function") {
    throw new Error(
      "ProjectControlPanel.gs is missing openMarketingHubControlPanel()."
    );
  }
  return openMarketingHubControlPanel();
}

/**
 * Displays the installed project version.
 */
function showProjectInformation() {
  SpreadsheetApp.getUi().alert(
    MSH.NAME,
    [
      "Version: " + MSH.VERSION,
      "Platforms: " + MSH.PLATFORMS.join(", "),
      "Timezone: " + Session.getScriptTimeZone()
    ].join("\n"),
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * Reads every value from the Settings sheet.
 *
 * @return {Object} Map such as:
 * {
 *   TIMEZONE: "Asia/Ho_Chi_Minh",
 *   MAX_RETRY_ATTEMPTS: 3
 * }
 */
function getSettings_() {
  const sheet = requireSheet_(MSH.SHEETS.SETTINGS);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return {};
  }

  const rows = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  const settings = {};

  rows.forEach(([key, value]) => {
    const normalizedKey = String(key || "").trim();

    if (normalizedKey) {
      settings[normalizedKey] = value;
    }
  });

  return settings;
}

/**
 * Returns a required sheet or stops execution with a clear error.
 */
function requireSheet_(sheetName) {
  const sheet =
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(
      'Required sheet "' + sheetName +
      '" is missing. Run setupMarketingSpendHub first.'
    );
  }

  return sheet;
}

/**
 * Generates one identifier for a synchronization run.
 */
function createRunId_() {
  return Utilities.getUuid();
}

/**
 * Writes connector/account detail to Platform_Log.
 * Sync_Log is reserved for one row per all-platform project run.
 */
function writeSyncLog_(entry) {
  const sheet = getOrCreatePlatformLog_();

  sheet.appendRow([
    entry.runId || "",
    entry.startedAt || "",
    entry.finishedAt || "",
    entry.platform || "",
    entry.accountId || "",
    entry.status || "",
    Number(entry.records || 0),
    Number(entry.durationSeconds || 0),
    sanitizeLogText_(entry.message || "")
  ]);
}

function getOrCreatePlatformLog_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(MSH.SHEETS.PLATFORM_LOG);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(MSH.SHEETS.PLATFORM_LOG);
  }

  const headers = MSH.PLATFORM_LOG_HEADERS;
  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      headers.length - sheet.getMaxColumns()
    );
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers.slice()]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * Writes a technical failure to Error_Log.
 * Tokens and credentials must never be included in details.
 */
function writeErrorLog_(entry) {
  const sheet = requireSheet_(MSH.SHEETS.ERROR_LOG);

  sheet.appendRow([
    new Date(),
    entry.runId || "",
    entry.platform || "",
    entry.accountId || "",
    entry.functionName || "",
    entry.errorCode || "",
    sanitizeLogText_(entry.message || "Unknown error"),
    sanitizeLogText_(entry.details || "")
  ]);
}

/**
 * Removes common authorization values before logging text.
 */
function sanitizeLogText_(value) {
  let text = String(value || "");

  if (
    typeof CREDENTIAL_REGISTRY !== "undefined" &&
    CREDENTIAL_REGISTRY
  ) {
    const properties = PropertiesService.getScriptProperties();
    Object.keys(CREDENTIAL_REGISTRY).forEach(platform => {
      CREDENTIAL_REGISTRY[platform].forEach(item => {
        const secret = String(properties.getProperty(item.key) || "");
        if (secret.length >= 6) {
          text = text.split(secret).join("[REDACTED]");
        }
      });
    });
  }

  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(
      /("(?:access_token|refresh_token|client_secret|api_key|private_key|developer_token)"\s*:\s*")[^"]+"/gi,
      '$1[REDACTED]"'
    )
    .replace(
      /([?&](?:access_token|refresh_token|client_secret|api_key|key)=)[^&#\s]+/gi,
      "$1[REDACTED]"
    )
    .replace(
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
      "[PRIVATE_KEY_REDACTED]"
    )
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      "[JWT_REDACTED]"
    )
    .replace(
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
      "[EMAIL_REDACTED]"
    )
    .replace(/\b\d{9,20}\b/g, "[IDENTIFIER_REDACTED]")
    .replace(
      /(?:\+?\d[\d\s().-]{7,}\d)/g,
      "[PHONE_OR_IDENTIFIER_REDACTED]"
    )
    .replace(
      /("(?:account_name|campaign_name|customer_name|descriptive_name|company|organization_name)"\s*:\s*")[^"]+"/gi,
      '$1[PRIVATE_DATA_REDACTED]"'
    )
    .slice(0, 1000);
}

/**
 * Verifies the workbook foundation.
 */
function runFoundationHealthCheck() {
  const startedAt = new Date();
  const runId = createRunId_();
  const checks = [];

  try {
    MSH.REQUIRED_SHEETS.forEach(sheetName => {
      const exists = Boolean(
        SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName)
      );

      checks.push({
        name: "Sheet: " + sheetName,
        passed: exists
      });
    });

    const settings = getSettings_();

    [
      "PROJECT_VERSION",
      "TIMEZONE",
      "MAX_RETRY_ATTEMPTS",
      "BATCH_SIZE"
    ].forEach(key => {
      checks.push({
        name: "Setting: " + key,
        passed: settings[key] !== undefined && settings[key] !== ""
      });
    });

    MSH.PLATFORMS.forEach(platform => {
      checks.push({
        name: "Platform: " + platform,
        passed: platformExists_(platform)
      });
    });

    const failures = checks.filter(check => !check.passed);
    const finishedAt = new Date();

    writeSyncLog_({
      runId,
      startedAt,
      finishedAt,
      platform: "SYSTEM",
      status: failures.length ? "FAILED" : "SUCCESS",
      records: checks.length,
      durationSeconds: (finishedAt - startedAt) / 1000,
      message: failures.length
        ? "Failed checks: " +
          failures.map(check => check.name).join(", ")
        : "All " + checks.length + " foundation checks passed."
    });

    SpreadsheetApp.getUi().alert(
      failures.length ? "Health check failed" : "Health check passed",
      failures.length
        ? failures.map(check => "❌ " + check.name).join("\n")
        : "✅ All " + checks.length +
          " foundation checks passed.\n\nRun ID:\n" + runId,
      SpreadsheetApp.getUi().ButtonSet.OK
    );

  } catch (error) {
    writeErrorLog_({
      runId,
      platform: "SYSTEM",
      functionName: "runFoundationHealthCheck",
      errorCode: "FOUNDATION_CHECK_FAILED",
      message: error.message,
      details: error.stack || ""
    });

    throw error;
  }
}

/**
 * Checks whether a platform is supported by the production orchestrator.
 */
function platformExists_(platformName) {
  return MSH.PLATFORMS.includes(String(platformName || ""));
}
