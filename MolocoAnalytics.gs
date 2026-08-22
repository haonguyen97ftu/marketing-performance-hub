/**
 * Tests whether this Moloco integration may use Analytics Detail.
 * It tests only the first enabled account and does not save spend data.
 */
function testMolocoAnalyticsAccess() {
  const runId = createRunId_();
  const startedAt = new Date();
  const accounts = getEnabledAccounts_("Moloco");

  if (!accounts.length) {
    SpreadsheetApp.getUi().alert(
      "No enabled Moloco accounts."
    );
    return;
  }

  const account = accounts[0];
  const reportDate = getYesterdayForTimezone_(
    account.timezone
  );

  try {
    const token = getMolocoAccessToken_(false);

    const response = apiRequest_({
      platform: "Moloco",
      url:
        "https://api.moloco.cloud/cm/v1/analytics-detail",
      method: "post",
      contentType: "application/json",
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/json",
        "Moloco-Cloud-Api-Version": "v1.10"
      },
      payload: {
        ad_account_id: account.accountId,
        timezone:
          account.timezone ||
          Session.getScriptTimeZone(),
        date_range: {
          start: reportDate,
          end: reportDate
        },
        dimensions: [
          "DATE"
        ],
        metrics: [
          "SPEND",
          "IMPRESSIONS",
          "CLICKS",
          "CONVERSIONS",
          "INSTALLS"
        ],
        limit: "10"
      },
      maxAttempts: 1
    });

    const finishedAt = new Date();

    writeSyncLog_({
      runId,
      startedAt,
      finishedAt,
      platform: "Moloco",
      accountId: account.accountId,
      status: "SUCCESS",
      records: 0,
      durationSeconds:
        (finishedAt - startedAt) / 1000,
      message:
        "Analytics Detail API access verified."
    });

    SpreadsheetApp.getUi().alert(
      "Moloco Analytics access passed",
      [
        "✅ Analytics Detail accepted the request.",
        "✅ Core performance metrics are supported.",
        "✅ The integration can use the synchronous fallback.",
        "",
        "No performance data was saved during this test."
      ].join("\n"),
      SpreadsheetApp.getUi().ButtonSet.OK
    );

  } catch (error) {
    writeErrorLog_({
      runId,
      platform: "Moloco",
      accountId: account.accountId,
      functionName: "testMolocoAnalyticsAccess",
      errorCode:
        error.statusCode ||
        "MOLOCO_ANALYTICS_ACCESS_FAILED",
      message: error.message,
      details: error.safeResponse || ""
    });

    SpreadsheetApp.getUi().alert(
      "Moloco Analytics access failed",
      sanitizeLogText_(error.message),
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

/**
 * Reads only JSON field names from one Analytics response.
 * No account IDs, campaign names, spend, or other values are shown.
 */
function inspectMolocoAnalyticsSchema() {
  const accounts = getEnabledAccounts_("Moloco");

  if (!accounts.length) {
    SpreadsheetApp.getUi().alert(
      "No enabled Moloco accounts."
    );
    return;
  }

  const account = accounts[0];
  const date = getYesterdayForTimezone_(
    account.timezone
  );

  try {
    const response = apiRequest_({
      platform: "Moloco",
      url:
        "https://api.moloco.cloud/cm/v1/analytics-detail",
      method: "post",
      contentType: "application/json",
      headers: {
        Authorization:
          "Bearer " +
          getMolocoAccessToken_(false),
        Accept: "application/json",
        "Moloco-Cloud-Api-Version": "v1.10"
      },
      payload: {
        ad_account_id: account.accountId,
        timezone:
          account.timezone ||
          Session.getScriptTimeZone(),
        date_range: {
          start: date,
          end: date
        },
        dimensions: [
          "DATE",
          "CAMPAIGN_ID",
          "CAMPAIGN_TITLE",
          "CURRENCY"
        ],
        metrics: [
          "SPEND",
          "IMPRESSIONS",
          "CLICKS",
          "CONVERSIONS",
          "INSTALLS"
        ],
        limit: "1"
      },
      maxAttempts: 1
    });

    const data = response.data || {};
    const rows = findMolocoAnalyticsRows_(data);
    const sample = rows.length ? rows[0] : {};

    const nestedKeys = {};

    Object.keys(sample).forEach(key => {
      const value = sample[key];

      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
      ) {
        nestedKeys[key] = Object.keys(value).sort();
      }
    });

    SpreadsheetApp.getUi().alert(
      "Moloco Analytics schema",
      [
        "Top-level keys:",
        JSON.stringify(Object.keys(data).sort()),
        "",
        "Row count returned: " + rows.length,
        "",
        "First-row keys:",
        JSON.stringify(Object.keys(sample).sort()),
        "",
        "Nested object keys:",
        JSON.stringify(nestedKeys)
      ].join("\n"),
      SpreadsheetApp.getUi().ButtonSet.OK
    );

  } catch (error) {
    SpreadsheetApp.getUi().alert(
      "Schema inspection failed",
      sanitizeLogText_(error.message),
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

function findMolocoAnalyticsRows_(data) {
  const candidates = [
    data.rows,
    data.results,
    data.summary,
    data.data &&
      data.data.rows,
    Array.isArray(data.data)
      ? data.data
      : null
  ];

  for (let i = 0; i < candidates.length; i++) {
    if (Array.isArray(candidates[i])) {
      return candidates[i];
    }
  }

  return [];
}

/**
 * Step 17.7B.
 *
 * Fetches campaign/day performance for every enabled Moloco account
 * through Analytics Detail and upserts it into Spend_Raw.
 *
 * Optional Script Property for a deterministic test:
 * MOLOCO_PERFORMANCE_TEST_DATE = YYYY-MM-DD
 */
function step177SyncMolocoPerformance(options) {
  const config = options || {};
  const overallRunId = createRunId_();
  const overallStartedAt = new Date();
  const accounts = getEnabledAccounts_("Moloco");
  const requestedStart = String(config.startDate || "").trim();
  const requestedEnd = String(config.endDate || "").trim();
  const hasRequestedRange = Boolean(requestedStart || requestedEnd);
  const testDate = hasRequestedRange
    ? null
    : getMolocoPerformanceTestDate_();

  if (hasRequestedRange) {
    validateMolocoPerformanceRange_(requestedStart, requestedEnd);
  }

  if (!accounts.length) {
    throw new Error(
      "No enabled Moloco accounts were found. " +
      "Open Accounts and enable at least one Moloco account."
    );
  }

  const token = getMolocoAccessToken_(false);
  const results = [];

  let successfulAccounts = 0;
  let accountsWithData = 0;
  let failedAccounts = 0;
  let totalApiRows = 0;
  let totalNormalizedRows = 0;
  let inserted = 0;
  let updated = 0;

  accounts.forEach(account => {
    const accountStartedAt = new Date();
    const defaultDate =
      testDate || getYesterdayForTimezone_(account.timezone);
    const reportStartDate = hasRequestedRange
      ? requestedStart
      : defaultDate;
    const reportEndDate = hasRequestedRange
      ? requestedEnd
      : defaultDate;
    const fallbackDate = reportStartDate === reportEndDate
      ? reportStartDate
      : "";

    try {
      const rows = fetchMolocoPerformanceRows_(
        account,
        token,
        reportStartDate,
        reportEndDate
      );

      const performanceRecords = rows.map(row =>
        mapMolocoAnalyticsRow_(
          row,
          account,
          fallbackDate
        )
      );

      const writeResult =
        upsertSpendRows_(performanceRecords);

      successfulAccounts++;
      totalApiRows += rows.length;
      totalNormalizedRows +=
        performanceRecords.length;
      inserted += Number(writeResult.inserted || 0);
      updated += Number(writeResult.updated || 0);

      if (rows.length) {
        accountsWithData++;
      }

      const accountFinishedAt = new Date();
      const accountResult = {
        accountName: account.accountName || "",
        maskedAccountId:
          maskMolocoAccountId_(account.accountId),
        status: "SUCCESS",
        dataStatus:
          rows.length ? "HAS_DATA" : "NO_DATA",
        apiRows: rows.length,
        normalizedRows: performanceRecords.length,
        inserted: Number(writeResult.inserted || 0),
        updated: Number(writeResult.updated || 0)
      };

      results.push(accountResult);

      writeSyncLog_({
        runId: overallRunId,
        startedAt: accountStartedAt,
        finishedAt: accountFinishedAt,
        platform: "Moloco",
        accountId: account.accountId,
        status: "SUCCESS",
        records: performanceRecords.length,
        durationSeconds:
          (accountFinishedAt - accountStartedAt) /
          1000,
        message:
          accountResult.inserted + " inserted, " +
          accountResult.updated + " updated."
      });

    } catch (error) {
      failedAccounts++;

      const safeError = normalizeMolocoSyncError_(error);

      results.push({
        accountName: account.accountName || "",
        maskedAccountId:
          maskMolocoAccountId_(account.accountId),
        status: "FAILED",
        dataStatus: "NOT_WRITTEN",
        error: safeError
      });

      writeErrorLog_({
        runId: overallRunId,
        platform: "Moloco",
        accountId: account.accountId,
        functionName:
          "step177SyncMolocoPerformance",
        errorCode:
          safeError.httpStatus ||
          "MOLOCO_PERFORMANCE_SYNC_FAILED",
        message: safeError.message,
        details: error.safeResponse || ""
      });

      const accountFinishedAt = new Date();

      writeSyncLog_({
        runId: overallRunId,
        startedAt: accountStartedAt,
        finishedAt: accountFinishedAt,
        platform: "Moloco",
        accountId: account.accountId,
        status: "FAILED",
        records: 0,
        durationSeconds:
          (accountFinishedAt - accountStartedAt) /
          1000,
        message: safeError.message
      });
    }
  });

  let outputsRebuilt = false;
  let outputError = null;

  /*
   * Do not publish a partially rebuilt dashboard. Rows already written
   * remain safe and will be updated on the next run by Record Key.
   */
  if (
    failedAccounts === 0 &&
    config.rebuildOutputs !== false
  ) {
    try {
      rebuildMolocoPerformanceOutputs_();
      outputsRebuilt = true;
    } catch (error) {
      outputError = sanitizeLogText_(
        error && error.message
          ? error.message
          : String(error)
      );

      writeErrorLog_({
        runId: overallRunId,
        platform: "Moloco",
        accountId: "",
        functionName:
          "rebuildMolocoPerformanceOutputs_",
        errorCode: "MOLOCO_OUTPUT_REBUILD_FAILED",
        message: outputError,
        details: ""
      });
    }
  }

  const overallFinishedAt = new Date();
  const overallStatus =
    failedAccounts === 0 && !outputError
      ? "SUCCESS"
      : successfulAccounts > 0
        ? "PARTIAL_SUCCESS"
        : "FAILED";

  const summary = {
    status: overallStatus,
    runId: overallRunId,
    runLabel:
      config.runLabel ||
      "Step 17.7B Moloco performance test",
    testDate: testDate || null,
    startDate: hasRequestedRange ? requestedStart : null,
    endDate: hasRequestedRange ? requestedEnd : null,
    apiVersion: "v1.10",
    enabledAccounts: accounts.length,
    successfulAccounts,
    accountsWithData,
    failedAccounts,
    apiRows: totalApiRows,
    normalizedRows: totalNormalizedRows,
    inserted,
    updated,
    outputsRebuilt,
    outputError,
    durationSeconds: Number(
      (
        (overallFinishedAt - overallStartedAt) /
        1000
      ).toFixed(1)
    ),
    results,
    secretsExposed: false
  };

  updatePlatformResult_(
    "Moloco",
    totalNormalizedRows +
      " performance rows synchronized",
    overallStatus
  );

  Logger.log(JSON.stringify(summary, null, 2));

  if (config.showAlert !== false) {
    try {
      SpreadsheetApp.getUi().alert(
        "Moloco performance synchronization",
        [
          "Status: " + overallStatus,
          "Successful accounts: " + successfulAccounts,
          "Accounts with data: " + accountsWithData,
          "Failed accounts: " + failedAccounts,
          "API rows: " + totalApiRows,
          "Inserted: " + inserted,
          "Updated: " + updated,
          "Outputs rebuilt: " + outputsRebuilt,
          "",
          hasRequestedRange
            ? "Date range: " + requestedStart + " to " + requestedEnd
            : testDate
              ? "Test date: " + testDate
              : "Date: yesterday in each account's timezone",
          outputError
            ? "Output error: " + outputError
            : ""
        ].filter(Boolean).join("\n"),
        SpreadsheetApp.getUi().ButtonSet.OK
      );
    } catch (uiError) {
      // Allows trigger/headless execution.
    }
  }

  return summary;
}

/**
 * Backward-compatible menu/function name.
 */
function syncMolocoYesterdaySpend() {
  return step177SyncMolocoPerformance();
}

function fetchMolocoPerformanceRows_(
  account,
  token,
  startDate,
  endDate
) {
  const response = apiRequest_({
    platform: "Moloco",
    url:
      "https://api.moloco.cloud/cm/v1/analytics-detail",
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/json",
      "Moloco-Cloud-Api-Version": "v1.10"
    },
    payload: {
      ad_account_id: account.accountId,
      timezone:
        account.timezone ||
        Session.getScriptTimeZone(),
      date_range: {
        start: startDate,
        end: endDate
      },
      dimensions: [
        "DATE",
        "CAMPAIGN_ID",
        "CAMPAIGN_TITLE",
        "CURRENCY"
      ],
      metrics: [
        "SPEND",
        "IMPRESSIONS",
        "CLICKS",
        "CONVERSIONS",
        "INSTALLS"
      ],
      limit: "10000"
    }
  });

  const data = response.data || {};
  const rows = findMolocoAnalyticsRows_(data);
  const reportedCount = Number(
    data.num_rows || rows.length
  );

  /*
   * Analytics Detail caps a response at 10,000 rows and does not
   * expose pagination. Never silently accept incomplete data.
   */
  if (
    reportedCount > rows.length ||
    rows.length >= 10000
  ) {
    throw new Error(
      "Moloco response may be truncated: received " +
      rows.length +
      " of " +
      reportedCount +
      " rows. Use a shorter date range or a lower granularity."
    );
  }

  return rows;
}

function validateMolocoPerformanceRange_(startDate, endDate) {
  var pattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!pattern.test(startDate) || !pattern.test(endDate)) {
    throw new Error(
      "Moloco sync dates must use YYYY-MM-DD."
    );
  }
  if (startDate > endDate) {
    throw new Error(
      "Moloco sync start date must be on or before end date."
    );
  }
}

/**
 * Converts one verified Moloco Analytics row into the common
 * Spend_Raw performance format.
 */
function mapMolocoAnalyticsRow_(
  row,
  account,
  fallbackDate
) {
  const campaign = row.campaign || {};
  const metric = row.metric || {};
  const adAccount = row.ad_account || {};

  const currency =
    account.currency ||
    adAccount.currency ||
    "";

  if (!currency) {
    throw new Error(
      "Moloco account currency is missing. " +
      "Reload the Moloco accounts and retry."
    );
  }

  return {
    date: row.date || fallbackDate,
    platform: "Moloco",
    accountId: account.accountId,
    accountName:
      account.accountName ||
      adAccount.title ||
      "",
    campaignId:
      campaign.id ||
      "ACCOUNT_TOTAL",
    campaignName:
      campaign.title ||
      "Account total",
    currency,
    spend: toMolocoMetricNumber_(metric.spend),
    impressions:
      toMolocoMetricNumber_(metric.impressions),
    clicks:
      toMolocoMetricNumber_(metric.clicks),
    conversions:
      toMolocoMetricNumber_(metric.conversions),
    appInstalls:
      toMolocoMetricNumber_(metric.installs)
  };
}

function toMolocoMetricNumber_(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  const number = Number(value);

  if (!isFinite(number)) {
    throw new Error(
      "Moloco returned a non-numeric metric value."
    );
  }

  return number;
}

function getMolocoPerformanceTestDate_() {
  const value = (
    PropertiesService.getScriptProperties()
      .getProperty("MOLOCO_PERFORMANCE_TEST_DATE") ||
    ""
  ).trim();

  if (!value) {
    return "";
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(
      "MOLOCO_PERFORMANCE_TEST_DATE must use YYYY-MM-DD."
    );
  }

  return value;
}

function rebuildMolocoPerformanceOutputs_() {
  if (typeof rebuildSpendDaily !== "function") {
    throw new Error(
      "Required function rebuildSpendDaily was not found."
    );
  }

  if (typeof refreshDashboard !== "function") {
    throw new Error(
      "Required function refreshDashboard was not found."
    );
  }

  rebuildSpendDaily();
  refreshDashboard();
}

function maskMolocoAccountId_(accountId) {
  const value = String(accountId || "");

  if (!value) {
    return "";
  }

  return "****" + value.slice(-4);
}

function normalizeMolocoSyncError_(error) {
  const statusCode = Number(
    error && error.statusCode
      ? error.statusCode
      : 0
  );
  const message = sanitizeLogText_(
    error && error.message
      ? error.message
      : String(error)
  );

  return {
    type:
      error && error.name
        ? String(error.name)
        : "Error",
    httpStatus: statusCode || null,
    message
  };
}
