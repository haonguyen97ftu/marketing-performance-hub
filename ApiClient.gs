/**
 * Marketing Spend Hub — Shared API Client
 *
 * Used by all platform adapters:
 * - Meta
 * - TikTok
 * - Google Ads
 * - Apple Search Ads
 * - Moloco
 */

const API_CLIENT_DEFAULTS = Object.freeze({
  MAX_ATTEMPTS: 3,
  INITIAL_DELAY_MS: 1000,
  MAX_DELAY_MS: 8000,
  TIMEOUT_CODES: [408, 425, 429, 500, 502, 503, 504]
});

/**
 * Sends an HTTP request with retry and standardized errors.
 *
 * @param {Object} request
 * @return {Object} Parsed response information.
 */
function apiRequest_(request) {
  validateApiRequest_(request);

  const settings = getSettings_();
  const maxAttempts = Number(
    request.maxAttempts ||
    settings.MAX_RETRY_ATTEMPTS ||
    API_CLIENT_DEFAULTS.MAX_ATTEMPTS
  );

  const initialDelay = Number(
    request.initialDelayMs ||
    settings.RETRY_DELAY_MS ||
    API_CLIENT_DEFAULTS.INITIAL_DELAY_MS
  );

  const options = {
    method: String(request.method || "get").toLowerCase(),
    headers: request.headers || {},
    muteHttpExceptions: true,
    followRedirects: request.followRedirects !== false
  };

  if (request.contentType) {
    options.contentType = request.contentType;
  }

  if (request.payload !== undefined && request.payload !== null) {
    options.payload =
      typeof request.payload === "string"
        ? request.payload
        : JSON.stringify(request.payload);
  }

  let lastFailure = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = UrlFetchApp.fetch(request.url, options);
      const statusCode = response.getResponseCode();
      const responseText = response.getContentText();

      if (statusCode >= 200 && statusCode < 300) {
        return {
          ok: true,
          statusCode,
          headers: response.getAllHeaders(),
          text: responseText,
          data: parseJsonSafely_(responseText),
          attempt
        };
      }

      lastFailure = createApiFailure_(
        request,
        statusCode,
        responseText,
        attempt
      );

      if (
        !isRetryableStatus_(statusCode) ||
        attempt === maxAttempts
      ) {
        throw lastFailure;
      }

      Utilities.sleep(
        calculateRetryDelay_(initialDelay, attempt)
      );

    } catch (error) {
      if (error && error.isApiFailure) {
        throw error;
      }

      lastFailure = createApiFailure_(
        request,
        0,
        error.message || String(error),
        attempt
      );

      if (attempt === maxAttempts) {
        throw lastFailure;
      }

      Utilities.sleep(
        calculateRetryDelay_(initialDelay, attempt)
      );
    }
  }

  throw lastFailure || new Error("API request failed.");
}

/**
 * Validates request structure before any external connection.
 */
function validateApiRequest_(request) {
  if (!request || typeof request !== "object") {
    throw new Error("API request configuration is required.");
  }

  if (!request.url || !/^https:\/\//i.test(request.url)) {
    throw new Error("API request requires a valid HTTPS URL.");
  }

  const supportedMethods = [
    "get",
    "post",
    "put",
    "patch",
    "delete"
  ];

  const method = String(request.method || "get").toLowerCase();

  if (!supportedMethods.includes(method)) {
    throw new Error("Unsupported HTTP method: " + method);
  }
}

/**
 * Parses JSON while allowing successful empty responses.
 */
function parseJsonSafely_(text) {
  const normalized = String(text || "").trim();

  if (!normalized) {
    return null;
  }

  try {
    return JSON.parse(normalized);
  } catch (error) {
    return null;
  }
}

/**
 * Creates a standardized API error without exposing tokens.
 */
function createApiFailure_(
  request,
  statusCode,
  responseText,
  attempt
) {
  const platform = request.platform || "UNKNOWN";
  const safeResponse = sanitizeLogText_(responseText || "");

  const error = new Error(
    platform +
    " API request failed with status " +
    statusCode +
    " on attempt " +
    attempt +
    (safeResponse ? ": " + safeResponse : "")
  );

  error.name = "ApiRequestError";
  error.isApiFailure = true;
  error.platform = platform;
  error.statusCode = statusCode;
  error.attempt = attempt;
  error.safeResponse = safeResponse;

  return error;
}

/**
 * Returns true for temporary errors that can be retried.
 */
function isRetryableStatus_(statusCode) {
  return API_CLIENT_DEFAULTS.TIMEOUT_CODES.includes(
    Number(statusCode)
  );
}

/**
 * Calculates capped exponential backoff with jitter.
 */
function calculateRetryDelay_(initialDelay, attempt) {
  const exponential =
    Number(initialDelay) * Math.pow(2, attempt - 1);

  const jitter = Math.floor(Math.random() * 250);

  return Math.min(
    exponential + jitter,
    API_CLIENT_DEFAULTS.MAX_DELAY_MS
  );
}

/**
 * Runs local tests without sending an external API request.
 */
function runApiClientSelfTest() {
  const results = [];

  results.push({
    name: "Valid JSON parsing",
    passed:
      parseJsonSafely_('{"spend":123.45}').spend === 123.45
  });

  results.push({
    name: "Empty response parsing",
    passed: parseJsonSafely_("") === null
  });

  results.push({
    name: "Invalid JSON handling",
    passed: parseJsonSafely_("not-json") === null
  });

  results.push({
    name: "Retryable HTTP 429",
    passed: isRetryableStatus_(429) === true
  });

  results.push({
    name: "Non-retryable HTTP 401",
    passed: isRetryableStatus_(401) === false
  });

  results.push({
    name: "Backoff increases",
    passed:
      calculateRetryDelay_(1000, 2) >= 2000 &&
      calculateRetryDelay_(1000, 3) >= 4000
  });

  results.push({
    name: "Bearer token redaction",
    passed:
      sanitizeLogText_("Bearer secret-token-123") ===
      "Bearer [REDACTED]"
  });

  let rejectedInsecureUrl = false;

  try {
    validateApiRequest_({
      url: "http://example.com",
      method: "get"
    });
  } catch (error) {
    rejectedInsecureUrl = true;
  }

  results.push({
    name: "Insecure URL rejection",
    passed: rejectedInsecureUrl
  });

  const failures = results.filter(result => !result.passed);
  const runId = createRunId_();
  const now = new Date();

  writeSyncLog_({
    runId,
    startedAt: now,
    finishedAt: new Date(),
    platform: "SYSTEM",
    status: failures.length ? "FAILED" : "SUCCESS",
    records: results.length,
    durationSeconds: 0,
    message: failures.length
      ? "API client failures: " +
        failures.map(item => item.name).join(", ")
      : "All " + results.length +
        " API client tests passed."
  });

  SpreadsheetApp.getUi().alert(
    failures.length
      ? "API client test failed"
      : "API client test passed",
    results
      .map(result =>
        (result.passed ? "✅ " : "❌ ") + result.name
      )
      .join("\n"),
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}
