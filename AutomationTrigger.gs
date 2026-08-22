/**
 * Marketing Performance Hub
 * Step 18B — Automatic trigger, health state, and sanitized run log.
 *
 * Required existing function:
 *   syncAllPlatformsRecentPerformance()
 *
 * Optional Script Properties:
 *   MASTER_SYNC_HOUR = 0..23 (default: 7, in the Apps Script timezone)
 *   MASTER_SYNC_LOG_RETENTION_DAYS = positive integer (default: 90)
 *
 * This file does not refresh platform credentials. Meta token lifecycle is
 * handled separately in Step 18C.
 */

var MASTER_AUTOMATION_181 = Object.freeze({
  STEP: "18B",
  HANDLER: "runScheduledMarketingPerformanceSync",
  LOG_SHEET: "Sync_Log",
  LEGACY_LOG_PREFIX: "Sync_Log_Legacy_",
  DEFAULT_HOUR: 7,
  DEFAULT_RETENTION_DAYS: 90,
  LOCK_TIMEOUT_MS: 1000,
  LOG_HEADERS: Object.freeze([
    "Started At",
    "Finished At",
    "Run ID",
    "Source",
    "Status",
    "Active Platforms",
    "Successful Platforms",
    "Failed Platforms",
    "Inserted",
    "Updated",
    "Outputs Rebuilt",
    "Duration Seconds",
    "Failed Platform Names",
    "Safe Summary"
  ])
});


/**
 * Safe Step 18B validation. It creates/verifies Sync_Log and health properties
 * but does not run connectors and does not install a time-driven trigger.
 */
function step181TestAutomationInfrastructure() {
  assertAutomationDependencies181_();

  var startedAt = new Date();
  var testResult = {
    status: "SUCCESS",
    step: MASTER_AUTOMATION_181.STEP,
    runId: Utilities.getUuid(),
    source: "INFRASTRUCTURE_TEST",
    activePlatforms: 0,
    successfulPlatforms: 0,
    failedPlatforms: 0,
    inserted: 0,
    updated: 0,
    outputsRebuilt: false,
    durationSeconds: 0,
    platforms: [],
    secretsExposed: false
  };

  var logSheet = ensureAutomationLogSheet181_();
  var triggerState = getMarketingPerformanceTriggerStatus181_();
  var finishedAt = new Date();

  testResult.durationSeconds =
    roundAutomationSeconds181_(finishedAt - startedAt);

  appendAutomationLog181_(
    testResult,
    "INFRASTRUCTURE_TEST",
    startedAt,
    finishedAt,
    "Infrastructure verified; no connector sync was run."
  );

  var result = {
    status: "SUCCESS",
    step: MASTER_AUTOMATION_181.STEP,
    logSheet: logSheet.getName(),
    logHeadersValid: true,
    triggerInstalled: triggerState.installed,
    triggerCount: triggerState.count,
    handler: MASTER_AUTOMATION_181.HANDLER,
    timezone: Session.getScriptTimeZone(),
    configuredHour: getAutomationHour181_(),
    syncExecuted: false,
    secretsExposed: false
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}


/**
 * Trigger handler. Do not rename without reinstalling the trigger.
 */
function runScheduledMarketingPerformanceSync() {
  return runLoggedMarketingPerformanceSync181_("TIME_TRIGGER");
}


/**
 * Manual production test with the same wrapper used by the trigger.
 * This performs a real all-platform sync.
 */
function step181RunLoggedSyncNow() {
  return runLoggedMarketingPerformanceSync181_("MANUAL_TEST");
}


/**
 * Logged custom-range sync used by the project Control Panel.
 * Dates are validated again by MasterOrchestrator before any connector runs.
 */
function step181RunLoggedSyncRange(startDate, endDate) {
  return runLoggedMarketingPerformanceSync181_(
    "CONTROL_PANEL_RANGE",
    {
      startDate: String(startDate || "").trim(),
      endDate: String(endDate || "").trim()
    }
  );
}


/**
 * Installs one daily trigger and removes duplicate triggers for the same
 * handler. Run only after all required platform credentials are healthy.
 */
function step181InstallDailyTrigger() {
  assertAutomationDependencies181_();

  var hour = getAutomationHour181_();
  var timezone = Session.getScriptTimeZone();
  var removed = deleteAutomationTriggers181_();

  var trigger = ScriptApp.newTrigger(
    MASTER_AUTOMATION_181.HANDLER
  )
    .timeBased()
    .atHour(hour)
    .everyDays(1)
    .inTimezone(timezone)
    .create();

  var properties = PropertiesService.getScriptProperties();
  properties.setProperties({
    "_MASTER_TRIGGER_ID": String(trigger.getUniqueId()),
    "_MASTER_TRIGGER_INSTALLED_AT": new Date().toISOString(),
    "_MASTER_TRIGGER_TIMEZONE": timezone,
    "_MASTER_TRIGGER_HOUR": String(hour)
  });

  var result = {
    status: "SUCCESS",
    step: MASTER_AUTOMATION_181.STEP,
    installed: true,
    removedExistingTriggers: removed,
    handler: MASTER_AUTOMATION_181.HANDLER,
    hour: hour,
    timezone: timezone,
    note:
      "Apps Script time triggers run within the selected hourly window.",
    secretsExposed: false
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}


/**
 * Removes every project trigger that targets the production handler.
 */
function step181RemoveDailyTrigger() {
  var removed = deleteAutomationTriggers181_();
  var properties = PropertiesService.getScriptProperties();

  properties.deleteProperty("_MASTER_TRIGGER_ID");
  properties.deleteProperty("_MASTER_TRIGGER_INSTALLED_AT");
  properties.deleteProperty("_MASTER_TRIGGER_TIMEZONE");
  properties.deleteProperty("_MASTER_TRIGGER_HOUR");

  var result = {
    status: "SUCCESS",
    step: MASTER_AUTOMATION_181.STEP,
    installed: false,
    removedTriggers: removed,
    handler: MASTER_AUTOMATION_181.HANDLER,
    secretsExposed: false
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}


/**
 * Returns trigger and health state without exposing credentials.
 */
function step181GetAutomationStatus() {
  var triggerState = getMarketingPerformanceTriggerStatus181_();
  var properties = PropertiesService.getScriptProperties();

  var result = {
    status: "SUCCESS",
    step: MASTER_AUTOMATION_181.STEP,
    triggerInstalled: triggerState.installed,
    triggerCount: triggerState.count,
    handler: MASTER_AUTOMATION_181.HANDLER,
    timezone: Session.getScriptTimeZone(),
    configuredHour: getAutomationHour181_(),
    lastRunAt: properties.getProperty("_MASTER_LAST_RUN_AT") || null,
    lastRunStatus:
      properties.getProperty("_MASTER_LAST_RUN_STATUS") || null,
    lastSuccessAt:
      properties.getProperty("_MASTER_LAST_SUCCESS_AT") || null,
    consecutiveNonSuccessRuns: Number(
      properties.getProperty(
        "_MASTER_CONSECUTIVE_NON_SUCCESS_RUNS"
      ) || 0
    ),
    secretsExposed: false
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}


function runLoggedMarketingPerformanceSync181_(source, options) {
  assertAutomationDependencies181_();

  var startedAt = new Date();
  var result;
  var config = options || {};

  /*
   * MasterOrchestrator.gs owns the one project-wide ScriptLock. Keeping a
   * second ScriptLock here would make the wrapper block its own nested call.
  */
  try {
    result = config.startDate || config.endDate
      ? syncAllPlatformsPerformanceRange(
          config.startDate,
          config.endDate
        )
      : syncAllPlatformsRecentPerformance();
  } catch (error) {
    result = {
      status: "FAILED",
      step: MASTER_AUTOMATION_181.STEP,
      runId: Utilities.getUuid(),
      activePlatforms: 0,
      successfulPlatforms: 0,
      failedPlatforms: 1,
      inserted: 0,
      updated: 0,
      outputsRebuilt: false,
      durationSeconds:
        roundAutomationSeconds181_(new Date() - startedAt),
      platforms: [],
      safeError: sanitizeAutomationText181_(
        error && error.message
          ? error.message
          : String(error || "Unknown error")
      ),
      secretsExposed: false
    };
  }

  var finishedAt = new Date();
  var normalized = normalizeAutomationResult181_(
    result,
    source,
    startedAt,
    finishedAt,
    config
  );

  appendAutomationLog181_(
    normalized,
    source,
    startedAt,
    finishedAt
  );
  updateAutomationHealth181_(normalized, finishedAt);
  pruneAutomationLog181_();

  console.log(JSON.stringify(normalized, null, 2));
  return normalized;
}


function normalizeAutomationResult181_(
  result,
  source,
  startedAt,
  finishedAt,
  options
) {
  var value = result || {};
  var config = options || {};

  return {
    status: String(value.status || "FAILED").toUpperCase(),
    step: MASTER_AUTOMATION_181.STEP,
    orchestratorStep: value.step || null,
    runId: value.runId || Utilities.getUuid(),
    runLabel: value.runLabel || null,
    source: source,
    startDate: value.startDate || config.startDate || null,
    endDate: value.endDate || config.endDate || null,
    activePlatforms: Number(value.activePlatforms || 0),
    successfulPlatforms: Number(
      value.successfulPlatforms || 0
    ),
    failedPlatforms: Number(value.failedPlatforms || 0),
    skippedPlatforms: Number(value.skippedPlatforms || 0),
    inserted: Number(value.inserted || 0),
    updated: Number(value.updated || 0),
    outputsRebuilt: Boolean(value.outputsRebuilt),
    outputError: value.outputError
      ? sanitizeAutomationText181_(value.outputError)
      : null,
    durationSeconds:
      value.durationSeconds !== undefined
        ? Number(value.durationSeconds || 0)
        : roundAutomationSeconds181_(finishedAt - startedAt),
    platforms: sanitizeAutomationPlatforms181_(
      value.platforms
    ),
    safeError: value.safeError
      ? sanitizeAutomationText181_(value.safeError)
      : null,
    secretsExposed: false
  };
}


function ensureAutomationLogSheet181_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  if (!spreadsheet) {
    throw new Error(
      "No active spreadsheet is available for Sync_Log."
    );
  }

  var sheet = spreadsheet.getSheetByName(
    MASTER_AUTOMATION_181.LOG_SHEET
  );

  if (!sheet) {
    sheet = spreadsheet.insertSheet(
      MASTER_AUTOMATION_181.LOG_SHEET
    );
  }

  var headers = MASTER_AUTOMATION_181.LOG_HEADERS;
  var hasExistingContent = sheet.getLastRow() > 0;
  var headersMatch = false;

  if (sheet.getMaxColumns() >= headers.length) {
    var currentHeaders = sheet
      .getRange(1, 1, 1, headers.length)
      .getDisplayValues()[0]
      .map(function (value) {
        return String(value || "").trim();
      });

    headersMatch =
      currentHeaders.join("|") === headers.join("|");
  }

  /*
   * Preserve a pre-Step-18B Sync_Log instead of overwriting it or asking the
   * operator to rename it manually. The archived tab remains in the same
   * spreadsheet and a fresh Step 18B log is created under the canonical name.
   */
  if (hasExistingContent && !headersMatch) {
    var legacyName =
      buildAutomationLegacyLogName181_(spreadsheet);

    sheet.setName(legacyName);
    sheet = spreadsheet.insertSheet(
      MASTER_AUTOMATION_181.LOG_SHEET
    );
  }

  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      headers.length - sheet.getMaxColumns()
    );
  }

  sheet.getRange(1, 1, 1, headers.length).setValues([
    headers.slice()
  ]);
  sheet.setFrozenRows(1);

  return sheet;
}


function buildAutomationLegacyLogName181_(spreadsheet) {
  var timezone = Session.getScriptTimeZone() || "UTC";
  var timestamp = Utilities.formatDate(
    new Date(),
    timezone,
    "yyyyMMdd_HHmmss"
  );
  var baseName =
    MASTER_AUTOMATION_181.LEGACY_LOG_PREFIX + timestamp;
  var candidate = baseName;
  var suffix = 2;

  while (spreadsheet.getSheetByName(candidate)) {
    candidate = baseName + "_" + suffix;
    suffix += 1;
  }

  return candidate;
}


function appendAutomationLog181_(
  result,
  source,
  startedAt,
  finishedAt,
  overrideSummary
) {
  var sheet = ensureAutomationLogSheet181_();
  var failedNames = getFailedPlatformNames181_(
    result.platforms
  );
  var safeSummary =
    overrideSummary ||
    buildAutomationSafeSummary181_(result);

  sheet.appendRow([
    startedAt,
    finishedAt,
    String(result.runId || ""),
    String(source || ""),
    String(result.status || ""),
    Number(result.activePlatforms || 0),
    Number(result.successfulPlatforms || 0),
    Number(result.failedPlatforms || 0),
    Number(result.inserted || 0),
    Number(result.updated || 0),
    Boolean(result.outputsRebuilt),
    Number(result.durationSeconds || 0),
    failedNames.join(", "),
    sanitizeAutomationText181_(safeSummary)
  ]);
}


function buildAutomationSafeSummary181_(result) {
  var parts = [
    "Status=" + String(result.status || "UNKNOWN"),
    "Successful=" +
      Number(result.successfulPlatforms || 0) +
      "/" +
      Number(result.activePlatforms || 0),
    "Failed=" + Number(result.failedPlatforms || 0),
    "OutputsRebuilt=" + Boolean(result.outputsRebuilt)
  ];

  if (result.startDate && result.endDate) {
    parts.push(
      "Range=" + result.startDate + ".." + result.endDate
    );
  }

  if (result.outputError) {
    parts.push("OutputError=" + result.outputError);
  }

  if (result.safeError) {
    parts.push("Error=" + result.safeError);
  }

  return parts.join("; ");
}


function sanitizeAutomationPlatforms181_(platforms) {
  if (!Array.isArray(platforms)) {
    return [];
  }

  return platforms.map(function (item) {
    var value = item || {};

    return {
      platform: String(value.platform || ""),
      status: String(value.status || ""),
      enabledAccounts: Number(value.enabledAccounts || 0),
      successfulAccounts: Number(
        value.successfulAccounts || 0
      ),
      failedAccounts: Number(value.failedAccounts || 0),
      inserted: Number(value.inserted || 0),
      updated: Number(value.updated || 0),
      durationSeconds: Number(value.durationSeconds || 0),
      error: value.error
        ? sanitizeAutomationText181_(
            value.error.message || String(value.error)
          )
        : null
    };
  });
}


function getFailedPlatformNames181_(platforms) {
  if (!Array.isArray(platforms)) {
    return [];
  }

  return platforms
    .filter(function (item) {
      var status = String(
        item && item.status ? item.status : ""
      ).toUpperCase();

      return status !== "SUCCESS" && status !== "SKIPPED";
    })
    .map(function (item) {
      return String(item.platform || "Unknown");
    });
}


function updateAutomationHealth181_(result, finishedAt) {
  var properties = PropertiesService.getScriptProperties();
  var previousCount = Number(
    properties.getProperty(
      "_MASTER_CONSECUTIVE_NON_SUCCESS_RUNS"
    ) || 0
  );
  var isSuccess =
    String(result.status || "").toUpperCase() === "SUCCESS";
  var updates = {
    "_MASTER_LAST_RUN_AT": finishedAt.toISOString(),
    "_MASTER_LAST_RUN_STATUS": String(
      result.status || "UNKNOWN"
    ),
    "_MASTER_LAST_RUN_ID": String(result.runId || ""),
    "_MASTER_CONSECUTIVE_NON_SUCCESS_RUNS": String(
      isSuccess ? 0 : previousCount + 1
    )
  };

  if (isSuccess) {
    updates["_MASTER_LAST_SUCCESS_AT"] =
      finishedAt.toISOString();
  }

  properties.setProperties(updates);
}


function pruneAutomationLog181_() {
  var sheet = ensureAutomationLogSheet181_();

  if (sheet.getLastRow() < 2) {
    return;
  }

  var retentionDays = getAutomationRetentionDays181_();
  var cutoff = new Date(
    Date.now() - retentionDays * 24 * 60 * 60 * 1000
  );
  var timestamps = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, 1)
    .getValues();
  var rowsToDelete = 0;

  for (var index = 0; index < timestamps.length; index += 1) {
    var value = timestamps[index][0];
    var date = value instanceof Date
      ? value
      : new Date(value);

    if (
      !isNaN(date.getTime()) &&
      date.getTime() < cutoff.getTime()
    ) {
      rowsToDelete += 1;
    } else {
      break;
    }
  }

  if (rowsToDelete > 0) {
    sheet.deleteRows(2, rowsToDelete);
  }
}


function getAutomationHour181_() {
  var raw = PropertiesService.getScriptProperties()
    .getProperty("MASTER_SYNC_HOUR");

  if (raw === null || String(raw).trim() === "") {
    return MASTER_AUTOMATION_181.DEFAULT_HOUR;
  }

  var hour = Number(raw);

  if (
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23
  ) {
    throw new Error(
      "MASTER_SYNC_HOUR must be an integer from 0 to 23."
    );
  }

  return hour;
}


function getAutomationRetentionDays181_() {
  var raw = PropertiesService.getScriptProperties()
    .getProperty("MASTER_SYNC_LOG_RETENTION_DAYS");

  if (raw === null || String(raw).trim() === "") {
    return MASTER_AUTOMATION_181.DEFAULT_RETENTION_DAYS;
  }

  var days = Number(raw);

  if (!Number.isInteger(days) || days < 1) {
    throw new Error(
      "MASTER_SYNC_LOG_RETENTION_DAYS must be a positive integer."
    );
  }

  return days;
}


function deleteAutomationTriggers181_() {
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;

  triggers.forEach(function (trigger) {
    if (
      trigger.getHandlerFunction() ===
      MASTER_AUTOMATION_181.HANDLER
    ) {
      ScriptApp.deleteTrigger(trigger);
      removed += 1;
    }
  });

  return removed;
}


function getMarketingPerformanceTriggerStatus181_() {
  var count = ScriptApp.getProjectTriggers()
    .filter(function (trigger) {
      return (
        trigger.getHandlerFunction() ===
        MASTER_AUTOMATION_181.HANDLER
      );
    })
    .length;

  return {
    installed: count > 0,
    count: count
  };
}


function sanitizeAutomationText181_(value) {
  return String(value || "")
    .replace(
      /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
      "Bearer [REDACTED]"
    )
    .replace(
      /(access_token|refresh_token|client_secret|app_secret|private_key|developer-token)(["'=:\s]+)[^,\s"}]+/gi,
      "$1$2[REDACTED]"
    )
    .slice(0, 1000);
}


function roundAutomationSeconds181_(milliseconds) {
  return Math.round(Number(milliseconds || 0) / 100) / 10;
}


function assertAutomationDependencies181_() {
  if (
    typeof syncAllPlatformsRecentPerformance !== "function"
  ) {
    throw new Error(
      "Step 18B requires syncAllPlatformsRecentPerformance() " +
      "from MasterOrchestrator.gs."
    );
  }

  if (
    typeof syncAllPlatformsPerformanceRange !== "function"
  ) {
    throw new Error(
      "Step 18B requires syncAllPlatformsPerformanceRange() " +
      "from MasterOrchestrator.gs."
    );
  }
}
