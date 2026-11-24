/**
 * Monthly Age_Monthly automation.
 *
 * The production daily trigger calls ensureMonthlyAgeTrigger20261106_ so the
 * monthly trigger is installed without a separate manual setup step.
 */

const MONTHLY_AGE_TRIGGER_20261106 = Object.freeze({
  HANDLER: "runMonthlyAgeSync20261106",
  DAY_OF_MONTH: 2,
  HOUR: 12,
  TIMEZONE: "Asia/Ho_Chi_Minh"
});


/** Runs Apple, TikTok, and Meta age reporting for the recent three months. */
function runMonthlyAgeSync20261106() {
  const startedAt = new Date();
  const results = [];

  [
    ["Apple Search Ads", syncAppleAdsAgeRecentMonths],
    ["TikTok + Meta", syncTikTokAndMetaAgeRecentMonths]
  ].forEach(function (job) {
    try {
      const result = job[1]();
      results.push({platform: job[0], status: result.status, result: result});
    } catch (error) {
      results.push({
        platform: job[0],
        status: "FAILED",
        message: sanitizeLogText_(error && error.message ? error.message : error)
      });
    }
  });

  const failed = results.filter(function (item) {
    return item.status === "FAILED";
  });
  const succeeded = results.every(function (item) {
    return item.status === "SUCCESS";
  });
  const summary = {
    status: succeeded ? "SUCCESS" :
      (failed.length === results.length ? "FAILED" : "PARTIAL"),
    handler: MONTHLY_AGE_TRIGGER_20261106.HANDLER,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    results: results
  };
  console.log("Audience age reporting: " + summary.status);
  return summary;
}


/** Public manual installer; safe to run repeatedly. */
function installMonthlyAgeTrigger20261106() {
  return ensureMonthlyAgeTrigger20261106_();
}


/** Creates exactly one recurring trigger for day 2 at noon. */
function ensureMonthlyAgeTrigger20261106_() {
  const handler = MONTHLY_AGE_TRIGGER_20261106.HANDLER;
  const matching = ScriptApp.getProjectTriggers().filter(function (trigger) {
    return trigger.getHandlerFunction() === handler;
  });
  if (matching.length) {
    return {
      status: "EXISTS",
      handler: handler,
      triggerCount: matching.length,
      dayOfMonth: MONTHLY_AGE_TRIGGER_20261106.DAY_OF_MONTH,
      hour: MONTHLY_AGE_TRIGGER_20261106.HOUR,
      timezone: MONTHLY_AGE_TRIGGER_20261106.TIMEZONE
    };
  }

  const trigger = ScriptApp.newTrigger(handler)
    .timeBased()
    .onMonthDay(MONTHLY_AGE_TRIGGER_20261106.DAY_OF_MONTH)
    .atHour(MONTHLY_AGE_TRIGGER_20261106.HOUR)
    .nearMinute(0)
    .inTimezone(MONTHLY_AGE_TRIGGER_20261106.TIMEZONE)
    .create();
  return {
    status: "INSTALLED",
    handler: handler,
    triggerId: trigger.getUniqueId(),
    triggerCount: 1,
    dayOfMonth: MONTHLY_AGE_TRIGGER_20261106.DAY_OF_MONTH,
    hour: MONTHLY_AGE_TRIGGER_20261106.HOUR,
    timezone: MONTHLY_AGE_TRIGGER_20261106.TIMEZONE
  };
}


function removeMonthlyAgeTrigger20261106() {
  const handler = MONTHLY_AGE_TRIGGER_20261106.HANDLER;
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === handler) {
      ScriptApp.deleteTrigger(trigger);
      removed += 1;
    }
  });
  return {status: "REMOVED", handler: handler, removed: removed};
}
