/**
 * Marketing Performance Hub
 * Step 17.8B — Google Ads production performance connector.
 *
 * Grain:
 *   Date × Google Ads advertiser × campaign
 *
 * Base metrics written to Spend_Raw:
 *   Spend, Impressions, Clicks, Conversions, App Installs
 *
 * Required existing project files/functions:
 *   GoogleAdsAuth.gs (Step 17.8A)
 *   getEnabledAccounts_(platform)
 *   upsertSpendRows_(records)
 *   rebuildSpendDaily()
 *   refreshDashboard()
 *
 * Optional Script Properties:
 *   GOOGLE_ADS_PERFORMANCE_TEST_DATE = yyyy-MM-dd
 *   GOOGLE_ADS_SYNC_START_DATE       = yyyy-MM-dd
 *   GOOGLE_ADS_SYNC_END_DATE         = yyyy-MM-dd
 *
 * GOOGLE_ADS_LOGIN_CUSTOMER_ID remains a preferred MCC only. This connector
 * rebuilds the accessible hierarchy and routes every enabled advertiser
 * through the correct directly accessible MCC.
 */

const GOOGLE_ADS_178B = Object.freeze({
  PLATFORM: "Google Ads",
  ROLLING_DAYS: 3,
  TEST_DATE_PROPERTY:
    "GOOGLE_ADS_PERFORMANCE_TEST_DATE",
  START_DATE_PROPERTY:
    "GOOGLE_ADS_SYNC_START_DATE",
  END_DATE_PROPERTY:
    "GOOGLE_ADS_SYNC_END_DATE"
});


/**
 * Step 17.8B production-writing test.
 *
 * Uses GOOGLE_ADS_PERFORMANCE_TEST_DATE when configured. Otherwise, it syncs
 * yesterday in each advertiser account's timezone.
 */
function step178SyncGoogleAdsPerformance() {
  const properties =
    PropertiesService.getScriptProperties();
  const testDate = String(
    properties.getProperty(
      GOOGLE_ADS_178B.TEST_DATE_PROPERTY
    ) || ""
  ).trim();

  if (testDate) {
    validateGoogleAdsDate178B_(
      testDate,
      GOOGLE_ADS_178B.TEST_DATE_PROPERTY
    );
  }

  return syncGoogleAdsPerformance178B_({
    runLabel:
      "Step 17.8B Google Ads performance test",
    dateMode: testDate
      ? "FIXED_TEST_DATE"
      : "PER_ACCOUNT_YESTERDAY",
    dateResolver: function (account) {
      const date =
        testDate ||
        getGoogleAdsYesterday178B_(
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
 * Re-syncs the previous three completed days in each account's timezone so
 * delayed conversion attribution updates existing Record Keys.
 */
function syncGoogleAdsRecentPerformance() {
  return syncGoogleAdsPerformance178B_({
    runLabel:
      "Google Ads rolling 3-day performance sync",
    dateMode: "PER_ACCOUNT_ROLLING_3_DAYS",
    dateResolver: function (account) {
      const endDate = getGoogleAdsYesterday178B_(
        account.timezone
      );
      const startDate = shiftGoogleAdsDate178B_(
        endDate,
        -(GOOGLE_ADS_178B.ROLLING_DAYS - 1)
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
 *   GOOGLE_ADS_SYNC_START_DATE = yyyy-MM-dd
 *   GOOGLE_ADS_SYNC_END_DATE   = yyyy-MM-dd
 */
function syncGoogleAdsPerformanceRange() {
  const properties =
    PropertiesService.getScriptProperties();
  const startDate =
    getRequiredGoogleAdsProperty178A_(
      properties,
      GOOGLE_ADS_178B.START_DATE_PROPERTY
    );
  const endDate =
    getRequiredGoogleAdsProperty178A_(
      properties,
      GOOGLE_ADS_178B.END_DATE_PROPERTY
    );

  validateGoogleAdsDateRange178B_(
    startDate,
    endDate
  );

  return syncGoogleAdsPerformance178B_({
    runLabel:
      "Google Ads manual performance backfill",
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
function syncGoogleAdsYesterdaySpend() {
  return step178SyncGoogleAdsPerformance();
}


/**
 * Core Google Ads range sync.
 *
 * Each account fails independently. Successful rows remain safe because the
 * shared Spend_Raw writer upserts them by Record Key. Derived outputs rebuild
 * only when every enabled account succeeds.
 */
function syncGoogleAdsPerformance178B_(config) {
  assertGoogleAdsDependencies178B_();

  const options = config || {};
  const accounts = getEnabledAccounts_(
    GOOGLE_ADS_178B.PLATFORM
  );

  if (!Array.isArray(accounts) || !accounts.length) {
    throw new Error(
      "No enabled Google Ads accounts were found. " +
      "Open Accounts and tick Enabled for 1–3 test accounts."
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
    getGoogleAdsCredentials178A_(properties);
  const accessToken =
    getGoogleAdsAccessToken178A_(
      credentials,
      false
    );
  const preferredLoginCustomerId =
    normalizeGoogleAdsCustomerId178A_(
      properties.getProperty(
        "GOOGLE_ADS_LOGIN_CUSTOMER_ID"
      ) || ""
    );

  const routing = resolveGoogleAdsRoutes178B_({
    accounts: accounts,
    accessToken: accessToken,
    developerToken: credentials.developerToken,
    preferredLoginCustomerId:
      preferredLoginCustomerId
  });

  const results = [];
  let successfulAccounts = 0;
  let accountsWithData = 0;
  let failedAccounts = 0;
  let totalApiRows = 0;
  let totalNormalizedRows = 0;
  let totalInserted = 0;
  let totalUpdated = 0;

  accounts.forEach(function (account) {
    const accountStartedAt = new Date();
    const accountId =
      normalizeGoogleAdsCustomerId178A_(
        account.accountId
      );
    const safeAccount = {
      accountName:
        String(account.accountName || "").trim() ||
        "Unnamed Google Ads account",
      maskedAccountId:
        maskGoogleAdsCustomerId178A_(accountId)
    };
    const route = routing.routes.get(accountId);

    if (!route) {
      failedAccounts += 1;

      const routingError = {
        type: "ROUTING_ERROR",
        httpStatus: null,
        reason: "NO_ACCESSIBLE_MCC_ROUTE",
        message:
          "The enabled advertiser was not found under any " +
          "currently accessible Google Ads account or MCC."
      };

      results.push(
        Object.assign({}, safeAccount, {
          status: "FAILED",
          dataStatus: "NOT_WRITTEN",
          error: routingError
        })
      );

      writeGoogleAdsPerformanceLog178B_({
        runId: runId,
        startedAt: accountStartedAt,
        finishedAt: new Date(),
        accountId: accountId,
        status: "FAILED",
        records: 0,
        message: routingError.message
      });

      return;
    }

    let dateRange;

    try {
      dateRange = options.dateResolver(account);
      validateGoogleAdsDateRange178B_(
        dateRange.startDate,
        dateRange.endDate
      );

      const apiRows =
        fetchGoogleAdsPerformanceRows178B_({
          account: account,
          loginCustomerId:
            route.loginCustomerId,
          accessToken: accessToken,
          developerToken:
            credentials.developerToken,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate
        });
      const records =
        normalizeGoogleAdsPerformanceRows178B_(
          apiRows,
          account
        );
      const writeResult =
        records.length > 0
          ? upsertSpendRows_(records)
          : { inserted: 0, updated: 0 };

      const inserted = Number(
        writeResult.inserted || 0
      );
      const updated = Number(
        writeResult.updated || 0
      );

      successfulAccounts += 1;
      totalApiRows += apiRows.length;
      totalNormalizedRows += records.length;
      totalInserted += inserted;
      totalUpdated += updated;

      if (records.length > 0) {
        accountsWithData += 1;
      }

      results.push(
        Object.assign({}, safeAccount, {
          status: "SUCCESS",
          dataStatus:
            records.length > 0
              ? "HAS_DATA"
              : "NO_DATA",
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          routeType:
            route.loginCustomerId
              ? "MCC"
              : "DIRECT",
          maskedLoginCustomerId:
            route.loginCustomerId
              ? maskGoogleAdsCustomerId178A_(
                  route.loginCustomerId
                )
              : null,
          apiRows: apiRows.length,
          normalizedRows: records.length,
          inserted: inserted,
          updated: updated
        })
      );

      writeGoogleAdsPerformanceLog178B_({
        runId: runId,
        startedAt: accountStartedAt,
        finishedAt: new Date(),
        accountId: accountId,
        status: "SUCCESS",
        records: records.length,
        message:
          inserted +
          " inserted, " +
          updated +
          " updated."
      });

    } catch (error) {
      failedAccounts += 1;
      const safeError =
        normalizeGoogleAdsPerformanceError178B_(
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
          routeType:
            route.loginCustomerId
              ? "MCC"
              : "DIRECT",
          maskedLoginCustomerId:
            route.loginCustomerId
              ? maskGoogleAdsCustomerId178A_(
                  route.loginCustomerId
                )
              : null,
          error: safeError
        })
      );

      writeGoogleAdsPerformanceError178B_({
        runId: runId,
        accountId: accountId,
        error: safeError
      });

      writeGoogleAdsPerformanceLog178B_({
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
        normalizeGoogleAdsPerformanceError178B_(
          error
        ).message;

      writeGoogleAdsPerformanceError178B_({
        runId: runId,
        accountId: "",
        functionName:
          "Google Ads output rebuild",
        error: {
          httpStatus: null,
          reason:
            "OUTPUT_REBUILD_FAILED",
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
      "Google Ads performance sync",
    apiVersion:
      GOOGLE_ADS_178A.API_VERSION,
    dateMode:
      options.dateMode || "CUSTOM",
    enabledAccounts: accounts.length,
    successfulAccounts: successfulAccounts,
    accountsWithData: accountsWithData,
    failedAccounts: failedAccounts,
    directRootsLoaded:
      routing.directRootsLoaded,
    managerRootsLoaded:
      routing.managerRootsLoaded,
    skippedDirectRoots:
      routing.rootErrors.length,
    hierarchyErrors:
      routing.hierarchyErrors.length,
    routedDirectAccounts:
      routing.routedDirectAccounts,
    routedMccAccounts:
      routing.routedMccAccounts,
    unroutedAccounts:
      accounts.length -
      routing.routes.size,
    apiRows: totalApiRows,
    normalizedRows: totalNormalizedRows,
    inserted: totalInserted,
    updated: totalUpdated,
    outputsRebuilt: outputsRebuilt,
    outputError: outputError,
    routeWarnings:
      routing.routeWarnings,
    rootErrors:
      routing.rootErrors,
    hierarchyErrorDetails:
      routing.hierarchyErrors,
    durationSeconds:
      Math.round(
        (finishedAt.getTime() -
          startedAt.getTime()) /
          100
      ) / 10,
    results: results,
    secretsExposed: false
  };

  console.log(
    JSON.stringify(summary, null, 2)
  );
  if (options.showAlert !== false) {
    showGoogleAdsPerformanceSummary178B_(
      summary
    );
  }

  return summary;
}


/**
 * Rebuilds advertiser → login-customer-id routes from all directly
 * accessible roots. The existing property is only a preference when an
 * advertiser is reachable through more than one manager.
 */
function resolveGoogleAdsRoutes178B_(config) {
  const enabledIds = new Set(
    (config.accounts || []).map(function (account) {
      return normalizeGoogleAdsCustomerId178A_(
        account.accountId
      );
    })
  );
  const candidateRoutes = new Map();
  const rootErrors = [];
  const hierarchyErrors = [];
  const routeWarnings = [];
  let directRootsLoaded = 0;
  let managerRootsLoaded = 0;

  const resourceNames =
    listAccessibleGoogleAdsCustomers178A_(
      config.accessToken,
      config.developerToken
    );
  const rootIds = resourceNames
    .map(extractGoogleAdsCustomerId178A_)
    .filter(Boolean);

  rootIds.forEach(function (rootId) {
    let root;

    try {
      root = fetchGoogleAdsCustomer178A_({
        customerId: rootId,
        loginCustomerId: "",
        accessToken: config.accessToken,
        developerToken:
          config.developerToken
      });
      directRootsLoaded += 1;
    } catch (error) {
      const safeError =
        normalizeGoogleAdsPerformanceError178B_(
          error
        );

      rootErrors.push({
        maskedCustomerId:
          maskGoogleAdsCustomerId178A_(
            rootId
          ),
        reason: safeError.reason,
        message: safeError.message
      });
      return;
    }

    if (!root.manager) {
      if (enabledIds.has(root.accountId)) {
        addGoogleAdsRouteCandidate178B_(
          candidateRoutes,
          root.accountId,
          ""
        );
      }
      return;
    }

    managerRootsLoaded += 1;

    try {
      const descendants =
        discoverGoogleAdsHierarchy178A_({
          rootManagerId: root.accountId,
          accessToken: config.accessToken,
          developerToken:
            config.developerToken
        });

      descendants.forEach(function (customer) {
        if (
          !customer.manager &&
          enabledIds.has(customer.accountId)
        ) {
          addGoogleAdsRouteCandidate178B_(
            candidateRoutes,
            customer.accountId,
            root.accountId
          );
        }
      });
    } catch (error) {
      const safeError =
        normalizeGoogleAdsPerformanceError178B_(
          error
        );

      hierarchyErrors.push({
        maskedManagerId:
          maskGoogleAdsCustomerId178A_(
            root.accountId
          ),
        reason: safeError.reason,
        message: safeError.message
      });
    }
  });

  const routes = new Map();
  let routedDirectAccounts = 0;
  let routedMccAccounts = 0;
  const preferred =
    normalizeGoogleAdsCustomerId178A_(
      config.preferredLoginCustomerId
    );

  candidateRoutes.forEach(
    function (loginIds, accountId) {
      const unique = Array.from(
        new Set(loginIds)
      );
      let selected = "";

      if (unique.indexOf("") >= 0) {
        selected = "";
      } else if (
        preferred &&
        unique.indexOf(preferred) >= 0
      ) {
        selected = preferred;
      } else {
        selected = unique.slice().sort()[0];
      }

      routes.set(accountId, {
        accountId: accountId,
        loginCustomerId: selected,
        candidateCount: unique.length
      });

      if (selected) {
        routedMccAccounts += 1;
      } else {
        routedDirectAccounts += 1;
      }

      if (unique.length > 1) {
        routeWarnings.push({
          maskedAccountId:
            maskGoogleAdsCustomerId178A_(
              accountId
            ),
          reason:
            "MULTIPLE_MCC_ROUTES",
          selectedMaskedLoginCustomerId:
            selected
              ? maskGoogleAdsCustomerId178A_(
                  selected
                )
              : null,
          candidateCount: unique.length
        });
      }
    }
  );

  return {
    routes: routes,
    directRootsLoaded: directRootsLoaded,
    managerRootsLoaded: managerRootsLoaded,
    routedDirectAccounts:
      routedDirectAccounts,
    routedMccAccounts: routedMccAccounts,
    rootErrors: rootErrors,
    hierarchyErrors: hierarchyErrors,
    routeWarnings: routeWarnings
  };
}


function addGoogleAdsRouteCandidate178B_(
  routeMap,
  accountId,
  loginCustomerId
) {
  const normalizedAccountId =
    normalizeGoogleAdsCustomerId178A_(
      accountId
    );
  const normalizedLoginId =
    normalizeGoogleAdsCustomerId178A_(
      loginCustomerId
    );

  if (!normalizedAccountId) {
    return;
  }

  if (!routeMap.has(normalizedAccountId)) {
    routeMap.set(normalizedAccountId, []);
  }

  routeMap
    .get(normalizedAccountId)
    .push(normalizedLoginId);
}


/**
 * Retrieves campaign/day performance with GoogleAdsService.SearchStream.
 */
function fetchGoogleAdsPerformanceRows178B_(
  config
) {
  const accountId =
    normalizeGoogleAdsCustomerId178A_(
      config.account.accountId
    );

  if (!accountId) {
    throw new Error(
      "Google Ads account ID is missing."
    );
  }

  const query = [
    "SELECT",
    "segments.date,",
    "campaign.id,",
    "campaign.name,",
    "metrics.cost_micros,",
    "metrics.impressions,",
    "metrics.clicks,",
    "metrics.conversions,",
    "metrics.biddable_app_install_conversions",
    "FROM campaign",
    "WHERE segments.date BETWEEN",
    "'" + config.startDate + "'",
    "AND",
    "'" + config.endDate + "'"
  ].join(" ");

  return searchGoogleAds178A_({
    customerId: accountId,
    loginCustomerId:
      config.loginCustomerId,
    accessToken: config.accessToken,
    developerToken:
      config.developerToken,
    query: query
  });
}


/**
 * Normalizes REST camelCase fields to the shared Spend_Raw interface.
 */
function normalizeGoogleAdsPerformanceRows178B_(
  rows,
  account
) {
  const accountId =
    normalizeGoogleAdsCustomerId178A_(
      account.accountId
    );
  const accountName =
    String(account.accountName || "").trim() ||
    "Unnamed Google Ads account";
  const currency =
    String(account.currency || "")
      .trim()
      .toUpperCase();
  const recordsByKey = new Map();

  if (!currency) {
    throw new Error(
      "Google Ads account currency is missing. " +
      "Run Step 17.8A again before syncing performance."
    );
  }

  (rows || []).forEach(function (row) {
    const segments = row.segments || {};
    const campaign = row.campaign || {};
    const metrics = row.metrics || {};
    const date =
      String(segments.date || "").trim();
    const campaignId =
      String(campaign.id || "").trim();

    if (!date || !campaignId) {
      return;
    }

    const record = {
      date: date,
      platform: GOOGLE_ADS_178B.PLATFORM,
      accountId: accountId,
      accountName: accountName,
      campaignId: campaignId,
      campaignName:
        String(campaign.name || "").trim() ||
        "Unnamed campaign",
      currency: currency,
      spend:
        toGoogleAdsMetricNumber178B_(
          metrics.costMicros
        ) / 1000000,
      impressions:
        toGoogleAdsMetricNumber178B_(
          metrics.impressions
        ),
      clicks:
        toGoogleAdsMetricNumber178B_(
          metrics.clicks
        ),
      conversions:
        toGoogleAdsMetricNumber178B_(
          metrics.conversions
        ),
      appInstalls:
        toGoogleAdsMetricNumber178B_(
          metrics.biddableAppInstallConversions
        )
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

    existing.spend += record.spend;
    existing.impressions +=
      record.impressions;
    existing.clicks += record.clicks;
    existing.conversions +=
      record.conversions;
    existing.appInstalls +=
      record.appInstalls;
  });

  return Array.from(
    recordsByKey.values()
  ).map(function (record) {
    record.spend =
      roundGoogleAdsNumber178B_(
        record.spend,
        6
      );
    record.impressions =
      roundGoogleAdsNumber178B_(
        record.impressions,
        4
      );
    record.clicks =
      roundGoogleAdsNumber178B_(
        record.clicks,
        4
      );
    record.conversions =
      roundGoogleAdsNumber178B_(
        record.conversions,
        4
      );
    record.appInstalls =
      roundGoogleAdsNumber178B_(
        record.appInstalls,
        4
      );

    return record;
  });
}


function toGoogleAdsMetricNumber178B_(value) {
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
      "Google Ads returned a non-numeric metric value."
    );
  }

  return number;
}


function roundGoogleAdsNumber178B_(
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


function getGoogleAdsYesterday178B_(timezone) {
  const zone =
    String(timezone || "").trim() ||
    Session.getScriptTimeZone();
  const now = new Date();
  const todayText =
    Utilities.formatDate(
      now,
      zone,
      "yyyy-MM-dd"
    );

  return shiftGoogleAdsDate178B_(
    todayText,
    -1
  );
}


function shiftGoogleAdsDate178B_(
  dateText,
  days
) {
  validateGoogleAdsDate178B_(
    dateText,
    "Google Ads date"
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


function validateGoogleAdsDateRange178B_(
  startDate,
  endDate
) {
  validateGoogleAdsDate178B_(
    startDate,
    "Google Ads start date"
  );
  validateGoogleAdsDate178B_(
    endDate,
    "Google Ads end date"
  );

  if (startDate > endDate) {
    throw new Error(
      "Google Ads start date must not be after end date."
    );
  }
}


function validateGoogleAdsDate178B_(
  value,
  label
) {
  const text = String(value || "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(
      label + " must use yyyy-MM-dd."
    );
  }

  const parts = text.split("-").map(Number);
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


function normalizeGoogleAdsPerformanceError178B_(
  error
) {
  const message =
    sanitizeGoogleAdsMessage178A_(
      error && error.message
        ? error.message
        : String(error)
    );
  const statusMatch = message.match(
    /failed \((\d{3})\)/i
  );
  const upper = message.toUpperCase();
  let reason =
    classifyGoogleAdsCustomerError178A_(
      message
    );

  if (
    upper.indexOf("QUERY_ERROR") >= 0 ||
    upper.indexOf(
      "PROHIBITED_FIELD_IN_SELECT_CLAUSE"
    ) >= 0 ||
    upper.indexOf(
      "UNRECOGNIZED_FIELD"
    ) >= 0
  ) {
    reason = "QUERY_ERROR";
  } else if (
    upper.indexOf("RESOURCE_EXHAUSTED") >= 0
  ) {
    reason = "RATE_LIMIT_OR_QUOTA";
  } else if (
    upper.indexOf("UNAUTHENTICATED") >= 0 ||
    upper.indexOf("INVALID_GRANT") >= 0
  ) {
    reason = "OAUTH_ERROR";
  }

  return {
    type:
      error && error.name
        ? String(error.name)
        : "Error",
    httpStatus:
      statusMatch
        ? Number(statusMatch[1])
        : null,
    reason: reason,
    message: message
  };
}


function assertGoogleAdsDependencies178B_() {
  const dependencyChecks = [
    [
      "getGoogleAdsCredentials178A_",
      typeof getGoogleAdsCredentials178A_
    ],
    [
      "getGoogleAdsAccessToken178A_",
      typeof getGoogleAdsAccessToken178A_
    ],
    [
      "listAccessibleGoogleAdsCustomers178A_",
      typeof listAccessibleGoogleAdsCustomers178A_
    ],
    [
      "fetchGoogleAdsCustomer178A_",
      typeof fetchGoogleAdsCustomer178A_
    ],
    [
      "discoverGoogleAdsHierarchy178A_",
      typeof discoverGoogleAdsHierarchy178A_
    ],
    [
      "searchGoogleAds178A_",
      typeof searchGoogleAds178A_
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
  const missing = dependencyChecks
    .filter(function (check) {
      return check[1] !== "function";
    })
    .map(function (check) {
      return check[0];
    });

  if (
    typeof GOOGLE_ADS_178A === "undefined"
  ) {
    missing.push("GOOGLE_ADS_178A");
  }

  if (missing.length > 0) {
    throw new Error(
      "Google Ads Step 17.8B is missing dependencies: " +
      missing.join(", ") +
      ". Add GoogleAdsAuth.gs and the shared Hub modules first."
    );
  }
}


function writeGoogleAdsPerformanceLog178B_(
  entry
) {
  if (typeof writeSyncLog_ !== "function") {
    return;
  }

  writeSyncLog_({
    runId: entry.runId,
    startedAt: entry.startedAt,
    finishedAt: entry.finishedAt,
    platform: GOOGLE_ADS_178B.PLATFORM,
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


function writeGoogleAdsPerformanceError178B_(
  entry
) {
  if (typeof writeErrorLog_ !== "function") {
    return;
  }

  writeErrorLog_({
    runId: entry.runId,
    platform: GOOGLE_ADS_178B.PLATFORM,
    accountId: entry.accountId || "",
    functionName:
      entry.functionName ||
      "step178SyncGoogleAdsPerformance",
    errorCode:
      entry.error.reason ||
      entry.error.httpStatus ||
      "GOOGLE_ADS_PERFORMANCE_SYNC_FAILED",
    message: entry.error.message,
    details: ""
  });
}


function showGoogleAdsPerformanceSummary178B_(
  summary
) {
  try {
    SpreadsheetApp.getUi().alert(
      "Google Ads performance sync",
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
