/**
 * Marketing Performance Hub
 * Step 19C — lightweight interactive dashboard.
 *
 * Design goals:
 *   - Spend_Daily remains the only dashboard source.
 *   - Filter edits update only rendered values and a fixed chart-helper range.
 *   - The embedded chart is created once; it is never deleted/recreated on edit.
 *   - Currency is always selected explicitly, preventing invalid cross-currency
 *     Spend/CPC/CPM/CPA/CPI totals.
 *   - Scheduled refreshes are UI-safe and preserve the user's current filters.
 */

const MARKETING_DASHBOARD_192 = Object.freeze({
  STEP: "19C",
  HELPER_SHEET: "_Dashboard_ChartData",
  EDIT_HANDLER: "handleMarketingDashboardEdit192",
  ALL_PLATFORMS: "All Platforms",
  ALL_ACCOUNTS: "All Accounts",
  NO_CURRENCY: "No currency",
  CACHE_KEY: "MARKETING_DASHBOARD_192_CONTEXT",
  CACHE_TTL_SECONDS: 600,
  MAX_TREND_DAYS: 400,
  FILTER_CELLS: Object.freeze(["B3", "D3", "F3", "H3", "J3", "L3"]),
  METRICS: Object.freeze([
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
  TABLE_HEADERS: Object.freeze([
    "Platform",
    "Account",
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
  ])
});

/**
 * One-time Step 19C entry point.
 * Rebuilds the old static layout, creates one persistent chart and installs one
 * scoped edit trigger. It is safe to rerun.
 */
function step192SetupInteractiveDashboard() {
  const startedAt = new Date();
  const renderResult = refreshDashboard({
    showUi: false,
    forceLayout: true
  });
  const triggerResult = ensureMarketingDashboardEditTrigger192_();
  const dashboard = requireSheet_(MSH.SHEETS.DASHBOARD);
  const helper = requireSheet_(MARKETING_DASHBOARD_192.HELPER_SHEET);
  const result = {
    status: "SUCCESS",
    step: MARKETING_DASHBOARD_192.STEP,
    interactiveLayout: isInteractiveDashboardLayout192_(dashboard),
    editTriggerInstalled: triggerResult.installed,
    editTriggerCount: triggerResult.count,
    filterCells: MARKETING_DASHBOARD_192.FILTER_CELLS.length,
    chartCount: dashboard.getCharts().length,
    chartPersistent: true,
    helperHidden: helper.isSheetHidden(),
    matchedRows: renderResult.matchedRows,
    durationSeconds: roundDashboardMetric192_(
      (new Date().getTime() - startedAt.getTime()) / 1000,
      3
    ),
    secretsExposed: false
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * Idempotent health test for Step 19C. It does not recreate the chart.
 */
function step192TestInteractiveDashboard() {
  const startedAt = new Date();
  const dashboard = requireSheet_(MSH.SHEETS.DASHBOARD);
  const chartCountBefore = dashboard.getCharts().length;
  const renderResult = refreshDashboard({ showUi: false });
  const chartCountAfter = dashboard.getCharts().length;
  const triggerCount = getMarketingDashboardEditTriggers192_().length;
  const filtersValid = MARKETING_DASHBOARD_192.FILTER_CELLS.every(function(a1) {
    return Boolean(dashboard.getRange(a1).getDataValidation());
  });
  const errors = [];

  if (!isInteractiveDashboardLayout192_(dashboard)) {
    errors.push("Interactive dashboard layout marker is missing.");
  }
  if (!filtersValid) {
    errors.push("One or more filter cells has no data validation.");
  }
  if (triggerCount !== 1) {
    errors.push("Expected exactly one dashboard edit trigger.");
  }
  if (chartCountBefore !== 1 || chartCountAfter !== 1) {
    errors.push("Expected one persistent dashboard chart.");
  }

  const result = {
    status: errors.length ? "FAILED" : "SUCCESS",
    step: MARKETING_DASHBOARD_192.STEP,
    errors: errors.length,
    errorMessages: errors,
    filtersValid: filtersValid,
    editTriggerCount: triggerCount,
    chartCount: chartCountAfter,
    chartRecreated: chartCountBefore !== chartCountAfter,
    matchedRows: renderResult.matchedRows,
    durationSeconds: roundDashboardMetric192_(
      (new Date().getTime() - startedAt.getTime()) / 1000,
      3
    ),
    secretsExposed: false
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * Called by the master orchestrator after Spend_Daily is rebuilt.
 */
function refreshDashboard(options) {
  const config = options || {};
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const dashboard = requireSheet_(MSH.SHEETS.DASHBOARD);
  const daily = requireSheet_(MSH.SHEETS.DAILY);

  ensureDailyPerformanceSchema_(daily);
  const context = buildMarketingDashboardContext192_(daily);
  writeMarketingDashboardCache192_(context);

  const forceLayout = config.forceLayout === true;
  const layoutRebuilt =
    forceLayout || !isInteractiveDashboardLayout192_(dashboard);

  if (layoutRebuilt) {
    setupInteractiveDashboardLayout192_(dashboard, context);
  } else {
    setMarketingDashboardValidations192_(dashboard, context, true);
  }

  const helper = getOrCreateDashboardHelper192_(spreadsheet);
  const filters = normalizeMarketingDashboardFilters192_(
    dashboard,
    context,
    true
  );
  const renderResult = renderMarketingDashboard192_(
    dashboard,
    helper,
    context,
    filters
  );
  const chartCreated = ensureMarketingDashboardChart192_(
    dashboard,
    helper,
    layoutRebuilt
  );

  if (!helper.isSheetHidden()) {
    helper.hideSheet();
  }

  if (config.showUi !== false) {
    spreadsheet.setActiveSheet(dashboard);
    spreadsheet.toast(
      "Dashboard refreshed successfully.",
      MSH.NAME,
      5
    );
  }

  return {
    status: "SUCCESS",
    layoutRebuilt: layoutRebuilt,
    chartCreated: chartCreated,
    matchedRows: renderResult.matchedRows,
    accountGroups: renderResult.accountGroups,
    dailyGroups: renderResult.dailyGroups,
    secretsExposed: false
  };
}

/**
 * Installable edit-trigger handler. It ignores every sheet/cell outside the six
 * filter cells and never calls an API, rebuilds Spend_Daily or recreates charts.
 */
function handleMarketingDashboardEdit192(e) {
  if (!e || !e.range) {
    return;
  }

  const range = e.range;
  const sheet = range.getSheet();

  if (
    sheet.getName() !== MSH.SHEETS.DASHBOARD ||
    range.getNumRows() !== 1 ||
    range.getNumColumns() !== 1 ||
    MARKETING_DASHBOARD_192.FILTER_CELLS.indexOf(range.getA1Notation()) === -1
  ) {
    return;
  }

  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(750)) {
    return;
  }

  try {
    const spreadsheet = e.source || SpreadsheetApp.getActiveSpreadsheet();
    const helper = spreadsheet.getSheetByName(
      MARKETING_DASHBOARD_192.HELPER_SHEET
    );
    if (!helper) {
      return;
    }

    const context = readMarketingDashboardCache192_() ||
      buildMarketingDashboardContext192_(requireSheet_(MSH.SHEETS.DAILY));
    const filters = normalizeMarketingDashboardFilters192_(
      sheet,
      context,
      false
    );

    // Changing only the selected chart metric updates one fixed helper block.
    // All KPI/table cells remain valid, so this is the fastest edit path.
    if (range.getA1Notation() === "L3") {
      updateMarketingDashboardChartData192_(helper, context, filters);
      updateMarketingDashboardStatus192_(sheet, context, filters, null);
      return;
    }

    renderMarketingDashboard192_(sheet, helper, context, filters);
  } catch (error) {
    sheet
      .getRange("A2:N2")
      .setValue("Filter error: " + sanitizeDashboardMessage192_(error.message))
      .setBackground("#FCE8E6")
      .setFontColor("#B3261E");
  } finally {
    lock.releaseLock();
  }
}

function buildMarketingDashboardContext192_(dailySheet) {
  const values = dailySheet.getLastRow() >= 2
    ? dailySheet.getRange(
        2,
        1,
        dailySheet.getLastRow() - 1,
        DAILY_PERFORMANCE_COLUMNS.length
      ).getValues()
    : [];
  const rows = [];
  const platforms = {};
  const currencies = {};
  const currencySpend = {};
  const accounts = {};
  let minDate = "";
  let maxDate = "";

  values.forEach(function(row) {
    const date = formatSpendDate_(row[DAILY_PERFORMANCE_INDEX.DATE]);
    const platform = String(
      row[DAILY_PERFORMANCE_INDEX.PLATFORM] || ""
    ).trim();
    const accountId = String(
      row[DAILY_PERFORMANCE_INDEX.ACCOUNT_ID] || ""
    ).trim();
    const accountName = String(
      row[DAILY_PERFORMANCE_INDEX.ACCOUNT_NAME] || accountId
    ).trim();
    const currency = String(
      row[DAILY_PERFORMANCE_INDEX.CURRENCY] || ""
    ).trim().toUpperCase();

    if (!date || !platform || !accountId || !currency) {
      return;
    }

    const item = {
      date: date,
      platform: platform,
      accountId: accountId,
      accountName: accountName,
      currency: currency,
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
    item.accountLabel = createDashboardAccountLabel192_(item);
    rows.push(item);
    platforms[platform] = true;
    currencies[currency] = true;
    currencySpend[currency] =
      Number(currencySpend[currency] || 0) + item.spend;
    accounts[item.accountLabel] = {
      label: item.accountLabel,
      platform: platform,
      accountId: accountId,
      accountName: accountName,
      currency: currency
    };
    if (!minDate || date < minDate) {
      minDate = date;
    }
    if (!maxDate || date > maxDate) {
      maxDate = date;
    }
  });

  const currencyList = Object.keys(currencies).sort();
  const defaultCurrency = currencyList.slice().sort(function(a, b) {
    return currencySpend[b] - currencySpend[a] || a.localeCompare(b);
  })[0] || MARKETING_DASHBOARD_192.NO_CURRENCY;

  return {
    rows: rows,
    platforms: Object.keys(platforms).sort(),
    currencies: currencyList,
    accounts: Object.keys(accounts).sort().map(function(key) {
      return accounts[key];
    }),
    minDate: minDate,
    maxDate: maxDate,
    defaultCurrency: defaultCurrency,
    builtAt: new Date().toISOString()
  };
}

function setupInteractiveDashboardLayout192_(sheet, context) {
  sheet.getCharts().forEach(function(chart) {
    sheet.removeChart(chart);
  });
  sheet.getDataRange().breakApart();
  sheet.clear();
  ensureMarketingDashboardCapacity192_(sheet, 40, 22);
  sheet.setHiddenGridlines(true);

  sheet
    .getRange("A1:N1")
    .merge()
    .setValue("MARKETING PERFORMANCE HUB")
    .setFontFamily("Arial")
    .setFontSize(18)
    .setFontWeight("bold")
    .setFontColor("#FFFFFF")
    .setBackground("#17324D")
    .setHorizontalAlignment("left")
    .setVerticalAlignment("middle");
  sheet.setRowHeight(1, 38);

  sheet
    .getRange("A2:N2")
    .merge()
    .setValue("Change a filter below — KPI, tables and chart update automatically.")
    .setBackground("#EAF2F8")
    .setFontColor("#40566D")
    .setFontSize(10);

  sheet.getRange("A3:N3").setBackground("#F7F9FB");
  sheet.getRangeList(["A3", "C3", "E3", "G3", "I3", "K3", "M3"])
    .setFontWeight("bold")
    .setFontColor("#40566D");
  sheet.getRange("A3:N3").setValues([[
    "Start date", "", "End date", "", "Platform", "", "Account", "",
    "Currency", "", "Chart metric", "", "View updated", ""
  ]]);

  setupDashboardKpiLabels192_(sheet);
  sheet
    .getRange("A8:N8")
    .merge()
    .setValue("ACCOUNT PERFORMANCE")
    .setFontWeight("bold")
    .setFontColor("#17324D")
    .setBackground("#DCEFEA");
  sheet
    .getRange(9, 1, 1, MARKETING_DASHBOARD_192.TABLE_HEADERS.length)
    .setValues([MARKETING_DASHBOARD_192.TABLE_HEADERS.slice()]);
  styleMarketingDashboardHeader192_(sheet.getRange("A9:N9"), "#2F6F64");

  sheet.setFrozenRows(9);
  sheet.setColumnWidth(1, 125);
  sheet.setColumnWidth(2, 210);
  sheet.setColumnWidth(3, 85);
  sheet.setColumnWidths(4, 11, 105);
  sheet.setColumnWidth(6, 120);
  sheet.setColumnWidth(7, 120);
  sheet.setColumnWidth(8, 115);
  sheet.setColumnWidth(14, 105);
  sheet.setColumnWidth(16, 120);

  setMarketingDashboardValidations192_(sheet, context, false);
}

function setupDashboardKpiLabels192_(sheet) {
  const labels = [
    ["Spend", "", "Impressions", "", "Clicks", "", "Conversions", "", "App Installs", "", "CTR", "", "CVR", ""],
    ["CPC", "", "CPM", "", "CPA", "", "CPI", "", "Rows", "", "Platforms", "", "Accounts", ""]
  ];
  sheet.getRange("A5:N6").setValues(labels);
  sheet.getRangeList([
    "A5", "C5", "E5", "G5", "I5", "K5", "M5",
    "A6", "C6", "E6", "G6", "I6", "K6", "M6"
  ])
    .setBackground("#E9EDF2")
    .setFontColor("#40566D")
    .setFontWeight("bold");
  sheet.getRangeList([
    "B5", "D5", "F5", "H5", "J5", "L5", "N5",
    "B6", "D6", "F6", "H6", "J6", "L6", "N6"
  ])
    .setBackground("#FFFFFF")
    .setFontColor("#17324D")
    .setFontWeight("bold")
    .setFontSize(11);
}

function setMarketingDashboardValidations192_(sheet, context, keepCurrent) {
  const minDate = context.minDate
    ? isoDashboardDate192_(context.minDate)
    : new Date();
  const maxDate = context.maxDate
    ? isoDashboardDate192_(context.maxDate)
    : new Date();
  const platformList = [MARKETING_DASHBOARD_192.ALL_PLATFORMS]
    .concat(context.platforms);
  const accountList = [MARKETING_DASHBOARD_192.ALL_ACCOUNTS]
    .concat(context.accounts.map(function(account) {
      return account.label;
    }));
  const currencyList = context.currencies.length
    ? context.currencies
    : [MARKETING_DASHBOARD_192.NO_CURRENCY];

  setDashboardDateValidation192_(sheet.getRange("B3"), minDate, maxDate);
  setDashboardDateValidation192_(sheet.getRange("D3"), minDate, maxDate);
  setDashboardListValidation192_(
    sheet.getRange("F3"),
    platformList,
    MARKETING_DASHBOARD_192.ALL_PLATFORMS,
    keepCurrent
  );
  setDashboardListValidation192_(
    sheet.getRange("H3"),
    accountList,
    MARKETING_DASHBOARD_192.ALL_ACCOUNTS,
    keepCurrent
  );
  setDashboardListValidation192_(
    sheet.getRange("J3"),
    currencyList,
    context.defaultCurrency,
    keepCurrent
  );
  setDashboardListValidation192_(
    sheet.getRange("L3"),
    MARKETING_DASHBOARD_192.METRICS.slice(),
    "Spend",
    keepCurrent
  );

  if (!keepCurrent || !parseDashboardDate192_(sheet.getRange("B3").getValue())) {
    sheet.getRange("B3").setValue(defaultDashboardStartDate192_(context));
  }
  if (!keepCurrent || !parseDashboardDate192_(sheet.getRange("D3").getValue())) {
    sheet.getRange("D3").setValue(maxDate);
  }
  sheet.getRange("B3").setNumberFormat("yyyy-mm-dd");
  sheet.getRange("D3").setNumberFormat("yyyy-mm-dd");
  sheet.getRange("N3").setNumberFormat("yyyy-mm-dd hh:mm");
}

function normalizeMarketingDashboardFilters192_(sheet, context, writeBack) {
  const values = sheet.getRangeList(
    MARKETING_DASHBOARD_192.FILTER_CELLS
  ).getRanges().map(function(range) {
    return range.getValue();
  });
  const fallbackStart = formatSpendDate_(defaultDashboardStartDate192_(context));
  const fallbackEnd = context.maxDate || formatSpendDate_(new Date());
  let start = parseDashboardDate192_(values[0]) || fallbackStart;
  let end = parseDashboardDate192_(values[1]) || fallbackEnd;
  const allowedPlatforms = [MARKETING_DASHBOARD_192.ALL_PLATFORMS]
    .concat(context.platforms);
  const allowedCurrencies = context.currencies.length
    ? context.currencies
    : [MARKETING_DASHBOARD_192.NO_CURRENCY];
  const allowedAccounts = context.accounts.map(function(item) {
    return item.label;
  });
  let platform = String(values[2] || MARKETING_DASHBOARD_192.ALL_PLATFORMS);
  let account = String(values[3] || MARKETING_DASHBOARD_192.ALL_ACCOUNTS);
  let currency = String(values[4] || context.defaultCurrency);
  let metric = String(values[5] || "Spend");

  if (start > end) {
    const swap = start;
    start = end;
    end = swap;
  }
  if (allowedPlatforms.indexOf(platform) === -1) {
    platform = MARKETING_DASHBOARD_192.ALL_PLATFORMS;
  }
  if (allowedAccounts.indexOf(account) === -1) {
    account = MARKETING_DASHBOARD_192.ALL_ACCOUNTS;
  }
  if (allowedCurrencies.indexOf(currency) === -1) {
    currency = context.defaultCurrency;
  }
  if (MARKETING_DASHBOARD_192.METRICS.indexOf(metric) === -1) {
    metric = "Spend";
  }

  const accountMeta = context.accounts.filter(function(item) {
    return item.label === account;
  })[0] || null;
  if (
    accountMeta &&
    platform !== MARKETING_DASHBOARD_192.ALL_PLATFORMS &&
    accountMeta.platform !== platform
  ) {
    account = MARKETING_DASHBOARD_192.ALL_ACCOUNTS;
  }

  if (writeBack !== false) {
    sheet.getRange("B3").setValue(isoDashboardDate192_(start));
    sheet.getRange("D3").setValue(isoDashboardDate192_(end));
    sheet.getRange("F3").setValue(platform);
    sheet.getRange("H3").setValue(account);
    sheet.getRange("J3").setValue(currency);
    sheet.getRange("L3").setValue(metric);
  } else if (
    account === MARKETING_DASHBOARD_192.ALL_ACCOUNTS &&
    String(values[3]) !== MARKETING_DASHBOARD_192.ALL_ACCOUNTS
  ) {
    sheet.getRange("H3").setValue(account);
  }

  return {
    start: start,
    end: end,
    platform: platform,
    account: account,
    currency: currency,
    metric: metric
  };
}

function renderMarketingDashboard192_(sheet, helper, context, filters) {
  const matched = context.rows.filter(function(row) {
    return dashboardRowMatches192_(row, filters);
  });
  const totals = createPerformanceAccumulator_();
  const accountGroups = new Map();
  const dailyGroups = new Map();

  matched.forEach(function(row) {
    addPerformanceMetrics_(totals, row);
    const accountKey = [
      row.platform,
      row.accountId,
      row.accountName,
      row.currency
    ].join("\u0001");
    const dailyKey = [row.date, row.platform, row.currency].join("\u0001");
    addDashboardGroupMetrics192_(accountGroups, accountKey, row);
    addDashboardGroupMetrics192_(dailyGroups, dailyKey, row);
  });

  const accountOutput = Array.from(accountGroups.entries()).map(function(entry) {
    const parts = entry[0].split("\u0001");
    return dashboardMetricRow192_(
      [parts[0], parts[2] || parts[1], parts[3]],
      entry[1]
    );
  }).sort(function(a, b) {
    return Number(b[3]) - Number(a[3]) ||
      String(a[0]).localeCompare(String(b[0]));
  });

  const dailyOutput = Array.from(dailyGroups.entries()).map(function(entry) {
    const parts = entry[0].split("\u0001");
    return dashboardMetricRow192_(
      [parts[0], parts[1], parts[2]],
      entry[1]
    );
  }).sort(function(a, b) {
    return String(b[0]).localeCompare(String(a[0])) ||
      String(a[1]).localeCompare(String(b[1]));
  });

  writeMarketingDashboardKpis192_(sheet, totals, matched);
  writeMarketingDashboardTables192_(sheet, accountOutput, dailyOutput);
  updateMarketingDashboardChartData192_(helper, context, filters);
  updateMarketingDashboardStatus192_(sheet, context, filters, {
    matchedRows: matched.length,
    trendTruncated: daysBetweenDashboardDates192_(filters.start, filters.end) + 1 >
      MARKETING_DASHBOARD_192.MAX_TREND_DAYS
  });

  return {
    matchedRows: matched.length,
    accountGroups: accountOutput.length,
    dailyGroups: dailyOutput.length
  };
}

function writeMarketingDashboardKpis192_(sheet, totals, matched) {
  const derived = calculateDerivedPerformanceMetrics_(totals);
  const platforms = {};
  const accounts = {};
  matched.forEach(function(row) {
    platforms[row.platform] = true;
    accounts[row.platform + "|" + row.accountId] = true;
  });
  const values = [
    totals.spend,
    totals.impressions,
    totals.clicks,
    totals.conversions,
    totals.appInstalls,
    derived.ctr,
    derived.cvr,
    derived.cpc,
    derived.cpm,
    derived.cpa,
    derived.cpi,
    matched.length,
    Object.keys(platforms).length,
    Object.keys(accounts).length
  ];
  const cells = [
    "B5", "D5", "F5", "H5", "J5", "L5", "N5",
    "B6", "D6", "F6", "H6", "J6", "L6", "N6"
  ];
  cells.forEach(function(a1, index) {
    sheet.getRange(a1).setValue(values[index]);
  });
  sheet.getRangeList(["B5", "B6", "D6", "F6", "H6"])
    .setNumberFormat("#,##0.00");
  sheet.getRangeList(["D5", "F5", "H5", "J5", "J6", "L6", "N6"])
    .setNumberFormat("#,##0.####");
  sheet.getRangeList(["L5", "N5"]).setNumberFormat('0.00"%"');
}

function writeMarketingDashboardTables192_(sheet, accountOutput, dailyOutput) {
  const lastRow = Math.max(sheet.getLastRow(), 10);
  sheet.getRange(10, 1, lastRow - 9, 14).breakApart().clearContent();
  sheet
    .getRange(9, 1, 1, MARKETING_DASHBOARD_192.TABLE_HEADERS.length)
    .setValues([MARKETING_DASHBOARD_192.TABLE_HEADERS.slice()]);

  const accountRows = Math.max(accountOutput.length, 1);
  const dailyHeaderRow = 12 + accountRows;
  const requiredRows = dailyHeaderRow + Math.max(dailyOutput.length, 1);
  ensureMarketingDashboardCapacity192_(sheet, requiredRows, 22);

  if (accountOutput.length) {
    sheet.getRange(10, 1, accountOutput.length, 14).setValues(accountOutput);
    formatMarketingDashboardMetricTable192_(
      sheet,
      10,
      accountOutput.length,
      3
    );
  } else {
    sheet.getRange("A10:N10").merge().setValue(
      "No data matches the selected filters."
    ).setBackground("#FFF4E5").setFontColor("#8A4B08");
  }

  sheet
    .getRange(dailyHeaderRow - 1, 1, 1, 14)
    .merge()
    .setValue("DAILY PERFORMANCE")
    .setFontWeight("bold")
    .setFontColor("#17324D")
    .setBackground("#E8E1F2");
  sheet
    .getRange(dailyHeaderRow, 1, 1, 14)
    .setValues([MARKETING_DASHBOARD_192.DAILY_HEADERS.slice()]);
  styleMarketingDashboardHeader192_(
    sheet.getRange(dailyHeaderRow, 1, 1, 14),
    "#65558F"
  );

  if (dailyOutput.length) {
    sheet
      .getRange(dailyHeaderRow + 1, 1, dailyOutput.length, 14)
      .setValues(dailyOutput);
    formatMarketingDashboardMetricTable192_(
      sheet,
      dailyHeaderRow + 1,
      dailyOutput.length,
      3
    );
  } else {
    sheet.getRange(dailyHeaderRow + 1, 1, 1, 14)
      .merge()
      .setValue("No daily rows for this selection.")
      .setBackground("#F7F9FB")
      .setFontColor("#66788A");
  }
}

function updateMarketingDashboardChartData192_(helper, context, filters) {
  const platformList = Array.isArray(MSH.PLATFORMS)
    ? MSH.PLATFORMS.slice()
    : context.platforms.slice();
  const startDate = isoDashboardDate192_(filters.start);
  const endDate = isoDashboardDate192_(filters.end);
  const totalDays = daysBetweenDashboardDates192_(filters.start, filters.end) + 1;
  const chartStart = totalDays > MARKETING_DASHBOARD_192.MAX_TREND_DAYS
    ? new Date(
        endDate.getTime() -
        (MARKETING_DASHBOARD_192.MAX_TREND_DAYS - 1) * 86400000
      )
    : startDate;
  const groups = {};

  context.rows.forEach(function(row) {
    if (!dashboardRowMatches192_(row, filters)) {
      return;
    }
    if (row.date < formatSpendDate_(chartStart)) {
      return;
    }
    const key = row.date + "\u0001" + row.platform;
    if (!groups[key]) {
      groups[key] = createPerformanceAccumulator_();
    }
    addPerformanceMetrics_(groups[key], row);
  });

  const dates = enumerateDashboardDates192_(chartStart, endDate);
  const output = dates.map(function(date) {
    const row = [isoDashboardDate192_(date)];
    platformList.forEach(function(platform) {
      const metrics = groups[date + "\u0001" + platform];
      row.push(metrics
        ? dashboardMetricValue192_(metrics, filters.metric)
        : null);
    });
    return row;
  });
  const fixedHeight = MARKETING_DASHBOARD_192.MAX_TREND_DAYS + 1;
  ensureMarketingDashboardCapacity192_(
    helper,
    fixedHeight,
    Math.max(platformList.length + 1, 9)
  );
  helper.getRange(
    1,
    1,
    fixedHeight,
    platformList.length + 1
  ).clearContent();
  helper.getRange(1, 1, 1, platformList.length + 1)
    .setValues([["Date"].concat(platformList)]);
  if (output.length) {
    helper.getRange(2, 1, output.length, platformList.length + 1)
      .setValues(output);
    helper.getRange(2, 1, output.length, 1).setNumberFormat("yyyy-mm-dd");
    helper.getRange(2, 2, output.length, platformList.length)
      .setNumberFormat(dashboardMetricFormat192_(filters.metric));
  }
  helper.getRange("H1").setValue("Selected metric");
  helper.getRange("H2").setValue(filters.metric);
  helper.getRange("I1").setValue("Currency");
  helper.getRange("I2").setValue(filters.currency);
}

function updateMarketingDashboardStatus192_(sheet, context, filters, detail) {
  const matchedRows = detail && detail.matchedRows !== undefined
    ? detail.matchedRows
    : context.rows.filter(function(row) {
        return dashboardRowMatches192_(row, filters);
      }).length;
  const notes = [
    matchedRows + " rows",
    "Metric: " + filters.metric,
    "Currency: " + filters.currency,
    "Chart updates without being rebuilt"
  ];
  if (detail && detail.trendTruncated) {
    notes.push(
      "Chart limited to the latest " +
      MARKETING_DASHBOARD_192.MAX_TREND_DAYS +
      " days"
    );
  }
  sheet.getRange("A2:N2")
    .setValue(notes.join(" · "))
    .setBackground("#EAF2F8")
    .setFontColor("#40566D");
  sheet.getRange("N3").setValue(new Date());
}

function ensureMarketingDashboardChart192_(dashboard, helper, force) {
  const charts = dashboard.getCharts();
  if (!force && charts.length === 1) {
    return false;
  }
  charts.forEach(function(chart) {
    dashboard.removeChart(chart);
  });
  const platformCount = Array.isArray(MSH.PLATFORMS)
    ? MSH.PLATFORMS.length
    : 5;
  const chart = dashboard.newChart()
    .asLineChart()
    .addRange(helper.getRange(
      1,
      1,
      MARKETING_DASHBOARD_192.MAX_TREND_DAYS + 1,
      platformCount + 1
    ))
    .setNumHeaders(1)
    .setPosition(5, 16, 0, 0)
    .setOption("title", "Daily trend by platform")
    .setOption("width", 760)
    .setOption("height", 360)
    .setOption("legend", { position: "bottom" })
    .setOption("hAxis", { title: "Date", format: "dd/MM" })
    .setOption("vAxis", { minValue: 0 })
    .setOption("pointSize", 3)
    .setOption("interpolateNulls", false)
    .build();
  dashboard.insertChart(chart);
  return true;
}

function ensureMarketingDashboardEditTrigger192_() {
  const existing = getMarketingDashboardEditTriggers192_();
  if (existing.length === 0) {
    ScriptApp.newTrigger(MARKETING_DASHBOARD_192.EDIT_HANDLER)
      .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
      .onEdit()
      .create();
  } else if (existing.length > 1) {
    existing.slice(1).forEach(function(trigger) {
      ScriptApp.deleteTrigger(trigger);
    });
  }
  const count = getMarketingDashboardEditTriggers192_().length;
  return { installed: count === 1, count: count };
}

function getMarketingDashboardEditTriggers192_() {
  return ScriptApp.getProjectTriggers().filter(function(trigger) {
    return trigger.getHandlerFunction() === MARKETING_DASHBOARD_192.EDIT_HANDLER;
  });
}

function getOrCreateDashboardHelper192_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(MARKETING_DASHBOARD_192.HELPER_SHEET);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(MARKETING_DASHBOARD_192.HELPER_SHEET);
  }
  return sheet;
}

function isInteractiveDashboardLayout192_(sheet) {
  return sheet.getRange("A1").getDisplayValue() === "MARKETING PERFORMANCE HUB" &&
    sheet.getRange("A3").getDisplayValue() === "Start date" &&
    sheet.getRange("A9").getDisplayValue() === "Platform";
}

function dashboardRowMatches192_(row, filters) {
  return row.date >= filters.start &&
    row.date <= filters.end &&
    (filters.platform === MARKETING_DASHBOARD_192.ALL_PLATFORMS ||
      row.platform === filters.platform) &&
    (filters.account === MARKETING_DASHBOARD_192.ALL_ACCOUNTS ||
      row.accountLabel === filters.account) &&
    row.currency === filters.currency;
}

function addDashboardGroupMetrics192_(map, key, source) {
  if (!map.has(key)) {
    map.set(key, createPerformanceAccumulator_());
  }
  addPerformanceMetrics_(map.get(key), source);
}

function dashboardMetricRow192_(dimensions, metrics) {
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

function dashboardMetricValue192_(metrics, metric) {
  const derived = calculateDerivedPerformanceMetrics_(metrics);
  const values = {
    "Spend": metrics.spend,
    "Impressions": metrics.impressions,
    "Clicks": metrics.clicks,
    "Conversions": metrics.conversions,
    "App Installs": metrics.appInstalls,
    "CTR": derived.ctr,
    "CPC": derived.cpc,
    "CPM": derived.cpm,
    "CPA": derived.cpa,
    "CVR": derived.cvr,
    "CPI": derived.cpi
  };
  return values[metric];
}

function formatMarketingDashboardMetricTable192_(sheet, row, count, dimensions) {
  sheet.getRange(row, dimensions + 1, count, 1).setNumberFormat("#,##0.00");
  sheet.getRange(row, dimensions + 2, count, 4).setNumberFormat("#,##0.####");
  sheet.getRange(row, dimensions + 6, count, 1).setNumberFormat('0.00"%"');
  sheet.getRange(row, dimensions + 7, count, 3).setNumberFormat("#,##0.00");
  sheet.getRange(row, dimensions + 10, count, 1).setNumberFormat('0.00"%"');
  sheet.getRange(row, dimensions + 11, count, 1).setNumberFormat("#,##0.00");
}

function styleMarketingDashboardHeader192_(range, color) {
  range
    .setFontWeight("bold")
    .setFontColor("#FFFFFF")
    .setBackground(color)
    .setHorizontalAlignment("center");
}

function createPerformanceAccumulator_() {
  return {
    spend: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    appInstalls: 0
  };
}

function addPerformanceMetrics_(target, source) {
  target.spend += Number(source.spend || 0);
  target.impressions += Number(source.impressions || 0);
  target.clicks += Number(source.clicks || 0);
  target.conversions += Number(source.conversions || 0);
  target.appInstalls += Number(source.appInstalls || 0);
}

function createDashboardAccountLabel192_(row) {
  return [
    row.accountName || row.accountId,
    row.platform,
    row.accountId
  ].join(" · ");
}

function setDashboardListValidation192_(cell, values, fallback, keepCurrent) {
  const list = values.length ? values : [fallback];
  const current = String(cell.getValue() || "");
  cell.setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(list, true)
      .setAllowInvalid(false)
      .build()
  );
  if (!keepCurrent || list.indexOf(current) === -1) {
    cell.setValue(fallback);
  }
}

function setDashboardDateValidation192_(cell, minDate, maxDate) {
  cell.setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireDateBetween(minDate, maxDate)
      .setAllowInvalid(false)
      .build()
  );
}

function defaultDashboardStartDate192_(context) {
  const maxDate = context.maxDate
    ? isoDashboardDate192_(context.maxDate)
    : new Date();
  const proposed = new Date(maxDate.getTime() - 29 * 86400000);
  if (!context.minDate) {
    return proposed;
  }
  const minDate = isoDashboardDate192_(context.minDate);
  return proposed < minDate ? minDate : proposed;
}

function parseDashboardDate192_(value) {
  try {
    return value ? formatSpendDate_(value) : "";
  } catch (error) {
    return "";
  }
}

function isoDashboardDate192_(value) {
  const text = typeof value === "string" ? value : formatSpendDate_(value);
  const parts = text.split("-").map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function enumerateDashboardDates192_(start, end) {
  const output = [];
  const current = new Date(start.getTime());
  while (current <= end) {
    output.push(formatSpendDate_(current));
    current.setDate(current.getDate() + 1);
  }
  return output;
}

function daysBetweenDashboardDates192_(start, end) {
  return Math.max(
    0,
    Math.round(
      (isoDashboardDate192_(end).getTime() -
        isoDashboardDate192_(start).getTime()) / 86400000
    )
  );
}

function dashboardMetricFormat192_(metric) {
  if (metric === "CTR" || metric === "CVR") {
    return '0.00"%"';
  }
  if (
    metric === "Spend" ||
    metric === "CPC" ||
    metric === "CPM" ||
    metric === "CPA" ||
    metric === "CPI"
  ) {
    return "#,##0.00";
  }
  return "#,##0.####";
}

function ensureMarketingDashboardCapacity192_(sheet, requiredRows, requiredColumns) {
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

function writeMarketingDashboardCache192_(context) {
  try {
    CacheService.getDocumentCache().put(
      MARKETING_DASHBOARD_192.CACHE_KEY,
      JSON.stringify(context),
      MARKETING_DASHBOARD_192.CACHE_TTL_SECONDS
    );
  } catch (error) {
    // Cache is an optimization only; rendering remains correct without it.
  }
}

function readMarketingDashboardCache192_() {
  try {
    const value = CacheService.getDocumentCache().get(
      MARKETING_DASHBOARD_192.CACHE_KEY
    );
    return value ? JSON.parse(value) : null;
  } catch (error) {
    return null;
  }
}

function sanitizeDashboardMessage192_(message) {
  return String(message || "Unknown dashboard error")
    .replace(/access[_ -]?token/gi, "credential")
    .replace(/app[_ -]?secret/gi, "credential")
    .slice(0, 220);
}

function roundDashboardMetric192_(value, decimals) {
  const factor = Math.pow(10, decimals);
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}
