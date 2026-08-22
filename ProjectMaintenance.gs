/**
 * Marketing Performance Hub — Step 21 workbook maintenance.
 *
 * Cleanup is reversible: project/support tabs are hidden, never deleted.
 * Unknown user tabs are never modified. Mixed legacy connector rows in
 * Sync_Log are backed up and migrated to Platform_Log before removal.
 */

var PROJECT_MAINTENANCE_210 = Object.freeze({
  STEP: "21",
  VISIBLE_SHEETS: Object.freeze([
    "Dashboard",
    "Accounts",
    "Payment_Monitor"
  ]),
  SYSTEM_SHEETS: Object.freeze([
    "Spend_Raw",
    "Spend_Daily",
    "Sync_Log",
    "Platform_Log",
    "Error_Log",
    "Settings",
    "OAuth_Config",
    "Control_Panel",
    "_Dashboard_ChartData",
    "Report_Jobs"
  ]),
  QA_SHEETS: Object.freeze([
    "Data_Quality",
    "Dashboard_QA",
    "Dashboard_Filter_QA"
  ]),
  HIDDEN_PREFIXES: Object.freeze([
    "Sync_Log_Legacy_",
    "Sync_Log_Backup_",
    "Spend_Raw_Backup_",
    "Spend_Daily_Backup_"
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
  ])
});

function step210TestProjectUpgrade() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var errors = [];
  var warnings = [];
  var requiredFunctions = [
    ["openMarketingHubControlPanel", typeof openMarketingHubControlPanel],
    ["step181RunLoggedSyncRange", typeof step181RunLoggedSyncRange],
    ["syncAllPlatformsPerformanceRange", typeof syncAllPlatformsPerformanceRange],
    ["normalizeMasterSyncRange180_", typeof normalizeMasterSyncRange180_],
    ["startMarketingProjectSyncJob200", typeof startMarketingProjectSyncJob200],
    ["step210CleanupProjectWorkbook", typeof step210CleanupProjectWorkbook]
  ];

  requiredFunctions.forEach(function(item) {
    if (item[1] !== "function") {
      errors.push("Missing function: " + item[0]);
    }
  });

  var syncLog = spreadsheet.getSheetByName("Sync_Log");
  var mixedRows = countMixedSyncLogRows210_(syncLog);
  if (mixedRows) {
    warnings.push(
      mixedRows +
        " connector log rows still need migration from Sync_Log."
    );
  }

  var platformLog = spreadsheet.getSheetByName("Platform_Log");
  if (!platformLog) {
    warnings.push(
      "Platform_Log does not exist yet; cleanup/setup will create it."
    );
  }

  var dailyTriggerCount = ScriptApp.getProjectTriggers().filter(
    function(trigger) {
      return trigger.getHandlerFunction() ===
        "runScheduledMarketingPerformanceSync";
    }
  ).length;
  if (dailyTriggerCount > 1) {
    warnings.push("Duplicate daily production triggers found.");
  }

  var result = {
    status: errors.length ? "FAILED" : warnings.length ? "WARNING" : "SUCCESS",
    step: PROJECT_MAINTENANCE_210.STEP,
    errors: errors.length,
    warnings: warnings.length,
    errorMessages: errors,
    warningMessages: warnings,
    rangeSyncReady: errors.indexOf(
      "Missing function: syncAllPlatformsPerformanceRange"
    ) === -1,
    openFunction: "openMarketingHubControlPanel",
    sidebarFile: typeof PROJECT_CONTROL_200 !== "undefined"
      ? PROJECT_CONTROL_200.SIDEBAR_FILE
      : null,
    mixedSyncLogRows: mixedRows,
    productionTriggerCount: dailyTriggerCount,
    secretsExposed: false
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function step210PreviewProjectCleanup() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var plan = buildProjectCleanupPlan210_(spreadsheet);
  var result = {
    status: "SUCCESS",
    step: PROJECT_MAINTENANCE_210.STEP,
    applyChanges: false,
    plannedActions: plan.actions,
    hiddenSheets: plan.hide.length,
    unknownSheets: plan.unknown,
    mixedSyncLogRows: countMixedSyncLogRows210_(
      spreadsheet.getSheetByName("Sync_Log")
    ),
    sourceSheetsModified: false,
    secretsExposed: false
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function step210CleanupProjectWorkbook() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var lock = LockService.getDocumentLock();
  lock.waitLock(10000);

  try {
    var dashboard = spreadsheet.getSheetByName("Dashboard");
    if (!dashboard) {
      throw new Error(
        "Dashboard is missing. Run setupMarketingSpendHub first."
      );
    }

    var migration = migrateMixedSyncLogRows210_(spreadsheet);
    if (typeof ensureAutomationLogSheet181_ === "function") {
      ensureAutomationLogSheet181_();
    }
    var plan = buildProjectCleanupPlan210_(spreadsheet);
    var hidden = [];

    if (dashboard.isSheetHidden()) {
      dashboard.showSheet();
    }
    spreadsheet.setActiveSheet(dashboard);

    PROJECT_MAINTENANCE_210.VISIBLE_SHEETS.forEach(
      function(name, index) {
        var sheet = spreadsheet.getSheetByName(name);
        if (!sheet) {
          return;
        }
        if (sheet.isSheetHidden()) {
          sheet.showSheet();
        }
        spreadsheet.setActiveSheet(sheet);
        spreadsheet.moveActiveSheet(index + 1);
        sheet.setTabColor(index === 0 ? "#17324d" : "#2f6f64");
      }
    );

    spreadsheet.setActiveSheet(dashboard);
    plan.hide.forEach(function(name) {
      var sheet = spreadsheet.getSheetByName(name);
      if (sheet && !sheet.isSheetHidden()) {
        sheet.hideSheet();
        hidden.push(name);
      }
    });

    var triggerCleanup = cleanupProjectTriggers210_();
    SpreadsheetApp.flush();

    var result = {
      status: "SUCCESS",
      step: PROJECT_MAINTENANCE_210.STEP,
      hiddenSheets: hidden.length,
      hiddenSheetNames: hidden,
      migratedLogRows: migration.migrated,
      backupSheet: migration.backupSheet,
      duplicateTriggersRemoved: triggerCleanup.removed,
      unknownSheets: plan.unknown,
      deletedSheets: 0,
      reversible: true,
      secretsExposed: false
    };
    console.log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    lock.releaseLock();
  }
}

function step210ShowAllProjectSheets() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var shown = [];
  spreadsheet.getSheets().forEach(function(sheet) {
    if (sheet.isSheetHidden()) {
      sheet.showSheet();
      shown.push(sheet.getName());
    }
  });
  return {
    status: "SUCCESS",
    step: PROJECT_MAINTENANCE_210.STEP,
    shownSheets: shown.length,
    shownSheetNames: shown,
    secretsExposed: false
  };
}

function buildProjectCleanupPlan210_(spreadsheet) {
  var hide = [];
  var unknown = [];
  var actions = [];

  spreadsheet.getSheets().forEach(function(sheet) {
    var name = sheet.getName();
    var role = classifyProjectSheet210_(name);
    var action = "KEEP_VISIBLE";

    if (role === "SYSTEM" || role === "QA" || role === "ARCHIVE") {
      action = "HIDE";
      hide.push(name);
    } else if (role === "UNKNOWN") {
      action = "LEAVE_UNTOUCHED";
      unknown.push(name);
    }

    actions.push({
      sheet: name,
      role: role,
      action: action,
      currentlyHidden: sheet.isSheetHidden()
    });
  });

  return { hide: hide, unknown: unknown, actions: actions };
}

function classifyProjectSheet210_(name) {
  if (PROJECT_MAINTENANCE_210.VISIBLE_SHEETS.indexOf(name) !== -1) {
    return "OPERATIONAL";
  }
  if (PROJECT_MAINTENANCE_210.SYSTEM_SHEETS.indexOf(name) !== -1) {
    return "SYSTEM";
  }
  if (PROJECT_MAINTENANCE_210.QA_SHEETS.indexOf(name) !== -1) {
    return "QA";
  }
  var archived = PROJECT_MAINTENANCE_210.HIDDEN_PREFIXES.some(
    function(prefix) {
      return name.indexOf(prefix) === 0;
    }
  );
  return archived ? "ARCHIVE" : "UNKNOWN";
}

function ensurePlatformLogSheet210_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName("Platform_Log");
  if (!sheet) {
    sheet = spreadsheet.insertSheet("Platform_Log");
  }
  var headers = PROJECT_MAINTENANCE_210.PLATFORM_LOG_HEADERS;
  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      headers.length - sheet.getMaxColumns()
    );
  }
  var current = sheet.getLastRow()
    ? sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0]
    : [];
  if (sheet.getLastRow() > 0 && current.join("|") !== headers.join("|")) {
    throw new Error(
      "Platform_Log has an unexpected schema. No log rows were migrated."
    );
  }
  sheet.getRange(1, 1, 1, headers.length).setValues([headers.slice()]);
  sheet.setFrozenRows(1);
  return sheet;
}

function countMixedSyncLogRows210_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) {
    return 0;
  }
  return readMixedSyncLogRows210_(sheet).length;
}

function readMixedSyncLogRows210_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }
  var width = Math.max(14, sheet.getLastColumn());
  var rows = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, width)
    .getValues();
  var mixed = [];

  rows.forEach(function(row, index) {
    var first = row[0];
    var second = row[1];
    var third = row[2];
    var firstIsDate = first instanceof Date && !isNaN(first.getTime());
    var looksLikeConnectorRow =
      !firstIsDate &&
      String(first || "").trim() &&
      second instanceof Date &&
      third instanceof Date &&
      String(row[3] || "").trim() &&
      String(row[5] || "").trim();

    if (looksLikeConnectorRow) {
      mixed.push({ rowNumber: index + 2, values: row.slice(0, 9) });
    }
  });
  return mixed;
}

function migrateMixedSyncLogRows210_(spreadsheet) {
  var syncLog = spreadsheet.getSheetByName("Sync_Log");
  var mixed = readMixedSyncLogRows210_(syncLog);
  if (!mixed.length) {
    ensurePlatformLogSheet210_(spreadsheet);
    return { migrated: 0, backupSheet: null };
  }

  var backupName = uniqueProjectSheetName210_(
    spreadsheet,
    "Sync_Log_Backup_" + projectTimestamp210_()
  );
  var backup = syncLog.copyTo(spreadsheet).setName(backupName);
  backup.hideSheet();

  var platformLog = ensurePlatformLogSheet210_(spreadsheet);
  platformLog
    .getRange(
      platformLog.getLastRow() + 1,
      1,
      mixed.length,
      PROJECT_MAINTENANCE_210.PLATFORM_LOG_HEADERS.length
    )
    .setValues(mixed.map(function(item) { return item.values; }));

  mixed
    .slice()
    .sort(function(left, right) {
      return right.rowNumber - left.rowNumber;
    })
    .forEach(function(item) {
      syncLog.deleteRow(item.rowNumber);
    });

  return { migrated: mixed.length, backupSheet: backupName };
}

function cleanupProjectTriggers210_() {
  var keepOneHandlers = [
    "handleMarketingDashboardEdit192",
    "runScheduledMarketingPerformanceSync"
  ];
  var obsoleteHandlers = [
    "marketingProjectControlOnOpen200",
    "marketingDashboardOnOpen194"
  ];
  var seen = {};
  var removed = 0;

  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    var handler = trigger.getHandlerFunction();
    if (obsoleteHandlers.indexOf(handler) !== -1) {
      ScriptApp.deleteTrigger(trigger);
      removed += 1;
      return;
    }
    if (keepOneHandlers.indexOf(handler) !== -1) {
      if (seen[handler]) {
        ScriptApp.deleteTrigger(trigger);
        removed += 1;
      } else {
        seen[handler] = true;
      }
    }
  });
  return { removed: removed };
}

function projectTimestamp210_() {
  return Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone() || "UTC",
    "yyyyMMdd_HHmmss"
  );
}

function uniqueProjectSheetName210_(spreadsheet, baseName) {
  var name = baseName.slice(0, 95);
  var suffix = 2;
  while (spreadsheet.getSheetByName(name)) {
    name = (baseName.slice(0, 90) + "_" + suffix).slice(0, 99);
    suffix += 1;
  }
  return name;
}
