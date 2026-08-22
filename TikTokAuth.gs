/**
 * Marketing Spend Hub
 * Step 17.2 — Exchange TikTok auth_code for access token.
 *
 * Security:
 * - Credentials are read only from Script Properties.
 * - Access token is saved directly to Script Properties.
 * - Token values are never written to logs or sheets.
 * - One-time auth code is removed after success.
 */
function step17ExchangeTikTokAuthCode() {
  const properties = PropertiesService.getScriptProperties();

  const appId = getRequiredTikTokProperty_(
    properties,
    'TIKTOK_APP_ID'
  );

  const appSecret = getRequiredTikTokProperty_(
    properties,
    'TIKTOK_APP_SECRET'
  );

  const authCode = getRequiredTikTokProperty_(
    properties,
    'TIKTOK_AUTH_CODE'
  );

  const endpoint =
    'https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/';

  const response = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      app_id: appId,
      secret: appSecret,
      auth_code: authCode
    }),
    muteHttpExceptions: true
  });

  const httpStatus = response.getResponseCode();
  const rawBody = response.getContentText();

  let result;

  try {
    result = JSON.parse(rawBody);
  } catch (parseError) {
    throw new Error(
      'TikTok returned a non-JSON response. HTTP status: ' +
      httpStatus
    );
  }

  if (
    httpStatus < 200 ||
    httpStatus >= 300 ||
    Number(result.code) !== 0
  ) {
    const sanitizedError = {
      httpStatus: httpStatus,
      code: result.code,
      message: result.message || 'Unknown TikTok API error',
      requestId: result.request_id || null
    };

    console.error(JSON.stringify(sanitizedError));

    throw new Error(
      'TikTok token exchange failed: ' +
      JSON.stringify(sanitizedError)
    );
  }

  const data = result.data || {};
  const accessToken = String(data.access_token || '').trim();

  if (!accessToken) {
    throw new Error(
      'TikTok response succeeded but did not contain access_token.'
    );
  }

  const propertiesToSave = {
    TIKTOK_ACCESS_TOKEN: accessToken
  };

  if (data.refresh_token) {
    propertiesToSave.TIKTOK_REFRESH_TOKEN =
      String(data.refresh_token).trim();
  }

  properties.setProperties(propertiesToSave, false);

  // Auth code is single-use, so remove it after successful exchange.
  properties.deleteProperty('TIKTOK_AUTH_CODE');

  const safeResult = {
    status: 'READY',
    accessTokenSaved: true,
    refreshTokenSaved: Boolean(data.refresh_token),
    authCodeDeleted: true,
    secretsExposed: false
  };

  console.log(JSON.stringify(safeResult));

  try {
    SpreadsheetApp.getUi().alert(
      'TikTok authentication',
      'READY — TikTok access token was saved securely.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (uiError) {
    // Allows execution without an active spreadsheet UI.
  }

  return safeResult;
}

function getRequiredTikTokProperty_(properties, key) {
  const value = properties.getProperty(key);

  if (value === null || String(value).trim() === '') {
    throw new Error(
      'Missing required Script Property: ' + key
    );
  }

  return String(value).trim();
}