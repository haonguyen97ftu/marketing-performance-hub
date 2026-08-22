/**
 * Marketing Spend Hub — Credential Registry
 *
 * Secret values are stored in Script Properties, not spreadsheet cells.
 * This file never displays or logs credential values.
 */

const CREDENTIAL_REGISTRY = Object.freeze({
  "Meta": [
    {
      key: "META_ACCESS_TOKEN",
      description: "Meta Marketing API access token",
      required: true
    }
  ],

  "TikTok": [
    {
      key: "TIKTOK_ACCESS_TOKEN",
      description: "TikTok Marketing API access token",
      required: true
    },
    {
      key: "TIKTOK_APP_ID",
      description: "TikTok application ID",
      required: true
    },
    {
      key: "TIKTOK_APP_SECRET",
      description: "TikTok application secret",
      required: true
    }
  ],

  "Google Ads": [
    {
      key: "GOOGLE_ADS_DEVELOPER_TOKEN",
      description: "Google Ads developer token",
      required: true
    },
    {
      key: "GOOGLE_ADS_CLIENT_ID",
      description: "Google OAuth client ID",
      required: true
    },
    {
      key: "GOOGLE_ADS_CLIENT_SECRET",
      description: "Google OAuth client secret",
      required: true
    },
    {
      key: "GOOGLE_ADS_REFRESH_TOKEN",
      description: "Google OAuth refresh token",
      required: true
    },
    {
      key: "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
      description: "Manager account ID without dashes",
      required: false
    }
  ],

  "Apple Search Ads": [
    {
      key: "APPLE_ADS_CLIENT_ID",
      description: "Apple Search Ads API client ID",
      required: true
    },
    {
      key: "APPLE_ADS_TEAM_ID",
      description: "Apple Search Ads API team ID",
      required: true
    },
    {
      key: "APPLE_ADS_KEY_ID",
      description: "Apple Search Ads API key ID",
      required: true
    },
    {
      key: "APPLE_ADS_PRIVATE_KEY",
      description: "Apple private key contents",
      required: true
    }
  ],

  "Moloco": [
  {
    key: "MOLOCO_API_KEY",
    description: "Moloco Ads API key",
    required: true
  }
  ]
});

/**
 * Populates OAuth_Config with credential requirements.
 * It never writes secret values into the spreadsheet.
 */
function initializeCredentialRegistry() {
  const sheet = requireSheet_(MSH.SHEETS.OAUTH);
  const existingKeys = getExistingCredentialKeys_(sheet);
  const rows = [];

  Object.entries(CREDENTIAL_REGISTRY).forEach(
    ([platform, requirements]) => {
      requirements.forEach(requirement => {
        const uniqueKey = platform + "|" + requirement.key;

        if (!existingKeys.has(uniqueKey)) {
          rows.push([
            platform,
            requirement.key,
            "SCRIPT_PROPERTY",
            requirement.description +
              (requirement.required ? " [Required]" : " [Optional]")
          ]);
        }
      });
    }
  );

  if (rows.length) {
    sheet
      .getRange(sheet.getLastRow() + 1, 1, rows.length, 4)
      .setValues(rows);
  }

  updateCredentialStatus();
  SpreadsheetApp.getActive().toast(
    rows.length
      ? rows.length + " credential requirements registered."
      : "Credential registry already exists.",
    MSH.NAME,
    6
  );
}

/**
 * Updates Control_Panel using only credential presence.
 * Credential contents are never read into spreadsheet cells.
 */
function updateCredentialStatus() {
  const properties = PropertiesService.getScriptProperties();
  const controlSheet = requireSheet_(MSH.SHEETS.CONTROL);

  if (controlSheet.getLastRow() < 2) {
    throw new Error("Control_Panel has no registered platforms.");
  }

  const platforms = controlSheet
    .getRange(2, 1, controlSheet.getLastRow() - 1, 1)
    .getDisplayValues()
    .flat();

  const statuses = platforms.map(platform => {
    const requirements = CREDENTIAL_REGISTRY[platform] || [];
    const required = requirements.filter(item => item.required);

    const configuredCount = required.filter(item =>
      Boolean(properties.getProperty(item.key))
    ).length;

    let status = "Not configured";

    if (configuredCount === required.length && required.length > 0) {
      status = "Credentials present";
    } else if (configuredCount > 0) {
      status =
        "Partially configured (" +
        configuredCount + "/" + required.length + ")";
    }

    return [status];
  });

  controlSheet
    .getRange(2, 3, statuses.length, 1)
    .setValues(statuses);
}

/**
 * Shows credential presence without exposing secret values.
 */
function showCredentialStatus() {
  const properties = PropertiesService.getScriptProperties();
  const lines = [];

  Object.entries(CREDENTIAL_REGISTRY).forEach(
    ([platform, requirements]) => {
      const required = requirements.filter(item => item.required);

      const configured = required.filter(item =>
        Boolean(properties.getProperty(item.key))
      ).length;

      const symbol =
        configured === required.length && required.length > 0
          ? "✅"
          : configured > 0
            ? "⚠️"
            : "○";

      lines.push(
        symbol + " " + platform + ": " +
        configured + "/" + required.length +
        " required credentials"
      );
    }
  );

  SpreadsheetApp.getUi().alert(
    "Credential status",
    lines.join("\n"),
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * Returns one secret for internal API adapters.
 *
 * Never log or write the returned value to a spreadsheet.
 */
function getSecret_(propertyKey) {
  const value = PropertiesService
    .getScriptProperties()
    .getProperty(propertyKey);

  if (!value) {
    throw new Error(
      'Missing credential "' + propertyKey +
      '". Add it under Project Settings → Script Properties.'
    );
  }

  return value;
}

function getExistingCredentialKeys_(sheet) {
  if (sheet.getLastRow() < 2) {
    return new Set();
  }

  return new Set(
    sheet
      .getRange(2, 1, sheet.getLastRow() - 1, 2)
      .getDisplayValues()
      .map(row => row[0] + "|" + row[1])
  );
}

/**
 * Replaces the obsolete permanent-access-token requirement
 * with the current Moloco API-key requirement.
 */
function migrateMolocoCredentialRegistry() {
  const sheet = requireSheet_(MSH.SHEETS.OAUTH);

  if (sheet.getLastRow() >= 2) {
    const values = sheet
      .getRange(2, 1, sheet.getLastRow() - 1, 4)
      .getValues();

    values.forEach((row, index) => {
      if (
        row[0] === "Moloco" &&
        row[1] === "MOLOCO_ACCESS_TOKEN"
      ) {
        sheet.getRange(index + 2, 2, 1, 3).setValues([[
          "MOLOCO_API_KEY",
          "SCRIPT_PROPERTY",
          "Moloco Ads API key [Required]"
        ]]);
      }
    });
  }

  initializeCredentialRegistry();
  updateCredentialStatus();

  SpreadsheetApp.getActive().toast(
    "Moloco credential registry updated.",
    MSH.NAME,
    5
  );
}