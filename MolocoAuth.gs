/**
 * Moloco Ads authentication.
 *
 * A long-lived API key generates a temporary access token.
 * The access token is cached privately in Script Properties.
 */

const MOLOCO_AUTH = Object.freeze({
  TOKEN_URL:
    "https://api.moloco.cloud/cm/v1/auth/tokens",

  API_KEY_PROPERTY:
    "MOLOCO_API_KEY",

  CACHED_TOKEN_PROPERTY:
    "_MOLOCO_CACHED_ACCESS_TOKEN",

  TOKEN_EXPIRY_PROPERTY:
    "_MOLOCO_CACHED_TOKEN_EXPIRY",

  // Official lifetime is 16 hours. Refresh after 15 hours.
  CACHE_DURATION_MS:
    15 * 60 * 60 * 1000
});

function getMolocoAccessToken_(forceRefresh) {
  const properties =
    PropertiesService.getScriptProperties();

  if (!forceRefresh) {
    const cachedToken = properties.getProperty(
      MOLOCO_AUTH.CACHED_TOKEN_PROPERTY
    );

    const expiry = Number(
      properties.getProperty(
        MOLOCO_AUTH.TOKEN_EXPIRY_PROPERTY
      ) || 0
    );

    if (
      cachedToken &&
      expiry > Date.now() + 5 * 60 * 1000
    ) {
      return cachedToken;
    }
  }

  const apiKey = getSecret_(
    MOLOCO_AUTH.API_KEY_PROPERTY
  );

  const response = apiRequest_({
    platform: "Moloco",
    url: MOLOCO_AUTH.TOKEN_URL,
    method: "post",
    contentType: "application/json",
    headers: {
      Accept: "application/json"
    },
    payload: {
      api_key: apiKey
    },
    maxAttempts: 2
  });

  const token =
    response.data &&
    response.data.token;

  if (!token) {
    throw new Error(
      "Moloco authentication succeeded without returning a token."
    );
  }

  properties.setProperties({
    [MOLOCO_AUTH.CACHED_TOKEN_PROPERTY]: token,
    [MOLOCO_AUTH.TOKEN_EXPIRY_PROPERTY]:
      String(
        Date.now() +
        MOLOCO_AUTH.CACHE_DURATION_MS
      )
  });

  return token;
}

/**
 * Clears only the generated temporary token.
 * The permanent API key is preserved.
 */
function clearMolocoAccessToken_() {
  const properties =
    PropertiesService.getScriptProperties();

  properties.deleteProperty(
    MOLOCO_AUTH.CACHED_TOKEN_PROPERTY
  );

  properties.deleteProperty(
    MOLOCO_AUTH.TOKEN_EXPIRY_PROPERTY
  );
}

/**
 * Performs a live authentication test.
 */
function testMolocoAuthentication() {
  const runId = createRunId_();
  const startedAt = new Date();

  try {
    clearMolocoAccessToken_();

    const token = getMolocoAccessToken_(true);

    if (!token) {
      throw new Error(
        "Moloco did not return an access token."
      );
    }

    const finishedAt = new Date();

    writeSyncLog_({
      runId,
      startedAt,
      finishedAt,
      platform: "Moloco",
      status: "SUCCESS",
      records: 1,
      durationSeconds:
        (finishedAt - startedAt) / 1000,
      message:
        "Authentication successful. Temporary token cached."
    });

    updateCredentialStatus();

    SpreadsheetApp.getUi().alert(
      "Moloco authentication passed",
      "✅ The API key is valid.\n" +
      "✅ A temporary access token was generated.\n" +
      "✅ No credential was written to the spreadsheet.",
      SpreadsheetApp.getUi().ButtonSet.OK
    );

  } catch (error) {
    writeErrorLog_({
      runId,
      platform: "Moloco",
      functionName: "testMolocoAuthentication",
      errorCode:
        error.statusCode ||
        "MOLOCO_AUTH_FAILED",
      message: error.message,
      details: error.safeResponse || ""
    });

    SpreadsheetApp.getUi().alert(
      "Moloco authentication failed",
      sanitizeLogText_(error.message),
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}