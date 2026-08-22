/**
 * Marketing Performance Hub
 * Step 19D — interactive filters and performance QA.
 *
 * This test exercises the real Step 19C edit-handler path with representative
 * date, platform, account, currency and metric selections. It writes only the
 * Dashboard, its hidden chart helper and Dashboard_Filter_QA. Spend_Daily is
 * fingerprinted before/after to prove that source data was not changed.
 *
 * Required: Dashboard.gs Step 19C and its installed edit trigger.
 */

const DASHBOARD_FILTER_QA_193 = Object.freeze({
  STEP: "19D",
  SHEET_NAME: "Dashboard_Filter_QA",
  FILTER_WARNING_SECONDS: 5,
  FILTER_ERROR_SECONDS: 12,
  METRIC_WARNING_SECONDS: 3,
  METRIC_ERROR_SECONDS: 8,
  MAX_PLATFORM_SCENARIOS: 5,
  MAX_CURRENCY_SCENARIOS: 5,
  MAX_ACCOUNT_SCENARIOS: 5,
  BASE_TOLERANCE: 0.0001,
  REPORT_HEADERS: Object.freeze([
    "Severity",
    "Check",
    "Scenario",
    "Expected",
    "Actual",
    "Result",
    "Duration (s)",
    "Detail",
    "Run At"
  ])
});

/**
 * Main Step 19D entry point.
 *
 * The original six filter values are restored in a finally block, including
 * when a scenario fails. The scheduled sync trigger and source sheets are not
 * modified.
 */
function step193RunInteractiveDashboardQA() {
  const startedAt = new Date();
  const checks = [];
  const timings = [];
  const metricTimings = [];
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const dashboard = requireSheet_(MSH.SHEETS.DASHBOARD);
  const daily = requireSheet_(MSH.SHEETS.DAILY);
  const helper = requireSheet_(MARKETING_DASHBOARD_192.HELPER_SHEET);
  const originalFilters = readDashboardFilterValues193_(dashboard);
  const originalFilterSignature = dashboardFilterSignature193_(originalFilters);
  const sourceSignatureBefore = dashboardSourceSignature193_(daily);
  const chartCountBefore = dashboard.getCharts().length;
  const context = buildMarketingDashboardContext192_(daily);
  const scenarios = buildDashboardFilterScenarios193_(context);
  let filtersRestored = false;
  let executedScenarios = 0;

  addDashboardFilterCheck193_(
    checks,
    isInteractiveDashboardLayout192_(dashboard),
    "ERROR",
    "INTERACTIVE_LAYOUT",
    "Infrastructure",
    "Step 19C layout",
    isInteractiveDashboardLayout192_(dashboard) ? "Present" : "Missing",
    0,
    "The Step 19C interactive layout must exist before filter QA."
  );
  addDashboardFilterCheck193_(
    checks,
    getMarketingDashboardEditTriggers192_().length === 1,
    "ERROR",
    "EDIT_TRIGGER",
    "Infrastructure",
    "1",
    String(getMarketingDashboardEditTriggers192_().length),
    0,
    "Exactly one scoped dashboard edit trigger is required."
  );
  addDashboardFilterCheck193_(
    checks,
    chartCountBefore === 1,
    "ERROR",
    "PERSISTENT_CHART",
    "Infrastructure",
    "1",
    String(chartCountBefore),
    0,
    "The interactive dashboard must start with one chart."
  );
  addDashboardFilterCheck193_(
    checks,
    helper.isSheetHidden(),
    "ERROR",
    "CHART_HELPER",
    "Infrastructure",
    "Hidden",
    helper.isSheetHidden() ? "Hidden" : "Visible",
    0,
    "The fixed chart-helper sheet must remain hidden."
  );

  try {
    scenarios.forEach(function(scenario) {
      const elapsed = executeDashboardFilterScenario193_(
        spreadsheet,
        dashboard,
        helper,
        context,
        scenario,
        checks
      );
      timings.push(elapsed);
      executedScenarios += 1;
    });

    const metricResult = executeDashboardMetricScenarios193_(
      spreadsheet,
      dashboard,
      helper,
      checks
    );
    metricResult.timings.forEach(function(value) {
      metricTimings.push(value);
    });

    const chartCountDuring = dashboard.getCharts().length;
    addDashboardFilterCheck193_(
      checks,
      chartCountDuring === chartCountBefore,
      "ERROR",
      "CHART_COUNT_STABLE",
      "All filter edits",
      String(chartCountBefore),
      String(chartCountDuring),
      0,
      "Filter edits must update the helper range without deleting or adding charts."
    );
  } catch (error) {
    addDashboardFilterCheck193_(
      checks,
      false,
      "ERROR",
      "QA_EXECUTION",
      "Test runner",
      "No exception",
      sanitizeDashboardMessage192_(error.message),
      0,
      "The QA runner stopped before all scenarios completed."
    );
  } finally {
    writeDashboardFilterValues193_(dashboard, originalFilters);
    refreshDashboard({ showUi: false });
    SpreadsheetApp.flush();
    filtersRestored = dashboardFilterSignature193_(
      readDashboardFilterValues193_(dashboard)
    ) === originalFilterSignature;
  }

  const sourceSignatureAfter = dashboardSourceSignature193_(daily);
  const sourceSheetsModified = sourceSignatureBefore !== sourceSignatureAfter;
  const chartCountAfter = dashboard.getCharts().length;
  const maxFilterSeconds = dashboardMax193_(timings);
  const p95FilterSeconds = dashboardPercentile193_(timings, 0.95);
  const maxMetricSeconds = dashboardMax193_(metricTimings);
  const p95MetricSeconds = dashboardPercentile193_(metricTimings, 0.95);

  addDashboardFilterCheck193_(
    checks,
    filtersRestored,
    "ERROR",
    "FILTERS_RESTORED",
    "Cleanup",
    originalFilterSignature,
    dashboardFilterSignature193_(readDashboardFilterValues193_(dashboard)),
    0,
    "The user's original filter selection must be restored after QA."
  );
  addDashboardFilterCheck193_(
    checks,
    !sourceSheetsModified,
    "ERROR",
    "SOURCE_DATA_UNCHANGED",
    "Spend_Daily",
    sourceSignatureBefore,
    sourceSignatureAfter,
    0,
    "Interactive QA must not change Spend_Daily."
  );
  addDashboardFilterCheck193_(
    checks,
    chartCountAfter === chartCountBefore,
    "ERROR",
    "CHART_PERSISTENT_AFTER_RESTORE",
    "Cleanup",
    String(chartCountBefore),
    String(chartCountAfter),
    0,
    "Restoring filters must not recreate or duplicate the chart."
  );
  addDashboardFilterPerformanceChecks193_(
    checks,
    "FILTER_RESPONSE",
    "Filter scenarios",
    maxFilterSeconds,
    p95FilterSeconds,
    DASHBOARD_FILTER_QA_193.FILTER_WARNING_SECONDS,
    DASHBOARD_FILTER_QA_193.FILTER_ERROR_SECONDS
  );
  addDashboardFilterPerformanceChecks193_(
    checks,
    "METRIC_RESPONSE",
    "Chart metric edits",
    maxMetricSeconds,
    p95MetricSeconds,
    DASHBOARD_FILTER_QA_193.METRIC_WARNING_SECONDS,
    DASHBOARD_FILTER_QA_193.METRIC_ERROR_SECONDS
  );

  const errors = checks.filter(function(check) {
    return check.severity === "ERROR" && !check.passed;
  }).length;
  const warnings = checks.filter(function(check) {
    return check.severity === "WARNING" && !check.passed;
  }).length;
  const finishedAt = new Date();
  const report = getOrCreateDashboardFilterQaSheet193_(spreadsheet);
  writeDashboardFilterQaReport193_(report, checks, startedAt, {
    scenarios: executedScenarios,
    metricEdits: metricTimings.length,
    maxFilterSeconds: maxFilterSeconds,
    p95FilterSeconds: p95FilterSeconds,
    maxMetricSeconds: maxMetricSeconds,
    p95MetricSeconds: p95MetricSeconds
  });

  const result = {
    status: errors > 0 ? "FAILED" : warnings > 0 ? "WARNING" : "SUCCESS",
    step: DASHBOARD_FILTER_QA_193.STEP,
    errors: errors,
    warnings: warnings,
    checks: checks.length,
    scenarios: executedScenarios,
    metricEdits: metricTimings.length,
    maxFilterSeconds: dashboardRound193_(maxFilterSeconds, 3),
    p95FilterSeconds: dashboardRound193_(p95FilterSeconds, 3),
    maxMetricSeconds: dashboardRound193_(maxMetricSeconds, 3),
    p95MetricSeconds: dashboardRound193_(p95MetricSeconds, 3),
    chartCount: chartCountAfter,
    chartCountStable: chartCountAfter === chartCountBefore,
    filtersRestored: filtersRestored,
    sourceSheetsModified: sourceSheetsModified,
    durationSeconds: dashboardRound193_(
      (finishedAt.getTime() - startedAt.getTime()) / 1000,
      3
    ),
    secretsExposed: false
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function buildDashboardFilterScenarios193_(context) {
  if (!context.rows.length) {
    return [];
  }

  const scenarios = [];
  const allPlatforms = MARKETING_DASHBOARD_192.ALL_PLATFORMS;
  const allAccounts = MARKETING_DASHBOARD_192.ALL_ACCOUNTS;
  const minDate = context.minDate;
  const maxDate = context.maxDate;

  scenarios.push({
    name: "Full range · all platforms",
    start: minDate,
    end: maxDate,
    platform: allPlatforms,
    account: allAccounts,
    currency: context.defaultCurrency,
    metric: "Spend"
  });

  const latestRows = context.rows.filter(function(row) {
    return row.date === maxDate;
  });
  const latest = latestRows[0] || context.rows[context.rows.length - 1];
  scenarios.push({
    name: "Latest day",
    start: latest.date,
    end: latest.date,
    platform: allPlatforms,
    account: allAccounts,
    currency: latest.currency,
    metric: "Spend"
  });

  context.platforms.slice(0, DASHBOARD_FILTER_QA_193.MAX_PLATFORM_SCENARIOS)
    .forEach(function(platform) {
      const currency = mostFrequentDashboardCurrency193_(
        context.rows.filter(function(row) {
          return row.platform === platform;
        })
      );
      scenarios.push({
        name: "Platform · " + platform,
        start: minDate,
        end: maxDate,
        platform: platform,
        account: allAccounts,
        currency: currency,
        metric: "Spend"
      });
    });

  context.currencies.slice(0, DASHBOARD_FILTER_QA_193.MAX_CURRENCY_SCENARIOS)
    .forEach(function(currency) {
      scenarios.push({
        name: "Currency · " + currency,
        start: minDate,
        end: maxDate,
        platform: allPlatforms,
        account: allAccounts,
        currency: currency,
        metric: "Spend"
      });
    });

  const usedPlatforms = {};
  context.accounts.forEach(function(account) {
    if (
      Object.keys(usedPlatforms).length >=
        DASHBOARD_FILTER_QA_193.MAX_ACCOUNT_SCENARIOS ||
      usedPlatforms[account.platform]
    ) {
      return;
    }
    usedPlatforms[account.platform] = true;
    scenarios.push({
      name: "Account · " + account.accountName,
      start: minDate,
      end: maxDate,
      platform: account.platform,
      account: account.label,
      currency: account.currency,
      metric: "Spend"
    });
  });

  const emptyScenario = findEmptyDashboardScenario193_(context);
  if (emptyScenario) {
    scenarios.push(emptyScenario);
  }

  const unique = {};
  return scenarios.filter(function(scenario) {
    const key = [
      scenario.start,
      scenario.end,
      scenario.platform,
      scenario.account,
      scenario.currency,
      scenario.metric
    ].join("\u0001");
    if (unique[key]) {
      return false;
    }
    unique[key] = true;
    return true;
  });
}

function executeDashboardFilterScenario193_(
  spreadsheet,
  dashboard,
  helper,
  context,
  scenario,
  checks
) {
  writeDashboardScenario193_(dashboard, scenario);
  const event = {
    range: dashboard.getRange("F3"),
    source: spreadsheet
  };
  const startedAt = new Date();
  handleMarketingDashboardEdit192(event);
  SpreadsheetApp.flush();
  const elapsed = (new Date().getTime() - startedAt.getTime()) / 1000;
  const errorText = dashboard.getRange("A2").getDisplayValue();
  const expected = expectedDashboardSelection193_(context, scenario);

  addDashboardFilterCheck193_(
    checks,
    errorText.indexOf("Filter error:") !== 0,
    "ERROR",
    "EDIT_HANDLER",
    scenario.name,
    "No filter error",
    errorText,
    elapsed,
    "The real edit handler must complete without writing an error state."
  );
  validateDashboardKpis193_(checks, dashboard, expected, scenario, elapsed);
  addDashboardFilterCheck193_(
    checks,
    dashboard.getCharts().length === 1,
    "ERROR",
    "CHART_COUNT",
    scenario.name,
    "1",
    String(dashboard.getCharts().length),
    elapsed,
    "Each filter scenario must retain one persistent chart."
  );
  addDashboardFilterCheck193_(
    checks,
    helper.getRange("H2").getDisplayValue() === scenario.metric,
    "ERROR",
    "CHART_METRIC",
    scenario.name,
    scenario.metric,
    helper.getRange("H2").getDisplayValue(),
    elapsed,
    "The fixed chart-helper block must use the selected metric."
  );
  addDashboardFilterCheck193_(
    checks,
    helper.getRange("I2").getDisplayValue() === scenario.currency,
    "ERROR",
    "CHART_CURRENCY",
    scenario.name,
    scenario.currency,
    helper.getRange("I2").getDisplayValue(),
    elapsed,
    "The chart-helper block must use the selected currency."
  );

  if (expected.rows.length === 0) {
    addDashboardFilterCheck193_(
      checks,
      dashboard.getRange("A10").getDisplayValue() ===
        "No data matches the selected filters.",
      "ERROR",
      "EMPTY_STATE",
      scenario.name,
      "No data matches the selected filters.",
      dashboard.getRange("A10").getDisplayValue(),
      elapsed,
      "A valid zero-row selection must render a clear empty state."
    );
  }

  return elapsed;
}

function executeDashboardMetricScenarios193_(
  spreadsheet,
  dashboard,
  helper,
  checks
) {
  const timings = [];
  const kpiBefore = readDashboardKpis193_(dashboard);

  MARKETING_DASHBOARD_192.METRICS.forEach(function(metric) {
    dashboard.getRange("L3").setValue(metric);
    const startedAt = new Date();
    handleMarketingDashboardEdit192({
      range: dashboard.getRange("L3"),
      source: spreadsheet
    });
    SpreadsheetApp.flush();
    const elapsed = (new Date().getTime() - startedAt.getTime()) / 1000;
    timings.push(elapsed);
    const kpiAfter = readDashboardKpis193_(dashboard);

    addDashboardFilterCheck193_(
      checks,
      helper.getRange("H2").getDisplayValue() === metric,
      "ERROR",
      "METRIC_FAST_PATH",
      metric,
      metric,
      helper.getRange("H2").getDisplayValue(),
      elapsed,
      "A chart-metric edit must update the fixed helper block."
    );
    addDashboardFilterCheck193_(
      checks,
      dashboardNumberArraysEqual193_(kpiBefore, kpiAfter),
      "ERROR",
      "METRIC_KPI_STABILITY",
      metric,
      "Unchanged KPI values",
      dashboardNumberArraysEqual193_(kpiBefore, kpiAfter)
        ? "Unchanged"
        : "Changed",
      elapsed,
      "Changing only the chart metric must not recalculate or change KPI values."
    );
    addDashboardFilterCheck193_(
      checks,
      dashboard.getCharts().length === 1,
      "ERROR",
      "METRIC_CHART_COUNT",
      metric,
      "1",
      String(dashboard.getCharts().length),
      elapsed,
      "Metric edits must not recreate or duplicate the chart."
    );
  });

  return { timings: timings };
}

function expectedDashboardSelection193_(context, scenario) {
  const rows = context.rows.filter(function(row) {
    return row.date >= scenario.start &&
      row.date <= scenario.end &&
      (scenario.platform === MARKETING_DASHBOARD_192.ALL_PLATFORMS ||
        row.platform === scenario.platform) &&
      (scenario.account === MARKETING_DASHBOARD_192.ALL_ACCOUNTS ||
        row.accountLabel === scenario.account) &&
      row.currency === scenario.currency;
  });
  const totals = {
    spend: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    appInstalls: 0
  };
  const platforms = {};
  const accounts = {};

  rows.forEach(function(row) {
    totals.spend += Number(row.spend || 0);
    totals.impressions += Number(row.impressions || 0);
    totals.clicks += Number(row.clicks || 0);
    totals.conversions += Number(row.conversions || 0);
    totals.appInstalls += Number(row.appInstalls || 0);
    platforms[row.platform] = true;
    accounts[row.platform + "|" + row.accountId] = true;
  });

  const ctr = totals.impressions > 0
    ? dashboardRound193_(totals.clicks / totals.impressions * 100, 4)
    : 0;
  const cvr = totals.clicks > 0
    ? dashboardRound193_(totals.conversions / totals.clicks * 100, 4)
    : 0;
  const cpc = totals.clicks > 0
    ? dashboardRound193_(totals.spend / totals.clicks, 4)
    : 0;
  const cpm = totals.impressions > 0
    ? dashboardRound193_(totals.spend / totals.impressions * 1000, 4)
    : 0;
  const cpa = totals.conversions > 0
    ? dashboardRound193_(totals.spend / totals.conversions, 4)
    : 0;
  const cpi = totals.appInstalls > 0
    ? dashboardRound193_(totals.spend / totals.appInstalls, 4)
    : 0;

  return {
    rows: rows,
    values: [
      totals.spend,
      totals.impressions,
      totals.clicks,
      totals.conversions,
      totals.appInstalls,
      ctr,
      cvr,
      cpc,
      cpm,
      cpa,
      cpi,
      rows.length,
      Object.keys(platforms).length,
      Object.keys(accounts).length
    ]
  };
}

function validateDashboardKpis193_(checks, dashboard, expected, scenario, elapsed) {
  const names = [
    "Spend",
    "Impressions",
    "Clicks",
    "Conversions",
    "App Installs",
    "CTR",
    "CVR",
    "CPC",
    "CPM",
    "CPA",
    "CPI",
    "Rows",
    "Platforms",
    "Accounts"
  ];
  const actual = readDashboardKpis193_(dashboard);

  expected.values.forEach(function(value, index) {
    const passed = dashboardNumbersClose193_(value, actual[index]);
    addDashboardFilterCheck193_(
      checks,
      passed,
      "ERROR",
      "FILTER_KPI_" + names[index].toUpperCase().replace(/[^A-Z]+/g, "_"),
      scenario.name,
      String(value),
      String(actual[index]),
      elapsed,
      "The rendered " + names[index] + " KPI must match Spend_Daily for this selection."
    );
  });
}

function readDashboardKpis193_(sheet) {
  return [
    "B5", "D5", "F5", "H5", "J5", "L5", "N5",
    "B6", "D6", "F6", "H6", "J6", "L6", "N6"
  ].map(function(a1) {
    return Number(sheet.getRange(a1).getValue() || 0);
  });
}

function writeDashboardScenario193_(sheet, scenario) {
  sheet.getRange("B3").setValue(isoDashboardDate192_(scenario.start));
  sheet.getRange("D3").setValue(isoDashboardDate192_(scenario.end));
  sheet.getRange("F3").setValue(scenario.platform);
  sheet.getRange("H3").setValue(scenario.account);
  sheet.getRange("J3").setValue(scenario.currency);
  sheet.getRange("L3").setValue(scenario.metric);
}

function findEmptyDashboardScenario193_(context) {
  const allAccounts = MARKETING_DASHBOARD_192.ALL_ACCOUNTS;
  for (let p = 0; p < context.platforms.length; p += 1) {
    for (let c = 0; c < context.currencies.length; c += 1) {
      const exists = context.rows.some(function(row) {
        return row.platform === context.platforms[p] &&
          row.currency === context.currencies[c];
      });
      if (!exists) {
        return {
          name: "Empty state · valid platform/currency",
          start: context.minDate,
          end: context.maxDate,
          platform: context.platforms[p],
          account: allAccounts,
          currency: context.currencies[c],
          metric: "Spend"
        };
      }
    }
  }

  for (let a = 0; a < context.accounts.length; a += 1) {
    const account = context.accounts[a];
    const dates = enumerateDashboardDates192_(
      isoDashboardDate192_(context.minDate),
      isoDashboardDate192_(context.maxDate)
    );
    for (let d = 0; d < dates.length; d += 1) {
      const date = dates[d];
      const exists = context.rows.some(function(row) {
        return row.date === date && row.accountLabel === account.label;
      });
      if (!exists) {
        return {
          name: "Empty state · valid account/day",
          start: date,
          end: date,
          platform: account.platform,
          account: account.label,
          currency: account.currency,
          metric: "Spend"
        };
      }
    }
  }
  return null;
}

function mostFrequentDashboardCurrency193_(rows) {
  const counts = {};
  rows.forEach(function(row) {
    counts[row.currency] = Number(counts[row.currency] || 0) + 1;
  });
  return Object.keys(counts).sort(function(a, b) {
    return counts[b] - counts[a] || a.localeCompare(b);
  })[0] || "";
}

function readDashboardFilterValues193_(sheet) {
  return MARKETING_DASHBOARD_192.FILTER_CELLS.map(function(a1) {
    return sheet.getRange(a1).getValue();
  });
}

function writeDashboardFilterValues193_(sheet, values) {
  MARKETING_DASHBOARD_192.FILTER_CELLS.forEach(function(a1, index) {
    sheet.getRange(a1).setValue(values[index]);
  });
}

function dashboardFilterSignature193_(values) {
  return values.map(function(value, index) {
    if (index < 2) {
      return parseDashboardDate192_(value);
    }
    return String(value || "");
  }).join("|");
}

function dashboardSourceSignature193_(sheet) {
  const rows = sheet.getLastRow();
  const columns = DAILY_PERFORMANCE_COLUMNS.length;
  const values = rows > 0 ? sheet.getRange(1, 1, rows, columns).getValues() : [];
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    JSON.stringify(values),
    Utilities.Charset.UTF_8
  );
  return Utilities.base64EncodeWebSafe(digest).slice(0, 16);
}

function addDashboardFilterPerformanceChecks193_(
  checks,
  checkName,
  scenario,
  maxSeconds,
  p95Seconds,
  warningSeconds,
  errorSeconds
) {
  if (maxSeconds > errorSeconds) {
    addDashboardFilterCheck193_(
      checks,
      false,
      "ERROR",
      checkName,
      scenario,
      "Max <= " + errorSeconds + "s",
      "Max " + dashboardRound193_(maxSeconds, 3) + "s",
      maxSeconds,
      "Response exceeded the failure threshold."
    );
    return;
  }
  addDashboardFilterCheck193_(
    checks,
    maxSeconds <= warningSeconds,
    "WARNING",
    checkName,
    scenario,
    "Max <= " + warningSeconds + "s",
    "Max " + dashboardRound193_(maxSeconds, 3) +
      "s; P95 " + dashboardRound193_(p95Seconds, 3) + "s",
    maxSeconds,
    "The dashboard is correct, but slower than the preferred response target."
  );
}

function addDashboardFilterCheck193_(
  checks,
  passed,
  severity,
  check,
  scenario,
  expected,
  actual,
  duration,
  detail
) {
  checks.push({
    severity: severity,
    check: check,
    scenario: scenario,
    expected: expected,
    actual: actual,
    passed: Boolean(passed),
    duration: dashboardRound193_(duration || 0, 3),
    detail: detail
  });
}

function getOrCreateDashboardFilterQaSheet193_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(DASHBOARD_FILTER_QA_193.SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(DASHBOARD_FILTER_QA_193.SHEET_NAME);
  }
  return sheet;
}

function writeDashboardFilterQaReport193_(sheet, checks, runAt, summary) {
  sheet.getDataRange().breakApart();
  sheet.clear();
  if (sheet.getMaxColumns() < DASHBOARD_FILTER_QA_193.REPORT_HEADERS.length) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      DASHBOARD_FILTER_QA_193.REPORT_HEADERS.length - sheet.getMaxColumns()
    );
  }
  const errors = checks.filter(function(check) {
    return check.severity === "ERROR" && !check.passed;
  }).length;
  const warnings = checks.filter(function(check) {
    return check.severity === "WARNING" && !check.passed;
  }).length;
  const status = errors > 0 ? "FAILED" : warnings > 0 ? "WARNING" : "SUCCESS";

  sheet.getRange("A1:I1").merge().setValue(
    "STEP 19D — INTERACTIVE DASHBOARD QA"
  ).setBackground("#17324D").setFontColor("#FFFFFF")
    .setFontWeight("bold").setFontSize(14);
  sheet.getRange("A2:I2").merge().setValue(
    "Status: " + status +
    " | Errors: " + errors +
    " | Warnings: " + warnings +
    " | Scenarios: " + summary.scenarios +
    " | Metric edits: " + summary.metricEdits
  ).setBackground(status === "SUCCESS" ? "#DCEFEA" : "#FCE8E6");
  sheet.getRange("A3:I3").merge().setValue(
    "Filter max/P95: " + dashboardRound193_(summary.maxFilterSeconds, 3) +
    "s / " + dashboardRound193_(summary.p95FilterSeconds, 3) +
    "s | Metric max/P95: " + dashboardRound193_(summary.maxMetricSeconds, 3) +
    "s / " + dashboardRound193_(summary.p95MetricSeconds, 3) + "s"
  ).setBackground("#F7F9FB");
  sheet.getRange(5, 1, 1, DASHBOARD_FILTER_QA_193.REPORT_HEADERS.length)
    .setValues([DASHBOARD_FILTER_QA_193.REPORT_HEADERS.slice()])
    .setBackground("#2F6F64").setFontColor("#FFFFFF")
    .setFontWeight("bold");

  if (checks.length) {
    const rows = checks.map(function(check) {
      return [
        check.severity,
        check.check,
        check.scenario,
        check.expected,
        check.actual,
        check.passed ? "PASS" : "FAIL",
        check.duration,
        check.detail,
        runAt
      ];
    });
    sheet.getRange(6, 1, rows.length, rows[0].length).setValues(rows);
    sheet.getRange(6, 7, rows.length, 1).setNumberFormat("0.000");
    sheet.getRange(6, 9, rows.length, 1).setNumberFormat("yyyy-mm-dd hh:mm:ss");
  }
  sheet.setFrozenRows(5);
  sheet.autoResizeColumns(1, 9);
  sheet.setColumnWidth(8, 420);
  sheet.getRange("A:I").setVerticalAlignment("top");
}

function dashboardNumbersClose193_(expected, actual) {
  return Math.abs(Number(expected) - Number(actual)) <=
    DASHBOARD_FILTER_QA_193.BASE_TOLERANCE;
}

function dashboardNumberArraysEqual193_(left, right) {
  return left.length === right.length && left.every(function(value, index) {
    return dashboardNumbersClose193_(value, right[index]);
  });
}

function dashboardMax193_(values) {
  return values.length ? Math.max.apply(null, values) : 0;
}

function dashboardPercentile193_(values, percentile) {
  if (!values.length) {
    return 0;
  }
  const sorted = values.slice().sort(function(a, b) {
    return a - b;
  });
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.ceil(sorted.length * percentile) - 1)
  );
  return sorted[index];
}

function dashboardRound193_(value, decimals) {
  const factor = Math.pow(10, decimals);
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}
