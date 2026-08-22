# Security and privacy

## Security objective

Keep source auditable and public while credentials, advertising operations,
customer/company context, project metadata, and personal data remain private in
the operator's Google and advertising-platform environments.

## Data classification

| Class | Examples | Allowed location |
|---|---|---|
| Public | Source, schemas, endpoint names, property key names | GitHub |
| Internal | Architecture decisions, synthetic tests, generic runbooks | GitHub or private docs |
| Confidential | Account/campaign names and IDs, spend, billing thresholds, production logs, Sheet URLs | Restricted Google workspace only |
| Restricted | Access/refresh tokens, client/app secrets, API keys, private keys, one-time auth codes | Apps Script Script Properties only |

The project is for advertising-account performance. It should not ingest
end-customer names, emails, phone numbers, addresses, user-level event payloads,
or other direct personal data.

## Access controls

- Keep the production Sheet private; never enable public or link-wide access.
- Grant Viewer access for read-only consumers when suitable; grant Editor only
  to trusted operators.
- Apps Script editors may be able to inspect Script Properties. Treat code edit
  access as credential access.
- Use organization-managed Google accounts with multi-factor authentication.
- Remove former staff, contractors, and customer users promptly.
- Keep a clean template Sheet separate from production data.

## Credential controls

- Values are read from Script Properties and are not written to cells.
- Presence checks return configured/missing status only.
- Known secret values are replaced before persisted free-text logging.
- Never commit `.clasp.json`, `.clasprc.json`, PEM/P8/key files, `.env`, Sheet
  exports, or screenshots.
- Rotate credentials after exposure or access changes.

Apps Script Script Properties are convenient encrypted-at-rest platform storage
within Google's service boundary, but they are not a separate vault with
per-secret role controls. If stronger separation is required, place secret/API
access in a controlled backend or Google Cloud Secret Manager proxy and expose
only a narrow service interface to Apps Script.

## Log minimization

- API error text is capped and sanitized before persistence.
- Bearer values, JSON/query credentials, JWTs, private-key blocks, emails,
  phone-like values, long numeric identifiers, and common
  account/campaign/customer name fields are redacted from free-text logs.
- Dedicated account-ID columns in private operational sheets may contain the
  real identifier because it is required for diagnosis.
- Sanitization reduces risk but is not a reason to publish production logs.

## Data storage and sharing

- Runtime data stays in the bound Google Sheet and Apps Script services.
- The code includes no custom analytics or telemetry endpoint.
- Advertising APIs receive only the requests required for reporting and account
  discovery.
- This repository must never include data exports, backups, client-specific
  configuration, or public Sheet links.
- Payment-monitor values are confidential finance/operations data.

## Public-release checklist

Before each push or release:

1. Run `bash scripts/security-scan.sh`.
2. Run `node scripts/validate-apps-script.js`.
3. Inspect `git diff --cached` for customer/company/project names and IDs.
4. Confirm `.clasp.json`, data, exports, backups, screenshots, and logs are not
   tracked.
5. Confirm examples use synthetic placeholders.
6. Confirm GitHub Issues and release notes contain no production evidence.

## Incident response

1. Stop scheduled triggers if active exposure could continue.
2. Revoke/rotate affected platform credentials.
3. Restrict Google Drive and Apps Script access.
4. Preserve a private incident timeline without copying secrets.
5. Remove exposed data from GitHub pages, releases, issues, and Git history.
6. Re-run security validation and a limited production test.
7. Notify affected organizations under applicable policy, contract, and law.

## Privacy limitations

This software does not itself provide legal compliance, data-loss prevention,
field-level encryption, or a formal access-review workflow. The operator is
responsible for Google Workspace sharing, platform permissions, retention,
lawful processing, customer contracts, and incident notification duties.
