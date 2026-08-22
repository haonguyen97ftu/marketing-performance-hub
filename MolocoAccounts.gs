/**
 * Moloco Ads — Account Discovery
 */

const MOLOCO_ACCOUNTS_URL =
  "https://api.moloco.cloud/cm/v1/ad-accounts";

/**
 * Loads accessible Moloco accounts into the Accounts sheet.
 */
function discoverMolocoAccounts() {
  const runId = createRunId_();
  const startedAt = new Date();

  try {
    const token = getMolocoAccessToken_(false);

    const response = apiRequest_({
      platform: "Moloco",
      url: MOLOCO_ACCOUNTS_URL,
      method: "get",
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/json"
      }
    });

    const sourceAccounts =
      extractMolocoAccountList_(response.data);

    if (!sourceAccounts.length) {
      throw new Error(
        "Moloco returned no accessible ad accounts."
      );
    }

    const accounts = sourceAccounts.map(account =>
      normalizeMolocoAccount_(account)
    );

    const result = upsertAccounts_(accounts);
    const finishedAt = new Date();

    writeSyncLog_({
      runId,
      startedAt,
      finishedAt,
      platform: "Moloco",
      status: "SUCCESS",
      records: accounts.length,
      durationSeconds:
        (finishedAt - startedAt) / 1000,
      message:
        "Account discovery completed: " +
        result.inserted + " inserted, " +
        result.updated + " updated."
    });

    updatePlatformResult_(
      "Moloco",
      "Accounts loaded",
      "SUCCESS"
    );

    SpreadsheetApp.getUi().alert(
      "Moloco accounts loaded",
      [
        "✅ Accessible accounts: " + accounts.length,
        "New accounts: " + result.inserted,
        "Updated accounts: " + result.updated,
        "",
        "Review the Accounts sheet and enable the accounts you want to sync."
      ].join("\n"),
      SpreadsheetApp.getUi().ButtonSet.OK
    );

  } catch (error) {
    writeErrorLog_({
      runId,
      platform: "Moloco",
      functionName: "discoverMolocoAccounts",
      errorCode:
        error.statusCode ||
        "MOLOCO_ACCOUNT_DISCOVERY_FAILED",
      message: error.message,
      details: error.safeResponse || ""
    });

    updatePlatformResult_(
      "Moloco",
      "Account loading failed",
      "FAILED"
    );

    SpreadsheetApp.getUi().alert(
      "Moloco account loading failed",
      sanitizeLogText_(error.message),
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

/**
 * Handles documented and compatible wrapped response forms.
 */
function extractMolocoAccountList_(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (!data || typeof data !== "object") {
    return [];
  }

  const candidates = [
    data.ad_accounts,
    data.adAccounts,
    data.accounts,
    data.results,
    data.data
  ];

  for (let i = 0; i < candidates.length; i++) {
    if (Array.isArray(candidates[i])) {
      return candidates[i];
    }
  }

  return [];
}

function normalizeMolocoAccount_(account) {
  const entity =
    account.ad_account ||
    account.adAccount ||
    account;

  return {
    platform: "Moloco",
    accountId:
      entity.id ||
      entity.ad_account_id ||
      entity.adAccountId,

    accountName:
      entity.title ||
      entity.name ||
      "",

    currency:
      entity.currency &&
      entity.currency !== "UNKNOWN_CURRENCY"
        ? entity.currency
        : "",

    timezone:
      entity.timezone ||
      entity.time_zone ||
      "",

    enabled: false,
    status: "Discovered"
  };
}

/**
 * Updates operational status without changing credentials.
 */
function updatePlatformResult_(
  platform,
  message,
  result
) {
  PropertiesService.getScriptProperties().setProperty(
    "_PLATFORM_STATUS_" +
      String(platform || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_"),
    JSON.stringify({
      result: String(result || ""),
      message: sanitizeLogText_(message || ""),
      updatedAt: new Date().toISOString()
    })
  );

  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(MSH.SHEETS.CONTROL);

  if (!sheet || sheet.getLastRow() < 2) {
    return;
  }

  const values = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, 1)
    .getDisplayValues()
    .flat();

  const index = values.indexOf(platform);

  if (index === -1) {
    return;
  }

  const row = index + 2;

  sheet.getRange(row, 4, 1, 2).setValues([[
    new Date(),
    result + ": " + message
  ]]);
}
