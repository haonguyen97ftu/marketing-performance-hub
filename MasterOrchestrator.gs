/**
 * Marketing Performance Hub
 * Step 18A — Master orchestrator.
 *
 * Runs every enabled production connector with independent platform failure
 * isolation, then rebuilds Spend_Daily and Dashboard exactly once after a
 * fully successful run.
 *
 * Required existing connector files:
 *   TikTokProduction.gs
 *   MetaPerformance.gs
 *   MolocoAnalytics.gs (Step 18A-compatible version)
 *   GoogleAdsPerformance.gs
 *   AppleAdsPerformance.gs
 *
 * Required shared functions:
 *   getEnabledAccounts_(platform)
 *   rebuildSpendDaily()
 *   refreshDashboard()
 *
 * No additional Script Properties are required.
 */

const MASTER_ORCHESTRATOR_180 = Object.freeze({
  STEP: "18A",
  ROLLING_DAYS: 3,
  MAX_RANGE_DAYS: 31,
  LOCK_TIMEOUT_MS: 1000,
  PLATFORMS: Object.freeze([
    "TikTok",
    "Meta",
    "Moloco",
    "Google Ads",
    "Apple Search Ads"
  ])
});


/**
 * Step 18A validation entry point.
 *
 * This performs a real rolling sync for every platform that currently has at
 * least one enabled account. Row writes remain safe because Spend_Raw upserts
 * by Record Key.
 */
function step180TestMasterOrchestrator() {
  return runMasterPerformanceSync180_({
    runLabel: "Step 18A master orchestrator test",
    showAlert: true
  });
}


/**
 * Production entry point for a time-driven trigger.
 */
function syncAllPlatformsRecentPerformance() {
  return runMasterPerformanceSync180_({
    runLabel: "Scheduled all-platform performance sync",
    showAlert: false
  });
}


/**
 * Control-panel/manual entry point for one completed calendar-date range.
 * The scheduled rolling handler remains unchanged.
 */
function syncAllPlatformsPerformanceRange(startDate, endDate) {
  const range = normalizeMasterSyncRange180_(startDate, endDate);

  return runMasterPerformanceSync180_({
    runLabel:
      "All-platform range sync " +
      range.startDate +
      " to " +
      range.endDate,
    showAlert: false,
    range: range
  });
}


/**
 * Runs enabled platforms sequentially.
 *
 * Connector-level rebuilds are disabled. Successful writes are preserved even
 * if another platform fails, but derived outputs remain on the last fully
 * successful state until every active platform succeeds in one run.
 */
function runMasterPerformanceSync180_(options) {
  assertMasterDependencies180_();

  const config = options || {};
  const lock = LockService.getScriptLock();
  const startedAt = new Date();
  const runId =
    typeof createRunId_ === "function"
      ? createRunId_()
      : Utilities.getUuid();

  if (!lock.tryLock(MASTER_ORCHESTRATOR_180.LOCK_TIMEOUT_MS)) {
    const lockedResult = {
      status: "SKIPPED_LOCKED",
      step: MASTER_ORCHESTRATOR_180.STEP,
      runId: runId,
      runLabel:
        config.runLabel || "Master performance sync",
      message:
        "Another master synchronization is already running.",
      outputsRebuilt: false,
      secretsExposed: false
    };

    console.log(JSON.stringify(lockedResult, null, 2));
    return lockedResult;
  }

  try {
    const platformResults = [];

    MASTER_ORCHESTRATOR_180.PLATFORMS.forEach(function (platform) {
      const enabledAccounts =
        getEnabledAccounts_(platform);

      if (
        !Array.isArray(enabledAccounts) ||
        enabledAccounts.length === 0
      ) {
        platformResults.push({
          platform: platform,
          status: "SKIPPED",
          enabledAccounts: 0,
          inserted: 0,
          updated: 0,
          failedAccounts: 0,
          message: "No enabled accounts."
        });
        return;
      }

      const platformStartedAt = new Date();

      try {
        const connectorResult =
          runMasterPlatform180_(platform, config.range || null);

        platformResults.push(
          summarizeMasterPlatform180_(
            platform,
            enabledAccounts.length,
            connectorResult,
            platformStartedAt
          )
        );
      } catch (error) {
        platformResults.push({
          platform: platform,
          status: "FAILED",
          enabledAccounts: enabledAccounts.length,
          inserted: 0,
          updated: 0,
          failedAccounts: enabledAccounts.length,
          durationSeconds:
            roundMasterSeconds180_(
              new Date() - platformStartedAt
            ),
          error:
            sanitizeMasterError180_(error)
        });
      }
    });

    const activeResults =
      platformResults.filter(function (item) {
        return item.status !== "SKIPPED";
      });

    if (activeResults.length === 0) {
      throw new Error(
        "No enabled advertising accounts were found. " +
        "Open Accounts and tick Enabled for at least one platform."
      );
    }

    const failedPlatforms =
      activeResults.filter(function (item) {
        return item.status !== "SUCCESS";
      });

    let outputsRebuilt = false;
    let outputError = null;

    if (failedPlatforms.length === 0) {
      try {
        rebuildSpendDaily({ showUi: false });
        refreshDashboard({ showUi: false });
        outputsRebuilt = true;
      } catch (error) {
        outputError =
          sanitizeMasterError180_(error).message;
      }
    }

    const finishedAt = new Date();
    const successfulPlatforms =
      activeResults.filter(function (item) {
        return item.status === "SUCCESS";
      }).length;
    const finalStatus =
      failedPlatforms.length === 0 && !outputError
        ? "SUCCESS"
        : successfulPlatforms > 0
          ? "PARTIAL_SUCCESS"
          : "FAILED";

    const summary = {
      status: finalStatus,
      step: MASTER_ORCHESTRATOR_180.STEP,
      runId: runId,
      runLabel:
        config.runLabel || "Master performance sync",
      startDate: config.range ? config.range.startDate : null,
      endDate: config.range ? config.range.endDate : null,
      activePlatforms: activeResults.length,
      successfulPlatforms: successfulPlatforms,
      failedPlatforms: failedPlatforms.length,
      skippedPlatforms:
        platformResults.length - activeResults.length,
      inserted: sumMasterMetric180_(
        activeResults,
        "inserted"
      ),
      updated: sumMasterMetric180_(
        activeResults,
        "updated"
      ),
      outputsRebuilt: outputsRebuilt,
      outputError: outputError,
      durationSeconds:
        roundMasterSeconds180_(
          finishedAt - startedAt
        ),
      platforms: platformResults,
      secretsExposed: false
    };

    console.log(JSON.stringify(summary, null, 2));

    if (config.showAlert !== false) {
      showMasterSummary180_(summary);
    }

    return summary;
  } finally {
    lock.releaseLock();
  }
}


function runMasterPlatform180_(platform, customRange) {
  if (platform === "TikTok") {
    const range = customRange || getMasterRecentRange180_();

    return syncTikTokPerformanceRange176_(
      range.startDate,
      range.endDate,
      {
        rebuildOutputs: false,
        showAlert: false,
        runLabel: customRange
          ? "Master TikTok range sync"
          : "Master TikTok rolling sync"
      }
    );
  }

  if (platform === "Meta") {
    const range = customRange || getMasterRecentRange180_();

    return syncMetaPerformanceRange177_(
      range.startDate,
      range.endDate,
      {
        rebuildOutputs: false,
        showAlert: false,
        runLabel: customRange
          ? "Master Meta range sync"
          : "Master Meta rolling sync"
      }
    );
  }

  if (platform === "Moloco") {
    return step177SyncMolocoPerformance({
      rebuildOutputs: false,
      showAlert: false,
      startDate: customRange ? customRange.startDate : null,
      endDate: customRange ? customRange.endDate : null,
      runLabel: customRange
        ? "Master Moloco range sync"
        : "Master Moloco daily sync"
    });
  }

  if (platform === "Google Ads") {
    return syncGoogleAdsPerformance178B_({
      runLabel: customRange
        ? "Master Google Ads range sync"
        : "Master Google Ads rolling sync",
      dateMode: customRange
        ? "FIXED_CONTROL_PANEL_RANGE"
        : "PER_ACCOUNT_ROLLING_3_DAYS",
      dateResolver: function (account) {
        if (customRange) {
          return {
            startDate: customRange.startDate,
            endDate: customRange.endDate
          };
        }
        const endDate =
          getGoogleAdsYesterday178B_(
            account.timezone
          );
        const startDate =
          shiftGoogleAdsDate178B_(
            endDate,
            -(
              MASTER_ORCHESTRATOR_180
                .ROLLING_DAYS - 1
            )
          );

        return {
          startDate: startDate,
          endDate: endDate
        };
      },
      rebuildOutputs: false,
      showAlert: false
    });
  }

  if (platform === "Apple Search Ads") {
    return syncAppleAdsPerformance179B_({
      runLabel: customRange
        ? "Master Apple Ads range sync"
        : "Master Apple Ads rolling sync",
      dateMode: customRange
        ? "FIXED_CONTROL_PANEL_RANGE"
        : "PER_ACCOUNT_ROLLING_3_DAYS",
      dateResolver: function (account) {
        if (customRange) {
          return {
            startDate: customRange.startDate,
            endDate: customRange.endDate
          };
        }
        const endDate =
          getAppleAdsYesterday179B_(
            account.timezone
          );
        const startDate =
          shiftAppleAdsDate179B_(
            endDate,
            -(
              MASTER_ORCHESTRATOR_180
                .ROLLING_DAYS - 1
            )
          );

        return {
          startDate: startDate,
          endDate: endDate
        };
      },
      rebuildOutputs: false,
      showAlert: false
    });
  }

  throw new Error(
    "Unsupported platform in master orchestrator: " +
    platform
  );
}


function summarizeMasterPlatform180_(
  platform,
  enabledAccounts,
  result,
  startedAt
) {
  const source = result || {};
  const failedAccounts =
    getMasterFailedCount180_(source);

  return {
    platform: platform,
    status:
      String(source.status || "").toUpperCase() ||
      (failedAccounts > 0 ? "FAILED" : "SUCCESS"),
    enabledAccounts: enabledAccounts,
    successfulAccounts:
      getMasterSuccessfulCount180_(
        source,
        enabledAccounts,
        failedAccounts
      ),
    failedAccounts: failedAccounts,
    inserted: Number(source.inserted || 0),
    updated: Number(source.updated || 0),
    durationSeconds:
      roundMasterSeconds180_(
        new Date() - startedAt
      )
  };
}


function getMasterFailedCount180_(result) {
  if (
    result.failedAccounts !== undefined &&
    result.failedAccounts !== null
  ) {
    return Number(result.failedAccounts || 0);
  }

  if (
    result.failedAdvertisers !== undefined &&
    result.failedAdvertisers !== null
  ) {
    return Number(result.failedAdvertisers || 0);
  }

  return 0;
}


function getMasterSuccessfulCount180_(
  result,
  enabledAccounts,
  failedAccounts
) {
  if (
    result.successfulAccounts !== undefined &&
    result.successfulAccounts !== null
  ) {
    return Number(result.successfulAccounts || 0);
  }

  if (
    result.successfulAdvertisers !== undefined &&
    result.successfulAdvertisers !== null
  ) {
    return Number(
      result.successfulAdvertisers || 0
    );
  }

  return Math.max(
    0,
    Number(enabledAccounts || 0) -
      Number(failedAccounts || 0)
  );
}


function getMasterRecentRange180_() {
  const timezone = Session.getScriptTimeZone();
  const todayText = Utilities.formatDate(
    new Date(),
    timezone,
    "yyyy-MM-dd"
  );
  const today = parseMasterDate180_(todayText);
  const endDate = new Date(
    today.getTime() - 24 * 60 * 60 * 1000
  );
  const startDate = new Date(
    endDate.getTime() -
      (
        MASTER_ORCHESTRATOR_180.ROLLING_DAYS -
        1
      ) *
        24 *
        60 *
        60 *
        1000
  );

  return {
    startDate: formatMasterDate180_(startDate),
    endDate: formatMasterDate180_(endDate)
  };
}


function normalizeMasterSyncRange180_(startDate, endDate) {
  const start = String(startDate || "").trim();
  const end = String(endDate || "").trim();
  const startValue = parseMasterDate180_(start);
  const endValue = parseMasterDate180_(end);

  if (startValue.getTime() > endValue.getTime()) {
    throw new Error("Sync start date must be on or before end date.");
  }

  const inclusiveDays =
    Math.floor(
      (endValue.getTime() - startValue.getTime()) /
        (24 * 60 * 60 * 1000)
    ) + 1;

  if (inclusiveDays > MASTER_ORCHESTRATOR_180.MAX_RANGE_DAYS) {
    throw new Error(
      "Sync range is " +
        inclusiveDays +
        " days. The maximum is " +
        MASTER_ORCHESTRATOR_180.MAX_RANGE_DAYS +
        " days per job."
    );
  }

  const latestCompleted = parseMasterDate180_(
    getMasterRecentRange180_().endDate
  );
  if (endValue.getTime() > latestCompleted.getTime()) {
    throw new Error(
      "Sync end date must be a completed day on or before " +
        formatMasterDate180_(latestCompleted) +
        "."
    );
  }

  return {
    startDate: formatMasterDate180_(startValue),
    endDate: formatMasterDate180_(endValue),
    days: inclusiveDays
  };
}


function parseMasterDate180_(value) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(
      String(value || "")
    );

  if (!match) {
    throw new Error(
      "Invalid master sync date: " + value
    );
  }

  return new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3])
    )
  );
}


function formatMasterDate180_(date) {
  return Utilities.formatDate(
    date,
    "UTC",
    "yyyy-MM-dd"
  );
}


function sumMasterMetric180_(items, key) {
  return items.reduce(function (total, item) {
    return total + Number(item[key] || 0);
  }, 0);
}


function roundMasterSeconds180_(milliseconds) {
  return Math.round(
    Number(milliseconds || 0) / 100
  ) / 10;
}


function sanitizeMasterError180_(error) {
  const message =
    error && error.message
      ? String(error.message)
      : String(error || "Unknown error");

  return {
    type:
      error && error.name
        ? String(error.name)
        : "Error",
    message:
      message
        .replace(
          /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
          "Bearer [REDACTED]"
        )
        .replace(
          /(access_token|refresh_token|client_secret|developer-token)(["'=:\s]+)[^,\s"}]+/gi,
          "$1$2[REDACTED]"
        )
        .slice(0, 1000)
  };
}


function showMasterSummary180_(summary) {
  try {
    SpreadsheetApp.getUi().alert(
      "All-platform performance sync",
      [
        "Status: " + summary.status,
        "Successful platforms: " +
          summary.successfulPlatforms +
          "/" +
          summary.activePlatforms,
        "Failed platforms: " +
          summary.failedPlatforms,
        "Skipped platforms: " +
          summary.skippedPlatforms,
        "Inserted: " + summary.inserted,
        "Updated: " + summary.updated,
        "Outputs rebuilt: " +
          summary.outputsRebuilt,
        summary.outputError
          ? "Output error: " +
            summary.outputError
          : ""
      ].filter(Boolean).join("\n"),
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (uiError) {
    // Allows time-driven/headless execution.
  }
}


function assertMasterDependencies180_() {
  const required = [
    [
      "getEnabledAccounts_",
      typeof getEnabledAccounts_
    ],
    [
      "rebuildSpendDaily",
      typeof rebuildSpendDaily
    ],
    [
      "refreshDashboard",
      typeof refreshDashboard
    ],
    [
      "syncTikTokPerformanceRange176_",
      typeof syncTikTokPerformanceRange176_
    ],
    [
      "syncMetaPerformanceRange177_",
      typeof syncMetaPerformanceRange177_
    ],
    [
      "step177SyncMolocoPerformance",
      typeof step177SyncMolocoPerformance
    ],
    [
      "syncGoogleAdsPerformance178B_",
      typeof syncGoogleAdsPerformance178B_
    ],
    [
      "syncAppleAdsPerformance179B_",
      typeof syncAppleAdsPerformance179B_
    ]
  ];

  const missing = required
    .filter(function (item) {
      return item[1] !== "function";
    })
    .map(function (item) {
      return item[0];
    });

  if (missing.length > 0) {
    throw new Error(
      "Master orchestrator is missing required functions: " +
      missing.join(", ")
    );
  }
}
