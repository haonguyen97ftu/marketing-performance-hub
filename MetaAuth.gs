/**
 * Meta Ads — Authentication
 */

const META_AUTH = Object.freeze({
  GRAPH_ROOT:
    "https://graph.facebook.com",

  TOKEN_PROPERTY:
    "META_ACCESS_TOKEN",

  DETECTED_VERSION_PROPERTY:
    "_META_DETECTED_API_VERSION"
});

/**
 * Returns the stored Meta token for internal adapters.
 */
function getMetaAccessToken_() {
  return getSecret_(
    META_AUTH.TOKEN_PROPERTY
  );
}

/**
 * Tests the token without writing user/profile data to Sheets.
 *
 * The first call is intentionally unversioned so Meta can report
 * the API version currently assigned to the application.
 */
function testMetaAuthentication() {
  const runId = createRunId_();
  const startedAt = new Date();

  try {
    const response = apiRequest_({
      platform: "Meta",
      url:
        META_AUTH.GRAPH_ROOT +
        "/me?fields=id",
      method: "get",
      headers: {
        Authorization:
          "Bearer " +
          getMetaAccessToken_()
      },
      maxAttempts: 1
    });

    if (
      !response.data ||
      !response.data.id
    ) {
      throw new Error(
        "Meta accepted the request but returned no identity."
      );
    }

    const version =
      getResponseHeaderCaseInsensitive_(
        response.headers,
        "facebook-api-version"
      );

    if (version) {
      PropertiesService
        .getScriptProperties()
        .setProperty(
          META_AUTH.DETECTED_VERSION_PROPERTY,
          String(version)
        );
    }

    const finishedAt = new Date();

    writeSyncLog_({
      runId,
      startedAt,
      finishedAt,
      platform: "Meta",
      status: "SUCCESS",
      records: 1,
      durationSeconds:
        (finishedAt - startedAt) / 1000,
      message:
        "Authentication successful" +
        (version
          ? "; detected API version " + version
          : "") +
        "."
    });

    updateCredentialStatus();

    SpreadsheetApp.getUi().alert(
      "Meta authentication passed",
      [
        "✅ The access token is valid.",
        "✅ Meta accepted the identity request.",
        version
          ? "✅ Detected API version: " + version
          : "○ Meta did not return an API-version header.",
        "✅ No identity or token was written to the spreadsheet."
      ].join("\n"),
      SpreadsheetApp.getUi().ButtonSet.OK
    );

  } catch (error) {
    writeErrorLog_({
      runId,
      platform: "Meta",
      functionName: "testMetaAuthentication",
      errorCode:
        error.statusCode ||
        "META_AUTH_FAILED",
      message: error.message,
      details: error.safeResponse || ""
    });

    SpreadsheetApp.getUi().alert(
      "Meta authentication failed",
      sanitizeLogText_(error.message),
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

function getResponseHeaderCaseInsensitive_(
  headers,
  targetName
) {
  if (!headers) {
    return "";
  }

  const target = String(targetName).toLowerCase();
  const key = Object.keys(headers).find(
    name => name.toLowerCase() === target
  );

  return key ? headers[key] : "";
}

/**
 * Returns the detected Meta API version if available.
 */
function getMetaApiBaseUrl_() {
  const detected = PropertiesService
    .getScriptProperties()
    .getProperty(
      META_AUTH.DETECTED_VERSION_PROPERTY
    );

  if (!detected) {
    return META_AUTH.GRAPH_ROOT;
  }

  let version = String(detected).trim();

  if (!version.toLowerCase().startsWith("v")) {
    version = "v" + version;
  }

  if (!version.includes(".")) {
    version += ".0";
  }

  return META_AUTH.GRAPH_ROOT + "/" + version;
}