/**
 * Marketing Performance Hub
 * Step 17.7A — Meta production performance connector.
 *
 * Grain:
 *   Date × Meta ad account × campaign
 *
 * Base metrics written to Spend_Raw:
 *   Spend, Impressions, Clicks, Conversions, App Installs
 *
 * Derived metrics are recalculated downstream by Aggregation.gs.
 *
 * Required existing project functions:
 *   getEnabledAccounts_(platform)
 *   upsertSpendRows_(records)
 *   rebuildSpendDaily()
 *   refreshDashboard()
 *
 * Required Script Properties:
 *   META_ACCESS_TOKEN
 *   META_APP_ID
 *   META_APP_SECRET
 *
 * Required Step 18C file:
 *   MetaTokenLifecycle.gs
 *
 * Optional Script Properties:
 *   META_PERFORMANCE_TEST_DATE = yyyy-MM-dd
 *   META_SYNC_START_DATE       = yyyy-MM-dd
 *   META_SYNC_END_DATE         = yyyy-MM-dd
 *
 * Existing internal property used when available:
 *   _META_DETECTED_API_VERSION
 */

const META_PERFORMANCE_177 = Object.freeze({
  PLATFORM: "Meta",
  DEFAULT_API_VERSION: "v25.0",
  GRAPH_BASE_URL: "https://graph.facebook.com",
  PAGE_LIMIT: 500,
  MAX_PAGES_PER_ACCOUNT: 10000,
  ROLLING_DAYS: 3,

  PRIMARY_FIELDS: Object.freeze([
    "date_start",
    "date_stop",
    "account_id",
    "account_name",
    "account_currency",
    "campaign_id",
    "campaign_name",
    "objective",
    "spend",
    "impressions",
    "clicks",
    "objective_results",
    "actions"
  ]),

  FALLBACK_FIELDS: Object.freeze([
    "date_start",
    "date_stop",
    "account_id",
    "account_name",
    "account_currency",
    "campaign_id",
    "campaign_name",
    "objective",
    "spend",
    "impressions",
    "clicks",
    "actions"
  ]),

  APP_INSTALL_ACTIONS: Object.freeze([
    "mobile_app_install",
    "omni_app_install",
    "app_install"
  ])
});


/**
 * Step 17.7A production-writing test.
 *
 * Uses META_PERFORMANCE_TEST_DATE when configured; otherwise yesterday.
 * Writes through Record Key upsert and rebuilds outputs only when all enabled
 * Meta accounts succeed.
 */
function step177SyncMetaPerformance() {
  const properties = PropertiesService.getScriptProperties();
  const reportDate =
    getMetaPerformanceTestDate177_(properties);

  return syncMetaPerformanceRange177_(
    reportDate,
    reportDate,
    {
      rebuildOutputs: true,
      runLabel: "Step 17.7A Meta performance test"
    }
  );
}


/**
 * Daily production entry point.
 *
 * Re-syncs the previous three completed calendar days so delayed attribution
 * updates existing Record Keys instead of creating duplicates.
 */
function syncMetaRecentPerformance() {
  const timezone = Session.getScriptTimeZone();
  const todayText = Utilities.formatDate(
    new Date(),
    timezone,
    "yyyy-MM-dd"
  );
  const today = parseMetaDate177_(todayText);
  const endDate = new Date(
    today.getTime() - 24 * 60 * 60 * 1000
  );
  const startDate = new Date(
    endDate.getTime() -
      (META_PERFORMANCE_177.ROLLING_DAYS - 1) *
        24 * 60 * 60 * 1000
  );

  return syncMetaPerformanceRange177_(
    formatMetaDate177_(startDate),
    formatMetaDate177_(endDate),
    {
      rebuildOutputs: true,
      runLabel: "Meta rolling 3-day performance sync"
    }
  );
}


/**
 * Manual backfill entry point.
 *
 * Required Script Properties:
 *   META_SYNC_START_DATE = yyyy-MM-dd
 *   META_SYNC_END_DATE   = yyyy-MM-dd
 */
function syncMetaPerformanceRange() {
  const properties = PropertiesService.getScriptProperties();
  const startDate = getRequiredMetaProperty177_(
    properties,
    "META_SYNC_START_DATE"
  );
  const endDate = getRequiredMetaProperty177_(
    properties,
    "META_SYNC_END_DATE"
  );

  validateMetaDateRange177_(startDate, endDate);

  return syncMetaPerformanceRange177_(
    startDate,
    endDate,
    {
      rebuildOutputs: true,
      runLabel: "Meta manual performance backfill"
    }
  );
}


/**
 * Core Meta range sync.
 *
 * Each account fails independently. Successful account rows are preserved for
 * safe retry, but derived outputs are rebuilt only after a fully successful
 * run.
 */
function syncMetaPerformanceRange177_(
  startDate,
  endDate,
  options
) {
  validateMetaDateRange177_(startDate, endDate);

  const config = options || {};
  const properties = PropertiesService.getScriptProperties();
  if (
    typeof getValidMetaAccessToken182_ !== "function"
  ) {
    throw new Error(
      "MetaTokenLifecycle.gs is required before Meta production sync."
    );
  }

  const accessToken = getValidMetaAccessToken182_();
  const apiVersion = getMetaApiVersion177_(properties);
  const accounts = getEnabledAccounts_(
    META_PERFORMANCE_177.PLATFORM
  );

  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error(
      "No enabled Meta accounts were found. " +
      "Open Accounts and tick Enabled for the Meta accounts to sync."
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
        safeMetaString177_(account.accountName) ||
        "Unnamed Meta account",
      maskedAccountId:
        maskMetaAccountId177_(account.accountId)
    };

    try {
      const report = fetchMetaCampaignInsights177_({
        accessToken: accessToken,
        apiVersion: apiVersion,
        account: account,
        startDate: startDate,
        endDate: endDate
      });

      const records = normalizeMetaInsightsRows177_(
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
          fieldProfile: report.fieldProfile,
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
          error: sanitizeMetaError177_(error)
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

  if (
    failed.length === 0 &&
    config.rebuildOutputs !== false
  ) {
    try {
      rebuildSpendDaily();
      refreshDashboard();
      outputsRebuilt = true;
    } catch (error) {
      outputError = sanitizeMetaError177_(error);
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
    runLabel:
      config.runLabel || "Meta performance sync",
    startDate: startDate,
    endDate: endDate,
    apiVersion: apiVersion,
    enabledAccounts: accounts.length,
    successfulAccounts: successful.length,
    accountsWithData: withData.length,
    failedAccounts: failed.length,
    apiRows: totalApiRows,
    normalizedRows: totalNormalizedRows,
    inserted: totalInserted,
    updated: totalUpdated,
    outputsRebuilt: outputsRebuilt,
    outputError: outputError,
    durationSeconds:
      Math.round(
        (finishedAt.getTime() - startedAt.getTime()) /
          100
      ) / 10,
    results: results,
    secretsExposed: false
  };

  console.log(JSON.stringify(safeResult, null, 2));

  if (config.showAlert !== false) {
    try {
      SpreadsheetApp.getUi().alert(
        "Meta performance sync",
        finalStatus +
          "\nDate range: " +
          startDate +
          " → " +
          endDate +
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
      // Allows trigger/headless execution.
    }
  }

  return safeResult;
}


/**
 * Retrieves all campaign/day rows for one Meta ad account.
 *
 * First requests objective_results. If that field is unavailable for the
 * account/API combination, retries once with the stable actions field.
 */
function fetchMetaCampaignInsights177_(config) {
  try {
    return fetchMetaCampaignInsightsWithFields177_(
      config,
      META_PERFORMANCE_177.PRIMARY_FIELDS,
      "OBJECTIVE_RESULTS"
    );
  } catch (error) {
    if (!isMetaFieldCompatibilityError177_(error)) {
      throw error;
    }

    return fetchMetaCampaignInsightsWithFields177_(
      config,
      META_PERFORMANCE_177.FALLBACK_FIELDS,
      "ACTIONS_FALLBACK"
    );
  }
}


/**
 * Paginates Meta Insights using the after cursor. No API page is silently
 * truncated.
 */
function fetchMetaCampaignInsightsWithFields177_(
  config,
  fields,
  fieldProfile
) {
  const accountId = safeMetaString177_(
    config.account && config.account.accountId
  );

  if (!accountId) {
    throw new Error("Meta account ID is missing.");
  }

  const endpoint =
    META_PERFORMANCE_177.GRAPH_BASE_URL +
    "/" +
    config.apiVersion +
    "/" +
    ensureMetaActPrefix177_(accountId) +
    "/insights";

  const baseParameters = {
    fields: fields.join(","),
    level: "campaign",
    time_increment: "1",
    time_range: JSON.stringify({
      since: config.startDate,
      until: config.endDate
    }),
    limit: String(META_PERFORMANCE_177.PAGE_LIMIT)
  };

  const rows = [];
  let afterCursor = "";
  let pagesFetched = 0;

  while (true) {
    if (
      pagesFetched >=
      META_PERFORMANCE_177.MAX_PAGES_PER_ACCOUNT
    ) {
      throw new Error(
        "Meta pagination safety limit reached before completion."
      );
    }

    const parameters = Object.assign(
      {},
      baseParameters
    );

    if (afterCursor) {
      parameters.after = afterCursor;
    }

    const response = requestMetaJson177_({
      url:
        endpoint +
        "?" +
        buildMetaQueryString177_(parameters),
      accessToken: config.accessToken
    });

    pagesFetched += 1;

    const pageRows = Array.isArray(response.data)
      ? response.data
      : [];

    Array.prototype.push.apply(rows, pageRows);

    const paging = response.paging || {};
    const cursors = paging.cursors || {};
    const nextAfter = safeMetaString177_(cursors.after);

    if (!paging.next || !nextAfter) {
      break;
    }

    if (nextAfter === afterCursor) {
      throw new Error(
        "Meta pagination returned the same cursor twice."
      );
    }

    afterCursor = nextAfter;
  }

  return {
    rows: rows,
    pagesFetched: pagesFetched,
    fieldProfile: fieldProfile
  };
}


/**
 * Normalizes Meta Insights rows to the shared Spend_Raw interface.
 */
function normalizeMetaInsightsRows177_(rows, account) {
  const recordsByKey = new Map();

  (rows || []).forEach(function (row) {
    const date = safeMetaString177_(row.date_start);
    const campaignId = safeMetaString177_(row.campaign_id);

    if (!date || !campaignId) {
      return;
    }

    const appInstalls = getMetaFirstActionValue177_(
      row.actions,
      META_PERFORMANCE_177.APP_INSTALL_ACTIONS
    );

    let conversions = sumMetaResultValues177_(
      row.objective_results
    );

    if (conversions <= 0) {
      conversions = getMetaPrimaryActionValue177_(
        row.actions,
        row.objective,
        appInstalls
      );
    }

    const record = {
      date: date,
      platform: META_PERFORMANCE_177.PLATFORM,
      accountId: safeMetaString177_(account.accountId),
      accountName:
        safeMetaString177_(account.accountName) ||
        safeMetaString177_(row.account_name) ||
        "Unnamed Meta account",
      campaignId: campaignId,
      campaignName:
        safeMetaString177_(row.campaign_name) ||
        "Unnamed campaign",
      currency:
        safeMetaString177_(row.account_currency) ||
        safeMetaString177_(account.currency),
      spend: toMetaNumber177_(row.spend),
      impressions: toMetaNumber177_(row.impressions),
      clicks: toMetaNumber177_(row.clicks),
      conversions: conversions,
      appInstalls: appInstalls
    };

    const localKey = [
      record.date,
      record.accountId,
      record.campaignId
    ].join("|");

    const existing = recordsByKey.get(localKey);

    if (!existing) {
      recordsByKey.set(localKey, record);
      return;
    }

    existing.spend += record.spend;
    existing.impressions += record.impressions;
    existing.clicks += record.clicks;
    existing.conversions += record.conversions;
    existing.appInstalls += record.appInstalls;
  });

  return Array.from(recordsByKey.values()).map(
    function (record) {
      record.spend = roundMetaNumber177_(
        record.spend,
        6
      );
      record.impressions = roundMetaNumber177_(
        record.impressions,
        4
      );
      record.clicks = roundMetaNumber177_(
        record.clicks,
        4
      );
      record.conversions = roundMetaNumber177_(
        record.conversions,
        4
      );
      record.appInstalls = roundMetaNumber177_(
        record.appInstalls,
        4
      );

      return record;
    }
  );
}


/**
 * Uses Meta's objective_results list when available.
 */
function sumMetaResultValues177_(results) {
  if (!Array.isArray(results)) {
    return 0;
  }

  return results.reduce(function (total, item) {
    return total + toMetaNumber177_(
      item && item.value
    );
  }, 0);
}


/**
 * Finds the first available action type in priority order. This avoids double
 * counting equivalent hierarchical actions such as mobile_app_install and
 * omni_app_install.
 */
function getMetaFirstActionValue177_(
  actions,
  priorityTypes
) {
  if (!Array.isArray(actions)) {
    return 0;
  }

  const valueByType = new Map();

  actions.forEach(function (action) {
    const type = safeMetaString177_(
      action && action.action_type
    );

    if (!type) {
      return;
    }

    valueByType.set(
      type,
      toMetaNumber177_(action.value)
    );
  });

  for (let i = 0; i < priorityTypes.length; i += 1) {
    const value = toMetaNumber177_(
      valueByType.get(priorityTypes[i])
    );

    if (value > 0) {
      return value;
    }
  }

  return 0;
}


/**
 * Fallback conversion mapping used only when objective_results is unavailable
 * or empty. The first compatible action is selected; equivalent actions are
 * never added together.
 */
function getMetaPrimaryActionValue177_(
  actions,
  objective,
  appInstalls
) {
  const normalizedObjective =
    safeMetaString177_(objective).toUpperCase();

  if (
    normalizedObjective.indexOf("APP") >= 0 &&
    normalizedObjective.indexOf("PROMOTION") >= 0
  ) {
    return appInstalls;
  }

  if (normalizedObjective === "APP_INSTALLS") {
    return appInstalls;
  }

  let priorities;

  if (
    normalizedObjective.indexOf("LEAD") >= 0
  ) {
    priorities = [
      "lead",
      "onsite_conversion.lead_grouped",
      "offsite_conversion.fb_pixel_lead",
      "leadgen_grouped",
      "complete_registration",
      "offsite_conversion.fb_pixel_complete_registration"
    ];

  } else if (
    normalizedObjective.indexOf("SALE") >= 0 ||
    normalizedObjective.indexOf("CONVERSION") >= 0 ||
    normalizedObjective.indexOf("CATALOG") >= 0
  ) {
    priorities = [
      "omni_purchase",
      "purchase",
      "offsite_conversion.fb_pixel_purchase",
      "app_custom_event.fb_mobile_purchase",
      "offline_conversion.purchase"
    ];

  } else if (
    normalizedObjective.indexOf("MESSAGE") >= 0
  ) {
    priorities = [
      "onsite_conversion.messaging_conversation_started_7d",
      "messaging_conversation_started_7d",
      "onsite_conversion.messaging_first_reply"
    ];

  } else if (
    normalizedObjective.indexOf("TRAFFIC") >= 0
  ) {
    priorities = [
      "landing_page_view",
      "link_click"
    ];

  } else if (
    normalizedObjective.indexOf("ENGAGEMENT") >= 0
  ) {
    priorities = [
      "post_engagement",
      "page_engagement"
    ];

  } else {
    priorities = [
      "omni_purchase",
      "purchase",
      "lead",
      "complete_registration",
      "mobile_app_install"
    ];
  }

  return getMetaFirstActionValue177_(
    actions,
    priorities
  );
}


/**
 * Performs one Meta request without putting the access token in the URL.
 */
function requestMetaJson177_(config) {
  let response;

  try {
    response = UrlFetchApp.fetch(
      config.url,
      {
        method: "get",
        headers: {
          Authorization: "Bearer " + config.accessToken
        },
        muteHttpExceptions: true
      }
    );
  } catch (networkError) {
    const error = new Error(
      "Meta request failed before receiving a response."
    );
    error.safeMetaError = {
      type: "NETWORK_ERROR",
      message: error.message
    };
    throw error;
  }

  const httpStatus = response.getResponseCode();
  const rawBody = response.getContentText();
  let result;

  try {
    result = JSON.parse(rawBody);
  } catch (parseError) {
    const error = new Error(
      "Meta returned a non-JSON response."
    );
    error.safeMetaError = {
      type: "NON_JSON_RESPONSE",
      httpStatus: httpStatus,
      message: error.message
    };
    throw error;
  }

  if (
    httpStatus < 200 ||
    httpStatus >= 300 ||
    result.error
  ) {
    const metaError = result.error || {};
    const safeError = {
      type:
        safeMetaString177_(metaError.type) ||
        "META_API_ERROR",
      httpStatus: httpStatus,
      code:
        metaError.code !== undefined
          ? metaError.code
          : null,
      errorSubcode:
        metaError.error_subcode !== undefined
          ? metaError.error_subcode
          : null,
      message:
        safeMetaString177_(metaError.message) ||
        "Unknown Meta API error",
      fbtraceId:
        safeMetaString177_(metaError.fbtrace_id) ||
        null
    };

    const error = new Error(
      "Meta API request failed: " +
      JSON.stringify(safeError)
    );
    error.safeMetaError = safeError;
    throw error;
  }

  return result;
}


/**
 * Retries with the fallback field profile only for invalid/unsupported field
 * errors. Authentication, rate limit and permission failures are not hidden.
 */
function isMetaFieldCompatibilityError177_(error) {
  const safe =
    error && error.safeMetaError
      ? error.safeMetaError
      : {};
  const message = safeMetaString177_(
    safe.message || (error && error.message)
  ).toLowerCase();

  return (
    Number(safe.code) === 100 &&
    (
      message.indexOf("field") >= 0 ||
      message.indexOf("metric") >= 0 ||
      message.indexOf("objective_results") >= 0
    )
  );
}


function getMetaPerformanceTestDate177_(properties) {
  const configuredDate =
    safeMetaString177_(
      properties.getProperty(
        "META_PERFORMANCE_TEST_DATE"
      )
    ) ||
    safeMetaString177_(
      properties.getProperty("META_TEST_DATE")
    );

  if (configuredDate) {
    validateMetaDate177_(
      configuredDate,
      "META_PERFORMANCE_TEST_DATE"
    );
    return configuredDate;
  }

  const timezone = Session.getScriptTimeZone();
  const todayText = Utilities.formatDate(
    new Date(),
    timezone,
    "yyyy-MM-dd"
  );
  const today = parseMetaDate177_(todayText);
  const yesterday = new Date(
    today.getTime() - 24 * 60 * 60 * 1000
  );

  return formatMetaDate177_(yesterday);
}


function getMetaApiVersion177_(properties) {
  const rawValue =
    safeMetaString177_(
      properties.getProperty(
        "_META_DETECTED_API_VERSION"
      )
    ) ||
    META_PERFORMANCE_177.DEFAULT_API_VERSION;

  const normalized = rawValue
    .replace(/^v/i, "")
    .trim();

  if (/^\d+$/.test(normalized)) {
    return "v" + normalized + ".0";
  }

  if (/^\d+\.\d+$/.test(normalized)) {
    return "v" + normalized;
  }

  return META_PERFORMANCE_177.DEFAULT_API_VERSION;
}


function validateMetaDateRange177_(
  startDate,
  endDate
) {
  validateMetaDate177_(startDate, "startDate");
  validateMetaDate177_(endDate, "endDate");

  if (startDate > endDate) {
    throw new Error(
      "Meta startDate must be on or before endDate."
    );
  }
}


function validateMetaDate177_(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    throw new Error(
      label + " must use yyyy-MM-dd format."
    );
  }

  const parsed = parseMetaDate177_(value);

  if (
    formatMetaDate177_(parsed) !== String(value)
  ) {
    throw new Error(
      label + " is not a valid calendar date."
    );
  }
}


function parseMetaDate177_(value) {
  const parts = String(value).split("-");

  return new Date(
    Number(parts[0]),
    Number(parts[1]) - 1,
    Number(parts[2])
  );
}


function formatMetaDate177_(date) {
  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    "yyyy-MM-dd"
  );
}


function getRequiredMetaProperty177_(
  properties,
  key
) {
  const value = properties.getProperty(key);

  if (
    value === null ||
    safeMetaString177_(value) === ""
  ) {
    throw new Error(
      "Missing required Script Property: " + key
    );
  }

  return safeMetaString177_(value);
}


function ensureMetaActPrefix177_(accountId) {
  const value = safeMetaString177_(accountId);

  return value.indexOf("act_") === 0
    ? value
    : "act_" + value;
}


function buildMetaQueryString177_(parameters) {
  return Object.keys(parameters)
    .map(function (key) {
      return (
        encodeURIComponent(key) +
        "=" +
        encodeURIComponent(parameters[key])
      );
    })
    .join("&");
}


function toMetaNumber177_(value) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue)
    ? numberValue
    : 0;
}


function roundMetaNumber177_(value, decimals) {
  const factor = Math.pow(10, decimals);

  return Math.round(
    (Number(value) + Number.EPSILON) * factor
  ) / factor;
}


function safeMetaString177_(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}


function maskMetaAccountId177_(accountId) {
  const value = safeMetaString177_(accountId)
    .replace(/^act_/, "");

  if (value.length <= 4) {
    return "****";
  }

  return "****" + value.slice(-4);
}


/**
 * Returns a safe error object. Tokens and full account IDs are never included.
 */
function sanitizeMetaError177_(error) {
  if (error && error.safeMetaError) {
    return error.safeMetaError;
  }

  let message =
    error && error.message
      ? String(error.message)
      : "Unknown Meta connector error";

  message = message
    .replace(
      /(?:access_token|authorization|bearer)\s*[:=]?\s*[^\s&,}"']+/gi,
      "[REDACTED]"
    )
    .replace(/\bact_\d{5,}\b/g, "act_****")
    .replace(/\b\d{8,}\b/g, "****");

  return {
    type: "CONNECTOR_ERROR",
    message: message
  };
}
