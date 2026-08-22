# Maintainers

The repository owner is the default source-code maintainer. Production access
is managed separately from GitHub access.

## Responsibilities

| Role | Required actions |
|---|---|
| Source maintainer | Review changes, CI, versioning, changelog, and releases |
| Production owner | Own the private Sheet, Apps Script deployment, and backups |
| Credential custodian | Create, rotate, revoke, and privately transfer ownership |
| Operator | Monitor sync, data quality, payment warnings, and incidents |

## Handoff rule

Handoff documentation may list property names, permissions, rotation dates, and
run IDs. It must never contain property values, customer/company data, Sheet
URLs, account IDs, logs, or screenshots. Transfer Google/platform ownership in
the provider UI and verify access before removing the previous maintainer.

## Release authority

A release is ready only when both public-release checks pass, the staged diff
has been manually reviewed, and a private non-production deployment completes a
one-day sync plus data-quality and dashboard QA.

