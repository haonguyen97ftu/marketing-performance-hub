/**
 * Marketing Performance Hub
 * Step 17.9B — Apple Ads production performance connector.
 *
 * Grain:
 *   Date × Apple Ads organization × campaign
 *
 * Base metrics written to Spend_Raw:
 *   Spend, Impressions, Clicks, Conversions, App Installs
 *
 * Apple Ads naming:
 *   Clicks       = taps
 *   Conversions  = totalInstalls
 *   App Installs = totalInstalls
 *
 * Required existing project files/functions:
 *   AppleAdsAuth.gs (Step 17.9A)
 *   getEnabledAccounts_(platform)
 *   upsertSpendRows_(records)
 *   rebuildSpendDaily()
 *   refreshDashboard()
 *
 * Optional Script Properties:
 *   APPLE_ADS_PERFORMANCE_TEST_DATE = yyyy-MM-dd
 *   APPLE_ADS_SYNC_START_DATE       = yyyy-MM-dd
 *   APPLE_ADS_SYNC_END_DATE         = yyyy-MM-dd
 */

const APPLE_ADS_179B = Object.freeze({
  PLATFORM: "Apple Search Ads",
  REPORT_PATH: "/reports/campaigns",
  // Apple report requests only accept ORTZ or UTC. The organization IANA
  // timezone remains useful for resolving completed local calendar dates,
  // but it must not be sent in the report request body.
  REPORT_TIME_ZONE: "ORTZ",
  PAGE_LIMIT: 1000,
  MAX_PAGES_PER_CHUNK: 1000,
  MAX_DAYS_PER_CHUNK: 30,
  MAX_HTTP_ATTEMPTS: 3,
  ROLLING_DAYS: 3,
  TEST_DATE_PROPERTY:
    "APPLE_ADS_PERFORMANCE_TEST_DATE",
  START_DATE_PROPERTY:
    "APPLE_ADS_SYNC_START_DATE",
  END_DATE_PROPERTY:
    "APPLE_ADS_SYNC_END_DATE"
});


/**
 * Step 17.9B production-writing test.
 *
 * Uses APPLE_ADS_PERFORMANCE_TEST_DATE when configured. Otherwise, it syncs
 * yesterday in each Apple Ads organization's timezone.
 */
function step179SyncAppleAdsPerformance() {
  const properties =
    PropertiesService.getScriptProperties();
  const testDate = String(
    properties.getProperty(
      APPLE_ADS_179B.TEST_DATE_PROPERTY
    ) || ""
  ).trim();

  if (testDate) {
    validateAppleAdsDate179B_(
      testDate,
      APPLE_ADS_179B.TEST_DATE_PROPERTY
    );
  }

  return syncAppleAdsPerformance179B_({
    runLabel:
      "Step 17.9B Apple Ads performance test",
    dateMode: testDate
      ? "FIXED_TEST_DATE"
      : "PER_ACCOUNT_YESTERDAY",
    dateResolver: function (account) {
      const date =
        testDate ||
        getAppleAdsYesterday179B_(
          account.timezone
        );

      return {
        startDate: date,
        endDate: date
      };
    },
    rebuildOutputs: true
  });
}


/**
 * Daily production entry point.
 *
 * Re-syncs the previous three completed days in each organization's timezone
 * so delayed attribution updates existing Record Keys.
 */
function syncAppleAdsRecentPerformance() {
  return syncAppleAdsPerformance179B_({
    runLabel:
      "Apple Ads rolling 3-day performance sync",
    dateMode: "PER_ACCOUNT_ROLLING_3_DAYS",
    dateResolver: function (account) {
      const endDate =
        getAppleAdsYesterday179B_(
          account.timezone
        );
      const startDate =
        shiftAppleAdsDate179B_(
          endDate,
          -(APPLE_ADS_179B.ROLLING_DAYS - 1)
        );

      return {
        startDate: startDate,
        endDate: endDate
      };
    },
    rebuildOutputs: true
  });
}


/**
 * Manual backfill entry point.
 *
 * Required Script Properties:
 *   APPLE_ADS_SYNC_START_DATE = yyyy-MM-dd
 *   APPLE_ADS_SYNC_END_DATE   = yyyy-MM-dd
 */
function syncAppleAdsPerformanceRange() {
  const properties =
    PropertiesService.getScriptProperties();
  const startDate =
    getRequiredAppleAdsProperty179A_(
      properties,
      APPLE_ADS_179B.START_DATE_PROPERTY
    );
  const endDate =
    getRequiredAppleAdsProperty179A_(
      properties,
      APPLE_ADS_179B.END_DATE_PROPERTY
    );

  validateAppleAdsDateRange179B_(
    startDate,
    endDate
  );

  return syncAppleAdsPerformance179B_({
    runLabel:
      "Apple Ads manual performance backfill",
    dateMode: "FIXED_MANUAL_RANGE",
    dateResolver: function () {
      return {
        startDate: startDate,
        endDate: endDate
      };
    },
    rebuildOutputs: true
  });
}


/**
 * Backward-compatible menu name.
 */
function syncAppleAdsYesterdaySpend() {
  return step179SyncAppleAdsPerformance();
}


/**
 * Core Apple Ads performance sync.
 *
 * Each organization fails independently. Successful rows remain safe because
 * the shared Spend_Raw writer upserts them by Record Key. Derived outputs
 * rebuild only when every enabled organization succeeds.
 */
function syncAppleAdsPerformance179B_(config) {
  assertAppleAdsDependencies179B_();

  const options = config || {};
  const accounts = getEnabledAccounts_(
    APPLE_ADS_179B.PLATFORM
  );

  if (!Array.isArray(accounts) || !accounts.length) {
    throw new Error(
      "No enabled Apple Ads organizations were found. " +
      "Open Accounts and tick Enabled for the Apple Ads account."
    );
  }

  const startedAt = new Date();
  const runId =
    typeof createRunId_ === "function"
      ? createRunId_()
      : Utilities.getUuid();
  const properties =
    PropertiesService.getScriptProperties();
  const credentials =
    getAppleAdsCredentials179A_(properties);
  const accessToken =
    getAppleAdsAccessToken179A_(
      credentials,
      false
    );
  const results = [];

  let successfulAccounts = 0;
  let accountsWithData = 0;
  let failedAccounts = 0;
  let totalApiRows = 0;
  let totalDailyMetricRows = 0;
  let totalNormalizedRows = 0;
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalPagesFetched = 0;
  let totalDateChunks = 0;

  accounts.forEach(function (account) {
    const accountStartedAt = new Date();
    const accountId =
      normalizeAppleAdsOrgId179B_(
        account.accountId
      );
    const safeAccount = {
      accountName:
        String(account.accountName || "").trim() ||
        "Apple Ads organization",
      maskedAccountId:
        maskAppleAdsId179A_(accountId)
    };
    let dateRange = null;

    try {
      if (!accountId) {
        throw new Error(
          "Apple Ads organization ID is missing."
        );
      }

      dateRange =
        options.dateResolver(account);
      validateAppleAdsDateRange179B_(
        dateRange.startDate,
        dateRange.endDate
      );

      const report =
        fetchAppleAdsCampaignReport179B_({
          account: account,
          accessToken: accessToken,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate
        });
      const normalized =
        normalizeAppleAdsReportRows179B_(
          report.rows,
          account
        );
      const writeResult =
        normalized.records.length > 0
          ? upsertSpendRows_(
              normalized.records
            )
          : { inserted: 0, updated: 0 };
      const inserted =
        Number(writeResult.inserted || 0);
      const updated =
        Number(writeResult.updated || 0);

      successfulAccounts += 1;
      totalApiRows += report.rows.length;
      totalDailyMetricRows +=
        normalized.dailyMetricRows;
      totalNormalizedRows +=
        normalized.records.length;
      totalInserted += inserted;
      totalUpdated += updated;
      totalPagesFetched +=
        report.pagesFetched;
      totalDateChunks +=
        report.dateChunks;

      if (normalized.records.length > 0) {
        accountsWithData += 1;
      }

      results.push(
        Object.assign({}, safeAccount, {
          status: "SUCCESS",
          dataStatus:
            normalized.records.length > 0
              ? "HAS_DATA"
              : "NO_DATA",
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          timezone:
            getAppleAdsTimezone179B_(
              account.timezone
            ),
          apiRows: report.rows.length,
          dailyMetricRows:
            normalized.dailyMetricRows,
          normalizedRows:
            normalized.records.length,
          pagesFetched:
            report.pagesFetched,
          dateChunks:
            report.dateChunks,
          inserted: inserted,
          updated: updated
        })
      );

      writeAppleAdsPerformanceLog179B_({
        runId: runId,
        startedAt: accountStartedAt,
        finishedAt: new Date(),
        accountId: accountId,
        status: "SUCCESS",
        records: normalized.records.length,
        message:
          inserted +
          " inserted, " +
          updated +
          " updated."
      });

    } catch (error) {
      failedAccounts += 1;
      const safeError =
        normalizeAppleAdsPerformanceError179B_(
          error
        );

      results.push(
        Object.assign({}, safeAccount, {
          status: "FAILED",
          dataStatus: "NOT_WRITTEN",
          startDate:
            dateRange &&
            dateRange.startDate
              ? dateRange.startDate
              : null,
          endDate:
            dateRange &&
            dateRange.endDate
              ? dateRange.endDate
              : null,
          error: safeError
        })
      );

      writeAppleAdsPerformanceError179B_({
        runId: runId,
        accountId: accountId,
        error: safeError
      });

      writeAppleAdsPerformanceLog179B_({
        runId: runId,
        startedAt: accountStartedAt,
        finishedAt: new Date(),
        accountId: accountId,
        status: "FAILED",
        records: 0,
        message: safeError.message
      });
    }
  });

  let outputsRebuilt = false;
  let outputError = null;

  if (
    failedAccounts === 0 &&
    options.rebuildOutputs !== false
  ) {
    try {
      rebuildSpendDaily();
      refreshDashboard();
      outputsRebuilt = true;
    } catch (error) {
      outputError =
        normalizeAppleAdsPerformanceError179B_(
          error
        ).message;

      writeAppleAdsPerformanceError179B_({
        runId: runId,
        accountId: "",
        functionName:
          "Apple Ads output rebuild",
        error: {
          httpStatus: null,
          reason: "OUTPUT_REBUILD_FAILED",
          message: outputError
        }
      });
    }
  }

  const finishedAt = new Date();
  const finalStatus =
    failedAccounts === 0 && !outputError
      ? "SUCCESS"
      : successfulAccounts > 0
        ? "PARTIAL_SUCCESS"
        : "FAILED";
  const summary = {
    status: finalStatus,
    runId: runId,
    runLabel:
      options.runLabel ||
      "Apple Ads performance sync",
    apiVersion:
      APPLE_ADS_179A.API_VERSION,
    dateMode:
      options.dateMode || "CUSTOM",
    enabledAccounts: accounts.length,
    successfulAccounts:
      successfulAccounts,
    accountsWithData: accountsWithData,
    failedAccounts: failedAccounts,
    apiRows: totalApiRows,
    dailyMetricRows:
      totalDailyMetricRows,
    normalizedRows:
      totalNormalizedRows,
    pagesFetched: totalPagesFetched,
    dateChunks: totalDateChunks,
    inserted: totalInserted,
    updated: totalUpdated,
    outputsRebuilt: outputsRebuilt,
    outputError: outputError,
    durationSeconds:
      roundAppleAdsSeconds179A_(
        finishedAt - startedAt
      ),
    results: results,
    secretsExposed: false
  };

  console.log(
    JSON.stringify(summary, null, 2)
  );
  if (options.showAlert !== false) {
    showAppleAdsPerformanceSummary179B_(
      summary
    );
  }

  return summary;
}


/**
 * Fetches campaign/day performance. Long backfills are split into 30-day
 * chunks and each chunk is paginated independently.
 */
function fetchAppleAdsCampaignReport179B_(
  config
) {
  const dateRanges =
    splitAppleAdsDateRange179B_(
      config.startDate,
      config.endDate,
      APPLE_ADS_179B.MAX_DAYS_PER_CHUNK
    );
  const rows = [];
  let pagesFetched = 0;

  dateRanges.forEach(function (dateRange) {
    const chunk =
      fetchAppleAdsCampaignReportChunk179B_({
        account: config.account,
        accessToken: config.accessToken,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate
      });

    Array.prototype.push.apply(
      rows,
      chunk.rows
    );
    pagesFetched += chunk.pagesFetched;
  });

  return {
    rows: rows,
    pagesFetched: pagesFetched,
    dateChunks: dateRanges.length
  };
}


function fetchAppleAdsCampaignReportChunk179B_(
  config
) {
  const accountId =
    normalizeAppleAdsOrgId179B_(
      config.account.accountId
    );
  const rows = [];
  let offset = 0;
  let pagesFetched = 0;

  while (
    pagesFetched <
    APPLE_ADS_179B.MAX_PAGES_PER_CHUNK
  ) {
    const payload = {
      startTime: config.startDate,
      endTime: config.endDate,
      timeZone:
        APPLE_ADS_179B.REPORT_TIME_ZONE,
      granularity: "DAILY",
      selector: {
        orderBy: [
          {
            field: "campaignId",
            sortOrder: "ASCENDING"
          }
        ],
        pagination: {
          offset: offset,
          limit:
            APPLE_ADS_179B.PAGE_LIMIT
        }
      },
      returnRecordsWithNoMetrics: false,
      returnRowTotals: false,
      returnGrandTotals: false
    };
    const response =
      fetchAppleAdsReportPage179B_({
        url:
          APPLE_ADS_179A.API_BASE_URL +
          APPLE_ADS_179B.REPORT_PATH,
        accessToken: config.accessToken,
        organizationId: accountId,
        payload: payload
      });
    const pageRows =
      extractAppleAdsReportRows179B_(
        response
      );
    const pagination =
      extractAppleAdsPagination179B_(
        response
      );

    Array.prototype.push.apply(
      rows,
      pageRows
    );
    pagesFetched += 1;

    const totalResults =
      toOptionalAppleAdsNumber179B_(
        pagination.totalResults
      );
    const nextOffset =
      offset + pageRows.length;

    if (
      pageRows.length === 0 ||
      pageRows.length <
        APPLE_ADS_179B.PAGE_LIMIT ||
      (
        totalResults !== null &&
        nextOffset >= totalResults
      )
    ) {
      return {
        rows: rows,
        pagesFetched: pagesFetched
      };
    }

    offset +=
      APPLE_ADS_179B.PAGE_LIMIT;
  }

  throw new Error(
    "Apple Ads report exceeded the pagination safety limit."
  );
}


function fetchAppleAdsReportPage179B_(
  config
) {
  let lastStatus = 0;
  let lastMessage =
    "Unknown Apple Ads API error.";
  let lastReason =
    "APPLE_ADS_API_ERROR";

  for (
    let attempt = 1;
    attempt <=
      APPLE_ADS_179B.MAX_HTTP_ATTEMPTS;
    attempt++
  ) {
    const response = UrlFetchApp.fetch(
      config.url,
      {
        method: "post",
        contentType: "application/json",
        headers: {
          Authorization:
            "Bearer " +
            config.accessToken,
          Accept: "application/json",
          "X-AP-Context":
            "orgId=" +
            config.organizationId
        },
        payload: JSON.stringify(
          config.payload
        ),
        muteHttpExceptions: true
      }
    );
    const statusCode =
      response.getResponseCode();
    const text =
      response.getContentText();
    const data =
      parseAppleAdsJson179A_(text);

    if (
      statusCode >= 200 &&
      statusCode < 300 &&
      !hasAppleAdsResponseError179B_(data)
    ) {
      return data;
    }

    const apiError =
      extractAppleAdsReportError179B_(
        data,
        text
      );

    lastStatus = statusCode;
    lastMessage = apiError.message;
    lastReason = apiError.reason;

    if (
      !isRetryableAppleAdsStatus179B_(
        statusCode
      ) ||
      attempt ===
        APPLE_ADS_179B.MAX_HTTP_ATTEMPTS
    ) {
      break;
    }

    Utilities.sleep(
      Math.min(
        4000,
        500 * Math.pow(2, attempt - 1)
      )
    );
  }

  const error = new Error(
    "Apple Ads API request failed (" +
    lastStatus +
    "): " +
    lastMessage
  );
  error.statusCode = lastStatus;
  error.reason = lastReason;
  throw error;
}


function extractAppleAdsReportRows179B_(
  response
) {
  const data =
    response && response.data
      ? response.data
      : {};
  const reporting =
    data.reportingDataResponse ||
    response.reportingDataResponse ||
    {};
  const rows =
    Array.isArray(reporting.row)
      ? reporting.row
      : Array.isArray(reporting.rows)
        ? reporting.rows
        : [];

  return rows;
}


function extractAppleAdsPagination179B_(
  response
) {
  const data =
    response && response.data
      ? response.data
      : {};
  const reporting =
    data.reportingDataResponse ||
    response.reportingDataResponse ||
    {};

  return (
    reporting.pagination ||
    data.pagination ||
    response.pagination ||
    {}
  );
}


/**
 * Converts Apple report metadata + daily granularity rows into Spend_Raw
 * records and aggregates any duplicate date/campaign records defensively.
 */
function normalizeAppleAdsReportRows179B_(
  rows,
  account
) {
  const accountId =
    normalizeAppleAdsOrgId179B_(
      account.accountId
    );
  const accountName =
    String(account.accountName || "").trim() ||
    "Apple Ads organization";
  const accountCurrency =
    String(account.currency || "")
      .trim()
      .toUpperCase();
  const recordsByKey = new Map();
  let dailyMetricRows = 0;

  if (!accountCurrency) {
    throw new Error(
      "Apple Ads account currency is missing. " +
      "Run Step 17.9A again before syncing performance."
    );
  }

  (rows || []).forEach(function (row) {
    const metadata =
      row && row.metadata
        ? row.metadata
        : {};
    const campaignId = String(
      metadata.campaignId ||
      metadata.id ||
      ""
    ).trim();
    const campaignName =
      String(
        metadata.campaignName ||
        metadata.name ||
        ""
      ).trim() ||
      "Unnamed campaign";
    const granularity =
      Array.isArray(row.granularity)
        ? row.granularity
        : [];

    granularity.forEach(function (metric) {
      const date =
        normalizeAppleAdsMetricDate179B_(
          metric && metric.date
        );

      if (!date || !campaignId) {
        return;
      }

      dailyMetricRows += 1;

      const localSpend =
        getAppleAdsLocalSpend179B_(
          metric
        );
      const currency =
        String(
          localSpend.currency ||
          accountCurrency
        )
          .trim()
          .toUpperCase();
      const totalInstalls =
        getAppleAdsTotalInstalls179B_(
          metric
        );
      const record = {
        date: date,
        platform:
          APPLE_ADS_179B.PLATFORM,
        accountId: accountId,
        accountName: accountName,
        campaignId: campaignId,
        campaignName: campaignName,
        currency: currency,
        spend:
          toAppleAdsMetricNumber179B_(
            localSpend.amount,
            "localSpend.amount"
          ),
        impressions:
          toAppleAdsMetricNumber179B_(
            metric.impressions,
            "impressions"
          ),
        clicks:
          toAppleAdsMetricNumber179B_(
            metric.taps,
            "taps"
          ),
        conversions: totalInstalls,
        appInstalls: totalInstalls
      };
      const key = [
        record.date,
        record.accountId,
        record.campaignId
      ].join("|");
      const existing =
        recordsByKey.get(key);

      if (!existing) {
        recordsByKey.set(key, record);
        return;
      }

      if (
        existing.currency !==
        record.currency
      ) {
        throw new Error(
          "Apple Ads returned mixed currencies for one campaign/day."
        );
      }

      existing.spend += record.spend;
      existing.impressions +=
        record.impressions;
      existing.clicks += record.clicks;
      existing.conversions +=
        record.conversions;
      existing.appInstalls +=
        record.appInstalls;
    });
  });

  const records = Array.from(
    recordsByKey.values()
  ).map(function (record) {
    record.spend =
      roundAppleAdsNumber179B_(
        record.spend,
        6
      );
    record.impressions =
      roundAppleAdsNumber179B_(
        record.impressions,
        4
      );
    record.clicks =
      roundAppleAdsNumber179B_(
        record.clicks,
        4
      );
    record.conversions =
      roundAppleAdsNumber179B_(
        record.conversions,
        4
      );
    record.appInstalls =
      roundAppleAdsNumber179B_(
        record.appInstalls,
        4
      );

    return record;
  });

  return {
    records: records,
    dailyMetricRows: dailyMetricRows
  };
}


function getAppleAdsLocalSpend179B_(
  metric
) {
  const value =
    metric && metric.localSpend !== undefined
      ? metric.localSpend
      : metric && metric.spend !== undefined
        ? metric.spend
        : 0;

  if (
    value &&
    typeof value === "object"
  ) {
    return {
      amount:
        value.amount !== undefined
          ? value.amount
          : 0,
      currency:
        value.currency || ""
    };
  }

  return {
    amount: value,
    currency: ""
  };
}


function getAppleAdsTotalInstalls179B_(
  metric
) {
  if (
    metric &&
    metric.totalInstalls !== undefined
  ) {
    return toAppleAdsMetricNumber179B_(
      metric.totalInstalls,
      "totalInstalls"
    );
  }

  return (
    toAppleAdsMetricNumber179B_(
      metric && metric.tapInstalls,
      "tapInstalls"
    ) +
    toAppleAdsMetricNumber179B_(
      metric && metric.viewInstalls,
      "viewInstalls"
    )
  );
}


function normalizeAppleAdsMetricDate179B_(
  value
) {
  const text =
    String(value || "").trim();
  const match = text.match(
    /^(\d{4}-\d{2}-\d{2})/
  );

  if (!match) {
    return "";
  }

  validateAppleAdsDate179B_(
    match[1],
    "Apple Ads metric date"
  );

  return match[1];
}


function toAppleAdsMetricNumber179B_(
  value,
  label
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  const number = Number(value);

  if (!isFinite(number) || number < 0) {
    throw new Error(
      "Apple Ads returned an invalid " +
      String(label || "metric") +
      " value."
    );
  }

  return number;
}


function toOptionalAppleAdsNumber179B_(
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);
  return isFinite(number)
    ? number
    : null;
}


function roundAppleAdsNumber179B_(
  value,
  decimals
) {
  const factor = Math.pow(
    10,
    Number(decimals || 0)
  );

  return (
    Math.round(
      (Number(value) + Number.EPSILON) *
        factor
    ) / factor
  );
}


function normalizeAppleAdsOrgId179B_(
  value
) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "");
}


function getAppleAdsTimezone179B_(
  timezone
) {
  const zone =
    String(timezone || "").trim() ||
    Session.getScriptTimeZone() ||
    "UTC";

  try {
    Utilities.formatDate(
      new Date(),
      zone,
      "yyyy-MM-dd"
    );
  } catch (error) {
    throw new Error(
      "Invalid Apple Ads account timezone: " +
      zone
    );
  }

  return zone;
}


function getAppleAdsYesterday179B_(
  timezone
) {
  const zone =
    getAppleAdsTimezone179B_(
      timezone
    );
  const todayText =
    Utilities.formatDate(
      new Date(),
      zone,
      "yyyy-MM-dd"
    );

  return shiftAppleAdsDate179B_(
    todayText,
    -1
  );
}


function shiftAppleAdsDate179B_(
  dateText,
  days
) {
  validateAppleAdsDate179B_(
    dateText,
    "Apple Ads date"
  );

  const parts = dateText
    .split("-")
    .map(Number);
  const date = new Date(
    Date.UTC(
      parts[0],
      parts[1] - 1,
      parts[2]
    )
  );

  date.setUTCDate(
    date.getUTCDate() + Number(days || 0)
  );

  return Utilities.formatDate(
    date,
    "UTC",
    "yyyy-MM-dd"
  );
}


function splitAppleAdsDateRange179B_(
  startDate,
  endDate,
  maxDays
) {
  validateAppleAdsDateRange179B_(
    startDate,
    endDate
  );

  const chunks = [];
  const chunkSize = Math.max(
    1,
    Number(maxDays || 1)
  );
  let cursor = startDate;

  while (cursor <= endDate) {
    let chunkEnd =
      shiftAppleAdsDate179B_(
        cursor,
        chunkSize - 1
      );

    if (chunkEnd > endDate) {
      chunkEnd = endDate;
    }

    chunks.push({
      startDate: cursor,
      endDate: chunkEnd
    });

    cursor =
      shiftAppleAdsDate179B_(
        chunkEnd,
        1
      );
  }

  return chunks;
}


function validateAppleAdsDateRange179B_(
  startDate,
  endDate
) {
  validateAppleAdsDate179B_(
    startDate,
    "Apple Ads start date"
  );
  validateAppleAdsDate179B_(
    endDate,
    "Apple Ads end date"
  );

  if (startDate > endDate) {
    throw new Error(
      "Apple Ads start date must not be after end date."
    );
  }
}


function validateAppleAdsDate179B_(
  value,
  label
) {
  const text =
    String(value || "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(
      label + " must use yyyy-MM-dd."
    );
  }

  const parts = text
    .split("-")
    .map(Number);
  const date = new Date(
    Date.UTC(
      parts[0],
      parts[1] - 1,
      parts[2]
    )
  );
  const valid =
    date.getUTCFullYear() === parts[0] &&
    date.getUTCMonth() === parts[1] - 1 &&
    date.getUTCDate() === parts[2];

  if (!valid) {
    throw new Error(
      label + " is not a valid calendar date."
    );
  }
}


function hasAppleAdsResponseError179B_(
  data
) {
  const error =
    data && data.error;

  return Boolean(
    error &&
    (
      typeof error === "string" ||
      (
        Array.isArray(error.errors) &&
        error.errors.length
      ) ||
      error.message
    )
  );
}


function extractAppleAdsReportError179B_(
  data,
  fallbackText
) {
  const error =
    data && data.error
      ? data.error
      : {};
  const firstError =
    Array.isArray(error.errors) &&
    error.errors.length
      ? error.errors[0]
      : {};
  const reason = String(
    firstError.messageCode ||
    error.code ||
    data.code ||
    "APPLE_ADS_API_ERROR"
  ).trim();
  const candidates = [
    firstError.message,
    error.message,
    typeof error === "string"
      ? error
      : "",
    data && data.message,
    data && data.rawText,
    fallbackText
  ];
  let message =
    "Unknown Apple Ads API error.";

  for (
    let index = 0;
    index < candidates.length;
    index++
  ) {
    const candidate =
      candidates[index];

    if (
      typeof candidate === "string" &&
      candidate.trim()
    ) {
      message = candidate.trim();
      break;
    }
  }

  return {
    reason:
      reason ||
      "APPLE_ADS_API_ERROR",
    message:
      sanitizeAppleAdsMessage179A_(
        message
      )
  };
}


function isRetryableAppleAdsStatus179B_(
  statusCode
) {
  return (
    Number(statusCode) === 408 ||
    Number(statusCode) === 429 ||
    Number(statusCode) >= 500
  );
}


function normalizeAppleAdsPerformanceError179B_(
  error
) {
  const message =
    sanitizeAppleAdsMessage179A_(
      error && error.message
        ? error.message
        : String(error)
    );
  const statusMatch = message.match(
    /failed \((\d{3})\)/i
  );
  const upper = message.toUpperCase();
  let reason =
    error && error.reason
      ? String(error.reason)
      : "APPLE_ADS_PERFORMANCE_SYNC_FAILED";

  if (
    upper.indexOf("UNAUTHORIZED") >= 0 ||
    upper.indexOf("UNAUTHENTICATED") >= 0 ||
    upper.indexOf("INVALID_CLIENT") >= 0 ||
    Number(
      error && error.statusCode
    ) === 401
  ) {
    reason = "OAUTH_ERROR";
  } else if (
    upper.indexOf("FORBIDDEN") >= 0 ||
    upper.indexOf("PERMISSION") >= 0 ||
    Number(
      error && error.statusCode
    ) === 403
  ) {
    reason = "PERMISSION_DENIED";
  } else if (
    upper.indexOf("RATE") >= 0 ||
    Number(
      error && error.statusCode
    ) === 429
  ) {
    reason = "RATE_LIMIT";
  }

  return {
    type:
      error && error.name
        ? String(error.name)
        : "Error",
    httpStatus:
      error && error.statusCode
        ? Number(error.statusCode)
        : statusMatch
          ? Number(statusMatch[1])
          : null,
    reason: reason,
    message: message
  };
}


function assertAppleAdsDependencies179B_() {
  const dependencyChecks = [
    [
      "getAppleAdsCredentials179A_",
      typeof getAppleAdsCredentials179A_
    ],
    [
      "getAppleAdsAccessToken179A_",
      typeof getAppleAdsAccessToken179A_
    ],
    [
      "getRequiredAppleAdsProperty179A_",
      typeof getRequiredAppleAdsProperty179A_
    ],
    [
      "parseAppleAdsJson179A_",
      typeof parseAppleAdsJson179A_
    ],
    [
      "sanitizeAppleAdsMessage179A_",
      typeof sanitizeAppleAdsMessage179A_
    ],
    [
      "maskAppleAdsId179A_",
      typeof maskAppleAdsId179A_
    ],
    [
      "roundAppleAdsSeconds179A_",
      typeof roundAppleAdsSeconds179A_
    ],
    [
      "getEnabledAccounts_",
      typeof getEnabledAccounts_
    ],
    [
      "upsertSpendRows_",
      typeof upsertSpendRows_
    ],
    [
      "rebuildSpendDaily",
      typeof rebuildSpendDaily
    ],
    [
      "refreshDashboard",
      typeof refreshDashboard
    ]
  ];
  const missing =
    dependencyChecks
      .filter(function (check) {
        return check[1] !== "function";
      })
      .map(function (check) {
        return check[0];
      });

  if (
    typeof APPLE_ADS_179A === "undefined"
  ) {
    missing.push("APPLE_ADS_179A");
  }

  if (missing.length > 0) {
    throw new Error(
      "Apple Ads Step 17.9B is missing dependencies: " +
      missing.join(", ") +
      ". Add AppleAdsAuth.gs and the shared Hub modules first."
    );
  }
}


function writeAppleAdsPerformanceLog179B_(
  entry
) {
  if (typeof writeSyncLog_ !== "function") {
    return;
  }

  writeSyncLog_({
    runId: entry.runId,
    startedAt: entry.startedAt,
    finishedAt: entry.finishedAt,
    platform: APPLE_ADS_179B.PLATFORM,
    accountId: entry.accountId,
    status: entry.status,
    records: entry.records,
    durationSeconds:
      (entry.finishedAt -
        entry.startedAt) /
      1000,
    message: entry.message
  });
}


function writeAppleAdsPerformanceError179B_(
  entry
) {
  if (typeof writeErrorLog_ !== "function") {
    return;
  }

  writeErrorLog_({
    runId: entry.runId,
    platform: APPLE_ADS_179B.PLATFORM,
    accountId: entry.accountId || "",
    functionName:
      entry.functionName ||
      "step179SyncAppleAdsPerformance",
    errorCode:
      entry.error.reason ||
      entry.error.httpStatus ||
      "APPLE_ADS_PERFORMANCE_SYNC_FAILED",
    message: entry.error.message,
    details: ""
  });
}


function showAppleAdsPerformanceSummary179B_(
  summary
) {
  try {
    SpreadsheetApp.getUi().alert(
      "Apple Ads performance sync",
      [
        "Status: " + summary.status,
        "Successful accounts: " +
          summary.successfulAccounts +
          "/" +
          summary.enabledAccounts,
        "Accounts with data: " +
          summary.accountsWithData,
        "Failed accounts: " +
          summary.failedAccounts,
        "Inserted: " +
          summary.inserted,
        "Updated: " +
          summary.updated,
        "Outputs rebuilt: " +
          summary.outputsRebuilt
      ].join("\n"),
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (uiError) {
    // Allows trigger/headless execution.
  }
}
