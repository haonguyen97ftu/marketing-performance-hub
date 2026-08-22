/**
 * Marketing Performance Hub
 * Step 20A — whole-project sidebar operations console.
 *
 * This is intentionally an orchestration/UI layer. It never returns Script
 * Property values and never calls connector internals directly. Production
 * sync remains owned by Step 18B, Dashboard rendering by Step 19E, and QA by
 * Steps 19A–19D.
 */

var PROJECT_CONTROL_200 = Object.freeze({
  STEP: "21",
  SIDEBAR_FILE: "ProjectControlPanel",
  SIDEBAR_TITLE: "Marketing Spend Hub",
  OPEN_HANDLER: "marketingProjectControlOnOpen200",
  MAX_LOG_ROWS: 25,
  MAX_SYNC_RANGE_DAYS: 31,
  STALE_SYNC_MINUTES: 30,
  SYNC_JOB_HANDLER: "runMarketingProjectBackgroundSync200",
  PLATFORM_ORDER: Object.freeze([
    "TikTok",
    "Meta",
    "Moloco",
    "Google Ads",
    "Apple Search Ads"
  ]),
  SHEET_LINKS: Object.freeze([
    "Dashboard",
    "Accounts",
    "Spend_Raw",
    "Spend_Daily",
    "Sync_Log",
    "Platform_Log",
    "Error_Log",
    "Data_Quality",
    "Dashboard_QA",
    "Dashboard_Filter_QA",
    "Settings",
    "OAuth_Config"
    ,"Payment_Monitor"
  ]),
  CREDENTIAL_GROUPS: Object.freeze([
    Object.freeze({
      platform: "TikTok",
      required: Object.freeze([
        "TIKTOK_ACCESS_TOKEN",
        "TIKTOK_APP_ID",
        "TIKTOK_APP_SECRET"
      ])
    }),
    Object.freeze({
      platform: "Meta",
      required: Object.freeze([
        "META_ACCESS_TOKEN",
        "META_APP_ID",
        "META_APP_SECRET"
      ])
    }),
    Object.freeze({
      platform: "Moloco",
      required: Object.freeze(["MOLOCO_API_KEY"])
    }),
    Object.freeze({
      platform: "Google Ads",
      required: Object.freeze([
        "GOOGLE_ADS_DEVELOPER_TOKEN",
        "GOOGLE_ADS_CLIENT_ID",
        "GOOGLE_ADS_CLIENT_SECRET",
        "GOOGLE_ADS_REFRESH_TOKEN"
      ])
    }),
    Object.freeze({
      platform: "Apple Search Ads",
      required: Object.freeze([
        "APPLE_ADS_CLIENT_ID",
        "APPLE_ADS_TEAM_ID",
        "APPLE_ADS_KEY_ID",
        "APPLE_ADS_PRIVATE_KEY"
      ])
    })
  ])
});

/** One-time setup. Safe to rerun. */
function step200SetupProjectControlPanel() {
  assertProjectControlDependencies200_();
  var triggerCleanup = cleanupMarketingProjectOpenTriggers200_();
  openMarketingHubControlPanel();
  var result = {
    status: "SUCCESS",
    step: PROJECT_CONTROL_200.STEP,
    scope: "WHOLE_PROJECT",
    modules: 7,
    platformCount: PROJECT_CONTROL_200.PLATFORM_ORDER.length,
    openMethod: "SIMPLE_ON_OPEN_MENU",
    openFunction: "openMarketingHubControlPanel",
    legacyOpenTriggersRemoved: triggerCleanup.removed,
    secretsExposed: false
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

/** Health test without running connectors or changing source data. */
function step200TestProjectControlPanel() {
  assertProjectControlDependencies200_();
  var overview = getMarketingProjectOverview200();
  var dashboard = getMarketingProjectDashboard200();
  var errors = [];
  if (overview.platforms.length !== 5) {
    errors.push("Expected five platform status rows.");
  }
  if (!dashboard || dashboard.status !== "SUCCESS") {
    errors.push("Dashboard control module is not available.");
  }
  if (overview.secretsExposed !== false) {
    errors.push("Overview safety flag is invalid.");
  }
  var result = {
    status: errors.length ? "FAILED" : "SUCCESS",
    step: PROJECT_CONTROL_200.STEP,
    scope: "WHOLE_PROJECT",
    errors: errors.length,
    errorMessages: errors,
    modules: 7,
    platformCount: overview.platforms.length,
    accountCount: overview.summary.totalAccounts,
    triggerInstalled: overview.automation.triggerInstalled,
    dashboardFilters: 6,
    openFunctionAvailable:
      typeof openMarketingHubControlPanel === "function",
    secretsExposed: false
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

/** Public function shown in the Apps Script function picker. */
function openMarketingHubControlPanel() {
  var html = HtmlService
    .createHtmlOutputFromFile(PROJECT_CONTROL_200.SIDEBAR_FILE)
    .setTitle(PROJECT_CONTROL_200.SIDEBAR_TITLE);
  SpreadsheetApp.getUi().showSidebar(html);
  return {
    status: "SUCCESS",
    opened: true,
    htmlFile: PROJECT_CONTROL_200.SIDEBAR_FILE,
    secretsExposed: false
  };
}

/** Backward-compatible name used by earlier menu versions. */
function showMarketingProjectControlPanel200() {
  return openMarketingHubControlPanel();
}

function buildMarketingProjectMenu200_() {
  SpreadsheetApp.getUi()
    .createMenu("Marketing Hub")
    .addItem("Open project control panel", "openMarketingHubControlPanel")
    .addItem("Sync all platforms now", "runMarketingProjectSyncFromMenu200")
    .addItem("Refresh dashboard", "refreshMarketingProjectDashboard200")
    .addSeparator()
    .addItem("Preview workbook cleanup", "step210PreviewProjectCleanup")
    .addItem("Clean up workbook tabs", "step210CleanupProjectWorkbook")
    .addSeparator()
    .addItem("Run data quality audit", "step190RunDataQualityAudit")
    .addToUi();
}

/** Owns the whole-project menu/open lifecycle; Dashboard is only one module. */
function marketingProjectControlOnOpen200() {
  buildMarketingProjectMenu200_();
}

/**
 * Stable Dashboard endpoints owned by the project panel.
 * They use the Step 19E sidebar API when present and fall back to the already
 * validated Step 19C interactive Dashboard engine when the project still has
 * the earlier Dashboard.gs version.
 */
function getMarketingProjectDashboard200() {
  if (typeof getMarketingDashboardSidebarModel194 === "function") {
    return getMarketingDashboardSidebarModel194();
  }
  return getLegacyMarketingProjectDashboard200_();
}

function applyMarketingProjectDashboard200(payload) {
  if (typeof applyMarketingDashboardSidebarFilters194 === "function") {
    return applyMarketingDashboardSidebarFilters194(payload);
  }
  return applyLegacyMarketingProjectDashboard200_(payload || {});
}

function resetMarketingProjectDashboard200() {
  if (typeof resetMarketingDashboardSidebarFilters194 === "function") {
    return resetMarketingDashboardSidebarFilters194();
  }
  var state = getLegacyMarketingProjectDashboardState200_();
  return applyLegacyMarketingProjectDashboard200_({
    startDate: state.defaultStart,
    endDate: state.context.maxDate || state.defaultEnd,
    platform: state.allPlatforms,
    account: state.allAccounts,
    currency: state.context.defaultCurrency,
    metric: "Spend"
  });
}

function refreshMarketingProjectDashboard200() {
  var model = getMarketingProjectDashboard200();
  return applyMarketingProjectDashboard200(model.selected);
}

function getLegacyMarketingProjectDashboard200_() {
  var state = getLegacyMarketingProjectDashboardState200_();
  return buildLegacyMarketingProjectDashboardModel200_(
    state,
    state.filters,
    null,
    0
  );
}

function applyLegacyMarketingProjectDashboard200_(payload) {
  var startedAt = new Date();
  var lock = LockService.getDocumentLock();
  lock.waitLock(5000);
  try {
    var state = getLegacyMarketingProjectDashboardState200_();
    var input = payload && typeof payload === "object" ? payload : {};
    state.dashboard.getRange("B3").setValue(String(input.startDate || ""));
    state.dashboard.getRange("D3").setValue(String(input.endDate || ""));
    state.dashboard.getRange("F3").setValue(String(input.platform || ""));
    state.dashboard.getRange("H3").setValue(String(input.account || ""));
    state.dashboard.getRange("J3").setValue(String(input.currency || ""));
    state.dashboard.getRange("L3").setValue(String(input.metric || ""));

    var filters = normalizeMarketingDashboardFilters192_(
      state.dashboard,
      state.context,
      true
    );
    var renderResult = renderMarketingDashboard192_(
      state.dashboard,
      state.helper,
      state.context,
      filters
    );
    SpreadsheetApp.flush();
    return buildLegacyMarketingProjectDashboardModel200_(
      state,
      filters,
      renderResult,
      Math.round((new Date().getTime() - startedAt.getTime()) / 10) / 100
    );
  } finally {
    lock.releaseLock();
  }
}

function getLegacyMarketingProjectDashboardState200_() {
  var missing = [];
  [
    ["buildMarketingDashboardContext192_", typeof buildMarketingDashboardContext192_],
    ["normalizeMarketingDashboardFilters192_", typeof normalizeMarketingDashboardFilters192_],
    ["renderMarketingDashboard192_", typeof renderMarketingDashboard192_],
    ["getOrCreateDashboardHelper192_", typeof getOrCreateDashboardHelper192_]
  ].forEach(function(item) {
    if (item[1] !== "function") {
      missing.push(item[0]);
    }
  });
  if (missing.length) {
    throw new Error(
      "Dashboard.gs is too old for Project Control Panel: " +
      missing.join(", ") + ". Replace Dashboard.gs with Step 19E."
    );
  }

  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var daily = requireSheet_(projectSheetName200_("DAILY", "Spend_Daily"));
  if (typeof ensureDailyPerformanceSchema_ === "function") {
    ensureDailyPerformanceSchema_(daily);
  }
  var context = buildMarketingDashboardContext192_(daily);
  var dashboard = requireSheet_(projectSheetName200_("DASHBOARD", "Dashboard"));
  var helper = getOrCreateDashboardHelper192_(spreadsheet);
  var filters = normalizeMarketingDashboardFilters192_(
    dashboard,
    context,
    true
  );
  var allPlatforms = typeof MARKETING_DASHBOARD_192 !== "undefined" &&
      MARKETING_DASHBOARD_192.ALL_PLATFORMS
    ? MARKETING_DASHBOARD_192.ALL_PLATFORMS
    : "All Platforms";
  var allAccounts = typeof MARKETING_DASHBOARD_192 !== "undefined" &&
      MARKETING_DASHBOARD_192.ALL_ACCOUNTS
    ? MARKETING_DASHBOARD_192.ALL_ACCOUNTS
    : "All Accounts";
  var defaultStart = context.minDate || projectIsoDate200_(new Date());
  if (typeof defaultDashboardStartDate192_ === "function") {
    defaultStart = projectIsoDate200_(defaultDashboardStartDate192_(context));
  }
  return {
    spreadsheet: spreadsheet,
    daily: daily,
    dashboard: dashboard,
    helper: helper,
    context: context,
    filters: filters,
    allPlatforms: allPlatforms,
    allAccounts: allAccounts,
    defaultStart: defaultStart,
    defaultEnd: context.maxDate || projectIsoDate200_(new Date())
  };
}

function buildLegacyMarketingProjectDashboardModel200_(
  state,
  filters,
  renderResult,
  durationSeconds
) {
  var metrics = typeof MARKETING_DASHBOARD_192 !== "undefined" &&
      MARKETING_DASHBOARD_192.METRICS
    ? Array.prototype.slice.call(MARKETING_DASHBOARD_192.METRICS)
    : ["Spend", "Impressions", "Clicks", "Conversions", "App Installs",
      "CTR", "CPC", "CPM", "CPA", "CVR", "CPI"];
  var matchedRows = renderResult && renderResult.matchedRows !== undefined
    ? Number(renderResult.matchedRows)
    : state.context.rows.filter(function(row) {
        return row.date >= filters.start &&
          row.date <= filters.end &&
          (filters.platform === state.allPlatforms ||
            row.platform === filters.platform) &&
          (filters.account === state.allAccounts ||
            row.accountLabel === filters.account) &&
          row.currency === filters.currency;
      }).length;
  return {
    status: "SUCCESS",
    step: "20A-COMPAT",
    minDate: state.context.minDate,
    maxDate: state.context.maxDate,
    platforms: [state.allPlatforms].concat(state.context.platforms.slice()),
    accounts: [{
      label: state.allAccounts,
      platform: state.allPlatforms,
      currency: ""
    }].concat(state.context.accounts.map(function(item) {
      return {
        label: item.label,
        platform: item.platform,
        currency: item.currency
      };
    })),
    currencies: state.context.currencies.length
      ? state.context.currencies.slice()
      : ["No currency"],
    metrics: metrics,
    selected: {
      startDate: filters.start,
      endDate: filters.end,
      platform: filters.platform,
      account: filters.account,
      currency: filters.currency,
      metric: filters.metric
    },
    matchedRows: matchedRows,
    metricOnly: false,
    lastUpdated: state.dashboard.getRange("N3").getDisplayValue(),
    durationSeconds: Number(durationSeconds || 0),
    compatibilityMode: true,
    secretsExposed: false
  };
}

function cleanupMarketingProjectOpenTriggers200_() {
  var obsoleteHandlers = [
    PROJECT_CONTROL_200.OPEN_HANDLER,
    "marketingDashboardOnOpen194"
  ];
  var removed = 0;

  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (obsoleteHandlers.indexOf(trigger.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(trigger);
      removed += 1;
    }
  });

  return { removed: removed };
}

/** Lightweight initial payload for the Overview tab. */
function getMarketingProjectOverview200() {
  assertProjectControlDependencies200_();
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var automation = step181GetAutomationStatus();
  var accounts = readProjectAccounts200_();
  var dataState = readProjectDailyState200_(spreadsheet);
  var credentialHealth = readProjectCredentialHealth200_();
  var lastLog = readProjectLogRows200_(
    spreadsheet.getSheetByName(MASTER_AUTOMATION_181.LOG_SHEET),
    1
  );
  var accountByPlatform = {};
  accounts.forEach(function(account) {
    if (!accountByPlatform[account.platform]) {
      accountByPlatform[account.platform] = { total: 0, enabled: 0 };
    }
    accountByPlatform[account.platform].total += 1;
    accountByPlatform[account.platform].enabled += account.enabled ? 1 : 0;
  });

  var platforms = PROJECT_CONTROL_200.PLATFORM_ORDER.map(function(platform) {
    var accountState = accountByPlatform[platform] || { total: 0, enabled: 0 };
    var credential = credentialHealth.filter(function(item) {
      return item.platform === platform;
    })[0];
    return {
      platform: platform,
      accounts: accountState.total,
      enabledAccounts: accountState.enabled,
      latestDataDate: dataState.latestByPlatform[platform] || null,
      credentialsConfigured: Boolean(credential && credential.configured),
      state: projectPlatformState200_(
        accountState,
        dataState.latestByPlatform[platform],
        credential
      )
    };
  });

  var configuredPlatforms = credentialHealth.filter(function(item) {
    return item.configured;
  }).length;
  var enabledAccounts = accounts.filter(function(account) {
    return account.enabled;
  }).length;
  var overall = projectOverallState200_(automation, platforms);

  return {
    status: "SUCCESS",
    step: PROJECT_CONTROL_200.STEP,
    overallState: overall,
    generatedAt: new Date().toISOString(),
    timezone: Session.getScriptTimeZone(),
    automation: automation,
    summary: {
      totalAccounts: accounts.length,
      enabledAccounts: enabledAccounts,
      configuredPlatforms: configuredPlatforms,
      rawRows: projectDataRowCount200_(spreadsheet, projectSheetName200_("RAW", "Spend_Raw")),
      dailyRows: dataState.rows
    },
    syncWindow: getMarketingProjectSyncWindow200_(),
    platforms: platforms,
    credentialHealth: credentialHealth,
    lastSync: lastLog.length ? lastLog[0] : null,
    sheetLinks: PROJECT_CONTROL_200.SHEET_LINKS.filter(function(name) {
      return Boolean(spreadsheet.getSheetByName(name));
    }),
    secretsExposed: false
  };
}

function getMarketingProjectSyncWindow200_() {
  var range = typeof getMasterRecentRange180_ === "function"
    ? getMasterRecentRange180_()
    : null;
  var latestCompleted = range && range.endDate
    ? range.endDate
    : projectIsoDate200_(new Date(Date.now() - 24 * 60 * 60 * 1000));

  return {
    latestCompletedDate: latestCompleted,
    maxRangeDays: PROJECT_CONTROL_200.MAX_SYNC_RANGE_DAYS
  };
}

function getMarketingProjectAccounts200() {
  return {
    status: "SUCCESS",
    accounts: readProjectAccounts200_(),
    secretsExposed: false
  };
}

/** Applies only Enabled changes. Names, IDs, currency and timezone are read-only. */
function saveMarketingProjectAccounts200(payload) {
  var changes = payload && Array.isArray(payload.changes)
    ? payload.changes
    : [];
  if (changes.length > 500) {
    throw new Error("Too many account changes in one request.");
  }
  var lock = LockService.getDocumentLock();
  lock.waitLock(5000);
  try {
    changes.forEach(function(change) {
      var platform = String(change.platform || "").trim();
      var accountId = String(change.accountId || "").trim();
      if (PROJECT_CONTROL_200.PLATFORM_ORDER.indexOf(platform) === -1) {
        throw new Error("Unsupported platform: " + platform);
      }
      if (!accountId) {
        throw new Error("Account ID is required.");
      }
      setAccountEnabled_(platform, accountId, Boolean(change.enabled));
    });
  } finally {
    lock.releaseLock();
  }
  return getMarketingProjectAccounts200();
}

/** Runs the exact logged production wrapper already used by the daily trigger. */
function runMarketingProjectSyncNow200(payload) {
  var range = normalizeProjectSyncRequest200_(payload || {});
  var startDate = range ? range.startDate : "";
  var endDate = range ? range.endDate : "";
  var result = startDate || endDate
    ? step181RunLoggedSyncRange(startDate, endDate)
    : step181RunLoggedSyncNow();
  return {
    status: String(result.status || "FAILED"),
    activePlatforms: Number(result.activePlatforms || 0),
    successfulPlatforms: Number(result.successfulPlatforms || 0),
    failedPlatforms: Number(result.failedPlatforms || 0),
    inserted: Number(result.inserted || 0),
    updated: Number(result.updated || 0),
    outputsRebuilt: Boolean(result.outputsRebuilt),
    durationSeconds: Number(result.durationSeconds || 0),
    startDate: startDate || null,
    endDate: endDate || null,
    platforms: Array.isArray(result.platforms) ? result.platforms : [],
    safeError: result.safeError || result.outputError || null,
    secretsExposed: false
  };
}

/** Starts sync in a headless one-time trigger, so connector UI alerts never block the sidebar. */
function startMarketingProjectSyncJob200(payload) {
  var props = PropertiesService.getScriptProperties();
  var active = props.getProperty("_PROJECT_SYNC_JOB_STATE");
  var stale = isProjectSyncJobStale200_(props);
  if ((active === "QUEUED" || active === "RUNNING") && !stale) {
    throw new Error("A project sync is already running.");
  }
  if (stale) {
    clearProjectSyncJobTriggers200_();
  }

  var range = normalizeProjectSyncRequest200_(payload || {});
  var startDate = range ? range.startDate : "";
  var endDate = range ? range.endDate : "";
  props.setProperties({
    "_PROJECT_SYNC_JOB_STATE": "QUEUED",
    "_PROJECT_SYNC_JOB_REQUEST": JSON.stringify({
      startDate: startDate,
      endDate: endDate
    }),
    "_PROJECT_SYNC_JOB_RESULT": "",
    "_PROJECT_SYNC_JOB_UPDATED": new Date().toISOString()
  });
  clearProjectSyncJobTriggers200_();
  ScriptApp.newTrigger(PROJECT_CONTROL_200.SYNC_JOB_HANDLER)
    .timeBased()
    .after(1000)
    .create();
  return getMarketingProjectSyncJob200();
}

function runMarketingProjectBackgroundSync200() {
  var props = PropertiesService.getScriptProperties();
  props.setProperties({
    "_PROJECT_SYNC_JOB_STATE": "RUNNING",
    "_PROJECT_SYNC_JOB_UPDATED": new Date().toISOString()
  });
  try {
    var request = JSON.parse(
      props.getProperty("_PROJECT_SYNC_JOB_REQUEST") || "{}"
    );
    var result = runMarketingProjectSyncNow200(request);
    if (typeof refreshMarketingPaymentMonitor201_ === "function") {
      refreshMarketingPaymentMonitor201_();
    }
    props.setProperties({
      "_PROJECT_SYNC_JOB_STATE": "COMPLETED",
      "_PROJECT_SYNC_JOB_RESULT": JSON.stringify(result),
      "_PROJECT_SYNC_JOB_UPDATED": new Date().toISOString()
    });
  } catch (error) {
    props.setProperties({
      "_PROJECT_SYNC_JOB_STATE": "FAILED",
      "_PROJECT_SYNC_JOB_RESULT": JSON.stringify({
        status: "FAILED",
        safeError: sanitizeProjectText200_(
          error && error.message ? error.message : String(error),
          getProjectSecretValues200_()
        ),
        secretsExposed: false
      }),
      "_PROJECT_SYNC_JOB_UPDATED": new Date().toISOString()
    });
  } finally {
    clearProjectSyncJobTriggers200_();
  }
}

function getMarketingProjectSyncJob200() {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty("_PROJECT_SYNC_JOB_RESULT");
  var result = null;
  if (raw) {
    try {
      result = JSON.parse(raw);
    } catch (error) {
      result = {
        status: "FAILED",
        safeError: "Stored sync result is invalid. Start a new sync.",
        secretsExposed: false
      };
    }
  }
  return {
    status: "SUCCESS",
    state: props.getProperty("_PROJECT_SYNC_JOB_STATE") || "IDLE",
    updatedAt: props.getProperty("_PROJECT_SYNC_JOB_UPDATED") || null,
    stale: isProjectSyncJobStale200_(props),
    result: result,
    secretsExposed: false
  };
}

function normalizeProjectSyncRequest200_(payload) {
  var input = payload || {};
  var startDate = String(input.startDate || "").trim();
  var endDate = String(input.endDate || "").trim();
  if (!startDate && !endDate) {
    return null;
  }
  if (!startDate || !endDate) {
    throw new Error("Both sync dates are required.");
  }
  if (typeof normalizeMasterSyncRange180_ !== "function") {
    throw new Error(
      "MasterOrchestrator.gs is missing custom-range validation."
    );
  }
  return normalizeMasterSyncRange180_(startDate, endDate);
}

function clearProjectSyncJobTriggers200_() {
  ScriptApp.getProjectTriggers()
    .filter(function(trigger) {
      return trigger.getHandlerFunction() ===
        PROJECT_CONTROL_200.SYNC_JOB_HANDLER;
    })
    .forEach(function(trigger) {
      ScriptApp.deleteTrigger(trigger);
    });
}

function isProjectSyncJobStale200_(properties) {
  var props = properties || PropertiesService.getScriptProperties();
  var state = props.getProperty("_PROJECT_SYNC_JOB_STATE");
  if (state !== "QUEUED" && state !== "RUNNING") {
    return false;
  }
  var updatedAt = new Date(
    props.getProperty("_PROJECT_SYNC_JOB_UPDATED") || ""
  );
  if (isNaN(updatedAt.getTime())) {
    return true;
  }
  return Date.now() - updatedAt.getTime() >
    PROJECT_CONTROL_200.STALE_SYNC_MINUTES * 60 * 1000;
}

/** Menu-friendly wrapper with visible feedback; sidebar uses the JSON function above. */
function runMarketingProjectSyncFromMenu200() {
  var result = startMarketingProjectSyncJob200({});
  SpreadsheetApp.getActiveSpreadsheet().toast(
    "Sync queued in the background. Open the Control Panel to follow progress.",
    "Marketing Spend Hub",
    8
  );
  return result;
}

function updateMarketingProjectSchedule200(payload) {
  var input = payload || {};
  var action = String(input.action || "").toUpperCase();
  if (action === "DISABLE") {
    return step181RemoveDailyTrigger();
  }
  if (action !== "ENABLE") {
    throw new Error("Schedule action must be ENABLE or DISABLE.");
  }
  var hour = Number(input.hour);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error("Daily sync hour must be an integer from 0 to 23.");
  }
  PropertiesService.getScriptProperties().setProperty(
    "MASTER_SYNC_HOUR",
    String(hour)
  );
  return step181InstallDailyTrigger();
}

/** Dispatches only approved, existing maintenance wrappers. */
function runMarketingProjectMaintenance200(action) {
  var key = String(action || "").toUpperCase();
  if (key === "DATA_QUALITY") {
    return safeProjectResult200_(step190RunDataQualityAudit());
  }
  if (key === "DASHBOARD_QA") {
    return safeProjectResult200_(step191RunDashboardFunctionalQA());
  }
  if (key === "FILTER_QA") {
    return safeProjectResult200_(step193RunInteractiveDashboardQA());
  }
  if (key === "REBUILD_OUTPUTS") {
    var daily = rebuildSpendDaily({ showUi: false });
    var dashboard = refreshDashboard({ showUi: false });
    return {
      status: "SUCCESS",
      action: key,
      daily: safeProjectResult200_(daily),
      dashboard: safeProjectResult200_(dashboard),
      secretsExposed: false
    };
  }
  if (key === "META_TOKEN_HEALTH") {
    return safeProjectResult200_(step182TestMetaTokenLifecycle());
  }
  if (key === "CLEANUP_PREVIEW") {
    return safeProjectResult200_(step210PreviewProjectCleanup());
  }
  if (key === "CLEANUP_APPLY") {
    return safeProjectResult200_(step210CleanupProjectWorkbook());
  }
  if (key === "SHOW_ALL_SHEETS") {
    return safeProjectResult200_(step210ShowAllProjectSheets());
  }
  throw new Error("Unsupported maintenance action: " + key);
}

function getMarketingProjectLogs200() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  return {
    status: "SUCCESS",
    sync: readProjectLogRows200_(
      spreadsheet.getSheetByName("Sync_Log"),
      PROJECT_CONTROL_200.MAX_LOG_ROWS
    ),
    platform: readProjectLogRows200_(
      spreadsheet.getSheetByName("Platform_Log"),
      PROJECT_CONTROL_200.MAX_LOG_ROWS
    ),
    errors: readProjectLogRows200_(
      spreadsheet.getSheetByName("Error_Log"),
      PROJECT_CONTROL_200.MAX_LOG_ROWS
    ),
    secretsExposed: false
  };
}

function activateMarketingProjectSheet200(name) {
  var sheetName = String(name || "");
  if (PROJECT_CONTROL_200.SHEET_LINKS.indexOf(sheetName) === -1) {
    throw new Error("Sheet is not available from the control panel.");
  }
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error("Sheet not found: " + sheetName);
  }
  if (sheet.isSheetHidden()) {
    sheet.showSheet();
  }
  spreadsheet.setActiveSheet(sheet);
  return { status: "SUCCESS", sheet: sheetName, secretsExposed: false };
}

function readProjectAccounts200_() {
  var sheet = requireSheet_(projectSheetName200_("ACCOUNTS", "Accounts"));
  if (sheet.getLastRow() < 2) {
    return [];
  }
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues()
    .filter(function(row) { return row[0] && row[1]; })
    .map(function(row) {
      return {
        platform: String(row[0] || ""),
        accountId: String(row[1] || ""),
        accountName: String(row[2] || ""),
        currency: String(row[3] || ""),
        timezone: String(row[4] || ""),
        enabled: Boolean(row[5]),
        status: String(row[6] || "")
      };
    });
}

function readProjectDailyState200_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName(projectSheetName200_("DAILY", "Spend_Daily"));
  var result = { rows: 0, latestByPlatform: {} };
  if (!sheet || sheet.getLastRow() < 2) {
    return result;
  }
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .getDisplayValues()[0];
  var dateIndex = headers.indexOf("Date");
  var platformIndex = headers.indexOf("Platform");
  if (dateIndex === -1 || platformIndex === -1) {
    return result;
  }
  var values = sheet.getRange(
    2,
    1,
    sheet.getLastRow() - 1,
    Math.max(dateIndex, platformIndex) + 1
  ).getValues();
  result.rows = values.length;
  values.forEach(function(row) {
    var platform = String(row[platformIndex] || "");
    var date = projectIsoDate200_(row[dateIndex]);
    if (platform && date && (!result.latestByPlatform[platform] ||
        date > result.latestByPlatform[platform])) {
      result.latestByPlatform[platform] = date;
    }
  });
  return result;
}

function readProjectCredentialHealth200_() {
  var properties = PropertiesService.getScriptProperties();
  return PROJECT_CONTROL_200.CREDENTIAL_GROUPS.map(function(group) {
    var missing = group.required.filter(function(name) {
      return !String(properties.getProperty(name) || "").trim();
    });
    return {
      platform: group.platform,
      configured: missing.length === 0,
      configuredCount: group.required.length - missing.length,
      requiredCount: group.required.length,
      missing: missing.slice(),
      valuesExposed: false
    };
  });
}

function readProjectLogRows200_(sheet, limit) {
  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }
  var count = Math.min(Number(limit || 1), sheet.getLastRow() - 1);
  var startRow = sheet.getLastRow() - count + 1;
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .getDisplayValues()[0];
  var rows = sheet.getRange(startRow, 1, count, sheet.getLastColumn())
    .getDisplayValues();
  var secretValues = getProjectSecretValues200_();
  return rows.reverse().map(function(row) {
    var item = {};
    headers.forEach(function(header, index) {
      var key = String(header || "Column " + (index + 1));
      item[key] = sanitizeProjectText200_(row[index], secretValues);
    });
    return item;
  });
}

function projectOverallState200_(automation, platforms) {
  if (!automation.triggerInstalled || automation.triggerCount !== 1) {
    return "ACTION_REQUIRED";
  }
  if (automation.lastRunStatus && automation.lastRunStatus !== "SUCCESS") {
    return "ATTENTION";
  }
  if (Number(automation.consecutiveNonSuccessRuns || 0) > 0) {
    return "ATTENTION";
  }
  var activeIssues = platforms.some(function(item) {
    return item.enabledAccounts > 0 && item.state !== "HEALTHY";
  });
  return activeIssues ? "ATTENTION" : "HEALTHY";
}

function projectPlatformState200_(accounts, latestDate, credential) {
  if (!credential || !credential.configured) {
    return "CONFIG_MISSING";
  }
  if (!accounts.enabled) {
    return accounts.total ? "DISABLED" : "NO_ACCOUNT";
  }
  return latestDate ? "HEALTHY" : "NO_DATA";
}

function projectDataRowCount200_(spreadsheet, sheetName) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  return sheet ? Math.max(0, sheet.getLastRow() - 1) : 0;
}

function projectSheetName200_(key, fallback) {
  return typeof MSH !== "undefined" && MSH.SHEETS && MSH.SHEETS[key]
    ? MSH.SHEETS[key]
    : fallback;
}

function projectIsoDate200_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  var text = String(value || "").trim();
  var match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  return match ? match[1] + "-" + match[2] + "-" + match[3] : "";
}

function safeProjectResult200_(value) {
  var source = value && typeof value === "object" ? value : {};
  var safe = {};
  [
    "status", "step", "errors", "warnings", "checks", "action",
    "rawRows", "dailyRows", "failedChecks", "chartCount",
    "sourceSheetsModified", "outputsRebuilt", "refreshed",
    "durationSeconds", "hiddenSheets", "shownSheets", "migratedLogRows",
    "mixedSyncLogRows", "unknownSheets", "plannedActions", "backupSheet",
    "duplicateTriggersRemoved", "deletedSheets", "reversible"
  ].forEach(function(key) {
    if (source[key] !== undefined) {
      safe[key] = source[key];
    }
  });
  safe.secretsExposed = false;
  return safe;
}

function getProjectSecretValues200_() {
  var properties = PropertiesService.getScriptProperties();
  var values = [];
  PROJECT_CONTROL_200.CREDENTIAL_GROUPS.forEach(function(group) {
    group.required.forEach(function(name) {
      var secret = String(properties.getProperty(name) || "");
      if (secret.length >= 6 && values.indexOf(secret) === -1) {
        values.push(secret);
      }
    });
  });
  return values;
}

function sanitizeProjectText200_(value, secretValues) {
  var text = typeof sanitizeAutomationText181_ === "function"
    ? sanitizeAutomationText181_(value)
    : String(value || "");
  var secrets = Array.isArray(secretValues)
    ? secretValues
    : getProjectSecretValues200_();
  secrets.forEach(function(secret) {
    text = text.split(secret).join("[REDACTED]");
  });
  return text
    .replace(
      /(api[_-]?key|authorization|token|secret|private[_-]?key)(["'=:\s]+)[^,\s"}]+/gi,
      "$1$2[REDACTED]"
    )
    .slice(0, 1000);
}

function assertProjectControlDependencies200_() {
  var required = [
    ["step181GetAutomationStatus", typeof step181GetAutomationStatus],
    ["step181RunLoggedSyncNow", typeof step181RunLoggedSyncNow],
    ["step181RunLoggedSyncRange", typeof step181RunLoggedSyncRange],
    ["step181InstallDailyTrigger", typeof step181InstallDailyTrigger],
    ["step181RemoveDailyTrigger", typeof step181RemoveDailyTrigger],
    ["setAccountEnabled_", typeof setAccountEnabled_],
    ["openMarketingHubControlPanel", typeof openMarketingHubControlPanel]
  ];
  var missing = required.filter(function(item) {
    return item[1] !== "function";
  }).map(function(item) { return item[0]; });
  if (missing.length) {
    throw new Error("Project Control Panel is missing: " + missing.join(", "));
  }
}
