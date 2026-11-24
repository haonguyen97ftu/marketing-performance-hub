/**
 * Marketing Performance Hub — Meta and TikTok audience age reporting.
 *
 * Grain:
 *   Month × Platform × Account × Campaign × Age Range
 *
 * Both connectors query one calendar month at a time. This avoids inventing a
 * time split for TikTok audience reports and keeps partial current-month data
 * compatible with the existing Age_Monthly table.
 */

const PAID_SOCIAL_AGE_20261106 = Object.freeze({
  RECENT_MONTHS: 3,
  META: Object.freeze({
    PLATFORM: "Meta",
    PAGE_LIMIT: 500,
    MAX_PAGES: 10000,
    FIELD_PROFILES: Object.freeze([
      Object.freeze([
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
      Object.freeze([
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
      Object.freeze([
        "date_start",
        "date_stop",
        "account_id",
        "account_name",
        "account_currency",
        "campaign_id",
        "campaign_name",
        "spend",
        "impressions",
        "clicks"
      ])
    ])
  }),
  TIKTOK: Object.freeze({
    PLATFORM: "TikTok",
    REPORT_ENDPOINT:
      "https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/",
    PAGE_SIZE: 1000,
    MAX_PAGES: 500,
    METRIC_PROFILES: Object.freeze([
      Object.freeze([
        "campaign_name",
        "currency",
        "spend",
        "impressions",
        "clicks",
        "conversion",
        "app_install"
      ]),
      Object.freeze([
        "campaign_name",
        "currency",
        "spend",
        "impressions",
        "clicks",
        "conversion"
      ]),
      Object.freeze([
        "campaign_name",
        "currency",
        "spend",
        "impressions",
        "clicks"
      ])
    ])
  })
});


/** Pulls the current month plus the previous two months for TikTok. */
function syncTikTokAgeRecentMonths() {
  return runPaidSocialAgePlatforms20261106_(["TikTok"]);
}


/** Pulls the current month plus the previous two months for Meta. */
function syncMetaAgeRecentMonths() {
  return runPaidSocialAgePlatforms20261106_(["Meta"]);
}


/** Pulls TikTok and Meta sequentially under one script lock. */
function syncTikTokAndMetaAgeRecentMonths() {
  return runPaidSocialAgePlatforms20261106_(["TikTok", "Meta"]);
}


function syncTikTokAndMetaAgeRecentMonthsFromMenu() {
  const result = syncTikTokAndMetaAgeRecentMonths();
  const rowsWritten = (result.results || []).reduce(function (total, item) {
    return total + Number(item.rowsWritten || 0);
  }, 0);
  SpreadsheetApp.getActiveSpreadsheet().toast(
    result.status + ": " + rowsWritten + " TikTok/Meta age rows written.",
    "Marketing Hub",
    8
  );
  return result;
}


function runPaidSocialAgePlatforms20261106_(platforms) {
  assertPaidSocialAgeDependencies20261106_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    throw new Error("Another Marketing Hub operation is already running.");
  }

  try {
    const startedAt = new Date();
    const range = getPaidSocialAgeRecentRange20261106_();
    const results = [];

    (platforms || []).forEach(function (platform) {
      try {
        const packageResult = platform === "TikTok"
          ? collectTikTokAge20261106_(range)
          : platform === "Meta"
            ? collectMetaAge20261106_(range)
            : null;
        if (!packageResult) {
          throw new Error("Unsupported age-reporting platform: " + platform);
        }

        const writeResult = replacePaidSocialAgeScopes20261106_(
          packageResult.records,
          packageResult.scopes
        );
        results.push({
          platform: platform,
          status: packageResult.failedAccounts ? "PARTIAL" : "SUCCESS",
          enabledAccounts: packageResult.enabledAccounts,
          successfulAccounts: packageResult.successfulAccounts,
          failedAccounts: packageResult.failedAccounts,
          rowsWritten: writeResult.incomingRows,
          totalSheetRows: writeResult.totalRows,
          accounts: packageResult.results
        });
      } catch (error) {
        results.push({
          platform: platform,
          status: "FAILED",
          message: sanitizePaidSocialAgeError20261106_(error)
        });
      }
    });

    const successful = results.filter(function (result) {
      return result.status === "SUCCESS" || result.status === "PARTIAL";
    });
    const summary = {
      status: successful.length === results.length
        ? (results.some(function (result) { return result.status === "PARTIAL"; })
          ? "PARTIAL"
          : "SUCCESS")
        : successful.length
          ? "PARTIAL"
          : "FAILED",
      sheetName: AGE_REPORTING_20261105.SHEET_NAME,
      startDate: range.startDate,
      endDate: range.endDate,
      results: results,
      durationSeconds: Math.round((new Date() - startedAt) / 100) / 10
    };

    console.log("Audience age reporting: " + summary.status);
    return summary;
  } finally {
    lock.releaseLock();
  }
}


function collectMetaAge20261106_(range) {
  const properties = PropertiesService.getScriptProperties();
  const accessToken = getValidMetaAccessToken182_();
  const apiVersion = getMetaApiVersion177_(properties);
  const accounts = getEnabledAccounts_(
    PAID_SOCIAL_AGE_20261106.META.PLATFORM
  );
  if (!accounts.length) {
    throw new Error("No enabled Meta account was found in Accounts.");
  }

  const months = splitPaidSocialAgeMonths20261106_(range);
  const records = [];
  const scopes = [];
  const results = [];

  accounts.forEach(function (account) {
    try {
      const accountRecords = [];
      let apiRows = 0;
      let pagesFetched = 0;
      const fieldProfiles = [];

      months.forEach(function (month) {
        const report = fetchMetaAgeMonth20261106_({
          accessToken: accessToken,
          apiVersion: apiVersion,
          account: account,
          startDate: month.startDate,
          endDate: month.endDate
        });
        const normalized = normalizeMetaAgeRows20261106_(
          report.rows,
          account,
          month.month
        );
        Array.prototype.push.apply(accountRecords, normalized);
        apiRows += report.rows.length;
        pagesFetched += report.pagesFetched;
        fieldProfiles.push(report.fieldProfile);
      });

      Array.prototype.push.apply(records, accountRecords);
      scopes.push({
        platform: PAID_SOCIAL_AGE_20261106.META.PLATFORM,
        accountId: String(account.accountId),
        startMonth: range.startDate.slice(0, 7),
        endMonth: range.endDate.slice(0, 7)
      });
      results.push({
        accountId: maskMetaAccountId177_(account.accountId),
        accountName: safeMetaString177_(account.accountName),
        status: "SUCCESS",
        apiRows: apiRows,
        outputRows: accountRecords.length,
        pagesFetched: pagesFetched,
        fieldProfiles: Array.from(new Set(fieldProfiles))
      });
    } catch (error) {
      results.push({
        accountId: maskMetaAccountId177_(account.accountId),
        accountName: safeMetaString177_(account.accountName),
        status: "FAILED",
        error: sanitizeMetaError177_(error)
      });
    }
  });

  return finalizePaidSocialAgeCollection20261106_(accounts, records, scopes, results);
}


function fetchMetaAgeMonth20261106_(config) {
  let lastError = null;
  const profiles = PAID_SOCIAL_AGE_20261106.META.FIELD_PROFILES;

  for (let index = 0; index < profiles.length; index++) {
    try {
      const result = fetchMetaAgeMonthWithFields20261106_(
        config,
        profiles[index]
      );
      result.fieldProfile = index === 0
        ? "OBJECTIVE_RESULTS_AND_ACTIONS"
        : index === 1
          ? "ACTIONS_FALLBACK"
          : "DELIVERY_ONLY_FALLBACK";
      return result;
    } catch (error) {
      lastError = error;
      if (
        index === profiles.length - 1 ||
        !isMetaAgeCompatibilityError20261106_(error)
      ) {
        throw error;
      }
    }
  }

  throw lastError || new Error("Meta age report failed.");
}


function fetchMetaAgeMonthWithFields20261106_(config, fields) {
  const accountId = safeMetaString177_(config.account.accountId);
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
    breakdowns: "age",
    time_range: JSON.stringify({
      since: config.startDate,
      until: config.endDate
    }),
    limit: String(PAID_SOCIAL_AGE_20261106.META.PAGE_LIMIT)
  };
  const rows = [];
  let afterCursor = "";
  let pagesFetched = 0;

  while (true) {
    if (pagesFetched >= PAID_SOCIAL_AGE_20261106.META.MAX_PAGES) {
      throw new Error("Meta age report exceeded pagination limit.");
    }
    const parameters = Object.assign({}, baseParameters);
    if (afterCursor) parameters.after = afterCursor;
    const response = requestMetaJson177_({
      url: endpoint + "?" + buildMetaQueryString177_(parameters),
      accessToken: config.accessToken
    });
    pagesFetched += 1;
    const pageRows = Array.isArray(response.data) ? response.data : [];
    Array.prototype.push.apply(rows, pageRows);
    const paging = response.paging || {};
    const nextAfter = safeMetaString177_((paging.cursors || {}).after);
    if (!paging.next || !nextAfter) break;
    if (nextAfter === afterCursor) {
      throw new Error("Meta age pagination returned the same cursor twice.");
    }
    afterCursor = nextAfter;
  }

  return {rows: rows, pagesFetched: pagesFetched};
}


function normalizeMetaAgeRows20261106_(rows, account, month) {
  const records = new Map();
  const pulledAt = getPaidSocialAgePulledAt20261106_();

  (rows || []).forEach(function (row) {
    const campaignId = safeMetaString177_(row.campaign_id);
    const ageRange = normalizePaidSocialAgeBucket20261106_(row.age, "Meta");
    if (!campaignId || !ageRange) return;

    const appInstalls = typeof getMetaFirstActionValue177_ === "function"
      ? getMetaFirstActionValue177_(
          row.actions,
          META_PERFORMANCE_177.APP_INSTALL_ACTIONS
        )
      : 0;
    // Age_Monthly uses Link Clicks for Clicks and Registrations Completed for
    // Conversions. Pick the first matching registration alias so Meta's omni
    // and pixel representations of the same event are not double-counted.
    const linkClicks = getMetaAgeActionValue20261109_(
      row.actions,
      ["link_click"]
    );
    const registrationsCompleted = getMetaAgeActionValue20261109_(
      row.actions,
      [
        "complete_registration",
        "omni_complete_registration",
        "onsite_web_app_complete_registration",
        "offsite_conversion.fb_pixel_complete_registration"
      ]
    );

    addPaidSocialAgeRecord20261106_(records, {
      month: month,
      platform: PAID_SOCIAL_AGE_20261106.META.PLATFORM,
      accountId: safeMetaString177_(account.accountId),
      accountName:
        safeMetaString177_(account.accountName) ||
        safeMetaString177_(row.account_name) ||
        "Unnamed Meta account",
      campaignId: campaignId,
      campaignName:
        safeMetaString177_(row.campaign_name) || "Unnamed campaign",
      ageRange: ageRange,
      currency:
        safeMetaString177_(row.account_currency) ||
        safeMetaString177_(account.currency),
      spend: toMetaNumber177_(row.spend),
      impressions: toMetaNumber177_(row.impressions),
      clicks: linkClicks,
      conversions: registrationsCompleted,
      appInstalls: appInstalls,
      pulledAt: pulledAt
    });
  });

  return Array.from(records.values()).sort(compareAgeRecords20261105_);
}


function getMetaAgeActionValue20261109_(actions, preferredTypes) {
  const list = Array.isArray(actions) ? actions : [];
  const types = (preferredTypes || []).map(function (type) {
    return String(type).toLowerCase();
  });

  for (let index = 0; index < types.length; index++) {
    let total = 0;
    let found = false;
    list.forEach(function (action) {
      if (
        String(action && action.action_type || "").toLowerCase() ===
        types[index]
      ) {
        total += toMetaNumber177_(action.value);
        found = true;
      }
    });
    if (found) return total;
  }
  return 0;
}


function isMetaAgeCompatibilityError20261106_(error) {
  const safe = error && error.safeMetaError ? error.safeMetaError : {};
  const message = String(safe.message || (error && error.message) || "").toLowerCase();
  return Number(safe.code) === 100 ||
    /field|breakdown|metric|not supported|invalid parameter/.test(message);
}


function collectTikTokAge20261106_(range) {
  const properties = PropertiesService.getScriptProperties();
  const accessToken = getRequiredTikTokProperty176_(
    properties,
    "TIKTOK_ACCESS_TOKEN"
  );
  const accounts = getEnabledAccounts_(
    PAID_SOCIAL_AGE_20261106.TIKTOK.PLATFORM
  );
  if (!accounts.length) {
    throw new Error("No enabled TikTok account was found in Accounts.");
  }

  const months = splitPaidSocialAgeMonths20261106_(range);
  const records = [];
  const scopes = [];
  const results = [];

  accounts.forEach(function (account) {
    try {
      const accountRecords = [];
      let apiRows = 0;
      let pagesFetched = 0;
      const metricProfiles = [];

      months.forEach(function (month) {
        const report = fetchTikTokAgeMonth20261106_({
          accessToken: accessToken,
          account: account,
          startDate: month.startDate,
          endDate: month.endDate
        });
        const normalized = normalizeTikTokAgeRows20261106_(
          report.rows,
          account,
          month.month
        );
        Array.prototype.push.apply(accountRecords, normalized);
        apiRows += report.rows.length;
        pagesFetched += report.pagesFetched;
        metricProfiles.push(report.metricProfile);
      });

      Array.prototype.push.apply(records, accountRecords);
      scopes.push({
        platform: PAID_SOCIAL_AGE_20261106.TIKTOK.PLATFORM,
        accountId: String(account.accountId),
        startMonth: range.startDate.slice(0, 7),
        endMonth: range.endDate.slice(0, 7)
      });
      results.push({
        accountId: maskTikTokAdvertiserId176_(account.accountId),
        accountName: String(account.accountName || ""),
        status: "SUCCESS",
        apiRows: apiRows,
        outputRows: accountRecords.length,
        pagesFetched: pagesFetched,
        metricProfiles: Array.from(new Set(metricProfiles))
      });
    } catch (error) {
      results.push({
        accountId: maskTikTokAdvertiserId176_(account.accountId),
        accountName: String(account.accountName || ""),
        status: "FAILED",
        error: sanitizeTikTokError176_(error)
      });
    }
  });

  return finalizePaidSocialAgeCollection20261106_(accounts, records, scopes, results);
}


function fetchTikTokAgeMonth20261106_(config) {
  const profiles = PAID_SOCIAL_AGE_20261106.TIKTOK.METRIC_PROFILES;
  let lastError = null;

  for (let index = 0; index < profiles.length; index++) {
    try {
      const result = fetchTikTokAgeMonthWithMetrics20261106_(
        config,
        profiles[index]
      );
      result.metricProfile = index === 0
        ? "FULL"
        : index === 1
          ? "NO_APP_INSTALL"
          : "DELIVERY_ONLY";
      return result;
    } catch (error) {
      lastError = error;
      if (
        index === profiles.length - 1 ||
        !isTikTokAgeCompatibilityError20261106_(error)
      ) {
        throw error;
      }
    }
  }

  throw lastError || new Error("TikTok age report failed.");
}


function fetchTikTokAgeMonthWithMetrics20261106_(config, metrics) {
  const rows = [];
  let page = 1;
  let pagesFetched = 0;

  while (page <= PAID_SOCIAL_AGE_20261106.TIKTOK.MAX_PAGES) {
    const parameters = {
      advertiser_id: String(config.account.accountId),
      report_type: "AUDIENCE",
      service_type: "AUCTION",
      data_level: "AUCTION_CAMPAIGN",
      dimensions: JSON.stringify(["age", "campaign_id"]),
      metrics: JSON.stringify(metrics),
      start_date: config.startDate,
      end_date: config.endDate,
      page: String(page),
      page_size: String(PAID_SOCIAL_AGE_20261106.TIKTOK.PAGE_SIZE)
    };
    const query = Object.keys(parameters).map(function (key) {
      return encodeURIComponent(key) + "=" + encodeURIComponent(parameters[key]);
    }).join("&");
    const response = UrlFetchApp.fetch(
      PAID_SOCIAL_AGE_20261106.TIKTOK.REPORT_ENDPOINT + "?" + query,
      {
        method: "get",
        headers: {"Access-Token": config.accessToken},
        muteHttpExceptions: true
      }
    );
    const httpStatus = response.getResponseCode();
    let result;
    try {
      result = JSON.parse(response.getContentText());
    } catch (error) {
      const parseError = new Error(
        "TikTok returned a non-JSON age-report response. HTTP " + httpStatus + "."
      );
      parseError.tiktokHttpStatus = httpStatus;
      throw parseError;
    }
    if (httpStatus < 200 || httpStatus >= 300 || Number(result.code) !== 0) {
      const apiError = new Error(
        result.message || result.msg || "Unknown TikTok age-report error."
      );
      apiError.tiktokHttpStatus = httpStatus;
      apiError.tiktokCode = result.code !== undefined ? result.code : null;
      apiError.tiktokRequestId = result.request_id || result.requestId || null;
      throw apiError;
    }

    const pageRows = result.data && Array.isArray(result.data.list)
      ? result.data.list
      : [];
    Array.prototype.push.apply(rows, pageRows);
    pagesFetched += 1;
    const pageInfo = result.data && result.data.page_info
      ? result.data.page_info
      : {};
    const totalPages = Number(pageInfo.total_page || pageInfo.total_pages || 0);
    if (
      (totalPages > 0 && page >= totalPages) ||
      (totalPages === 0 &&
        pageRows.length < PAID_SOCIAL_AGE_20261106.TIKTOK.PAGE_SIZE)
    ) {
      return {rows: rows, pagesFetched: pagesFetched};
    }
    page += 1;
  }

  throw new Error("TikTok age report exceeded pagination limit.");
}


function normalizeTikTokAgeRows20261106_(rows, account, month) {
  const records = new Map();
  const pulledAt = getPaidSocialAgePulledAt20261106_();

  (rows || []).forEach(function (row) {
    const dimensions = row.dimensions || {};
    const metrics = row.metrics || {};
    const campaignId = String(
      dimensions.campaign_id || metrics.campaign_id || ""
    ).trim();
    const ageRange = normalizePaidSocialAgeBucket20261106_(
      dimensions.age || metrics.age,
      "TikTok"
    );
    if (!campaignId || !ageRange) return;

    addPaidSocialAgeRecord20261106_(records, {
      month: month,
      platform: PAID_SOCIAL_AGE_20261106.TIKTOK.PLATFORM,
      accountId: String(account.accountId),
      accountName: String(account.accountName || "Unnamed advertiser"),
      campaignId: campaignId,
      campaignName: String(
        metrics.campaign_name || dimensions.campaign_name || ""
      ).trim(),
      ageRange: ageRange,
      currency: String(metrics.currency || account.currency || "")
        .trim()
        .toUpperCase(),
      spend: toTikTokNumber176_(metrics.spend),
      impressions: toTikTokNumber176_(metrics.impressions),
      clicks: toTikTokNumber176_(metrics.clicks),
      conversions: toTikTokNumber176_(metrics.conversion),
      appInstalls: toTikTokNumber176_(metrics.app_install),
      pulledAt: pulledAt
    });
  });

  return Array.from(records.values()).sort(compareAgeRecords20261105_);
}


function isTikTokAgeCompatibilityError20261106_(error) {
  const message = String(error && error.message ? error.message : "").toLowerCase();
  return /dimension|metric|field|not support|not available|invalid parameter/.test(message);
}


function finalizePaidSocialAgeCollection20261106_(accounts, records, scopes, results) {
  const successfulAccounts = results.filter(function (result) {
    return result.status === "SUCCESS";
  }).length;
  const failedAccounts = results.length - successfulAccounts;
  if (!scopes.length) {
    throw new Error(
      "Age sync failed for every enabled account: " + JSON.stringify(results)
    );
  }
  return {
    records: records,
    scopes: scopes,
    results: results,
    enabledAccounts: accounts.length,
    successfulAccounts: successfulAccounts,
    failedAccounts: failedAccounts
  };
}


function addPaidSocialAgeRecord20261106_(records, record) {
  const key = [
    record.month,
    record.platform,
    record.accountId,
    record.campaignId,
    record.ageRange
  ].join("|");
  const current = records.get(key) || Object.assign({}, record, {
    spend: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    appInstalls: 0,
    recordKey: key
  });
  current.spend += Number(record.spend) || 0;
  current.impressions += Number(record.impressions) || 0;
  current.clicks += Number(record.clicks) || 0;
  current.conversions += Number(record.conversions) || 0;
  current.appInstalls += Number(record.appInstalls) || 0;
  current.pulledAt = record.pulledAt;
  if (!current.campaignName && record.campaignName) {
    current.campaignName = record.campaignName;
  }
  records.set(key, current);
}


function normalizePaidSocialAgeBucket20261106_(rawValue, platform) {
  const value = String(rawValue == null ? "" : rawValue).trim();
  if (!value) return "UNKNOWN";
  const normalized = value
    .replace(/\s+/g, "_")
    .replace(/-/g, "_")
    .toUpperCase();
  const aliases = {
    AGE_13_17: "13-17",
    AGE_18_24: "18-24",
    AGE_25_34: "25-34",
    AGE_35_44: "35-44",
    AGE_45_54: "45-54",
    AGE_55_64: "55-64",
    AGE_55_100: "55+",
    AGE_65_PLUS: "65+",
    AGE_65: "65+",
    "13_17": "13-17",
    "18_24": "18-24",
    "25_34": "25-34",
    "35_44": "35-44",
    "45_54": "45-54",
    "55_64": "55-64",
    "55_PLUS": "55+",
    "65_PLUS": "65+",
    UNKNOWN: "UNKNOWN",
    UNCLASSIFIED: "UNKNOWN",
    AGE_UNKNOWN: "UNKNOWN"
  };
  if (aliases[normalized]) return aliases[normalized];
  if (platform === "Meta" && /^\d{2}_\d{2}$/.test(normalized)) {
    return normalized.replace("_", "-");
  }
  return value;
}


function replacePaidSocialAgeScopes20261106_(records, scopes) {
  const sheet = getOrCreateAgeSheet20261105_();
  const headers = AGE_REPORTING_20261105.HEADERS;
  const existing = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues()
    : [];
  const scopeMap = new Map();
  (scopes || []).forEach(function (scope) {
    scopeMap.set(
      String(scope.platform) + "|" + String(scope.accountId),
      scope
    );
  });
  const retained = existing.filter(function (row) {
    const scope = scopeMap.get(String(row[1]) + "|" + String(row[2]));
    if (!scope) return true;
    const month = normalizeAgeSheetMonth20261105_(row[0]);
    return month < scope.startMonth || month > scope.endMonth;
  });
  const incoming = (records || []).map(ageRecordToRow20261105_);
  const output = retained.concat(incoming).sort(compareAgeRows20261105_);
  writePaidSocialAgeTable20261106_(sheet, headers, output);
  return {incomingRows: incoming.length, totalRows: output.length};
}


function writePaidSocialAgeTable20261106_(sheet, headers, output) {
  const requiredRows = Math.max(2, output.length + 1);
  if (sheet.getMaxRows() < requiredRows) {
    sheet.insertRowsAfter(sheet.getMaxRows(), requiredRows - sheet.getMaxRows());
  }
  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      headers.length - sheet.getMaxColumns()
    );
  }
  if (sheet.getFilter()) sheet.getFilter().remove();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  const oldDataRows = Math.max(0, sheet.getLastRow() - 1);
  if (oldDataRows) {
    sheet.getRange(2, 1, oldDataRows, headers.length).clearContent();
  }
  if (output.length) {
    sheet.getRange(2, 1, output.length, headers.length).setValues(output);
    sheet.getRange(2, 1, output.length, 1).setNumberFormat("yyyy-mm");
    sheet.getRange(2, 9, output.length, 1).setNumberFormat("#,##0.00");
    sheet.getRange(2, 10, output.length, 4).setNumberFormat("#,##0");
  }
  const usedRows = Math.max(1, output.length + 1);
  sheet.getRange(1, 1, usedRows, headers.length)
    .setFontFamily("Arial")
    .setFontSize(10)
    .setVerticalAlignment("middle");
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground("#eeeeee")
    .setFontWeight("bold")
    .setWrap(true)
    .setNote(
      "Monthly aggregated age-bucket performance from Apple Search Ads, " +
      "TikTok, and Meta. Platform privacy thresholds and different source " +
      "bucket definitions are preserved; Apple Low Volume, UNKNOWN, and " +
      "User Withheld remain separate values. " +
      "For Apple Search Ads, App Installs is tap-through installs."
    );
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 36);
  sheet.setColumnWidths(1, headers.length, 130);
  sheet.setColumnWidth(4, 220);
  sheet.setColumnWidth(6, 360);
  sheet.setColumnWidth(15, 420);
  sheet.getRange(1, 1, usedRows, headers.length).createFilter();
  SpreadsheetApp.flush();
}


function getPaidSocialAgeRecentRange20261106_() {
  const timezone = Session.getScriptTimeZone() || "Asia/Ho_Chi_Minh";
  const todayText = Utilities.formatDate(new Date(), timezone, "yyyy-MM-dd");
  const endDate = shiftPaidSocialAgeDate20261106_(todayText, -1);
  return {
    startDate: getAppleAdsAgeMonthStart20261105_(
      endDate,
      PAID_SOCIAL_AGE_20261106.RECENT_MONTHS - 1
    ),
    endDate: endDate
  };
}


function splitPaidSocialAgeMonths20261106_(range) {
  const months = [];
  let cursor = range.startDate.slice(0, 7) + "-01";
  while (cursor <= range.endDate) {
    const nextMonth = shiftPaidSocialAgeMonth20261106_(cursor, 1);
    const monthEnd = shiftPaidSocialAgeDate20261106_(nextMonth, -1);
    months.push({
      month: cursor.slice(0, 7),
      startDate: cursor < range.startDate ? range.startDate : cursor,
      endDate: monthEnd > range.endDate ? range.endDate : monthEnd
    });
    cursor = nextMonth;
  }
  return months;
}


function shiftPaidSocialAgeMonth20261106_(dateText, months) {
  const parts = String(dateText).split("-").map(Number);
  const index = parts[0] * 12 + parts[1] - 1 + Number(months);
  const year = Math.floor(index / 12);
  const month = index - year * 12 + 1;
  return year + "-" + String(month).padStart(2, "0") + "-01";
}


function shiftPaidSocialAgeDate20261106_(dateText, days) {
  const parts = String(dateText).split("-").map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  date.setUTCDate(date.getUTCDate() + Number(days));
  return Utilities.formatDate(date, "UTC", "yyyy-MM-dd");
}


function getPaidSocialAgePulledAt20261106_() {
  return Utilities.formatDate(
    new Date(),
    "UTC",
    "yyyy-MM-dd'T'HH:mm:ss'Z'"
  );
}


function sanitizePaidSocialAgeError20261106_(error) {
  return String(error && error.message ? error.message : error || "Unknown error")
    .replace(/\b\d{8,}\b/g, "[REDACTED_ID]")
    .slice(0, 1000);
}


function assertPaidSocialAgeDependencies20261106_() {
  const required = [
    ["AGE_REPORTING_20261105", typeof AGE_REPORTING_20261105],
    ["getEnabledAccounts_", typeof getEnabledAccounts_],
    ["getValidMetaAccessToken182_", typeof getValidMetaAccessToken182_],
    ["requestMetaJson177_", typeof requestMetaJson177_],
    ["getRequiredTikTokProperty176_", typeof getRequiredTikTokProperty176_],
    ["getOrCreateAgeSheet20261105_", typeof getOrCreateAgeSheet20261105_]
  ];
  const missing = required.filter(function (entry) {
    return entry[1] !== "function" && entry[1] !== "object";
  }).map(function (entry) {
    return entry[0];
  });
  if (missing.length) {
    throw new Error(
      "Paid-social age reporting is missing dependencies: " + missing.join(", ")
    );
  }
}
