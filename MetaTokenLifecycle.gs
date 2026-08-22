/**
 * Marketing Performance Hub
 * Step 18C — Meta access-token lifecycle.
 *
 * Required Script Properties:
 *   META_ACCESS_TOKEN
 *   META_APP_ID
 *   META_APP_SECRET
 *
 * Optional Script Property:
 *   META_TOKEN_REFRESH_WINDOW_DAYS = 1..30 (default: 10)
 *
 * Internal health properties written by this file:
 *   _META_TOKEN_LAST_CHECK_AT
 *   _META_TOKEN_LAST_REFRESH_AT
 *   _META_TOKEN_LAST_STATUS
 *   _META_TOKEN_EXPIRES_AT
 *   _META_TOKEN_DATA_ACCESS_EXPIRES_AT
 *   _META_TOKEN_TYPE
 *   _META_TOKEN_REFRESH_COUNT
 *
 * Security:
 *   - Access tokens and app secrets are never returned or logged.
 *   - The refreshed token is saved to Script Properties immediately because
 *     Meta can revoke the previous system-user token during refresh.
 *   - Expired/revoked tokens cannot be refreshed and require one manual
 *     bootstrap token.
 */

var META_TOKEN_LIFECYCLE_182 = Object.freeze({
  STEP: "18C",
  GRAPH_BASE_URL: "https://graph.facebook.com",
  DEFAULT_API_VERSION: "v25.0",
  DEFAULT_REFRESH_WINDOW_DAYS: 10,
  MIN_REFRESH_WINDOW_DAYS: 1,
  MAX_REFRESH_WINDOW_DAYS: 30,
  REQUIRED_AD_PERMISSIONS: Object.freeze([
    "ads_read",
    "ads_management"
  ])
});


/**
 * Safe validation entry point.
 *
 * This performs real Meta API calls. It refreshes the token only when the
 * current token is within the configured refresh window.
 */
function step182TestMetaTokenLifecycle() {
  return runMetaTokenLifecycleTest182_(false);
}


/**
 * One-time live verification of the Refresh API.
 *
 * Run this only after step182TestMetaTokenLifecycle succeeds. A non-expiring
 * token is left unchanged because it does not need rotation.
 */
function step182ForceRefreshMetaToken() {
  return runMetaTokenLifecycleTest182_(true);
}


function runMetaTokenLifecycleTest182_(forceRefresh) {
  try {
    var state = ensureValidMetaAccessToken182_({
      source: forceRefresh
        ? "STEP_18C_FORCE_REFRESH_TEST"
        : "STEP_18C_TEST",
      forceRefresh: forceRefresh === true
    });
    var result = buildSafeMetaTokenResult182_(
      "SUCCESS",
      state
    );

    console.log(JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    var safeError = sanitizeMetaTokenError182_(error);
    var failedResult = {
      status: "FAILED",
      step: META_TOKEN_LIFECYCLE_182.STEP,
      tokenValid: false,
      refreshed: false,
      requiresManualToken:
        safeError.reason === "TOKEN_INVALID_OR_EXPIRED" ||
        safeError.reason === "DATA_ACCESS_REAUTH_REQUIRED",
      reason: safeError.reason,
      message: safeError.message,
      secretsExposed: false
    };

    recordMetaTokenFailure182_(safeError);
    console.log(JSON.stringify(failedResult, null, 2));
    return failedResult;
  }
}


/**
 * Production accessor used by MetaPerformance.gs.
 *
 * Returns only the token string to the connector. Callers must never log it.
 */
function getValidMetaAccessToken182_() {
  return ensureValidMetaAccessToken182_({
    source: "META_PERFORMANCE_SYNC"
  }).accessToken;
}


/**
 * Validates the current token, refreshes it when needed, and returns an
 * internal state object. The accessToken field is intentionally omitted from
 * every public/logged result.
 */
function ensureValidMetaAccessToken182_(options) {
  var config = options || {};
  var properties = PropertiesService.getScriptProperties();
  var accessToken = getRequiredMetaTokenProperty182_(
    properties,
    "META_ACCESS_TOKEN"
  );
  var appId = getRequiredMetaTokenProperty182_(
    properties,
    "META_APP_ID"
  );
  var appSecret = getRequiredMetaTokenProperty182_(
    properties,
    "META_APP_SECRET"
  );
  var apiVersion = getMetaTokenApiVersion182_(properties);
  var refreshWindowDays =
    getMetaRefreshWindowDays182_(properties);
  var checkedAt = new Date();
  var secrets = [accessToken, appSecret];

  var currentDebug;

  try {
    currentDebug = debugMetaAccessToken182_({
      accessToken: accessToken,
      appId: appId,
      appSecret: appSecret,
      apiVersion: apiVersion
    });
  } catch (error) {
    throw attachMetaTokenSafeError182_(
      error,
      "TOKEN_DEBUG_FAILED",
      "Meta token validation failed.",
      secrets
    );
  }

  validateMetaTokenDebug182_(
    currentDebug,
    appId,
    checkedAt
  );

  var currentState = normalizeMetaTokenState182_(
    currentDebug,
    checkedAt,
    refreshWindowDays
  );
  var shouldRefresh =
    currentState.expiresAtMs > 0 &&
    (
      currentState.needsRefresh ||
      config.forceRefresh === true
    );

  if (!hasMetaAdsPermission182_(currentState.scopes)) {
    throw createMetaTokenError182_(
      "MISSING_ADS_PERMISSION",
      "The Meta token is valid but is missing ads_read or ads_management."
    );
  }

  if (
    currentState.dataAccessExpiresAtMs > 0 &&
    currentState.dataAccessExpiresAtMs <=
      checkedAt.getTime() +
        refreshWindowDays * 24 * 60 * 60 * 1000
  ) {
    throw createMetaTokenError182_(
      "DATA_ACCESS_REAUTH_REQUIRED",
      "Meta data access is near expiry and requires user reauthorization."
    );
  }

  if (!shouldRefresh) {
    var healthyState = Object.assign(
      {},
      currentState,
      {
        accessToken: accessToken,
        refreshed: false,
        action:
          currentState.expiresAtMs === 0
            ? "VALID_NON_EXPIRING"
            : "VALID_NO_REFRESH",
        source: String(config.source || "")
      }
    );

    recordMetaTokenHealth182_(
      properties,
      healthyState,
      checkedAt
    );
    return healthyState;
  }

  var refreshResponse;

  try {
    refreshResponse = refreshMetaAccessToken182_({
      accessToken: accessToken,
      appId: appId,
      appSecret: appSecret,
      apiVersion: apiVersion
    });
  } catch (error) {
    throw attachMetaTokenSafeError182_(
      error,
      "TOKEN_REFRESH_FAILED",
      "Meta token refresh failed before a new token was received.",
      secrets
    );
  }

  var refreshedToken = safeMetaTokenString182_(
    refreshResponse.access_token
  );

  if (!refreshedToken) {
    throw createMetaTokenError182_(
      "TOKEN_REFRESH_EMPTY",
      "Meta refresh returned no access token."
    );
  }

  /*
   * Persist immediately. Meta documents that refreshing an expiring
   * system-user token revokes the previous token immediately.
   */
  properties.setProperties({
    "META_ACCESS_TOKEN": refreshedToken,
    "_META_TOKEN_LAST_STATUS": "REFRESHED_PENDING_VALIDATION",
    "_META_TOKEN_LAST_REFRESH_AT": checkedAt.toISOString()
  });

  var refreshedDebug;

  try {
    refreshedDebug = debugMetaAccessToken182_({
      accessToken: refreshedToken,
      appId: appId,
      appSecret: appSecret,
      apiVersion: apiVersion
    });
  } catch (error) {
    throw attachMetaTokenSafeError182_(
      error,
      "REFRESHED_TOKEN_DEBUG_FAILED",
      "A refreshed token was saved, but its validation request failed. Retry Step 18C.",
      [refreshedToken, appSecret]
    );
  }

  validateMetaTokenDebug182_(
    refreshedDebug,
    appId,
    new Date()
  );

  var refreshedState = normalizeMetaTokenState182_(
    refreshedDebug,
    new Date(),
    refreshWindowDays
  );

  if (!hasMetaAdsPermission182_(refreshedState.scopes)) {
    throw createMetaTokenError182_(
      "MISSING_ADS_PERMISSION",
      "The refreshed Meta token is missing ads_read or ads_management."
    );
  }

  if (
    currentState.needsRefresh &&
    currentState.expiresAtMs > 0 &&
    refreshedState.expiresAtMs > 0 &&
    refreshedState.expiresAtMs <=
      currentState.expiresAtMs + 24 * 60 * 60 * 1000
  ) {
    throw createMetaTokenError182_(
      "TOKEN_EXPIRY_NOT_EXTENDED",
      "Meta returned a valid token but did not extend its expiry. Use a refreshable or non-expiring system-user token."
    );
  }

  var finalState = Object.assign(
    {},
    refreshedState,
    {
      accessToken: refreshedToken,
      refreshed: true,
      action: "REFRESHED",
      source: String(config.source || "")
    }
  );

  recordMetaTokenHealth182_(
    properties,
    finalState,
    new Date()
  );
  incrementMetaTokenRefreshCount182_(properties);

  return finalState;
}


function debugMetaAccessToken182_(config) {
  var endpoint =
    META_TOKEN_LIFECYCLE_182.GRAPH_BASE_URL +
    "/" +
    config.apiVersion +
    "/debug_token?input_token=" +
    encodeURIComponent(config.accessToken);

  var response = requestMetaTokenJson182_({
    url: endpoint,
    method: "get",
    headers: {
      Authorization:
        "Bearer " + config.appId + "|" + config.appSecret
    },
    secrets: [
      config.accessToken,
      config.appSecret,
      config.appId + "|" + config.appSecret
    ]
  });

  return response && response.data
    ? response.data
    : {};
}


function refreshMetaAccessToken182_(config) {
  var endpoint =
    META_TOKEN_LIFECYCLE_182.GRAPH_BASE_URL +
    "/" +
    config.apiVersion +
    "/oauth/access_token";

  return requestMetaTokenJson182_({
    url: endpoint,
    method: "post",
    payload: {
      grant_type: "fb_exchange_token",
      client_id: config.appId,
      client_secret: config.appSecret,
      fb_exchange_token: config.accessToken
    },
    secrets: [
      config.accessToken,
      config.appSecret
    ]
  });
}


function requestMetaTokenJson182_(config) {
  var response;

  try {
    response = UrlFetchApp.fetch(config.url, {
      method: config.method || "get",
      headers: config.headers || {},
      payload: config.payload || undefined,
      muteHttpExceptions: true
    });
  } catch (networkError) {
    throw createMetaTokenError182_(
      "NETWORK_ERROR",
      "Meta token request failed before receiving a response."
    );
  }

  var httpStatus = response.getResponseCode();
  var rawBody = response.getContentText();
  var parsed = parseMetaTokenResponse182_(rawBody);

  if (
    httpStatus < 200 ||
    httpStatus >= 300 ||
    !parsed ||
    parsed.error
  ) {
    var metaError =
      parsed && parsed.error ? parsed.error : {};
    var message =
      safeMetaTokenString182_(metaError.message) ||
      "Unknown Meta token API error";
    var error = createMetaTokenError182_(
      "META_TOKEN_API_ERROR",
      sanitizeMetaTokenText182_(
        message,
        config.secrets || []
      )
    );

    error.safeMetaTokenError.httpStatus = httpStatus;
    error.safeMetaTokenError.code =
      metaError.code !== undefined
        ? metaError.code
        : null;
    error.safeMetaTokenError.errorSubcode =
      metaError.error_subcode !== undefined
        ? metaError.error_subcode
        : null;
    throw error;
  }

  return parsed;
}


function parseMetaTokenResponse182_(rawBody) {
  var text = String(rawBody || "").trim();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (jsonError) {
    var result = {};

    text.split("&").forEach(function (pair) {
      var separator = pair.indexOf("=");

      if (separator < 0) {
        return;
      }

      var key = decodeURIComponent(
        pair.slice(0, separator).replace(/\+/g, " ")
      );
      var value = decodeURIComponent(
        pair.slice(separator + 1).replace(/\+/g, " ")
      );

      result[key] = value;
    });

    if (Object.keys(result).length > 0) {
      return result;
    }
  }

  throw createMetaTokenError182_(
    "NON_JSON_RESPONSE",
    "Meta returned an unreadable token response."
  );
}


function validateMetaTokenDebug182_(
  debugData,
  expectedAppId,
  checkedAt
) {
  if (!debugData || debugData.is_valid !== true) {
    throw createMetaTokenError182_(
      "TOKEN_INVALID_OR_EXPIRED",
      "The Meta token is invalid or expired. Generate one fresh token and save it to META_ACCESS_TOKEN."
    );
  }

  var actualAppId = safeMetaTokenString182_(
    debugData.app_id
  );

  if (
    actualAppId &&
    actualAppId !== String(expectedAppId)
  ) {
    throw createMetaTokenError182_(
      "APP_ID_MISMATCH",
      "META_ACCESS_TOKEN was issued for a different Meta app than META_APP_ID."
    );
  }

  var expiresAtMs =
    toMetaEpochMilliseconds182_(debugData.expires_at);

  if (
    expiresAtMs > 0 &&
    expiresAtMs <= checkedAt.getTime()
  ) {
    throw createMetaTokenError182_(
      "TOKEN_INVALID_OR_EXPIRED",
      "The Meta token has expired. Generate one fresh token and save it to META_ACCESS_TOKEN."
    );
  }
}


function normalizeMetaTokenState182_(
  debugData,
  checkedAt,
  refreshWindowDays
) {
  var expiresAtMs =
    toMetaEpochMilliseconds182_(debugData.expires_at);
  var dataAccessExpiresAtMs =
    toMetaEpochMilliseconds182_(
      debugData.data_access_expires_at
    );
  var refreshAtMs =
    checkedAt.getTime() +
    refreshWindowDays * 24 * 60 * 60 * 1000;

  return {
    tokenValid: true,
    tokenType:
      safeMetaTokenString182_(debugData.type) ||
      "UNKNOWN",
    expiresAtMs: expiresAtMs,
    dataAccessExpiresAtMs: dataAccessExpiresAtMs,
    daysRemaining:
      expiresAtMs > 0
        ? roundMetaTokenDays182_(
            (expiresAtMs - checkedAt.getTime()) /
              (24 * 60 * 60 * 1000)
          )
        : null,
    dataAccessDaysRemaining:
      dataAccessExpiresAtMs > 0
        ? roundMetaTokenDays182_(
            (
              dataAccessExpiresAtMs -
              checkedAt.getTime()
            ) /
              (24 * 60 * 60 * 1000)
          )
        : null,
    refreshWindowDays: refreshWindowDays,
    needsRefresh:
      expiresAtMs > 0 && expiresAtMs <= refreshAtMs,
    scopes: Array.isArray(debugData.scopes)
      ? debugData.scopes.map(String)
      : []
  };
}


function hasMetaAdsPermission182_(scopes) {
  var values = Array.isArray(scopes) ? scopes : [];

  return META_TOKEN_LIFECYCLE_182
    .REQUIRED_AD_PERMISSIONS
    .some(function (permission) {
      return values.indexOf(permission) >= 0;
    });
}


function buildSafeMetaTokenResult182_(status, state) {
  return {
    status: status,
    step: META_TOKEN_LIFECYCLE_182.STEP,
    tokenValid: Boolean(state.tokenValid),
    tokenType: state.tokenType,
    action: state.action,
    refreshed: Boolean(state.refreshed),
    expiresAt:
      state.expiresAtMs > 0
        ? new Date(state.expiresAtMs).toISOString()
        : null,
    nonExpiring: state.expiresAtMs === 0,
    daysRemaining: state.daysRemaining,
    dataAccessExpiresAt:
      state.dataAccessExpiresAtMs > 0
        ? new Date(
            state.dataAccessExpiresAtMs
          ).toISOString()
        : null,
    dataAccessDaysRemaining:
      state.dataAccessDaysRemaining,
    refreshWindowDays: state.refreshWindowDays,
    adsPermissionPresent:
      hasMetaAdsPermission182_(state.scopes),
    secretsExposed: false
  };
}


function recordMetaTokenHealth182_(
  properties,
  state,
  checkedAt
) {
  properties.setProperties({
    "_META_TOKEN_LAST_CHECK_AT": checkedAt.toISOString(),
    "_META_TOKEN_LAST_STATUS": state.action,
    "_META_TOKEN_EXPIRES_AT":
      state.expiresAtMs > 0
        ? new Date(state.expiresAtMs).toISOString()
        : "NEVER",
    "_META_TOKEN_DATA_ACCESS_EXPIRES_AT":
      state.dataAccessExpiresAtMs > 0
        ? new Date(
            state.dataAccessExpiresAtMs
          ).toISOString()
        : "NEVER",
    "_META_TOKEN_TYPE": state.tokenType
  });
}


function recordMetaTokenFailure182_(safeError) {
  PropertiesService.getScriptProperties().setProperties({
    "_META_TOKEN_LAST_CHECK_AT": new Date().toISOString(),
    "_META_TOKEN_LAST_STATUS":
      "FAILED:" + String(safeError.reason || "UNKNOWN"),
    "_META_TOKEN_LAST_ERROR":
      String(safeError.message || "").slice(0, 500)
  });
}


function incrementMetaTokenRefreshCount182_(properties) {
  var current = Number(
    properties.getProperty(
      "_META_TOKEN_REFRESH_COUNT"
    ) || 0
  );

  properties.setProperty(
    "_META_TOKEN_REFRESH_COUNT",
    String(current + 1)
  );
}


function getMetaRefreshWindowDays182_(properties) {
  var raw = safeMetaTokenString182_(
    properties.getProperty(
      "META_TOKEN_REFRESH_WINDOW_DAYS"
    )
  );

  if (!raw) {
    return META_TOKEN_LIFECYCLE_182
      .DEFAULT_REFRESH_WINDOW_DAYS;
  }

  var days = Number(raw);

  if (
    !Number.isInteger(days) ||
    days <
      META_TOKEN_LIFECYCLE_182
        .MIN_REFRESH_WINDOW_DAYS ||
    days >
      META_TOKEN_LIFECYCLE_182
        .MAX_REFRESH_WINDOW_DAYS
  ) {
    throw createMetaTokenError182_(
      "INVALID_REFRESH_WINDOW",
      "META_TOKEN_REFRESH_WINDOW_DAYS must be an integer from 1 to 30."
    );
  }

  return days;
}


function getMetaTokenApiVersion182_(properties) {
  if (typeof getMetaApiVersion177_ === "function") {
    return getMetaApiVersion177_(properties);
  }

  var raw =
    safeMetaTokenString182_(
      properties.getProperty(
        "_META_DETECTED_API_VERSION"
      )
    ) ||
    META_TOKEN_LIFECYCLE_182.DEFAULT_API_VERSION;
  var normalized = raw.replace(/^v/i, "").trim();

  if (/^\d+$/.test(normalized)) {
    return "v" + normalized + ".0";
  }

  if (/^\d+\.\d+$/.test(normalized)) {
    return "v" + normalized;
  }

  return META_TOKEN_LIFECYCLE_182.DEFAULT_API_VERSION;
}


function getRequiredMetaTokenProperty182_(
  properties,
  key
) {
  var value = safeMetaTokenString182_(
    properties.getProperty(key)
  );

  if (!value) {
    throw createMetaTokenError182_(
      "MISSING_PROPERTY",
      "Missing required Script Property: " + key
    );
  }

  return value;
}


function toMetaEpochMilliseconds182_(value) {
  var seconds = Number(value || 0);

  if (!isFinite(seconds) || seconds <= 0) {
    return 0;
  }

  return Math.round(seconds * 1000);
}


function roundMetaTokenDays182_(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}


function safeMetaTokenString182_(value) {
  return value === null || value === undefined
    ? ""
    : String(value).trim();
}


function createMetaTokenError182_(reason, message) {
  var error = new Error(message);
  error.safeMetaTokenError = {
    reason: reason,
    message: message
  };
  return error;
}


function attachMetaTokenSafeError182_(
  error,
  fallbackReason,
  fallbackMessage,
  secrets
) {
  var safe = sanitizeMetaTokenError182_(
    error,
    secrets || []
  );

  if (
    safe.reason === "UNKNOWN_ERROR" ||
    safe.reason === "ERROR"
  ) {
    safe.reason = fallbackReason;
    safe.message = fallbackMessage;
  }

  var wrapped = new Error(safe.message);
  wrapped.safeMetaTokenError = safe;
  return wrapped;
}


function sanitizeMetaTokenError182_(error, secrets) {
  var source =
    error && error.safeMetaTokenError
      ? error.safeMetaTokenError
      : {};
  var reason =
    safeMetaTokenString182_(source.reason) ||
    safeMetaTokenString182_(
      error && error.name
    ) ||
    "UNKNOWN_ERROR";
  var message =
    safeMetaTokenString182_(source.message) ||
    safeMetaTokenString182_(
      error && error.message
    ) ||
    "Unknown Meta token lifecycle error";

  return {
    reason: reason,
    httpStatus:
      source.httpStatus !== undefined
        ? source.httpStatus
        : null,
    code:
      source.code !== undefined
        ? source.code
        : null,
    errorSubcode:
      source.errorSubcode !== undefined
        ? source.errorSubcode
        : null,
    message: sanitizeMetaTokenText182_(
      message,
      secrets || []
    )
  };
}


function sanitizeMetaTokenText182_(value, secrets) {
  var text = String(value || "");

  (secrets || []).forEach(function (secret) {
    var raw = String(secret || "");

    if (raw) {
      text = text.split(raw).join("[REDACTED]");
    }
  });

  return text
    .replace(
      /Bearer\s+[A-Za-z0-9._~+/|=-]+/gi,
      "Bearer [REDACTED]"
    )
    .replace(
      /(access_token|fb_exchange_token|client_secret|app_secret)(["'=:\s]+)[^,\s"&}]+/gi,
      "$1$2[REDACTED]"
    )
    .slice(0, 1000);
}
