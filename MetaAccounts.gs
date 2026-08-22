/**
 * Meta Ads — Account Discovery
 */

function discoverMetaAccounts() {
  const runId = createRunId_();
  const startedAt = new Date();

  try {
    const token = getMetaAccessToken_();
    const baseUrl = getMetaApiBaseUrl_();

    const fields = [
      "id",
      "name",
      "currency",
      "timezone_name",
      "account_status"
    ].join(",");

    let after = "";
    let page = 0;
    const maximumPages = 50;
    const discovered = [];
    const seen = new Set();

    do {
      page++;

      let url =
        baseUrl +
        "/me/adaccounts" +
        "?fields=" +
        encodeURIComponent(fields) +
        "&limit=100";

      if (after) {
        url +=
          "&after=" +
          encodeURIComponent(after);
      }

      const response = apiRequest_({
        platform: "Meta",
        url,
        method: "get",
        headers: {
          Authorization:
            "Bearer " + token
        }
      });

      const data = response.data || {};
      const accounts = Array.isArray(data.data)
        ? data.data
        : [];

      accounts.forEach(account => {
        const accountId = String(
          account.id || ""
        ).trim();

        if (!accountId || seen.has(accountId)) {
          return;
        }

        seen.add(accountId);

        discovered.push({
          platform: "Meta",
          accountId,
          accountName:
            String(account.name || ""),
          currency:
            String(account.currency || ""),
          timezone:
            String(
              account.timezone_name || ""
            ),
          enabled: false,
          status:
            Number(account.account_status) === 1
              ? "Active"
              : "Discovered"
        });
      });

      after =
        data.paging &&
        data.paging.cursors &&
        data.paging.cursors.after
          ? String(data.paging.cursors.after)
          : "";

      const hasNext =
        Boolean(
          data.paging &&
          data.paging.next &&
          after
        );

      if (!hasNext) {
        after = "";
      }

    } while (
      after &&
      page < maximumPages
    );

    if (
      page >= maximumPages &&
      after
    ) {
      throw new Error(
        "Meta account discovery exceeded " +
        maximumPages +
        " pages."
      );
    }

    if (!discovered.length) {
      throw new Error(
        "Meta returned no accessible advertising accounts. " +
        "Confirm the token has ads_read and account access."
      );
    }

    const result = upsertAccounts_(discovered);
    const finishedAt = new Date();

    writeSyncLog_({
      runId,
      startedAt,
      finishedAt,
      platform: "Meta",
      status: "SUCCESS",
      records: discovered.length,
      durationSeconds:
        (finishedAt - startedAt) / 1000,
      message:
        result.inserted + " inserted, " +
        result.updated + " updated."
    });

    updatePlatformResult_(
      "Meta",
      discovered.length +
        " accounts loaded",
      "SUCCESS"
    );

    SpreadsheetApp.getUi().alert(
      "Meta accounts loaded",
      [
        "Accessible accounts: " +
          discovered.length,
        "New accounts: " +
          result.inserted,
        "Updated accounts: " +
          result.updated,
        "",
        "Enable the accounts you want to synchronize in the Accounts sheet."
      ].join("\n"),
      SpreadsheetApp.getUi().ButtonSet.OK
    );

  } catch (error) {
    writeErrorLog_({
      runId,
      platform: "Meta",
      functionName: "discoverMetaAccounts",
      errorCode:
        error.statusCode ||
        "META_ACCOUNT_DISCOVERY_FAILED",
      message: error.message,
      details: error.safeResponse || ""
    });

    updatePlatformResult_(
      "Meta",
      "Account loading failed",
      "FAILED"
    );

    SpreadsheetApp.getUi().alert(
      "Meta account loading failed",
      sanitizeLogText_(error.message),
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}