/**
 * Marketing Spend Hub
 * Step 17.6B — TikTok production performance connector.
 *
 * Grain:
 *   Date × TikTok advertiser × campaign
 *
 * Base metrics:
 *   Spend, Impressions, Clicks, Conversions, App Installs
 *
 * Derived metrics are recalculated downstream by Aggregation.gs.
 *
 * Required existing project functions:
 *   upsertAccounts_(accounts)
 *   getEnabledAccounts_(platform)
 *   upsertSpendRows_(records)
 *   rebuildSpendDaily()
 *   refreshDashboard()
 *
 * Required Script Property:
 *   TIKTOK_ACCESS_TOKEN
 *
 * Existing property created by Step 17.3:
 *   TIKTOK_AUTHORIZED_ADVERTISERS_JSON
 *
 * Optional test property:
 *   TIKTOK_TEST_DATE = yyyy-MM-dd
 */

const TIKTOK_PRODUCTION_176 = Object.freeze({
  PLATFORM: "TikTok",
  REPORT_ENDPOINT:
    "https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/",
  PAGE_SIZE: 1000,
  MAX_PAGES: 500,
  REPORT_TYPE: "BASIC",
  SERVICE_TYPE: "AUCTION",
  DATA_LEVEL: "AUCTION_CAMPAIGN",
  DIMENSIONS: Object.freeze([
    "campaign_id",
    "stat_time_day"
  ]),
  METRICS: Object.freeze([
    "campaign_name",
    "currency",
    "spend",
    "impressions",
    "clicks",
    "conversion",
    "app_install"
  ])
});

/**
 * Step 17.6B — Part A
 *
 * Adds all authorized TikTok advertisers to Accounts.
 * New advertisers remain disabled. Existing Enabled selections, currency,
 * timezone, and status values are preserved.
 */
function step17SyncTikTokAccounts() {
  const properties = PropertiesService.getScriptProperties();
  const advertisers =
    getTikTokAuthorizedAdvertisers176_(properties);
  const existing =
    getExistingTikTokAccountMetadata176_();

  const accounts = advertisers.map(function (advertiser) {
    const current =
      existing.get(advertiser.advertiserId) || {};

    return {
      platform: TIKTOK_PRODUCTION_176.PLATFORM,
      accountId: advertiser.advertiserId,
      accountName:
        advertiser.advertiserName ||
        current.accountName ||
        "Unnamed advertiser",
      currency: current.currency || "",
      timezone: current.timezone || "",
      enabled: false,
      status: current.status || "Authorized"
    };
  });

  const upsertResult = upsertAccounts_(accounts);

  const safeResult = {
    status: "READY",
    authorizedAdvertisers: advertisers.length,
    inserted: upsertResult.inserted,
    updated: upsertResult.updated,
    nextAction:
      "Tick Enabled for the TikTok accounts to sync.",
    advertisers: advertisers.map(function (item, index) {
      return {
        selectionNumber: index + 1,
        advertiserName: item.advertiserName,
        maskedAdvertiserId:
          maskTikTokAdvertiserId176_(item.advertiserId)
      };
    }),
    secretsExposed: false
  };

  console.log(JSON.stringify(safeResult, null, 2));

  try {
    SpreadsheetApp.getUi().alert(
      "TikTok account registry",
      "READY — " +
        advertisers.length +
        " authorized advertisers added/updated.\n\n" +
        "Open Accounts and tick Enabled for every TikTok account " +
        "that should be synced.",
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (uiError) {
    // Allows execution without an active spreadsheet UI.
  }

  return safeResult;
}

/**
 * Step 17.6B — Part B
 *
 * Production-writing test for one completed day.
 * Uses TIKTOK_TEST_DATE when configured; otherwise yesterday.
 *
 * This function writes to Spend_Raw using Record Key upsert, then rebuilds
 * Spend_Daily and refreshes Dashboard when every enabled advertiser succeeds.
 */
function step17SyncTikTokProduction() {
  const properties = PropertiesService.getScriptProperties();
  const reportDate =
    getTikTokProductionTestDate176_(properties);

  return syncTikTokPerformanceRange176_(
    reportDate,
    reportDate,
    {
      rebuildOutputs: true,
      runLabel: "Step 17.6B production test"
    }
  );
}

/**
 * Daily production entry point.
 *
 * Re-syncs the previous three completed calendar days so delayed attribution
 * can update existing Record Keys instead of creating duplicates.
 */
function syncTikTokRecentPerformance() {
  const endDate = new Date(
    Date.now() - 24 * 60 * 60 * 1000
  );
  const startDate = new Date(
    endDate.getTime() - 2 * 24 * 60 * 60 * 1000
  );

  return syncTikTokPerformanceRange176_(
    formatTikTokDate176_(startDate),
    formatTikTokDate176_(endDate),
    {
      rebuildOutputs: true,
      runLabel: "TikTok rolling 3-day sync"
    }
  );
}

/**
 * Manual backfill entry point.
 *
 * Required Script Properties:
 *   TIKTOK_SYNC_START_DATE = yyyy-MM-dd
 *   TIKTOK_SYNC_END_DATE   = yyyy-MM-dd
 */
function syncTikTokPerformanceRange() {
  const properties = PropertiesService.getScriptProperties();
  const startDate = getRequiredTikTokProperty176_(
    properties,
    "TIKTOK_SYNC_START_DATE"
  );
  const endDate = getRequiredTikTokProperty176_(
    properties,
    "TIKTOK_SYNC_END_DATE"
  );

  validateTikTokDateRange176_(startDate, endDate);

  return syncTikTokPerformanceRange176_(
    startDate,
    endDate,
    {
      rebuildOutputs: true,
      runLabel: "TikTok manual range sync"
    }
  );
}

/**
 * Core production sync.
 * Each advertiser is isolated: one failure does not block the remaining
 * advertisers from being fetched and upserted.
 */
function syncTikTokPerformanceRange176_(
  startDate,
  endDate,
  options
) {
  validateTikTokDateRange176_(startDate, endDate);

  const config = options || {};
  const properties = PropertiesService.getScriptProperties();
  const accessToken = getRequiredTikTokProperty176_(
    properties,
    "TIKTOK_ACCESS_TOKEN"
  );
  const accounts =
    getEnabledAccounts_(TIKTOK_PRODUCTION_176.PLATFORM);

  if (accounts.length === 0) {
    throw new Error(
      "No enabled TikTok accounts were found. " +
      "Run step17SyncTikTokAccounts, then tick Enabled in Accounts."
    );
  }

  const startedAt = new Date();
  const runId =
    typeof createRunId_ === "function"
      ? createRunId_()
      : Utilities.getUuid();

  const results = [];
  let totalApiRows = 0;
  let totalNormalizedRows = 0;
  let totalInserted = 0;
  let totalUpdated = 0;

  accounts.forEach(function (account) {
    const safeAccount = {
      accountName:
        account.accountName || "Unnamed advertiser",
      maskedAdvertiserId:
        maskTikTokAdvertiserId176_(account.accountId)
    };

    try {
      const report = fetchTikTokCampaignReport176_({
        accessToken: accessToken,
        account: account,
        startDate: startDate,
        endDate: endDate
      });

      const records =
        normalizeTikTokCampaignRows176_(
          report.rows,
          account
        );

      const upsertResult =
        records.length > 0
          ? upsertSpendRows_(records)
          : { inserted: 0, updated: 0 };

      totalApiRows += report.rows.length;
      totalNormalizedRows += records.length;
      totalInserted += upsertResult.inserted;
      totalUpdated += upsertResult.updated;

      results.push(
        Object.assign({}, safeAccount, {
          status: "SUCCESS",
          dataStatus:
            records.length > 0
              ? "HAS_DATA"
              : "NO_DATA",
          pagesFetched: report.pagesFetched,
          apiRows: report.rows.length,
          normalizedRows: records.length,
          inserted: upsertResult.inserted,
          updated: upsertResult.updated
        })
      );

    } catch (error) {
      results.push(
        Object.assign({}, safeAccount, {
          status: "FAILED",
          dataStatus: "NOT_WRITTEN",
          error: sanitizeTikTokError176_(error)
        })
      );
    }
  });

  const failed = results.filter(function (item) {
    return item.status === "FAILED";
  });
  const successful = results.filter(function (item) {
    return item.status === "SUCCESS";
  });
  const withData = results.filter(function (item) {
    return item.dataStatus === "HAS_DATA";
  });

  let outputsRebuilt = false;
  let outputError = null;

  /*
   * Do not rebuild partial results automatically. This keeps the visible
   * dashboard on the last fully successful state while still preserving
   * successful advertiser rows in Spend_Raw for safe retry.
   */
  if (
    failed.length === 0 &&
    config.rebuildOutputs !== false
  ) {
    try {
      rebuildSpendDaily();
      refreshDashboard();
      outputsRebuilt = true;
    } catch (error) {
      outputError = sanitizeTikTokError176_(error);
    }
  }

  const finishedAt = new Date();
  const finalStatus =
    failed.length === 0 && !outputError
      ? "SUCCESS"
      : successful.length > 0
        ? "PARTIAL_SUCCESS"
        : "FAILED";

  const safeResult = {
    status: finalStatus,
    runId: runId,
    runLabel: config.runLabel || "TikTok performance sync",
    startDate: startDate,
    endDate: endDate,
    enabledAdvertisers: accounts.length,
    successfulAdvertisers: successful.length,
    advertisersWithData: withData.length,
    failedAdvertisers: failed.length,
    apiRows: totalApiRows,
    normalizedRows: totalNormalizedRows,
    inserted: totalInserted,
    updated: totalUpdated,
    spendDailyAndDashboardRebuilt: outputsRebuilt,
    outputError: outputError,
    results: results,
    secretsExposed: false
  };

  console.log(JSON.stringify(safeResult, null, 2));

  if (typeof writeSyncLog_ === "function") {
    writeSyncLog_({
      runId: runId,
      startedAt: startedAt,
      finishedAt: finishedAt,
      platform: TIKTOK_PRODUCTION_176.PLATFORM,
      status: finalStatus,
      records: totalNormalizedRows,
      durationSeconds:
        Math.round(
          (finishedAt.getTime() - startedAt.getTime()) /
          1000
        ),
      message:
        successful.length +
        "/" +
        accounts.length +
        " advertisers succeeded; " +
        totalInserted +
        " inserted, " +
        totalUpdated +
        " updated."
    });
  }

  if (config.showAlert !== false) {
    try {
      SpreadsheetApp.getUi().alert(
        "TikTok production performance sync",
        finalStatus +
          "\nDate: " +
          startDate +
          (startDate === endDate
            ? ""
            : " to " + endDate) +
          "\nSuccessful: " +
          successful.length +
          "/" +
          accounts.length +
          "\nWith data: " +
          withData.length +
          "\nFailed: " +
          failed.length +
          "\nInserted: " +
          totalInserted +
          "\nUpdated: " +
          totalUpdated,
        SpreadsheetApp.getUi().ButtonSet.OK
      );
    } catch (uiError) {
      // Allows trigger execution without an active spreadsheet UI.
    }
  }

  return safeResult;
}

/**
 * Fetches every page of one advertiser's campaign/day report.
 */
function fetchTikTokCampaignReport176_(config) {
  const rows = [];
  let page = 1;
  let pagesFetched = 0;

  while (page <= TIKTOK_PRODUCTION_176.MAX_PAGES) {
    const queryParameters = {
      advertiser_id: String(config.account.accountId),
      report_type: TIKTOK_PRODUCTION_176.REPORT_TYPE,
      service_type: TIKTOK_PRODUCTION_176.SERVICE_TYPE,
      data_level: TIKTOK_PRODUCTION_176.DATA_LEVEL,
      dimensions: JSON.stringify(
        TIKTOK_PRODUCTION_176.DIMENSIONS
      ),
      metrics: JSON.stringify(
        TIKTOK_PRODUCTION_176.METRICS
      ),
      start_date: config.startDate,
      end_date: config.endDate,
      page: String(page),
      page_size: String(
        TIKTOK_PRODUCTION_176.PAGE_SIZE
      )
    };

    const queryString = Object.keys(queryParameters)
      .map(function (key) {
        return (
          encodeURIComponent(key) +
          "=" +
          encodeURIComponent(queryParameters[key])
        );
      })
      .join("&");

    const response = UrlFetchApp.fetch(
      TIKTOK_PRODUCTION_176.REPORT_ENDPOINT +
        "?" +
        queryString,
      {
        method: "get",
        headers: {
          "Access-Token": config.accessToken
        },
        muteHttpExceptions: true
      }
    );

    const httpStatus = response.getResponseCode();
    const rawBody = response.getContentText();
    let result;

    try {
      result = JSON.parse(rawBody);
    } catch (parseError) {
      const error = new Error(
        "TikTok returned a non-JSON response. HTTP " +
        httpStatus +
        "."
      );
      error.tiktokHttpStatus = httpStatus;
      throw error;
    }

    if (
      httpStatus < 200 ||
      httpStatus >= 300 ||
      Number(result.code) !== 0
    ) {
      const error = new Error(
        result.message ||
        result.msg ||
        "Unknown TikTok Reporting API error."
      );
      error.tiktokHttpStatus = httpStatus;
      error.tiktokCode =
        result.code !== undefined
          ? result.code
          : null;
      error.tiktokRequestId =
        result.request_id ||
        result.requestId ||
        null;
      throw error;
    }

    const pageRows =
      result.data && Array.isArray(result.data.list)
        ? result.data.list
        : [];

    rows.push.apply(rows, pageRows);
    pagesFetched += 1;

    const pageInfo =
      result.data && result.data.page_info
        ? result.data.page_info
        : {};
    const totalPages = Number(
      pageInfo.total_page ||
      pageInfo.total_pages ||
      0
    );

    if (
      (totalPages > 0 && page >= totalPages) ||
      (totalPages === 0 &&
        pageRows.length <
          TIKTOK_PRODUCTION_176.PAGE_SIZE)
    ) {
      return {
        rows: rows,
        pagesFetched: pagesFetched
      };
    }

    page += 1;
  }

  throw new Error(
    "TikTok report exceeded " +
    TIKTOK_PRODUCTION_176.MAX_PAGES +
    " pages. No data was silently truncated."
  );
}

/**
 * Converts TikTok rows to the shared Spend_Raw schema.
 * Duplicate API rows for the same Record Key are summed before upsert.
 */
function normalizeTikTokCampaignRows176_(
  rows,
  account
) {
  const grouped = new Map();

  rows.forEach(function (row) {
    const dimensions = row.dimensions || {};
    const metrics = row.metrics || {};

    const reportDate = String(
      dimensions.stat_time_day ||
      dimensions.date ||
      ""
    ).slice(0, 10);
    const campaignId = String(
      dimensions.campaign_id ||
      metrics.campaign_id ||
      ""
    ).trim();

    if (!reportDate || !campaignId) {
      throw new Error(
        "TikTok returned a row without stat_time_day or campaign_id."
      );
    }

    const currency = String(
      metrics.currency ||
      account.currency ||
      ""
    ).trim().toUpperCase();

    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new Error(
        "Currency was not returned for advertiser " +
        maskTikTokAdvertiserId176_(account.accountId) +
        ". Add its three-letter currency in Accounts and rerun."
      );
    }

    const recordKey = [
      reportDate,
      TIKTOK_PRODUCTION_176.PLATFORM,
      String(account.accountId),
      campaignId
    ].join("|");

    const current = grouped.get(recordKey) || {
      date: reportDate,
      platform: TIKTOK_PRODUCTION_176.PLATFORM,
      accountId: String(account.accountId),
      accountName:
        account.accountName || "Unnamed advertiser",
      campaignId: campaignId,
      campaignName: String(
        metrics.campaign_name ||
        dimensions.campaign_name ||
        ""
      ).trim(),
      currency: currency,
      spend: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      appInstalls: 0
    };

    current.spend +=
      toTikTokNumber176_(metrics.spend);
    current.impressions +=
      toTikTokNumber176_(metrics.impressions);
    current.clicks +=
      toTikTokNumber176_(metrics.clicks);
    current.conversions +=
      toTikTokNumber176_(metrics.conversion);
    current.appInstalls +=
      toTikTokNumber176_(metrics.app_install);

    if (
      !current.campaignName &&
      metrics.campaign_name
    ) {
      current.campaignName = String(
        metrics.campaign_name
      ).trim();
    }

    grouped.set(recordKey, current);
  });

  return Array.from(grouped.values());
}

function getTikTokAuthorizedAdvertisers176_(
  properties
) {
  const rawValue = getRequiredTikTokProperty176_(
    properties,
    "TIKTOK_AUTHORIZED_ADVERTISERS_JSON"
  );
  let source;

  try {
    source = JSON.parse(rawValue);
  } catch (error) {
    throw new Error(
      "TIKTOK_AUTHORIZED_ADVERTISERS_JSON contains invalid JSON. " +
      "Run step17CheckTikTokAdvertisers again."
    );
  }

  if (!Array.isArray(source) || source.length === 0) {
    throw new Error(
      "No authorized TikTok advertisers are available."
    );
  }

  const unique = new Map();

  source.forEach(function (item) {
    const advertiserId = String(
      item.advertiserId ||
      item.advertiser_id ||
      item.id ||
      ""
    ).trim();

    if (!advertiserId) {
      return;
    }

    unique.set(advertiserId, {
      advertiserId: advertiserId,
      advertiserName: String(
        item.advertiserName ||
        item.advertiser_name ||
        item.name ||
        "Unnamed advertiser"
      ).trim()
    });
  });

  const advertisers = Array.from(unique.values());

  if (advertisers.length === 0) {
    throw new Error(
      "No valid advertiser ID was found in " +
      "TIKTOK_AUTHORIZED_ADVERTISERS_JSON."
    );
  }

  return advertisers;
}

/**
 * Preserves metadata entered manually in Accounts when advertiser/info scope
 * is unavailable.
 */
function getExistingTikTokAccountMetadata176_() {
  const result = new Map();
  const sheet = requireSheet_(MSH.SHEETS.ACCOUNTS);

  if (sheet.getLastRow() < 2) {
    return result;
  }

  const values = sheet
    .getRange(
      2,
      1,
      sheet.getLastRow() - 1,
      ACCOUNT_COLUMNS.length
    )
    .getValues();

  values.forEach(function (row) {
    if (
      String(row[0]) !==
      TIKTOK_PRODUCTION_176.PLATFORM
    ) {
      return;
    }

    const accountId = String(row[1] || "").trim();

    if (accountId) {
      result.set(accountId, {
        accountName: String(row[2] || "").trim(),
        currency: String(row[3] || "")
          .trim()
          .toUpperCase(),
        timezone: String(row[4] || "").trim(),
        enabled: Boolean(row[5]),
        status: String(row[6] || "").trim()
      });
    }
  });

  return result;
}

function getTikTokProductionTestDate176_(
  properties
) {
  const configuredDate = String(
    properties.getProperty("TIKTOK_TEST_DATE") || ""
  ).trim();

  if (configuredDate) {
    validateTikTokDate176_(
      configuredDate,
      "TIKTOK_TEST_DATE"
    );
    return configuredDate;
  }

  return formatTikTokDate176_(
    new Date(Date.now() - 24 * 60 * 60 * 1000)
  );
}

function validateTikTokDateRange176_(
  startDate,
  endDate
) {
  validateTikTokDate176_(startDate, "start date");
  validateTikTokDate176_(endDate, "end date");

  if (startDate > endDate) {
    throw new Error(
      "TikTok start date cannot be later than end date."
    );
  }
}

function validateTikTokDate176_(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    throw new Error(
      label + " must use yyyy-MM-dd format."
    );
  }

  const date = new Date(String(value) + "T00:00:00Z");

  if (
    isNaN(date.getTime()) ||
    Utilities.formatDate(date, "UTC", "yyyy-MM-dd") !==
      String(value)
  ) {
    throw new Error(label + " is not a valid date.");
  }
}

function formatTikTokDate176_(date) {
  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    "yyyy-MM-dd"
  );
}

function getRequiredTikTokProperty176_(
  properties,
  key
) {
  const value = properties.getProperty(key);

  if (value === null || String(value).trim() === "") {
    throw new Error(
      "Missing required Script Property: " + key
    );
  }

  return String(value).trim();
}

function toTikTokNumber176_(value) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue)
    ? numberValue
    : 0;
}

function sanitizeTikTokError176_(error) {
  const rawMessage = String(
    error && error.message
      ? error.message
      : error || "Unknown error"
  );

  return {
    httpStatus:
      error && error.tiktokHttpStatus !== undefined
        ? error.tiktokHttpStatus
        : null,
    code:
      error && error.tiktokCode !== undefined
        ? error.tiktokCode
        : null,
    message: rawMessage.replace(
      /\b\d{8,}\b/g,
      "[REDACTED_ID]"
    ),
    requestId:
      error && error.tiktokRequestId
        ? String(error.tiktokRequestId)
        : null
  };
}

function maskTikTokAdvertiserId176_(advertiserId) {
  const value = String(advertiserId || "");

  if (value.length <= 4) {
    return "****";
  }

  return "****" + value.slice(-4);
}
