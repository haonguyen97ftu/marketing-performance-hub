# Security policy

## Supported version

Only the latest release on the default branch receives security fixes.

## Reporting a vulnerability

Do not open a public GitHub Issue containing a vulnerability, credential,
account ID, customer name, company information, spreadsheet URL, log extract,
or screenshot of production data.

Use GitHub's private vulnerability reporting feature when it is enabled for
the repository. Include a minimal reproduction using synthetic values only.
Rotate any credential that may have been exposed before sharing the report.

## Credential incident response

1. Revoke or rotate the affected credential at the advertising platform.
2. Replace it in Apps Script Script Properties.
3. Remove the exposed value from Issues, logs, releases, and repository history.
4. Re-run `bash scripts/security-scan.sh`.
5. Run a limited one-day sync and confirm sanitized logs.

See [docs/SECURITY_AND_PRIVACY.md](docs/SECURITY_AND_PRIVACY.md) for the full
operating model.

