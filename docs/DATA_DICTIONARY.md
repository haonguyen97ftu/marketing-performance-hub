# Data dictionary

## `Accounts`

| Column | Meaning |
|---|---|
| Platform | One of the five supported platforms |
| Account ID | Platform advertising-account identifier; confidential |
| Account Name | Platform account label; confidential |
| Currency | Account reporting currency |
| Timezone | Platform/account reporting timezone |
| Enabled | Whether production synchronization includes the account |
| Status | Discovery/access state |

## `Spend_Raw`

| Column | Meaning |
|---|---|
| Date | Completed platform reporting date |
| Platform | Source platform |
| Account ID / Name | Advertising account dimensions |
| Campaign ID / Name | Campaign dimensions |
| Currency | Native account currency; no implicit FX conversion |
| Spend | Native-currency spend |
| Imported At | Ingestion timestamp |
| Record Key | Deterministic normalized dimension key |
| Impressions | Delivered impressions |
| Clicks | Reported clicks |
| Conversions | Connector-normalized conversion count |
| App Installs | Connector-normalized app-install count |

## `Spend_Daily`

The first 11 columns aggregate `Spend_Raw` by Date, Platform, Account, and
Currency. Derived metrics:

| Metric | Formula |
|---|---|
| CTR | Clicks / Impressions |
| CPC | Spend / Clicks |
| CPM | Spend / Impressions × 1,000 |
| CPA | Spend / Conversions |
| CVR | Conversions / Clicks |
| CPI | Spend / App Installs |

Zero-denominator values must follow the aggregation code's explicit null/zero
policy; do not replace them with infinity.

## Operational sheets

| Sheet | Contains |
|---|---|
| `Sync_Log` | One summary row per project sync |
| `Platform_Log` | Connector/account status and record counts |
| `Error_Log` | Sanitized technical failures |
| `Payment_Monitor` | Threshold, cycle, spend-to-threshold, remaining, warning state |
| `Dashboard` | Filtered KPIs, tables, and one persistent chart |

All of these sheets are confidential in production even when some system tabs
are hidden.

