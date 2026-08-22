/**
 * Marketing Performance Hub
 * Step 17.8A — Google Ads OAuth, account discovery, and MCC resolution.
 *
 * Required Script Properties:
 *   GOOGLE_ADS_DEVELOPER_TOKEN
 *   GOOGLE_ADS_CLIENT_ID
 *   GOOGLE_ADS_CLIENT_SECRET
 *   GOOGLE_ADS_REFRESH_TOKEN
 *
 * Optional Script Property:
 *   GOOGLE_ADS_LOGIN_CUSTOMER_ID
 *
 * Required existing project function:
 *   upsertAccounts_(accounts)
 *
 * This file never logs OAuth credentials or full customer IDs.
 */

const GOOGLE_ADS_178A = Object.freeze({
  PLATFORM: "Google Ads",
  API_VERSION: "v25",
  API_BASE_URL: "https://googleads.googleapis.com",
  TOKEN_URL: "https://oauth2.googleapis.com/token",
  ACCESS_TOKEN_CACHE_KEY: "GOOGLE_ADS_ACCESS_TOKEN_178A",
  MAX_HIERARCHY_DEPTH: 20
});


/**
 * Step 17.8A entry point.
 *
 * Verifies OAuth and developer-token access, discovers directly accessible
 * customers and their child accounts, resolves a unique MCC when possible,
 * and upserts non-manager ad accounts into Accounts with Enabled = false.
 */
function step178TestGoogleAdsConnection() {
  const startedAt = new Date();
  const runId =
    typeof createRunId_ === "function"
      ? createRunId_()
      : Utilities.getUuid();

  try {
    const properties = PropertiesService.getScriptProperties();
    const credentials = getGoogleAdsCredentials178A_(properties);
    const accessToken = getGoogleAdsAccessToken178A_(
      credentials,
      false
    );

    const resourceNames =
      listAccessibleGoogleAdsCustomers178A_(
        accessToken,
        credentials.developerToken
      );

    if (!resourceNames.length) {
      throw new Error(
        "OAuth succeeded, but no directly accessible Google Ads " +
        "customers were returned for this Google account."
      );
    }

    const rootIds = resourceNames
      .map(extractGoogleAdsCustomerId178A_)
      .filter(Boolean);

    const roots = [];
    const rootErrors = [];

    rootIds.forEach(function (customerId) {
      try {
        roots.push(
          fetchGoogleAdsCustomer178A_({
            customerId: customerId,
            loginCustomerId: "",
            accessToken: accessToken,
            developerToken:
              credentials.developerToken
          })
        );
      } catch (error) {
        const safeMessage =
          sanitizeGoogleAdsMessage178A_(
            error && error.message
              ? error.message
              : String(error)
          );

        rootErrors.push({
          maskedCustomerId:
            maskGoogleAdsCustomerId178A_(
              customerId
            ),
          reason:
            classifyGoogleAdsCustomerError178A_(
              safeMessage
            ),
          message: safeMessage
        });
      }
    });

    const rootManagers = roots.filter(function (customer) {
      return customer.manager;
    });

    const loginResolution =
      resolveGoogleAdsLoginCustomer178A_(
        properties,
        rootManagers
      );

    const discovered = new Map();
    const hierarchyErrors = [];

    roots.forEach(function (root) {
      if (!root.manager) {
        discovered.set(root.accountId, root);
        return;
      }

      try {
        const descendants =
          discoverGoogleAdsHierarchy178A_({
            rootManagerId: root.accountId,
            accessToken: accessToken,
            developerToken: credentials.developerToken
          });

        descendants.forEach(function (customer) {
          discovered.set(customer.accountId, customer);
        });
      } catch (error) {
        hierarchyErrors.push({
          managerName:
            root.accountName || "Unnamed manager",
          maskedManagerId:
            maskGoogleAdsCustomerId178A_(
              root.accountId
            ),
          message:
            sanitizeGoogleAdsMessage178A_(
              error.message
            )
        });
      }
    });

    const advertiserAccounts = Array.from(
      discovered.values()
    ).filter(function (customer) {
      return !customer.manager;
    });

    const registryRows = advertiserAccounts.map(
      function (customer) {
        return {
          platform: GOOGLE_ADS_178A.PLATFORM,
          accountId: customer.accountId,
          accountName:
            customer.accountName ||
            "Google Ads " +
              maskGoogleAdsCustomerId178A_(
                customer.accountId
              ),
          currency: customer.currency,
          timezone: customer.timezone,
          enabled: false,
          status:
            customer.status ||
            "DISCOVERED"
        };
      }
    );

    const registryResult =
      registryRows.length > 0
        ? upsertAccounts_(registryRows)
        : { inserted: 0, updated: 0 };

    const hasDiscoveryErrors =
      rootErrors.length > 0 ||
      hierarchyErrors.length > 0;
    const status =
      roots.length === 0
        ? "ACTION_REQUIRED"
        : loginResolution.selectionRequired
          ? "ACTION_REQUIRED"
          : hasDiscoveryErrors
            ? "PARTIAL_SUCCESS"
            : "SUCCESS";

    const finishedAt = new Date();
    const summary = {
      status: status,
      runId: runId,
      step: "17.8A",
      apiVersion: GOOGLE_ADS_178A.API_VERSION,
      oauth: "SUCCESS",
      developerTokenAccess: "SUCCESS",
      directlyAccessibleCustomers:
        rootIds.length,
      rootMetadataLoaded: roots.length,
      skippedDirectCustomers:
        rootErrors.length,
      directlyAccessibleManagers: rootManagers.length,
      discoveredAdvertisers: advertiserAccounts.length,
      inserted: registryResult.inserted,
      updated: registryResult.updated,
      loginCustomerResolution:
        loginResolution.status,
      maskedLoginCustomerId:
        loginResolution.customerId
          ? maskGoogleAdsCustomerId178A_(
              loginResolution.customerId
            )
          : null,
      managerCandidates:
        rootManagers.map(function (manager) {
          return {
            accountName:
              manager.accountName ||
              "Unnamed manager",
            maskedAccountId:
              maskGoogleAdsCustomerId178A_(
                manager.accountId
            )
          };
        }),
      rootErrors: rootErrors,
      hierarchyErrors: hierarchyErrors,
      durationSeconds:
        Math.round(
          ((finishedAt - startedAt) / 1000) * 10
        ) / 10,
      secretsExposed: false
    };

    writeGoogleAdsStep178ALog_({
      runId: runId,
      startedAt: startedAt,
      finishedAt: finishedAt,
      status: status,
      records: advertiserAccounts.length,
      message:
        "Google Ads OAuth and account discovery completed. " +
        "Skipped direct customers: " +
        rootErrors.length +
        ". " +
        "Login customer resolution: " +
        loginResolution.status +
        "."
    });

    console.log(JSON.stringify(summary, null, 2));
    return summary;

  } catch (error) {
    const finishedAt = new Date();
    const safeMessage =
      sanitizeGoogleAdsMessage178A_(
        error && error.message
          ? error.message
          : String(error)
      );

    writeGoogleAdsStep178ALog_({
      runId: runId,
      startedAt: startedAt,
      finishedAt: finishedAt,
      status: "FAILED",
      records: 0,
      message: safeMessage
    });

    const failedSummary = {
      status: "FAILED",
      runId: runId,
      step: "17.8A",
      apiVersion: GOOGLE_ADS_178A.API_VERSION,
      error: safeMessage,
      durationSeconds:
        Math.round(
          ((finishedAt - startedAt) / 1000) * 10
        ) / 10,
      secretsExposed: false
    };

    console.log(
      JSON.stringify(failedSummary, null, 2)
    );

    throw new Error(safeMessage);
  }
}


/**
 * Forces a fresh OAuth exchange without changing account data.
 */
function step178RefreshGoogleAdsAccessToken() {
  const credentials =
    getGoogleAdsCredentials178A_(
      PropertiesService.getScriptProperties()
    );

  getGoogleAdsAccessToken178A_(
    credentials,
    true
  );

  const result = {
    status: "SUCCESS",
    step: "17.8A OAuth refresh",
    accessTokenCached: true,
    secretsExposed: false
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}


function getGoogleAdsCredentials178A_(properties) {
  return {
    developerToken:
      getRequiredGoogleAdsProperty178A_(
        properties,
        "GOOGLE_ADS_DEVELOPER_TOKEN"
      ),
    clientId:
      getRequiredGoogleAdsProperty178A_(
        properties,
        "GOOGLE_ADS_CLIENT_ID"
      ),
    clientSecret:
      getRequiredGoogleAdsProperty178A_(
        properties,
        "GOOGLE_ADS_CLIENT_SECRET"
      ),
    refreshToken:
      getRequiredGoogleAdsProperty178A_(
        properties,
        "GOOGLE_ADS_REFRESH_TOKEN"
      )
  };
}


function getRequiredGoogleAdsProperty178A_(
  properties,
  key
) {
  const value = String(
    properties.getProperty(key) || ""
  ).trim();

  if (!value) {
    throw new Error(
      "Missing required Script Property: " + key
    );
  }

  return value;
}


function getGoogleAdsAccessToken178A_(
  credentials,
  forceRefresh
) {
  const cache = CacheService.getScriptCache();

  if (!forceRefresh) {
    const cached = cache.get(
      GOOGLE_ADS_178A.ACCESS_TOKEN_CACHE_KEY
    );

    if (cached) {
      return cached;
    }
  }

  const response = UrlFetchApp.fetch(
    GOOGLE_ADS_178A.TOKEN_URL,
    {
      method: "post",
      payload: {
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        refresh_token: credentials.refreshToken,
        grant_type: "refresh_token"
      },
      muteHttpExceptions: true
    }
  );

  const statusCode = response.getResponseCode();
  const text = response.getContentText();
  const data = parseGoogleAdsJson178A_(text);

  if (
    statusCode < 200 ||
    statusCode >= 300 ||
    !data.access_token
  ) {
    throw new Error(
      "Google OAuth token exchange failed (" +
      statusCode +
      "): " +
      extractGoogleAdsErrorMessage178A_(data, text)
    );
  }

  const expiresIn = Number(
    data.expires_in || 3600
  );
  const cacheSeconds = Math.max(
    60,
    Math.min(3300, expiresIn - 120)
  );

  cache.put(
    GOOGLE_ADS_178A.ACCESS_TOKEN_CACHE_KEY,
    String(data.access_token),
    cacheSeconds
  );

  return String(data.access_token);
}


function listAccessibleGoogleAdsCustomers178A_(
  accessToken,
  developerToken
) {
  const data = fetchGoogleAdsJson178A_({
    url:
      GOOGLE_ADS_178A.API_BASE_URL +
      "/" +
      GOOGLE_ADS_178A.API_VERSION +
      "/customers:listAccessibleCustomers",
    method: "get",
    accessToken: accessToken,
    developerToken: developerToken
  });

  return Array.isArray(data.resourceNames)
    ? data.resourceNames
    : [];
}


function fetchGoogleAdsCustomer178A_(config) {
  const rows = searchGoogleAds178A_({
    customerId: config.customerId,
    loginCustomerId: config.loginCustomerId,
    accessToken: config.accessToken,
    developerToken: config.developerToken,
    query: [
      "SELECT",
      "customer.id,",
      "customer.descriptive_name,",
      "customer.currency_code,",
      "customer.time_zone,",
      "customer.manager,",
      "customer.test_account,",
      "customer.status",
      "FROM customer",
      "LIMIT 1"
    ].join(" ")
  });

  if (!rows.length || !rows[0].customer) {
    throw new Error(
      "Google Ads returned no customer metadata for " +
      maskGoogleAdsCustomerId178A_(
        config.customerId
      ) +
      "."
    );
  }

  return normalizeGoogleAdsCustomer178A_(
    rows[0].customer
  );
}


function discoverGoogleAdsHierarchy178A_(config) {
  const discovered = new Map();
  const visitedManagers = new Set();

  walkGoogleAdsManager178A_({
    managerId: config.rootManagerId,
    loginCustomerId: config.rootManagerId,
    accessToken: config.accessToken,
    developerToken: config.developerToken,
    depth: 0,
    discovered: discovered,
    visitedManagers: visitedManagers
  });

  return Array.from(discovered.values());
}


function walkGoogleAdsManager178A_(config) {
  if (
    config.depth >
    GOOGLE_ADS_178A.MAX_HIERARCHY_DEPTH
  ) {
    throw new Error(
      "Google Ads manager hierarchy exceeded " +
      GOOGLE_ADS_178A.MAX_HIERARCHY_DEPTH +
      " levels."
    );
  }

  if (config.visitedManagers.has(config.managerId)) {
    return;
  }

  config.visitedManagers.add(config.managerId);

  const rows = searchGoogleAds178A_({
    customerId: config.managerId,
    loginCustomerId: config.loginCustomerId,
    accessToken: config.accessToken,
    developerToken: config.developerToken,
    query: [
      "SELECT",
      "customer_client.id,",
      "customer_client.client_customer,",
      "customer_client.descriptive_name,",
      "customer_client.currency_code,",
      "customer_client.time_zone,",
      "customer_client.manager,",
      "customer_client.test_account,",
      "customer_client.status,",
      "customer_client.level",
      "FROM customer_client",
      "WHERE customer_client.level = 1"
    ].join(" ")
  });

  rows.forEach(function (row) {
    if (!row.customerClient) {
      return;
    }

    const customer =
      normalizeGoogleAdsCustomer178A_(
        row.customerClient
      );

    if (!customer.accountId) {
      return;
    }

    config.discovered.set(
      customer.accountId,
      customer
    );

    if (customer.manager) {
      walkGoogleAdsManager178A_({
        managerId: customer.accountId,
        loginCustomerId:
          config.loginCustomerId,
        accessToken: config.accessToken,
        developerToken:
          config.developerToken,
        depth: config.depth + 1,
        discovered: config.discovered,
        visitedManagers:
          config.visitedManagers
      });
    }
  });
}


function searchGoogleAds178A_(config) {
  const data = fetchGoogleAdsJson178A_({
    url:
      GOOGLE_ADS_178A.API_BASE_URL +
      "/" +
      GOOGLE_ADS_178A.API_VERSION +
      "/customers/" +
      normalizeGoogleAdsCustomerId178A_(
        config.customerId
      ) +
      "/googleAds:searchStream",
    method: "post",
    accessToken: config.accessToken,
    developerToken: config.developerToken,
    loginCustomerId:
      config.loginCustomerId,
    payload: {
      query: config.query
    }
  });

  const chunks = Array.isArray(data)
    ? data
    : [data];
  const rows = [];

  chunks.forEach(function (chunk) {
    if (chunk && Array.isArray(chunk.results)) {
      Array.prototype.push.apply(
        rows,
        chunk.results
      );
    }
  });

  return rows;
}


function fetchGoogleAdsJson178A_(config) {
  const headers = {
    Authorization:
      "Bearer " + config.accessToken,
    "developer-token":
      config.developerToken,
    Accept: "application/json"
  };

  const loginCustomerId =
    normalizeGoogleAdsCustomerId178A_(
      config.loginCustomerId || ""
    );

  if (loginCustomerId) {
    headers["login-customer-id"] =
      loginCustomerId;
  }

  const options = {
    method: config.method || "get",
    headers: headers,
    muteHttpExceptions: true
  };

  if (config.payload !== undefined) {
    options.contentType = "application/json";
    options.payload = JSON.stringify(
      config.payload
    );
  }

  const response = UrlFetchApp.fetch(
    config.url,
    options
  );
  const statusCode = response.getResponseCode();
  const text = response.getContentText();
  const data = parseGoogleAdsJson178A_(text);

  if (
    statusCode < 200 ||
    statusCode >= 300
  ) {
    throw new Error(
      "Google Ads API request failed (" +
      statusCode +
      "): " +
      extractGoogleAdsErrorMessage178A_(
        data,
        text
      )
    );
  }

  return data;
}


function normalizeGoogleAdsCustomer178A_(raw) {
  const accountId =
    normalizeGoogleAdsCustomerId178A_(
      raw.id ||
      raw.clientCustomer ||
      ""
    );

  return {
    accountId: accountId,
    accountName: String(
      raw.descriptiveName || ""
    ).trim(),
    currency: String(
      raw.currencyCode || ""
    ).trim().toUpperCase(),
    timezone: String(
      raw.timeZone || ""
    ).trim(),
    manager: Boolean(raw.manager),
    testAccount: Boolean(raw.testAccount),
    status: String(
      raw.status || "DISCOVERED"
    ).trim()
  };
}


function resolveGoogleAdsLoginCustomer178A_(
  properties,
  rootManagers
) {
  const existing =
    normalizeGoogleAdsCustomerId178A_(
      properties.getProperty(
        "GOOGLE_ADS_LOGIN_CUSTOMER_ID"
      ) || ""
    );

  if (existing) {
    return {
      status: "EXISTING_PROPERTY",
      customerId: existing,
      selectionRequired: false
    };
  }

  if (rootManagers.length === 1) {
    const customerId =
      rootManagers[0].accountId;

    properties.setProperty(
      "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
      customerId
    );

    return {
      status: "AUTO_SET_UNIQUE_MANAGER",
      customerId: customerId,
      selectionRequired: false
    };
  }

  if (rootManagers.length > 1) {
    return {
      status: "MULTIPLE_MANAGERS_FOUND",
      customerId: "",
      selectionRequired: true
    };
  }

  return {
    status: "NOT_REQUIRED_DIRECT_ACCESS",
    customerId: "",
    selectionRequired: false
  };
}


function extractGoogleAdsCustomerId178A_(
  resourceName
) {
  const match = String(
    resourceName || ""
  ).match(/^customers\/(\d+)$/);

  return match ? match[1] : "";
}


function normalizeGoogleAdsCustomerId178A_(
  value
) {
  return String(value || "")
    .replace(/\D/g, "")
    .trim();
}


function maskGoogleAdsCustomerId178A_(value) {
  const normalized =
    normalizeGoogleAdsCustomerId178A_(value);

  if (!normalized) {
    return "";
  }

  return "****" + normalized.slice(-4);
}


function parseGoogleAdsJson178A_(text) {
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return {
      rawText:
        String(text).slice(0, 1000)
    };
  }
}


function extractGoogleAdsErrorMessage178A_(
  data,
  fallbackText
) {
  const candidates = [
    data &&
      data.error &&
      data.error.message,
    data && data.error_description,
    data && data.error,
    data && data.message,
    data && data.rawText,
    fallbackText
  ];

  for (
    let index = 0;
    index < candidates.length;
    index++
  ) {
    const candidate = candidates[index];

    if (
      typeof candidate === "string" &&
      candidate.trim()
    ) {
      return sanitizeGoogleAdsMessage178A_(
        candidate
      );
    }
  }

  return "Unknown Google Ads API error.";
}


function classifyGoogleAdsCustomerError178A_(
  message
) {
  const normalized = String(
    message || ""
  ).toUpperCase();

  if (
    normalized.indexOf(
      "CUSTOMER_NOT_ENABLED"
    ) !== -1
  ) {
    return "CUSTOMER_NOT_ENABLED";
  }

  if (
    normalized.indexOf(
      "USER_PERMISSION_DENIED"
    ) !== -1 ||
    normalized.indexOf(
      "CUSTOMER_NOT_ACCESSIBLE"
    ) !== -1
  ) {
    return "CUSTOMER_NOT_ACCESSIBLE";
  }

  if (
    normalized.indexOf(
      "DEVELOPER_TOKEN"
    ) !== -1
  ) {
    return "DEVELOPER_TOKEN_ERROR";
  }

  return "CUSTOMER_DISCOVERY_ERROR";
}


function sanitizeGoogleAdsMessage178A_(message) {
  return String(message || "")
    .replace(
      /ya29\.[A-Za-z0-9._-]+/g,
      "[ACCESS_TOKEN_REDACTED]"
    )
    .replace(
      /\b\d{10}\b/g,
      function (customerId) {
        return (
          "******" +
          customerId.slice(-4)
        );
      }
    )
    .slice(0, 1500);
}


function writeGoogleAdsStep178ALog_(entry) {
  if (typeof writeSyncLog_ !== "function") {
    return;
  }

  writeSyncLog_({
    runId: entry.runId,
    startedAt: entry.startedAt,
    finishedAt: entry.finishedAt,
    platform: GOOGLE_ADS_178A.PLATFORM,
    accountId: "",
    status: entry.status,
    records: entry.records,
    durationSeconds:
      (entry.finishedAt - entry.startedAt) /
      1000,
    message: entry.message
  });
}
