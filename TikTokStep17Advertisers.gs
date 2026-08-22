/**
 * Marketing Spend Hub
 * Step 17.3 — Validate TikTok token and discover authorized advertisers.
 *
 * Security:
 * - Credentials are read only from Script Properties.
 * - Token and App Secret are never logged.
 * - Advertiser IDs are stored internally, but only masked IDs are logged.
 */
function step17CheckTikTokAdvertisers() {
  const properties = PropertiesService.getScriptProperties();

  const appId = getRequiredTikTokProperty17_(
    properties,
    'TIKTOK_APP_ID'
  );

  const appSecret = getRequiredTikTokProperty17_(
    properties,
    'TIKTOK_APP_SECRET'
  );

  const accessToken = getRequiredTikTokProperty17_(
    properties,
    'TIKTOK_ACCESS_TOKEN'
  );

  const endpoint =
    'https://business-api.tiktok.com/open_api/v1.3/oauth2/advertiser/get/';

  const queryString = [
    'app_id=' + encodeURIComponent(appId),
    'secret=' + encodeURIComponent(appSecret)
  ].join('&');

  let response;

  try {
    response = UrlFetchApp.fetch(endpoint + '?' + queryString, {
      method: 'get',
      headers: {
        'Access-Token': accessToken
      },
      muteHttpExceptions: true
    });
  } catch (networkError) {
    // Không đưa URL hoặc lỗi gốc vào log vì URL chứa App Secret.
    throw new Error(
      'TikTok advertiser request failed before receiving a response. ' +
      'Check the Apps Script network connection and try again.'
    );
  }

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
      code:
        result.code !== undefined
          ? result.code
          : null,
      message:
        result.message ||
        result.msg ||
        'Unknown TikTok API error',
      requestId:
        result.request_id ||
        result.requestId ||
        null
    };

    console.error(JSON.stringify(sanitizedError));

    throw new Error(
      'TikTok advertiser lookup failed: ' +
      JSON.stringify(sanitizedError)
    );
  }

  const rawAdvertisers =
    result.data && Array.isArray(result.data.list)
      ? result.data.list
      : [];

  const advertisers = rawAdvertisers
    .map(function (item) {
      return {
        advertiserId: String(
          item.advertiser_id || ''
        ).trim(),
        advertiserName: String(
          item.advertiser_name || 'Unnamed advertiser'
        ).trim()
      };
    })
    .filter(function (item) {
      return item.advertiserId !== '';
    });

  if (advertisers.length === 0) {
    throw new Error(
      'TikTok token is valid, but no authorized advertiser was returned. ' +
      'Reauthorize the app and make sure at least one TikTok Ads account is selected.'
    );
  }

  /*
   * Lưu danh sách advertiser nội bộ.
   * Không cần gửi advertiser ID qua chat.
   */
  properties.setProperty(
    'TIKTOK_AUTHORIZED_ADVERTISERS_JSON',
    JSON.stringify(advertisers)
  );

  /*
   * Nếu chỉ có một advertiser, tự động chọn làm advertiser mặc định.
   */
  if (advertisers.length === 1) {
    properties.setProperty(
      'TIKTOK_ADVERTISER_ID',
      advertisers[0].advertiserId
    );
  } else {
    properties.deleteProperty('TIKTOK_ADVERTISER_ID');
  }

  const safeAdvertisers = advertisers.map(function (item, index) {
    return {
      selectionNumber: index + 1,
      advertiserName: item.advertiserName,
      maskedAdvertiserId:
        maskTikTokAdvertiserId17_(item.advertiserId)
    };
  });

  const safeResult = {
    status: 'READY',
    tokenValid: true,
    advertiserCount: advertisers.length,
    defaultAdvertiserConfigured:
      advertisers.length === 1,
    advertisers: safeAdvertisers,
    secretsExposed: false
  };

  console.log(JSON.stringify(safeResult));

  try {
    const message =
      advertisers.length === 1
        ? 'READY — Token is valid. One advertiser was found and selected automatically.'
        : 'READY — Token is valid. ' +
          advertisers.length +
          ' advertisers were found. Selection is required in the next step.';

    SpreadsheetApp.getUi().alert(
      'TikTok advertiser check',
      message,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (uiError) {
    // Cho phép chạy khi không có spreadsheet UI.
  }

  return safeResult;
}

/**
 * Đọc property bắt buộc mà không log giá trị.
 */
function getRequiredTikTokProperty17_(properties, key) {
  const value = properties.getProperty(key);

  if (value === null || String(value).trim() === '') {
    throw new Error(
      'Missing required Script Property: ' + key
    );
  }

  return String(value).trim();
}

/**
 * Chỉ hiển thị 4 ký tự cuối của advertiser ID.
 */
function maskTikTokAdvertiserId17_(advertiserId) {
  const value = String(advertiserId || '');

  if (value.length <= 4) {
    return '****';
  }

  return '****' + value.slice(-4);
}