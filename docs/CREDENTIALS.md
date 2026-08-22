# Credential setup and rotation

Credentials are created and controlled by the operator. The repository never
ships values and the spreadsheet never needs to contain them.

## Where to enter values

Open the bound Apps Script project, then:

```text
Project Settings → Script Properties → Add script property
```

Use the exact property names below. Property names are public configuration;
property values are restricted secrets unless marked otherwise.

## Properties

| Platform | Property | Required | Notes |
|---|---|---:|---|
| Meta | `META_ACCESS_TOKEN` | Yes | Marketing API token with required ad permissions |
| Meta | `META_APP_ID` | For lifecycle refresh | App identifier |
| Meta | `META_APP_SECRET` | For lifecycle refresh | Restricted secret |
| Meta | `META_TOKEN_REFRESH_WINDOW_DAYS` | No | Integer 1–30; default 10 |
| TikTok | `TIKTOK_ACCESS_TOKEN` | Yes | Marketing API access token |
| TikTok | `TIKTOK_APP_ID` | Yes | TikTok application identifier |
| TikTok | `TIKTOK_APP_SECRET` | Yes | Restricted secret |
| TikTok | `TIKTOK_AUTH_CODE` | One-time | Deleted after successful exchange |
| Google Ads | `GOOGLE_ADS_DEVELOPER_TOKEN` | Yes | Google Ads developer token |
| Google Ads | `GOOGLE_ADS_CLIENT_ID` | Yes | OAuth client ID |
| Google Ads | `GOOGLE_ADS_CLIENT_SECRET` | Yes | OAuth client secret |
| Google Ads | `GOOGLE_ADS_REFRESH_TOKEN` | Yes | OAuth refresh token |
| Google Ads | `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | Optional | MCC/customer ID without dashes; operational identifier |
| Apple Search Ads | `APPLE_ADS_CLIENT_ID` | Yes | API client ID |
| Apple Search Ads | `APPLE_ADS_TEAM_ID` | Yes | Team ID |
| Apple Search Ads | `APPLE_ADS_KEY_ID` | Yes | Key ID |
| Apple Search Ads | `APPLE_ADS_PRIVATE_KEY` | Yes | Full EC private key including line breaks |
| Moloco | `MOLOCO_API_KEY` | Yes | Long-lived API key |

Properties beginning with `_`, such as cached access tokens, job state, and
last-run status, are internal. Do not copy them between environments.

## Safe bootstrap sequence

1. Create credentials in the platform's own admin/developer console.
2. Grant the minimum reporting/account-discovery permissions required.
3. Add values directly to Script Properties.
4. Run the platform authentication test from Apps Script.
5. Confirm that output contains only status, counts, masked IDs, and
   `secretsExposed: false`.
6. Run a one-day sync before enabling the daily trigger.

For Apple private keys, preserve the header, footer, and line breaks. Do not
store the `.p8` file in this repository or Google Drive beside the workbook.

## Rotation

| Credential | Rotate when |
|---|---|
| Any credential | Suspected exposure, team access change, or platform alert |
| Meta token | Lifecycle status requests manual reauthorization or policy requires it |
| TikTok token | Expired/revoked or platform policy requires it |
| Google refresh token | OAuth consent/client changes, revocation, or policy requires it |
| Apple private key | Key revocation, personnel change, or security policy requires it |
| Moloco API key | Revocation, personnel change, or security policy requires it |

After rotation, replace only the affected Script Property, clear generated
cached tokens if applicable, run the authentication test, and perform a
limited sync.

## Access-control warning

Script Properties are not a substitute for organizational access control.
Anyone who can edit the Apps Script project may be able to inspect them. Keep
the Sheet private, remove former operators promptly, require strong Google
account security, and use a dedicated production owner when possible.

