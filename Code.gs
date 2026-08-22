/**
 * Marketing Spend Hub — Foundation Setup
 * Creates the required sheets and column structures.
 *
 * Safe to run repeatedly:
 * - Existing sheets are preserved.
 * - Existing data is not deleted.
 * - Missing headers are added only to empty sheets.
 */
function setupMarketingSpendHub() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  const structures = {
    Dashboard: ["Marketing Performance Hub"],

    Control_Panel: [
      "Platform", "Enabled", "Connection Status",
      "Last Sync", "Last Result", "Notes"
    ],

    Accounts: [
      "Platform", "Account ID", "Account Name",
      "Currency", "Timezone", "Enabled", "Status"
    ],

    OAuth_Config: [
      "Platform", "Setting", "Value", "Description"
    ],

    Settings: [
      "Setting", "Value", "Description"
    ],

    Spend_Raw: [
      "Date", "Platform", "Account ID", "Account Name",
      "Campaign ID", "Campaign Name", "Currency",
      "Spend", "Imported At", "Record Key", "Impressions",
      "Clicks", "Conversions", "App Installs"
    ],

    Spend_Daily: [
      "Date", "Platform", "Account ID", "Account Name",
      "Currency", "Spend", "Updated At", "Impressions",
      "Clicks", "Conversions", "App Installs", "CTR", "CPC",
      "CPM", "CPA", "CVR", "CPI"
    ],

    Sync_Log: [
      "Started At", "Finished At", "Run ID", "Source", "Status",
      "Active Platforms", "Successful Platforms", "Failed Platforms",
      "Inserted", "Updated", "Outputs Rebuilt", "Duration Seconds",
      "Failed Platform Names", "Safe Summary"
    ],

    Platform_Log: [
      "Run ID", "Started At", "Finished At", "Platform",
      "Account ID", "Status", "Records", "Duration Seconds", "Message"
    ],

    Error_Log: [
      "Timestamp", "Run ID", "Platform", "Account ID",
      "Function", "Error Code", "Error Message", "Details"
    ],

    Payment_Monitor: [
      "Platform", "Account ID", "Account Name", "Currency", "Enabled",
      "Payment Threshold", "Billing Cycle Start", "Manual Current Amount",
      "Spend Since Cycle Start", "Current Amount Used", "Remaining",
      "Percent Used", "Warning At %", "Status", "Data Source", "Last Checked"
    ]
  };

  Object.entries(structures).forEach(([sheetName, headers]) => {
    let sheet = spreadsheet.getSheetByName(sheetName);

    if (!sheet) {
      sheet = spreadsheet.insertSheet(sheetName);
    }

    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

      sheet
        .getRange(1, 1, 1, headers.length)
        .setFontWeight("bold")
        .setBackground("#1F4E78")
        .setFontColor("#FFFFFF");

      sheet.setFrozenRows(1);
      sheet.autoResizeColumns(1, headers.length);
    }
  });

  initializeSettings_(spreadsheet);
  initializePlatforms_(spreadsheet);

  if (typeof initializeCredentialRegistry === "function") {
    initializeCredentialRegistry();
  }
  if (typeof refreshMarketingPaymentMonitor201_ === "function") {
    refreshMarketingPaymentMonitor201_();
  }
  if (typeof refreshDashboard === "function") {
    refreshDashboard({ showUi: false, forceLayout: true });
  }

  SpreadsheetApp.flush();
  spreadsheet.toast(
    "Five-platform foundation created successfully.",
    "Marketing Spend Hub",
    8
  );
}

/**
 * Adds default system settings.
 * Existing settings are not replaced.
 */
function initializeSettings_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName("Settings");

  const defaults = [
    ["PROJECT_VERSION", "2.2.0", "Current project version"],
    ["TIMEZONE", Session.getScriptTimeZone(), "Reporting timezone"],
    ["DEFAULT_LOOKBACK_DAYS", 3, "Completed days fetched during normal synchronization"],
    ["MAX_RETRY_ATTEMPTS", 3, "Maximum API retry attempts"],
    ["RETRY_DELAY_MS", 2000, "Initial delay between retries"],
    ["BATCH_SIZE", 100, "Rows written to Sheets per batch"],
    ["LOG_RETENTION_DAYS", 90, "Number of days to retain operational logs"]
  ];

  const existingKeys = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1)
        .getValues()
        .flat()
        .map(String)
    : [];

  const missingRows = defaults.filter(row => !existingKeys.includes(row[0]));

  if (missingRows.length) {
    sheet
      .getRange(sheet.getLastRow() + 1, 1, missingRows.length, 3)
      .setValues(missingRows);
  }
}

/**
 * Registers the five initial advertising platforms.
 * API credentials will be configured in a later step.
 */
function initializePlatforms_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName("Control_Panel");

  const platforms = [
    ["Meta", false, "Not configured", "", "", ""],
    ["TikTok", false, "Not configured", "", "", ""],
    ["Google Ads", false, "Not configured", "", "", ""],
    ["Apple Search Ads", false, "Not configured", "", "", ""],
    ["Moloco", false, "Not configured", "", "", ""]
  ];

  const existingPlatforms = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1)
        .getValues()
        .flat()
        .map(String)
    : [];

  const missingRows = platforms.filter(
    row => !existingPlatforms.includes(row[0])
  );

  if (missingRows.length) {
    sheet
      .getRange(sheet.getLastRow() + 1, 1, missingRows.length, 6)
      .setValues(missingRows);
  }

  const platformCount = Math.max(sheet.getLastRow() - 1, 1);

  sheet
    .getRange(2, 2, platformCount, 1)
    .insertCheckboxes();
}
