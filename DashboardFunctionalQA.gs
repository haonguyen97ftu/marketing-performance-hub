/**
 * Marketing Performance Hub
 * Step 19B — Dashboard functional QA.
 *
 * Read-only sources:
 *   - Spend_Raw
 *   - Spend_Daily
 *   - Dashboard
 *
 * The only sheet written by this file is Dashboard_QA. The test recalculates
 * dashboard totals from Spend_Daily instead of trusting the rendered values.
 */

const DASHBOARD_QA_191 = Object.freeze({
  SHEET_NAME: "Dashboard_QA",
  TITLE: "Marketing Spend Hub",
  PLATFORM_HEADERS: Object.freeze([
    "Platform",
    "Currency",
    "Spend",
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
  DAILY_HEADERS: Object.freeze([
    "Date",
    "Platform",
    "Currency",
    "Spend",
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
    "Scope",
    "Expected",
    "Actual",
    "Result",
    "Detail",
    "Run At"
  ]),
  BASE_TOLERANCE: 0.000001,
  DERIVED_TOLERANCE: 0.0001
});

/**
 * Main Step 19B entry point.
 */
function step191RunDashboardFunctionalQA() {
  const startedAt = new Date();
  const checks = [];
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const dashboard = requireSheet_(MSH.SHEETS.DASHBOARD);
  const daily = requireSheet_(MSH.SHEETS.DAILY);
  const raw = requireSheet_(MSH.SHEETS.RAW);

  ensureDailyPerformanceSchema_(daily);

  const dailyRows = daily.getLastRow() >= 2
    ? daily.getRange(
        2,
        1,
        daily.getLastRow() - 1,
        DAILY_PERFORMANCE_COLUMNS.length
      ).getValues()
    : [];

  const expected = buildDashboardExpectations191_(dailyRows);
  const platformCount = expected.platformRows.length;
  const dailyCount = expected.dailyRows.length;
  const expectedDailyHeaderRow = 10 + platformCount;

  addDashboardCheck191_(
    checks,
    dashboard.getRange("A1").getDisplayValue() === DASHBOARD_QA_191.TITLE,
    "ERROR",
    "DASHBOARD_TITLE",
    "Dashboard!A1",
    DASHBOARD_QA_191.TITLE,
    dashboard.getRange("A1").getDisplayValue(),
    "Dashboard title must identify the Marketing Spend Hub."
  );

  validateDashboardSummary191_(
    checks,
    dashboard,
    raw,
    dailyRows.length
  );

  validateHeaderRow191_(
    checks,
    dashboard,
    7,
    DASHBOARD_QA_191.PLATFORM_HEADERS,
    "PLATFORM_HEADERS"
  );

  validateHeaderRow191_(
    checks,
    dashboard,
    expectedDailyHeaderRow,
    DASHBOARD_QA_191.DAILY_HEADERS,
    "DAILY_HEADERS"
  );

  validateDashboardTable191_(
    checks,
    dashboard,
    8,
    expected.platformRows,
    "PLATFORM_TOTALS",
    2
  );

  validateDashboardTable191_(
    checks,
    dashboard,
    expectedDailyHeaderRow + 1,
    expected.dailyRows,
    "DAILY_TOTALS",
    3
  );

  const charts = dashboard.getCharts();
  const chartExpected = dailyCount > 0 ? 1 : 0;

  addDashboardCheck191_(
    checks,
    dailyCount === 0 || charts.length >= chartExpected,
    dailyCount > 0 ? "ERROR" : "INFO",
    "DASHBOARD_CHART",
    "Dashboard embedded charts",
    dailyCount > 0 ? "At least 1" : "0 or more",
    String(charts.length),
    dailyCount > 0
      ? "A daily spend chart must be present when daily data exists."
      : "No daily data exists, so a chart is optional."
  );

  addDashboardCheck191_(
    checks,
    dashboard.getFrozenRows() >= 1,
    "WARNING",
    "DASHBOARD_LAYOUT",
    "Frozen rows",
    "At least 1",
    String(dashboard.getFrozenRows()),
    "Keeping the title row frozen improves navigation on long dashboards."
  );

  const reportSheet = getOrCreateDashboardQaSheet191_(spreadsheet);
  writeDashboardQaReport191_(reportSheet, checks, startedAt, {
    platformGroups: platformCount,
    dailyGroups: dailyCount,
    chartCount: charts.length
  });

  const errors = checks.filter(function(check) {
    return check.severity === "ERROR" && !check.passed;
  }).length;
  const warnings = checks.filter(function(check) {
    return check.severity === "WARNING" && !check.passed;
  }).length;
  const finishedAt = new Date();
  const result = {
    status: errors > 0
      ? "FAILED"
      : warnings > 0
        ? "WARNING"
        : "SUCCESS",
    errors: errors,
    warnings: warnings,
    checks: checks.length,
    platformGroups: platformCount,
    dailyGroups: dailyCount,
    chartCount: charts.length,
    durationSeconds: roundDashboardQa191_(
      (finishedAt.getTime() - startedAt.getTime()) / 1000,
      3
    ),
    sourceSheetsModified: false,
    secretsExposed: false
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function buildDashboardExpectations191_(rows) {
  const platformGroups = new Map();
  const dailyGroups = new Map();

  rows.forEach(function(row) {
    const date = formatSpendDate_(row[DAILY_PERFORMANCE_INDEX.DATE]);
    const platform = String(
      row[DAILY_PERFORMANCE_INDEX.PLATFORM] || ""
    );
    const currency = String(
      row[DAILY_PERFORMANCE_INDEX.CURRENCY] || ""
    );
    const metrics = {
      spend: Number(row[DAILY_PERFORMANCE_INDEX.SPEND] || 0),
      impressions: Number(
        row[DAILY_PERFORMANCE_INDEX.IMPRESSIONS] || 0
      ),
      clicks: Number(row[DAILY_PERFORMANCE_INDEX.CLICKS] || 0),
      conversions: Number(
        row[DAILY_PERFORMANCE_INDEX.CONVERSIONS] || 0
      ),
      appInstalls: Number(
        row[DAILY_PERFORMANCE_INDEX.APP_INSTALLS] || 0
      )
    };

    const platformKey = [platform, currency].join("|");
    const dailyKey = [date, platform, currency].join("|");

    addDashboardQaMetrics191_(platformGroups, platformKey, metrics);
    addDashboardQaMetrics191_(dailyGroups, dailyKey, metrics);
  });

  const platformRows = Array.from(platformGroups.entries())
    .map(function(entry) {
      const parts = entry[0].split("|");
      return dashboardQaMetricRow191_(
        [parts[0], parts[1]],
        entry[1]
      );
    })
    .sort(function(a, b) {
      return a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]);
    });

  const dailyRows = Array.from(dailyGroups.entries())
    .map(function(entry) {
      const parts = entry[0].split("|");
      return dashboardQaMetricRow191_(
        [parts[0], parts[1], parts[2]],
        entry[1]
      );
    })
    .sort(function(a, b) {
      return b[0].localeCompare(a[0]) || a[1].localeCompare(b[1]);
    });

  return {
    platformRows: platformRows,
    dailyRows: dailyRows
  };
}

function addDashboardQaMetrics191_(map, key, metrics) {
  if (!map.has(key)) {
    map.set(key, {
      spend: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      appInstalls: 0
    });
  }

  const target = map.get(key);
  target.spend += metrics.spend;
  target.impressions += metrics.impressions;
  target.clicks += metrics.clicks;
  target.conversions += metrics.conversions;
  target.appInstalls += metrics.appInstalls;
}

function dashboardQaMetricRow191_(dimensions, metrics) {
  const derived = calculateDerivedPerformanceMetrics_(metrics);

  return dimensions.concat([
    metrics.spend,
    metrics.impressions,
    metrics.clicks,
    metrics.conversions,
    metrics.appInstalls,
    derived.ctr,
    derived.cpc,
    derived.cpm,
    derived.cpa,
    derived.cvr,
    derived.cpi
  ]);
}

function validateDashboardSummary191_(checks, dashboard, raw, dailyCount) {
  const actualRawCount = Math.max(raw.getLastRow() - 1, 0);
  const actualEnabledAccounts = getEnabledAccounts_().length;

  const summaryChecks = [
    ["Dashboard!A3", "Last refreshed", dashboard.getRange("A3").getDisplayValue()],
    ["Dashboard!D3", "Version", dashboard.getRange("D3").getDisplayValue()],
    ["Dashboard!A4", "Raw records", dashboard.getRange("A4").getDisplayValue()],
    ["Dashboard!B4", actualRawCount, dashboard.getRange("B4").getValue()],
    ["Dashboard!D4", "Daily groups", dashboard.getRange("D4").getDisplayValue()],
    ["Dashboard!E4", dailyCount, dashboard.getRange("E4").getValue()],
    ["Dashboard!A5", "Enabled accounts", dashboard.getRange("A5").getDisplayValue()],
    ["Dashboard!B5", actualEnabledAccounts, dashboard.getRange("B5").getValue()],
    ["Dashboard!D5", "Platforms", dashboard.getRange("D5").getDisplayValue()],
    ["Dashboard!E5", MSH.PLATFORMS.length, dashboard.getRange("E5").getValue()]
  ];

  summaryChecks.forEach(function(item) {
    addDashboardCheck191_(
      checks,
      String(item[1]) === String(item[2]),
      "ERROR",
      "DASHBOARD_SUMMARY",
      item[0],
      item[1],
      item[2],
      "Dashboard summary must match the current source sheets."
    );
  });

  addDashboardCheck191_(
    checks,
    dashboard.getRange("E3").getDisplayValue() === String(MSH.VERSION),
    "ERROR",
    "DASHBOARD_SUMMARY",
    "Dashboard!E3",
    MSH.VERSION,
    dashboard.getRange("E3").getDisplayValue(),
    "Displayed dashboard version must match the installed project version."
  );

  const refreshedAt = dashboard.getRange("B3").getValue();
  addDashboardCheck191_(
    checks,
    refreshedAt instanceof Date && !isNaN(refreshedAt.getTime()),
    "ERROR",
    "DASHBOARD_SUMMARY",
    "Dashboard!B3",
    "Valid refresh timestamp",
    String(refreshedAt),
    "Dashboard must show when it was last rebuilt."
  );
}

function validateHeaderRow191_(checks, sheet, row, expected, checkName) {
  const actual = sheet
    .getRange(row, 1, 1, expected.length)
    .getDisplayValues()[0];

  expected.forEach(function(header, index) {
    addDashboardCheck191_(
      checks,
      String(actual[index]).trim() === header,
      "ERROR",
      checkName,
      sheet.getName() + "!" + columnLetter191_(index + 1) + row,
      header,
      actual[index],
      "Dashboard table header mismatch."
    );
  });
}

function validateDashboardTable191_(
  checks,
  dashboard,
  startRow,
  expectedRows,
  checkName,
  dimensionCount
) {
  if (!expectedRows.length) {
    addDashboardCheck191_(
      checks,
      true,
      "INFO",
      checkName,
      "No source groups",
      "No rendered rows required",
      "No rendered rows required",
      "Source data is empty."
    );
    return;
  }

  const actualRows = dashboard
    .getRange(startRow, 1, expectedRows.length, expectedRows[0].length)
    .getValues();

  expectedRows.forEach(function(expectedRow, rowIndex) {
    const actualRow = actualRows[rowIndex];
    const rowLabel = expectedRow.slice(0, dimensionCount).join(" | ");

    for (let column = 0; column < dimensionCount; column += 1) {
      const expectedDimension = normalizeDashboardDimension191_(
        expectedRow[column],
        checkName,
        column
      );
      const actualDimension = normalizeDashboardDimension191_(
        actualRow[column],
        checkName,
        column
      );

      addDashboardCheck191_(
        checks,
        actualDimension === expectedDimension,
        "ERROR",
        checkName,
        rowLabel + " / dimension " + (column + 1),
        expectedDimension,
        actualDimension,
        "Dashboard group dimensions must match Spend_Daily."
      );
    }

    for (
      let column = dimensionCount;
      column < expectedRow.length;
      column += 1
    ) {
      const metricIndex = column - dimensionCount;
      const isDerived = metricIndex >= 5;
      const tolerance = isDerived
        ? DASHBOARD_QA_191.DERIVED_TOLERANCE
        : DASHBOARD_QA_191.BASE_TOLERANCE;
      const actualNumber = Number(actualRow[column]);
      const expectedNumber = Number(expectedRow[column]);
      const passed = Number.isFinite(actualNumber) &&
        Math.abs(actualNumber - expectedNumber) <= tolerance;

      addDashboardCheck191_(
        checks,
        passed,
        "ERROR",
        checkName,
        rowLabel + " / metric " + (metricIndex + 1),
        expectedNumber,
        actualRow[column],
        isDerived
          ? "Derived KPI must be recalculated from aggregate base metrics."
          : "Dashboard base metric must reconcile to Spend_Daily."
      );
    }
  });
}

/**
 * Google Sheets can return a displayed ISO date as a Date object even when
 * the dashboard was populated from a yyyy-MM-dd string. Normalize the date
 * dimension before comparing it; keep every other dimension strict.
 */
function normalizeDashboardDimension191_(value, checkName, column) {
  if (checkName === "DAILY_TOTALS" && column === 0) {
    return formatSpendDate_(value);
  }

  return String(value);
}

function addDashboardCheck191_(
  checks,
  passed,
  severity,
  check,
  scope,
  expected,
  actual,
  detail
) {
  checks.push({
    passed: Boolean(passed),
    severity: severity,
    check: check,
    scope: String(scope || ""),
    expected: dashboardQaValue191_(expected),
    actual: dashboardQaValue191_(actual),
    detail: String(detail || "")
  });
}

function getOrCreateDashboardQaSheet191_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(DASHBOARD_QA_191.SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(DASHBOARD_QA_191.SHEET_NAME);
  }

  return sheet;
}

function writeDashboardQaReport191_(sheet, checks, runAt, summary) {
  sheet.clear();
  sheet.getRange("A1:H1").merge();
  sheet
    .getRange("A1")
    .setValue("Step 19B — Dashboard Functional QA")
    .setFontSize(16)
    .setFontWeight("bold")
    .setFontColor("#FFFFFF")
    .setBackground("#1F4E78")
    .setHorizontalAlignment("center");

  const errors = checks.filter(function(check) {
    return check.severity === "ERROR" && !check.passed;
  }).length;
  const warnings = checks.filter(function(check) {
    return check.severity === "WARNING" && !check.passed;
  }).length;
  const status = errors > 0
    ? "FAILED"
    : warnings > 0
      ? "WARNING"
      : "SUCCESS";

  sheet.getRange(3, 1, 2, 8).setValues([
    [
      "Status",
      status,
      "Errors",
      errors,
      "Warnings",
      warnings,
      "Run at",
      runAt
    ],
    [
      "Platform groups",
      summary.platformGroups,
      "Daily groups",
      summary.dailyGroups,
      "Charts",
      summary.chartCount,
      "Source modified",
      false
    ]
  ]);

  sheet.getRange("A3:A4").setFontWeight("bold").setBackground("#D9EAF7");
  sheet.getRange("C3:C4").setFontWeight("bold").setBackground("#D9EAF7");
  sheet.getRange("E3:E4").setFontWeight("bold").setBackground("#D9EAF7");
  sheet.getRange("G3:G4").setFontWeight("bold").setBackground("#D9EAF7");

  sheet
    .getRange(6, 1, 1, DASHBOARD_QA_191.REPORT_HEADERS.length)
    .setValues([DASHBOARD_QA_191.REPORT_HEADERS.slice()])
    .setFontWeight("bold")
    .setFontColor("#FFFFFF")
    .setBackground("#38761D");

  const reportRows = checks.map(function(check) {
    return [
      check.severity,
      check.check,
      check.scope,
      check.expected,
      check.actual,
      check.passed ? "PASS" : "FAIL",
      check.detail,
      runAt
    ];
  });

  if (reportRows.length) {
    sheet
      .getRange(7, 1, reportRows.length, DASHBOARD_QA_191.REPORT_HEADERS.length)
      .setValues(reportRows);

    const resultColors = reportRows.map(function(row) {
      return [row[5] === "PASS" ? "#D9EAD3" : "#F4CCCC"];
    });
    sheet.getRange(7, 6, reportRows.length, 1).setBackgrounds(resultColors);
  }

  sheet.setFrozenRows(6);
  sheet.setColumnWidth(1, 95);
  sheet.setColumnWidth(2, 180);
  sheet.setColumnWidth(3, 260);
  sheet.setColumnWidth(4, 180);
  sheet.setColumnWidth(5, 180);
  sheet.setColumnWidth(6, 85);
  sheet.setColumnWidth(7, 360);
  sheet.setColumnWidth(8, 160);
  sheet.getRange("H3:H4").setNumberFormat("yyyy-mm-dd hh:mm:ss");
}

function dashboardQaValue191_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      "yyyy-MM-dd HH:mm:ss"
    );
  }

  if (value === null || value === undefined) {
    return "";
  }

  return value;
}

function columnLetter191_(column) {
  let result = "";
  let current = column;

  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }

  return result;
}

function roundDashboardQa191_(value, decimals) {
  const factor = Math.pow(10, decimals);
  return Math.round(Number(value) * factor) / factor;
}
