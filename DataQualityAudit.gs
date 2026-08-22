/**
 * Marketing Performance Hub
 * Step 19A — Data Quality & Reconciliation.
 *
 * Read-only checks against source/derived data:
 *   - Accounts registry integrity
 *   - Spend_Raw schema, required fields, metrics, and Record Key uniqueness
 *   - Spend_Daily schema, key uniqueness, metrics, and derived metrics
 *   - Spend_Raw versus Spend_Daily reconciliation
 *   - Platform-level data freshness for enabled platforms
 *
 * The only sheet this file writes is Data_Quality, which is a derived audit
 * report. Spend_Raw, Spend_Daily, Accounts, and Dashboard are never changed.
 *
 * Optional Script Properties:
 *   DATA_QUALITY_FRESHNESS_DAYS = non-negative integer (default: 2)
 *   DATA_QUALITY_MAX_DETAILS    = positive integer (default: 5000)
 */

var DATA_QUALITY_190 = Object.freeze({
  STEP: "19A",
  REPORT_SHEET: "Data_Quality",
  DEFAULT_FRESHNESS_DAYS: 2,
  DEFAULT_MAX_DETAILS: 5000,
  BASE_TOLERANCE: 0.000001,
  DERIVED_TOLERANCE: 0.0001,
  PLATFORMS: Object.freeze([
    "TikTok",
    "Meta",
    "Moloco",
    "Google Ads",
    "Apple Search Ads"
  ]),
  ACCOUNT_HEADERS: Object.freeze([
    "Platform",
    "Account ID",
    "Account Name",
    "Currency",
    "Timezone",
    "Enabled",
    "Status"
  ]),
  RAW_HEADERS: Object.freeze([
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
  ]),
  DAILY_HEADERS: Object.freeze([
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
  ]),
  REPORT_HEADERS: Object.freeze([
    "Severity",
    "Check",
    "Platform",
    "Account ID",
    "Date",
    "Raw Row",
    "Daily Row",
    "Metric",
    "Expected",
    "Actual",
    "Difference",
    "Detail"
  ]),
  CHECKS: Object.freeze([
    "SHEET_SCHEMA",
    "ACCOUNT_REGISTRY",
    "RAW_REQUIRED_FIELDS",
    "RAW_RECORD_KEYS",
    "RAW_METRICS",
    "DAILY_REQUIRED_FIELDS",
    "DAILY_KEYS",
    "DAILY_METRICS",
    "DERIVED_METRICS",
    "RECONCILIATION",
    "FRESHNESS"
  ])
});


/**
 * Main Step 19A entry point.
 */
function step190RunDataQualityAudit() {
  var startedAt = new Date();
  var config = getDataQualityConfig190_();
  var audit = createAuditState190_(config);
  var sheets = getDataQualitySourceSheets190_();

  var accountData = readAuditSheet190_(
    sheets.accounts,
    DATA_QUALITY_190.ACCOUNT_HEADERS,
    "Accounts",
    audit
  );
  var rawData = readAuditSheet190_(
    sheets.raw,
    DATA_QUALITY_190.RAW_HEADERS,
    "Spend_Raw",
    audit
  );
  var dailyData = readAuditSheet190_(
    sheets.daily,
    DATA_QUALITY_190.DAILY_HEADERS,
    "Spend_Daily",
    audit
  );

  var accounts = auditAccounts190_(accountData, audit);
  var raw = auditRawData190_(rawData, accounts, audit);
  var daily = auditDailyData190_(dailyData, accounts, audit);

  reconcileRawAndDaily190_(raw.groups, daily.groups, audit);
  auditFreshness190_(raw.latestByPlatform, accounts, audit);
  addPassedCheckRows190_(audit);

  var finishedAt = new Date();
  var summary = buildDataQualitySummary190_(
    audit,
    accounts,
    raw,
    daily,
    startedAt,
    finishedAt
  );

  writeDataQualityReport190_(summary, audit.details);
  console.log(JSON.stringify(summary, null, 2));

  return summary;
}


/**
 * Alias retained for the project's step-test naming convention.
 */
function step190TestDataQualityAudit() {
  return step190RunDataQualityAudit();
}


function getDataQualityConfig190_() {
  var properties = PropertiesService.getScriptProperties();

  return {
    freshnessDays: parseAuditInteger190_(
      properties.getProperty("DATA_QUALITY_FRESHNESS_DAYS"),
      DATA_QUALITY_190.DEFAULT_FRESHNESS_DAYS,
      0
    ),
    maxDetails: parseAuditInteger190_(
      properties.getProperty("DATA_QUALITY_MAX_DETAILS"),
      DATA_QUALITY_190.DEFAULT_MAX_DETAILS,
      1
    )
  };
}


function parseAuditInteger190_(value, fallback, minimum) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  var parsed = Number(value);

  if (
    !Number.isFinite(parsed) ||
    Math.floor(parsed) !== parsed ||
    parsed < minimum
  ) {
    throw new Error(
      "Invalid Step 19A integer property value: " + value
    );
  }

  return parsed;
}


function createAuditState190_(config) {
  var stats = {};

  DATA_QUALITY_190.CHECKS.forEach(function (check) {
    stats[check] = {
      errors: 0,
      warnings: 0,
      details: 0
    };
  });

  return {
    config: config,
    stats: stats,
    details: [],
    errors: 0,
    warnings: 0,
    omittedDetails: 0
  };
}


function getDataQualitySourceSheets190_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var names = {
    accounts: getAuditSheetName190_("ACCOUNTS", "Accounts"),
    raw: getAuditSheetName190_("RAW", "Spend_Raw"),
    daily: getAuditSheetName190_("DAILY", "Spend_Daily")
  };
  var result = {};

  Object.keys(names).forEach(function (key) {
    var sheet = spreadsheet.getSheetByName(names[key]);

    if (!sheet) {
      throw new Error(
        "Step 19A requires sheet '" + names[key] + "'."
      );
    }

    result[key] = sheet;
  });

  return result;
}


function getAuditSheetName190_(key, fallback) {
  if (
    typeof MSH !== "undefined" &&
    MSH &&
    MSH.SHEETS &&
    MSH.SHEETS[key]
  ) {
    return String(MSH.SHEETS[key]);
  }

  return fallback;
}


function readAuditSheet190_(sheet, expectedHeaders, label, audit) {
  var width = expectedHeaders.length;
  var lastRow = sheet.getLastRow();
  var maxColumns = sheet.getMaxColumns();
  var actualHeaders = [];

  if (maxColumns >= width) {
    actualHeaders = sheet
      .getRange(1, 1, 1, width)
      .getDisplayValues()[0];
  } else {
    actualHeaders = sheet
      .getRange(1, 1, 1, maxColumns)
      .getDisplayValues()[0];
  }

  expectedHeaders.forEach(function (expected, index) {
    var actual = String(actualHeaders[index] || "").trim();

    if (actual !== expected) {
      addAuditDetail190_(audit, {
        severity: "ERROR",
        check: "SHEET_SCHEMA",
        expected: expected,
        actual: actual || "(blank)",
        detail:
          label + " header mismatch at column " + (index + 1) + "."
      });
    }
  });

  if (lastRow < 2 || maxColumns < width) {
    return {
      label: label,
      values: [],
      display: [],
      headerValid: maxColumns >= width
    };
  }

  return {
    label: label,
    values: sheet
      .getRange(2, 1, lastRow - 1, width)
      .getValues(),
    display: sheet
      .getRange(2, 1, lastRow - 1, width)
      .getDisplayValues(),
    headerValid: true
  };
}


function auditAccounts190_(data, audit) {
  var registry = {};
  var enabledPlatforms = {};
  var enabledAccounts = 0;
  var validRows = 0;

  data.values.forEach(function (row, index) {
    var display = data.display[index];
    var sheetRow = index + 2;

    if (isBlankAuditRow190_(display)) {
      return;
    }

    var platform = String(display[0] || "").trim();
    var accountId = String(display[1] || "").trim();
    var currency = String(display[3] || "").trim().toUpperCase();
    var enabled = Boolean(row[5]);

    if (!platform || !accountId) {
      addAuditDetail190_(audit, {
        severity: "ERROR",
        check: "ACCOUNT_REGISTRY",
        platform: platform,
        accountId: accountId,
        detail:
          "Accounts row " + sheetRow +
          " is missing Platform or Account ID."
      });
      return;
    }

    if (DATA_QUALITY_190.PLATFORMS.indexOf(platform) === -1) {
      addAuditDetail190_(audit, {
        severity: "ERROR",
        check: "ACCOUNT_REGISTRY",
        platform: platform,
        accountId: accountId,
        detail: "Unsupported platform in Accounts row " + sheetRow + "."
      });
    }

    if (currency && !/^[A-Z]{3}$/.test(currency)) {
      addAuditDetail190_(audit, {
        severity: "ERROR",
        check: "ACCOUNT_REGISTRY",
        platform: platform,
        accountId: accountId,
        expected: "Three-letter currency code",
        actual: currency,
        detail: "Invalid currency in Accounts row " + sheetRow + "."
      });
    }

    var key = createAuditAccountKey190_(platform, accountId);

    if (registry[key]) {
      addAuditDetail190_(audit, {
        severity: "ERROR",
        check: "ACCOUNT_REGISTRY",
        platform: platform,
        accountId: accountId,
        detail:
          "Duplicate account registry key at rows " +
          registry[key].row + " and " + sheetRow + "."
      });
    } else {
      registry[key] = {
        row: sheetRow,
        platform: platform,
        accountId: accountId,
        currency: currency,
        enabled: enabled
      };
      validRows += 1;
    }

    if (enabled) {
      enabledAccounts += 1;
      enabledPlatforms[platform] = true;
    }
  });

  return {
    registry: registry,
    enabledPlatforms: enabledPlatforms,
    enabledAccounts: enabledAccounts,
    rows: validRows
  };
}


function auditRawData190_(data, accounts, audit) {
  var recordKeys = {};
  var groups = {};
  var latestByPlatform = {};
  var validRows = 0;

  data.values.forEach(function (row, index) {
    var display = data.display[index];
    var sheetRow = index + 2;

    if (isBlankAuditRow190_(display)) {
      return;
    }

    var date = safeAuditDate190_(row[0], display[0]);
    var platform = String(display[1] || "").trim();
    var accountId = String(display[2] || "").trim();
    var campaignId = String(display[4] || "").trim();
    var currency = String(display[6] || "").trim().toUpperCase();
    var recordKey = String(display[9] || "").trim();
    var requiredMissing = [];

    if (!date) {
      requiredMissing.push("Date");
    }
    if (!platform) {
      requiredMissing.push("Platform");
    }
    if (!accountId) {
      requiredMissing.push("Account ID");
    }
    if (!campaignId) {
      requiredMissing.push("Campaign ID");
    }
    if (!currency) {
      requiredMissing.push("Currency");
    }
    if (!recordKey) {
      requiredMissing.push("Record Key");
    }

    if (requiredMissing.length) {
      addAuditDetail190_(audit, {
        severity: "ERROR",
        check: "RAW_REQUIRED_FIELDS",
        platform: platform,
        accountId: accountId,
        date: date,
        rawRow: sheetRow,
        detail: "Missing: " + requiredMissing.join(", ") + "."
      });
    }

    if (
      platform &&
      DATA_QUALITY_190.PLATFORMS.indexOf(platform) === -1
    ) {
      addAuditDetail190_(audit, {
        severity: "ERROR",
        check: "RAW_REQUIRED_FIELDS",
        platform: platform,
        accountId: accountId,
        date: date,
        rawRow: sheetRow,
        detail: "Unsupported platform."
      });
    }

    if (currency && !/^[A-Z]{3}$/.test(currency)) {
      addAuditDetail190_(audit, {
        severity: "ERROR",
        check: "RAW_REQUIRED_FIELDS",
        platform: platform,
        accountId: accountId,
        date: date,
        rawRow: sheetRow,
        expected: "Three-letter currency code",
        actual: currency,
        detail: "Invalid currency."
      });
    }

    if (platform && accountId) {
      var accountKey = createAuditAccountKey190_(platform, accountId);

      if (!accounts.registry[accountKey]) {
        addAuditDetail190_(audit, {
          severity: "WARNING",
          check: "ACCOUNT_REGISTRY",
          platform: platform,
          accountId: accountId,
          date: date,
          rawRow: sheetRow,
          detail: "Spend_Raw account is not present in Accounts."
        });
      }
    }

    if (recordKey) {
      if (recordKeys[recordKey]) {
        addAuditDetail190_(audit, {
          severity: "ERROR",
          check: "RAW_RECORD_KEYS",
          platform: platform,
          accountId: accountId,
          date: date,
          rawRow: sheetRow,
          expected: "Unique Record Key",
          actual: recordKey,
          detail:
            "Duplicate Record Key also exists at raw row " +
            recordKeys[recordKey] + "."
        });
      } else {
        recordKeys[recordKey] = sheetRow;
      }

      if (date && platform && accountId && campaignId) {
        var expectedKey = [
          date,
          platform,
          accountId,
          campaignId
        ].join("|");

        if (recordKey !== expectedKey) {
          addAuditDetail190_(audit, {
            severity: "ERROR",
            check: "RAW_RECORD_KEYS",
            platform: platform,
            accountId: accountId,
            date: date,
            rawRow: sheetRow,
            expected: expectedKey,
            actual: recordKey,
            detail: "Record Key does not match row dimensions."
          });
        }
      }
    }

    var metricNames = [
      "Spend",
      "Impressions",
      "Clicks",
      "Conversions",
      "App Installs"
    ];
    var metricIndexes = [7, 10, 11, 12, 13];
    var metricValues = {};
    var metricsValid = true;

    metricIndexes.forEach(function (columnIndex, metricIndex) {
      var metricName = metricNames[metricIndex];
      var result = parseAuditMetric190_(row[columnIndex]);

      if (!result.valid) {
        metricsValid = false;
        addAuditDetail190_(audit, {
          severity: "ERROR",
          check: "RAW_METRICS",
          platform: platform,
          accountId: accountId,
          date: date,
          rawRow: sheetRow,
          metric: metricName,
          expected: "Non-negative number",
          actual: String(display[columnIndex] || "(blank)"),
          detail: "Invalid base metric in Spend_Raw."
        });
      } else {
        metricValues[metricName] = result.value;
      }
    });

    if (
      date &&
      platform &&
      accountId &&
      currency &&
      metricsValid
    ) {
      var groupKey = createAuditDailyKey190_(
        date,
        platform,
        accountId,
        currency
      );

      if (!groups[groupKey]) {
        groups[groupKey] = createAuditMetricGroup190_(
          date,
          platform,
          accountId,
          currency
        );
      }

      groups[groupKey].rawRows.push(sheetRow);
      groups[groupKey].spend += metricValues.Spend;
      groups[groupKey].impressions += metricValues.Impressions;
      groups[groupKey].clicks += metricValues.Clicks;
      groups[groupKey].conversions += metricValues.Conversions;
      groups[groupKey].appInstalls += metricValues["App Installs"];
      validRows += 1;

      if (
        !latestByPlatform[platform] ||
        date > latestByPlatform[platform]
      ) {
        latestByPlatform[platform] = date;
      }
    }
  });

  return {
    groups: groups,
    latestByPlatform: latestByPlatform,
    rows: data.values.length,
    validRows: validRows
  };
}


function auditDailyData190_(data, accounts, audit) {
  var groups = {};
  var validRows = 0;

  data.values.forEach(function (row, index) {
    var display = data.display[index];
    var sheetRow = index + 2;

    if (isBlankAuditRow190_(display)) {
      return;
    }

    var date = safeAuditDate190_(row[0], display[0]);
    var platform = String(display[1] || "").trim();
    var accountId = String(display[2] || "").trim();
    var currency = String(display[4] || "").trim().toUpperCase();
    var missing = [];

    if (!date) {
      missing.push("Date");
    }
    if (!platform) {
      missing.push("Platform");
    }
    if (!accountId) {
      missing.push("Account ID");
    }
    if (!currency) {
      missing.push("Currency");
    }

    if (missing.length) {
      addAuditDetail190_(audit, {
        severity: "ERROR",
        check: "DAILY_REQUIRED_FIELDS",
        platform: platform,
        accountId: accountId,
        date: date,
        dailyRow: sheetRow,
        detail: "Missing: " + missing.join(", ") + "."
      });
    }

    if (
      platform &&
      DATA_QUALITY_190.PLATFORMS.indexOf(platform) === -1
    ) {
      addAuditDetail190_(audit, {
        severity: "ERROR",
        check: "DAILY_REQUIRED_FIELDS",
        platform: platform,
        accountId: accountId,
        date: date,
        dailyRow: sheetRow,
        detail: "Unsupported platform."
      });
    }

    if (currency && !/^[A-Z]{3}$/.test(currency)) {
      addAuditDetail190_(audit, {
        severity: "ERROR",
        check: "DAILY_REQUIRED_FIELDS",
        platform: platform,
        accountId: accountId,
        date: date,
        dailyRow: sheetRow,
        expected: "Three-letter currency code",
        actual: currency,
        detail: "Invalid currency."
      });
    }

    var metricDefinitions = [
      { name: "Spend", index: 5, property: "spend" },
      { name: "Impressions", index: 7, property: "impressions" },
      { name: "Clicks", index: 8, property: "clicks" },
      { name: "Conversions", index: 9, property: "conversions" },
      { name: "App Installs", index: 10, property: "appInstalls" }
    ];
    var metrics = {};
    var metricsValid = true;

    metricDefinitions.forEach(function (definition) {
      var result = parseAuditMetric190_(row[definition.index]);

      if (!result.valid) {
        metricsValid = false;
        addAuditDetail190_(audit, {
          severity: "ERROR",
          check: "DAILY_METRICS",
          platform: platform,
          accountId: accountId,
          date: date,
          dailyRow: sheetRow,
          metric: definition.name,
          expected: "Non-negative number",
          actual: String(display[definition.index] || "(blank)"),
          detail: "Invalid base metric in Spend_Daily."
        });
      } else {
        metrics[definition.property] = result.value;
      }
    });

    if (
      date &&
      platform &&
      accountId &&
      currency &&
      metricsValid
    ) {
      var groupKey = createAuditDailyKey190_(
        date,
        platform,
        accountId,
        currency
      );

      if (groups[groupKey]) {
        addAuditDetail190_(audit, {
          severity: "ERROR",
          check: "DAILY_KEYS",
          platform: platform,
          accountId: accountId,
          date: date,
          dailyRow: sheetRow,
          expected: "One daily row per date/platform/account/currency",
          actual: groupKey,
          detail:
            "Duplicate Spend_Daily key also exists at daily row " +
            groups[groupKey].dailyRow + "."
        });
      } else {
        groups[groupKey] = createAuditMetricGroup190_(
          date,
          platform,
          accountId,
          currency
        );
        groups[groupKey].dailyRow = sheetRow;
        groups[groupKey].spend = metrics.spend;
        groups[groupKey].impressions = metrics.impressions;
        groups[groupKey].clicks = metrics.clicks;
        groups[groupKey].conversions = metrics.conversions;
        groups[groupKey].appInstalls = metrics.appInstalls;
        validRows += 1;

        auditDerivedMetrics190_(
          row,
          display,
          groups[groupKey],
          audit
        );
      }
    }
  });

  return {
    groups: groups,
    rows: data.values.length,
    validRows: validRows
  };
}


function auditDerivedMetrics190_(row, display, group, audit) {
  var expected = calculateAuditDerivedMetrics190_(group);
  var definitions = [
    { name: "CTR", index: 11, property: "ctr" },
    { name: "CPC", index: 12, property: "cpc" },
    { name: "CPM", index: 13, property: "cpm" },
    { name: "CPA", index: 14, property: "cpa" },
    { name: "CVR", index: 15, property: "cvr" },
    { name: "CPI", index: 16, property: "cpi" }
  ];

  definitions.forEach(function (definition) {
    var parsed = parseAuditMetric190_(row[definition.index]);

    if (!parsed.valid) {
      addAuditDetail190_(audit, {
        severity: "ERROR",
        check: "DERIVED_METRICS",
        platform: group.platform,
        accountId: group.accountId,
        date: group.date,
        dailyRow: group.dailyRow,
        metric: definition.name,
        expected: expected[definition.property],
        actual: String(display[definition.index] || "(blank)"),
        detail: "Derived metric is not a non-negative number."
      });
      return;
    }

    var expectedValue = expected[definition.property];
    var actualValue = parsed.value;

    if (
      !approximatelyEqualAudit190_(
        expectedValue,
        actualValue,
        DATA_QUALITY_190.DERIVED_TOLERANCE
      )
    ) {
      addAuditDetail190_(audit, {
        severity: "ERROR",
        check: "DERIVED_METRICS",
        platform: group.platform,
        accountId: group.accountId,
        date: group.date,
        dailyRow: group.dailyRow,
        metric: definition.name,
        expected: expectedValue,
        actual: actualValue,
        difference: actualValue - expectedValue,
        detail: "Derived metric does not match aggregate base metrics."
      });
    }
  });
}


function reconcileRawAndDaily190_(rawGroups, dailyGroups, audit) {
  var allKeys = {};

  Object.keys(rawGroups).forEach(function (key) {
    allKeys[key] = true;
  });
  Object.keys(dailyGroups).forEach(function (key) {
    allKeys[key] = true;
  });

  Object.keys(allKeys).forEach(function (key) {
    var raw = rawGroups[key];
    var daily = dailyGroups[key];

    if (!raw) {
      addAuditDetail190_(audit, {
        severity: "ERROR",
        check: "RECONCILIATION",
        platform: daily.platform,
        accountId: daily.accountId,
        date: daily.date,
        dailyRow: daily.dailyRow,
        expected: "Matching Spend_Raw group",
        actual: "Spend_Daily only",
        detail: "Spend_Daily contains a group absent from Spend_Raw."
      });
      return;
    }

    if (!daily) {
      addAuditDetail190_(audit, {
        severity: "ERROR",
        check: "RECONCILIATION",
        platform: raw.platform,
        accountId: raw.accountId,
        date: raw.date,
        rawRow: raw.rawRows.join(", "),
        expected: "Matching Spend_Daily group",
        actual: "Spend_Raw only",
        detail: "Spend_Raw group is missing from Spend_Daily."
      });
      return;
    }

    var metrics = [
      { name: "Spend", property: "spend" },
      { name: "Impressions", property: "impressions" },
      { name: "Clicks", property: "clicks" },
      { name: "Conversions", property: "conversions" },
      { name: "App Installs", property: "appInstalls" }
    ];

    metrics.forEach(function (metric) {
      var expectedValue = raw[metric.property];
      var actualValue = daily[metric.property];

      if (
        !approximatelyEqualAudit190_(
          expectedValue,
          actualValue,
          DATA_QUALITY_190.BASE_TOLERANCE
        )
      ) {
        addAuditDetail190_(audit, {
          severity: "ERROR",
          check: "RECONCILIATION",
          platform: raw.platform,
          accountId: raw.accountId,
          date: raw.date,
          rawRow: raw.rawRows.join(", "),
          dailyRow: daily.dailyRow,
          metric: metric.name,
          expected: expectedValue,
          actual: actualValue,
          difference: actualValue - expectedValue,
          detail: "Spend_Daily does not reconcile to Spend_Raw."
        });
      }
    });
  });
}


function auditFreshness190_(latestByPlatform, accounts, audit) {
  var today = formatAuditDate190_(new Date());
  var todayNumber = auditDateNumber190_(today);
  var enabledPlatforms = Object.keys(accounts.enabledPlatforms);

  enabledPlatforms.forEach(function (platform) {
    var latest = latestByPlatform[platform];

    if (!latest) {
      addAuditDetail190_(audit, {
        severity: "WARNING",
        check: "FRESHNESS",
        platform: platform,
        expected:
          "Data within " + audit.config.freshnessDays + " day(s)",
        actual: "No Spend_Raw data",
        detail: "Enabled platform has no valid performance rows."
      });
      return;
    }

    var ageDays = Math.round(
      (todayNumber - auditDateNumber190_(latest)) / 86400000
    );

    if (ageDays < 0) {
      addAuditDetail190_(audit, {
        severity: "ERROR",
        check: "FRESHNESS",
        platform: platform,
        date: latest,
        expected: "Date not later than " + today,
        actual: latest,
        difference: ageDays,
        detail: "Latest platform date is in the future."
      });
    } else if (ageDays > audit.config.freshnessDays) {
      addAuditDetail190_(audit, {
        severity: "WARNING",
        check: "FRESHNESS",
        platform: platform,
        date: latest,
        expected:
          "At most " + audit.config.freshnessDays + " day(s) old",
        actual: ageDays + " day(s) old",
        difference: ageDays,
        detail: "Enabled platform data may be stale."
      });
    }
  });
}


function addPassedCheckRows190_(audit) {
  DATA_QUALITY_190.CHECKS.forEach(function (check) {
    var stat = audit.stats[check];

    if (stat.errors === 0 && stat.warnings === 0) {
      audit.details.push({
        severity: "PASS",
        check: check,
        platform: "",
        accountId: "",
        date: "",
        rawRow: "",
        dailyRow: "",
        metric: "",
        expected: "",
        actual: "",
        difference: "",
        detail: "Check passed."
      });
    }
  });
}


function addAuditDetail190_(audit, detail) {
  var severity = String(detail.severity || "ERROR").toUpperCase();
  var check = String(detail.check || "UNKNOWN");

  if (!audit.stats[check]) {
    audit.stats[check] = {
      errors: 0,
      warnings: 0,
      details: 0
    };
  }

  if (severity === "ERROR") {
    audit.errors += 1;
    audit.stats[check].errors += 1;
  } else if (severity === "WARNING") {
    audit.warnings += 1;
    audit.stats[check].warnings += 1;
  }

  audit.stats[check].details += 1;

  if (audit.details.length >= audit.config.maxDetails) {
    audit.omittedDetails += 1;
    return;
  }

  audit.details.push({
    severity: severity,
    check: check,
    platform: detail.platform || "",
    accountId: detail.accountId || "",
    date: detail.date || "",
    rawRow: detail.rawRow || "",
    dailyRow: detail.dailyRow || "",
    metric: detail.metric || "",
    expected:
      detail.expected === undefined ? "" : detail.expected,
    actual:
      detail.actual === undefined ? "" : detail.actual,
    difference:
      detail.difference === undefined ? "" : detail.difference,
    detail: detail.detail || ""
  });
}


function buildDataQualitySummary190_(
  audit,
  accounts,
  raw,
  daily,
  startedAt,
  finishedAt
) {
  var status = audit.errors > 0
    ? "FAILED"
    : audit.warnings > 0
      ? "WARNING"
      : "SUCCESS";
  var failedChecks = 0;
  var warningChecks = 0;
  var passedChecks = 0;

  DATA_QUALITY_190.CHECKS.forEach(function (check) {
    var stat = audit.stats[check];

    if (stat.errors > 0) {
      failedChecks += 1;
    } else if (stat.warnings > 0) {
      warningChecks += 1;
    } else {
      passedChecks += 1;
    }
  });

  return {
    status: status,
    step: DATA_QUALITY_190.STEP,
    runAt: finishedAt.toISOString(),
    durationSeconds:
      Math.round((finishedAt - startedAt) / 10) / 100,
    errors: audit.errors,
    warnings: audit.warnings,
    failedChecks: failedChecks,
    warningChecks: warningChecks,
    passedChecks: passedChecks,
    accounts: accounts.rows,
    enabledAccounts: accounts.enabledAccounts,
    enabledPlatforms:
      Object.keys(accounts.enabledPlatforms).length,
    rawRows: raw.rows,
    validRawRows: raw.validRows,
    dailyRows: daily.rows,
    validDailyRows: daily.validRows,
    reconciliationGroups: Object.keys(raw.groups).length,
    freshnessThresholdDays: audit.config.freshnessDays,
    reportSheet: DATA_QUALITY_190.REPORT_SHEET,
    detailsWritten: audit.details.length,
    detailsOmitted: audit.omittedDetails,
    sourceSheetsModified: false,
    secretsExposed: false
  };
}


function writeDataQualityReport190_(summary, details) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(
    DATA_QUALITY_190.REPORT_SHEET
  );

  if (!sheet) {
    sheet = spreadsheet.insertSheet(
      DATA_QUALITY_190.REPORT_SHEET
    );
  }

  ensureAuditSheetSize190_(
    sheet,
    Math.max(details.length + 5, 20),
    DATA_QUALITY_190.REPORT_HEADERS.length
  );
  sheet.clear();

  var width = DATA_QUALITY_190.REPORT_HEADERS.length;
  sheet.getRange(1, 1, 4, width).breakApart();
  sheet.getRange(1, 1, 1, width).merge();
  sheet
    .getRange(1, 1)
    .setValue("Marketing Performance Data Quality — Step 19A")
    .setFontSize(14)
    .setFontWeight("bold")
    .setFontColor("#FFFFFF")
    .setBackground("#1F4E78");

  sheet.getRange(2, 1, 1, width).setValues([[
    "Status",
    summary.status,
    "Errors",
    summary.errors,
    "Warnings",
    summary.warnings,
    "Raw rows",
    summary.rawRows,
    "Daily rows",
    summary.dailyRows,
    "Run at",
    new Date(summary.runAt)
  ]]);

  sheet
    .getRange(2, 1, 1, width)
    .setFontWeight("bold")
    .setBackground("#D9EAF7");

  sheet
    .getRange(4, 1, 1, width)
    .setValues([DATA_QUALITY_190.REPORT_HEADERS.slice()])
    .setFontWeight("bold")
    .setFontColor("#FFFFFF")
    .setBackground("#5B9BD5");

  var severityOrder = {
    ERROR: 0,
    WARNING: 1,
    PASS: 2
  };

  var sorted = details.slice().sort(function (a, b) {
    return (
      severityOrder[a.severity] - severityOrder[b.severity] ||
      String(a.check).localeCompare(String(b.check)) ||
      String(a.platform).localeCompare(String(b.platform)) ||
      String(a.date).localeCompare(String(b.date))
    );
  });

  if (sorted.length) {
    var rows = sorted.map(function (detail) {
      return [
        detail.severity,
        detail.check,
        detail.platform,
        detail.accountId,
        detail.date,
        detail.rawRow,
        detail.dailyRow,
        detail.metric,
        detail.expected,
        detail.actual,
        detail.difference,
        detail.detail
      ];
    });

    sheet.getRange(5, 1, rows.length, width).setValues(rows);
    applyAuditSeverityFormatting190_(sheet, rows.length);
  }

  sheet.setFrozenRows(4);
  sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 4), width)
    .setVerticalAlignment("middle");
  sheet.getRange(5, 1, Math.max(sorted.length, 1), width)
    .setWrap(true);
  sheet.setColumnWidths(1, 1, 85);
  sheet.setColumnWidths(2, 1, 165);
  sheet.setColumnWidths(3, 1, 130);
  sheet.setColumnWidths(4, 1, 150);
  sheet.setColumnWidths(5, 1, 95);
  sheet.setColumnWidths(6, 2, 75);
  sheet.setColumnWidths(8, 1, 110);
  sheet.setColumnWidths(9, 3, 130);
  sheet.setColumnWidths(12, 1, 330);
  sheet.getRange(2, 12).setNumberFormat("yyyy-mm-dd hh:mm:ss");
}


function applyAuditSeverityFormatting190_(sheet, rowCount) {
  var range = sheet.getRange(5, 1, rowCount, 1);
  var rules = [
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("ERROR")
      .setBackground("#F4CCCC")
      .setFontColor("#990000")
      .setBold(true)
      .setRanges([range])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("WARNING")
      .setBackground("#FFF2CC")
      .setFontColor("#7F6000")
      .setBold(true)
      .setRanges([range])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("PASS")
      .setBackground("#D9EAD3")
      .setFontColor("#274E13")
      .setBold(true)
      .setRanges([range])
      .build()
  ];

  sheet.setConditionalFormatRules(rules);
}


function ensureAuditSheetSize190_(sheet, requiredRows, requiredColumns) {
  if (sheet.getMaxRows() < requiredRows) {
    sheet.insertRowsAfter(
      sheet.getMaxRows(),
      requiredRows - sheet.getMaxRows()
    );
  }

  if (sheet.getMaxColumns() < requiredColumns) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      requiredColumns - sheet.getMaxColumns()
    );
  }
}


function createAuditMetricGroup190_(
  date,
  platform,
  accountId,
  currency
) {
  return {
    date: date,
    platform: platform,
    accountId: accountId,
    currency: currency,
    spend: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    appInstalls: 0,
    rawRows: [],
    dailyRow: ""
  };
}


function calculateAuditDerivedMetrics190_(metrics) {
  return {
    ctr: metrics.impressions > 0
      ? roundAuditMetric190_(
          metrics.clicks / metrics.impressions * 100,
          4
        )
      : 0,
    cpc: metrics.clicks > 0
      ? roundAuditMetric190_(metrics.spend / metrics.clicks, 4)
      : 0,
    cpm: metrics.impressions > 0
      ? roundAuditMetric190_(
          metrics.spend / metrics.impressions * 1000,
          4
        )
      : 0,
    cpa: metrics.conversions > 0
      ? roundAuditMetric190_(
          metrics.spend / metrics.conversions,
          4
        )
      : 0,
    cvr: metrics.clicks > 0
      ? roundAuditMetric190_(
          metrics.conversions / metrics.clicks * 100,
          4
        )
      : 0,
    cpi: metrics.appInstalls > 0
      ? roundAuditMetric190_(
          metrics.spend / metrics.appInstalls,
          4
        )
      : 0
  };
}


function roundAuditMetric190_(value, decimals) {
  var factor = Math.pow(10, decimals);

  return Math.round(
    (Number(value) + Number.EPSILON) * factor
  ) / factor;
}


function parseAuditMetric190_(value) {
  if (value === "" || value === null || value === undefined) {
    return { valid: false, value: null };
  }

  var numberValue = Number(value);

  return {
    valid: Number.isFinite(numberValue) && numberValue >= 0,
    value: numberValue
  };
}


function approximatelyEqualAudit190_(expected, actual, tolerance) {
  var scale = Math.max(1, Math.abs(Number(expected || 0)));

  return Math.abs(Number(actual) - Number(expected)) <=
    Math.max(tolerance, scale * 0.00000001);
}


function createAuditAccountKey190_(platform, accountId) {
  return String(platform).trim() + "|" + String(accountId).trim();
}


function createAuditDailyKey190_(
  date,
  platform,
  accountId,
  currency
) {
  return [date, platform, accountId, currency].join("|");
}


function safeAuditDate190_(value, displayValue) {
  try {
    return formatAuditDate190_(value || displayValue);
  } catch (error) {
    return "";
  }
}


function formatAuditDate190_(value) {
  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return value;
  }

  var date = Object.prototype.toString.call(value) === "[object Date]"
    ? value
    : new Date(value);

  if (isNaN(date.getTime())) {
    throw new Error("Invalid audit date: " + value);
  }

  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    "yyyy-MM-dd"
  );
}


function auditDateNumber190_(yyyyMmDd) {
  var parts = String(yyyyMmDd).split("-");

  return Date.UTC(
    Number(parts[0]),
    Number(parts[1]) - 1,
    Number(parts[2])
  );
}


function isBlankAuditRow190_(displayRow) {
  return displayRow.every(function (value) {
    return String(value || "").trim() === "";
  });
}
