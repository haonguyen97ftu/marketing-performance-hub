/**
 * Marketing Performance Hub
 * Step 19A repair — canonicalize legacy raw rows and rebuild derived outputs.
 *
 * Repairs only the issues proven by the Step 19A audit:
 *   - blank legacy performance metrics become numeric zero;
 *   - Record Key is rebuilt from Date|Platform|Account ID|Campaign ID;
 *   - Spend_Daily "Last Updated" migrates to "Updated At";
 *   - Spend_Daily and Dashboard are rebuilt, then Step 19A is rerun.
 *
 * Before any write, backup copies of Spend_Raw and Spend_Daily are created.
 * Non-blank invalid metrics or canonical-key collisions stop the repair before
 * source data is changed.
 */

var DATA_QUALITY_REPAIR_190 = Object.freeze({
  STEP: "19A_REPAIR",
  RAW_SHEET: "Spend_Raw",
  DAILY_SHEET: "Spend_Daily",
  LEGACY_DAILY_HEADER: "Last Updated",
  CANONICAL_DAILY_HEADER: "Updated At"
});


function step190RepairDataQuality() {
  assertDataQualityRepairDependencies190_();

  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var rawSheet = requireSheet_(MSH.SHEETS.RAW);
  var dailySheet = requireSheet_(MSH.SHEETS.DAILY);
  var lock = LockService.getDocumentLock();

  lock.waitLock(30000);

  try {
    var plan = buildDataQualityRepairPlan190_(
      rawSheet,
      dailySheet
    );

    var backupStamp = Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyyMMdd_HHmmss"
    );
    var rawBackup = backupSheetForRepair190_(
      spreadsheet,
      rawSheet,
      "Spend_Raw_Pre19A_" + backupStamp
    );
    var dailyBackup = backupSheetForRepair190_(
      spreadsheet,
      dailySheet,
      "Spend_Daily_Pre19A_" + backupStamp
    );

    applyDataQualityRepairPlan190_(
      rawSheet,
      dailySheet,
      plan
    );

    rebuildSpendDaily({ showUi: false });
    refreshDashboard({ showUi: false });

    var audit = step190RunDataQualityAudit();
    var summary = {
      status: audit.errors === 0 ? "SUCCESS" : "FAILED",
      step: DATA_QUALITY_REPAIR_190.STEP,
      repairedRecordKeys: plan.keyRepairs,
      filledBlankMetrics: plan.blankMetricAddresses.length,
      dailyHeaderMigrated: plan.dailyHeaderMigrated,
      dailyRebuilt: true,
      dashboardRefreshed: true,
      auditStatus: audit.status,
      auditErrors: audit.errors,
      auditWarnings: audit.warnings,
      rawBackupSheet: rawBackup.getName(),
      dailyBackupSheet: dailyBackup.getName(),
      sourceSheetsModified: true,
      secretsExposed: false
    };

    console.log(JSON.stringify(summary, null, 2));
    return summary;
  } finally {
    lock.releaseLock();
  }
}


function buildDataQualityRepairPlan190_(rawSheet, dailySheet) {
  validateRepairHeaders190_(
    rawSheet,
    SPEND_COLUMNS,
    DATA_QUALITY_REPAIR_190.RAW_SHEET,
    null
  );

  validateRepairHeaders190_(
    dailySheet,
    DAILY_PERFORMANCE_COLUMNS,
    DATA_QUALITY_REPAIR_190.DAILY_SHEET,
    {
      columnIndex: DAILY_PERFORMANCE_INDEX.UPDATED_AT,
      alias: DATA_QUALITY_REPAIR_190.LEGACY_DAILY_HEADER
    }
  );

  var rowCount = Math.max(rawSheet.getLastRow() - 1, 0);
  var rows = rowCount
    ? rawSheet
        .getRange(2, 1, rowCount, SPEND_COLUMNS.length)
        .getValues()
    : [];
  var displayRows = rowCount
    ? rawSheet
        .getRange(2, 1, rowCount, SPEND_COLUMNS.length)
        .getDisplayValues()
    : [];
  var canonicalKeys = [];
  var seenKeys = {};
  var blankMetricAddresses = [];
  var keyRepairs = 0;
  var invalidMetrics = [];

  rows.forEach(function (row, index) {
    var display = displayRows[index];
    var sheetRow = index + 2;

    if (isBlankRepairRow190_(display)) {
      canonicalKeys.push([row[SPEND_COLUMN_INDEX.RECORD_KEY]]);
      return;
    }

    var date = row[SPEND_COLUMN_INDEX.DATE];
    var platform = String(
      display[SPEND_COLUMN_INDEX.PLATFORM] || ""
    ).trim();
    var accountId = String(
      display[SPEND_COLUMN_INDEX.ACCOUNT_ID] || ""
    ).trim();
    var campaignId = String(
      display[SPEND_COLUMN_INDEX.CAMPAIGN_ID] || ""
    ).trim();

    if (!date || !platform || !accountId || !campaignId) {
      throw new Error(
        "Repair stopped: Spend_Raw row " + sheetRow +
        " is missing a Record Key dimension."
      );
    }

    var canonicalKey = createSpendRecordKey_(
      date,
      platform,
      accountId,
      campaignId
    );

    if (seenKeys[canonicalKey]) {
      throw new Error(
        "Repair stopped: canonical Record Key collision between rows " +
        seenKeys[canonicalKey] + " and " + sheetRow + "."
      );
    }
    seenKeys[canonicalKey] = sheetRow;
    canonicalKeys.push([canonicalKey]);

    var existingKey = String(
      display[SPEND_COLUMN_INDEX.RECORD_KEY] || ""
    ).trim();
    if (existingKey !== canonicalKey) {
      keyRepairs += 1;
    }

    [
      SPEND_COLUMN_INDEX.SPEND,
      SPEND_COLUMN_INDEX.IMPRESSIONS,
      SPEND_COLUMN_INDEX.CLICKS,
      SPEND_COLUMN_INDEX.CONVERSIONS,
      SPEND_COLUMN_INDEX.APP_INSTALLS
    ].forEach(function (columnIndex) {
      var rawValue = row[columnIndex];
      var displayValue = String(display[columnIndex] || "").trim();
      var isBlank =
        rawValue === "" ||
        rawValue === null ||
        rawValue === undefined ||
        displayValue === "";

      if (isBlank) {
        if (columnIndex === SPEND_COLUMN_INDEX.SPEND) {
          invalidMetrics.push(
            "row " + sheetRow + " / Spend is blank"
          );
        } else {
          blankMetricAddresses.push(
            columnNumberToA1Repair190_(columnIndex + 1) + sheetRow
          );
        }
        return;
      }

      var numericValue = Number(rawValue);
      if (!Number.isFinite(numericValue) || numericValue < 0) {
        invalidMetrics.push(
          "row " + sheetRow + " / " +
          SPEND_COLUMNS[columnIndex]
        );
      }
    });
  });

  if (invalidMetrics.length) {
    throw new Error(
      "Repair stopped: non-repairable base metric(s): " +
      invalidMetrics.slice(0, 10).join(", ") +
      (invalidMetrics.length > 10 ? " …" : "")
    );
  }

  var currentDailyHeader = String(
    dailySheet
      .getRange(
        1,
        DAILY_PERFORMANCE_INDEX.UPDATED_AT + 1
      )
      .getDisplayValue() || ""
  ).trim();

  return {
    rowCount: rowCount,
    canonicalKeys: canonicalKeys,
    keyRepairs: keyRepairs,
    blankMetricAddresses: blankMetricAddresses,
    dailyHeaderMigrated:
      currentDailyHeader ===
      DATA_QUALITY_REPAIR_190.LEGACY_DAILY_HEADER
  };
}


function applyDataQualityRepairPlan190_(
  rawSheet,
  dailySheet,
  plan
) {
  if (plan.rowCount) {
    rawSheet
      .getRange(
        2,
        SPEND_COLUMN_INDEX.RECORD_KEY + 1,
        plan.rowCount,
        1
      )
      .setValues(plan.canonicalKeys);
  }

  if (plan.blankMetricAddresses.length) {
    rawSheet
      .getRangeList(plan.blankMetricAddresses)
      .setValue(0);
  }

  // Migrate the proven legacy alias before calling the shared schema guard.
  // This keeps the one-time repair compatible with both older and newer
  // Aggregation.gs versions: older guards reject "Last Updated", while newer
  // guards accept and normalize it. buildDataQualityRepairPlan190_ already
  // verified that no other unexpected Spend_Daily header is present.
  if (plan.dailyHeaderMigrated) {
    dailySheet
      .getRange(
        1,
        DAILY_PERFORMANCE_INDEX.UPDATED_AT + 1
      )
      .setValue(DATA_QUALITY_REPAIR_190.CANONICAL_DAILY_HEADER);
  }

  ensureDailyPerformanceSchema_(dailySheet);
}


function validateRepairHeaders190_(
  sheet,
  expectedHeaders,
  label,
  allowedAlias
) {
  ensureSheetColumnCapacity_(sheet, expectedHeaders.length);

  var currentHeaders = sheet
    .getRange(1, 1, 1, expectedHeaders.length)
    .getDisplayValues()[0];

  expectedHeaders.forEach(function (expected, index) {
    var current = String(currentHeaders[index] || "").trim();
    var aliasAllowed =
      allowedAlias &&
      index === allowedAlias.columnIndex &&
      current === allowedAlias.alias;

    if (current !== expected && !aliasAllowed) {
      throw new Error(
        "Repair stopped: " + label +
        " header mismatch at column " + (index + 1) +
        ". Expected '" + expected +
        "' but found '" + current + "'."
      );
    }
  });
}


function backupSheetForRepair190_(
  spreadsheet,
  sourceSheet,
  requestedName
) {
  var name = requestedName;
  var suffix = 2;

  while (spreadsheet.getSheetByName(name)) {
    name = requestedName + "_" + suffix;
    suffix += 1;
  }

  return sourceSheet.copyTo(spreadsheet).setName(name);
}


function columnNumberToA1Repair190_(columnNumber) {
  var value = columnNumber;
  var result = "";

  while (value > 0) {
    var remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }

  return result;
}


function isBlankRepairRow190_(displayRow) {
  return displayRow.every(function (value) {
    return String(value || "").trim() === "";
  });
}


function assertDataQualityRepairDependencies190_() {
  var dependencies = [
    ["requireSheet_", typeof requireSheet_],
    ["createSpendRecordKey_", typeof createSpendRecordKey_],
    ["ensureSheetColumnCapacity_", typeof ensureSheetColumnCapacity_],
    ["ensureDailyPerformanceSchema_", typeof ensureDailyPerformanceSchema_],
    ["rebuildSpendDaily", typeof rebuildSpendDaily],
    ["refreshDashboard", typeof refreshDashboard],
    ["step190RunDataQualityAudit", typeof step190RunDataQualityAudit]
  ];
  var missing = dependencies
    .filter(function (item) {
      return item[1] !== "function";
    })
    .map(function (item) {
      return item[0];
    });

  if (
    typeof MSH === "undefined" ||
    typeof SPEND_COLUMNS === "undefined" ||
    typeof SPEND_COLUMN_INDEX === "undefined" ||
    typeof DAILY_PERFORMANCE_COLUMNS === "undefined" ||
    typeof DAILY_PERFORMANCE_INDEX === "undefined"
  ) {
    missing.push("shared schema constants");
  }

  if (missing.length) {
    throw new Error(
      "Step 19A repair dependency missing: " +
      missing.join(", ") + "."
    );
  }
}
