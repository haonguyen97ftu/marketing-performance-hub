/** Payment-threshold monitoring for Marketing Performance Hub. */

var PAYMENT_MONITOR_201 = Object.freeze({
  SHEET: "Payment_Monitor",
  DEFAULT_WARNING_PERCENT: 80,
  HEADERS: Object.freeze([
    "Platform",
    "Account ID",
    "Account Name",
    "Currency",
    "Enabled",
    "Payment Threshold",
    "Billing Cycle Start",
    "Manual Current Amount",
    "Spend Since Cycle Start",
    "Current Amount Used",
    "Remaining",
    "Percent Used",
    "Warning At %",
    "Status",
    "Data Source",
    "Last Checked"
  ])
});

function getMarketingPaymentMonitor201() {
  refreshMarketingPaymentMonitor201_();
  var sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(PAYMENT_MONITOR_201.SHEET);
  var rows = sheet.getLastRow() < 2
    ? []
    : sheet
        .getRange(
          2,
          1,
          sheet.getLastRow() - 1,
          PAYMENT_MONITOR_201.HEADERS.length
        )
        .getValues();

  return {
    status: "SUCCESS",
    accounts: rows.map(paymentRowToModel201_),
    sheet: PAYMENT_MONITOR_201.SHEET,
    secretsExposed: false
  };
}

function saveMarketingPaymentSettings201(payload) {
  var changes = payload && Array.isArray(payload.changes)
    ? payload.changes
    : [];
  if (changes.length > 500) {
    throw new Error("Too many payment settings in one request.");
  }

  refreshMarketingPaymentMonitor201_();
  var sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(PAYMENT_MONITOR_201.SHEET);
  var rowCount = Math.max(0, sheet.getLastRow() - 1);
  var values = rowCount
    ? sheet
        .getRange(
          2,
          1,
          rowCount,
          PAYMENT_MONITOR_201.HEADERS.length
        )
        .getValues()
    : [];
  var index = {};

  values.forEach(function(row, rowIndex) {
    index[paymentAccountKey201_(row[0], row[1])] = rowIndex;
  });

  changes.forEach(function(change) {
    var key = paymentAccountKey201_(change.platform, change.accountId);
    if (index[key] === undefined) {
      throw new Error("Payment account not found: " + key);
    }

    var threshold = validatePaymentNumber201_(
      change.threshold,
      "Payment threshold",
      false
    );
    var warning = validatePaymentWarning201_(change.warningAt);
    var manualCurrent = validatePaymentNumber201_(
      change.manualCurrent,
      "Manual current amount",
      true
    );
    var cycleStart = String(change.cycleStart || "").trim();
    if (cycleStart && !/^\d{4}-\d{2}-\d{2}$/.test(cycleStart)) {
      throw new Error("Billing cycle start must use YYYY-MM-DD.");
    }

    var row = values[index[key]];
    row[5] = threshold === null ? "" : threshold;
    row[6] = cycleStart
      ? new Date(cycleStart + "T00:00:00Z")
      : "";
    row[7] = manualCurrent === null ? "" : manualCurrent;
    row[12] = warning;
  });

  if (values.length) {
    sheet
      .getRange(
        2,
        1,
        values.length,
        PAYMENT_MONITOR_201.HEADERS.length
      )
      .setValues(values);
  }

  return getMarketingPaymentMonitor201();
}

function refreshMarketingPaymentMonitor201_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(PAYMENT_MONITOR_201.SHEET);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(PAYMENT_MONITOR_201.SHEET);
  }

  ensurePaymentMonitorCapacity201_(sheet);
  var priorSettings = readPaymentSettings201_(sheet);
  var accounts = readProjectAccounts200_();
  var spend = readPaymentSpend201_(spreadsheet);
  var checkedAt = new Date();
  var rows = accounts.map(function(account) {
    return buildPaymentMonitorRow201_(
      account,
      priorSettings[paymentAccountKey201_(
        account.platform,
        account.accountId
      )] || {},
      spend,
      checkedAt
    );
  });

  sheet.clearContents();
  sheet
    .getRange(1, 1, 1, PAYMENT_MONITOR_201.HEADERS.length)
    .setValues([PAYMENT_MONITOR_201.HEADERS.slice()]);
  if (rows.length) {
    sheet
      .getRange(2, 1, rows.length, PAYMENT_MONITOR_201.HEADERS.length)
      .setValues(rows);
  }

  formatPaymentMonitor201_(sheet, rows.length);
  return {
    status: "SUCCESS",
    accounts: rows.length,
    lastChecked: checkedAt.toISOString(),
    secretsExposed: false
  };
}

function buildPaymentMonitorRow201_(account, prior, spendMap, checkedAt) {
  var key = paymentAccountKey201_(account.platform, account.accountId);
  var threshold = numberOrNull201_(prior.threshold);
  var cycleStart = prior.cycleStart || "";
  var manualCurrent = numberOrNull201_(prior.manualCurrent);
  var spend = spendForPayment201_(spendMap, key, cycleStart);
  var current = manualCurrent !== null ? manualCurrent : spend;
  var remaining = threshold === null
    ? null
    : Math.max(0, threshold - current);
  var percent = threshold === null
    ? null
    : current / threshold * 100;
  var warningAt = Number(
    prior.warningAt || PAYMENT_MONITOR_201.DEFAULT_WARNING_PERCENT
  );
  var state = threshold === null
    ? "NOT_CONFIGURED"
    : percent >= 100
      ? "THRESHOLD_REACHED"
      : percent >= warningAt
        ? "WARNING"
        : "HEALTHY";

  return [
    account.platform,
    account.accountId,
    account.accountName,
    account.currency,
    account.enabled,
    threshold === null ? "" : threshold,
    cycleStart,
    manualCurrent === null ? "" : manualCurrent,
    roundPaymentNumber201_(spend),
    roundPaymentNumber201_(current),
    remaining === null ? "" : roundPaymentNumber201_(remaining),
    percent === null ? "" : roundPaymentNumber201_(percent),
    warningAt,
    state,
    manualCurrent !== null
      ? "MANUAL_CURRENT"
      : cycleStart
        ? "MANUAL_THRESHOLD + SPEND_DAILY"
        : "MANUAL_THRESHOLD + ALL_SYNCED_SPEND",
    checkedAt
  ];
}

function readPaymentSettings201_(sheet) {
  if (sheet.getLastRow() < 2) {
    return {};
  }
  var rows = sheet
    .getRange(
      2,
      1,
      sheet.getLastRow() - 1,
      PAYMENT_MONITOR_201.HEADERS.length
    )
    .getValues();
  var settings = {};
  rows.forEach(function(row) {
    settings[paymentAccountKey201_(row[0], row[1])] = {
      threshold: row[5],
      cycleStart: row[6],
      manualCurrent: row[7],
      warningAt: row[12]
    };
  });
  return settings;
}

function readPaymentSpend201_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName("Spend_Daily");
  var output = {};
  if (!sheet || sheet.getLastRow() < 2) {
    return output;
  }

  var headers = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getDisplayValues()[0];
  var dateIndex = headers.indexOf("Date");
  var platformIndex = headers.indexOf("Platform");
  var accountIndex = headers.indexOf("Account ID");
  var spendIndex = headers.indexOf("Spend");
  if ([dateIndex, platformIndex, accountIndex, spendIndex].some(
    function(index) { return index < 0; }
  )) {
    throw new Error(
      "Spend_Daily is missing Date, Platform, Account ID or Spend."
    );
  }

  sheet
    .getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn())
    .getValues()
    .forEach(function(row) {
      var key = paymentAccountKey201_(
        row[platformIndex],
        row[accountIndex]
      );
      if (!output[key]) {
        output[key] = [];
      }
      output[key].push({
        date: isoPaymentDate201_(row[dateIndex]),
        spend: Number(row[spendIndex] || 0)
      });
    });
  return output;
}

function spendForPayment201_(map, key, cycleStart) {
  var start = isoPaymentDate201_(cycleStart);
  return (map[key] || []).reduce(function(total, item) {
    return total + (!start || item.date >= start ? item.spend : 0);
  }, 0);
}

function paymentRowToModel201_(row) {
  return {
    platform: String(row[0] || ""),
    accountId: String(row[1] || ""),
    accountName: String(row[2] || ""),
    currency: String(row[3] || ""),
    enabled: Boolean(row[4]),
    threshold: numberOrNull201_(row[5]),
    cycleStart: isoPaymentDate201_(row[6]),
    manualCurrent: numberOrNull201_(row[7]),
    spend: Number(row[8] || 0),
    current: Number(row[9] || 0),
    remaining: numberOrNull201_(row[10]),
    percent: numberOrNull201_(row[11]),
    warningAt: Number(
      row[12] || PAYMENT_MONITOR_201.DEFAULT_WARNING_PERCENT
    ),
    state: String(row[13] || "NOT_CONFIGURED"),
    dataSource: String(row[14] || ""),
    lastChecked: row[15] instanceof Date
      ? row[15].toISOString()
      : String(row[15] || "")
  };
}

function formatPaymentMonitor201_(sheet, rowCount) {
  sheet.setFrozenRows(1);
  sheet
    .getRange(1, 1, 1, PAYMENT_MONITOR_201.HEADERS.length)
    .setFontWeight("bold")
    .setBackground("#17324d")
    .setFontColor("#ffffff");
  sheet.getRange("F:F").setNumberFormat("0.00");
  sheet.getRange("H:K").setNumberFormat("0.00");
  sheet.getRange("L:M").setNumberFormat("0.0");
  sheet.getRange("G:G").setNumberFormat("yyyy-mm-dd");
  sheet.getRange("P:P").setNumberFormat("yyyy-mm-dd hh:mm");
  sheet.autoResizeColumns(1, PAYMENT_MONITOR_201.HEADERS.length);

  if (!rowCount) {
    sheet.setConditionalFormatRules([]);
    return;
  }
  var statusRange = sheet.getRange(2, 14, rowCount, 1);
  var rules = [
    ["THRESHOLD_REACHED", "#feeceb", "#b42318"],
    ["WARNING", "#fff3df", "#b66a00"],
    ["HEALTHY", "#e9f7f0", "#197a55"],
    ["NOT_CONFIGURED", "#eef1f5", "#59636e"]
  ].map(function(item) {
    return SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(item[0])
      .setBackground(item[1])
      .setFontColor(item[2])
      .setRanges([statusRange])
      .build();
  });
  sheet.setConditionalFormatRules(rules);
}

function ensurePaymentMonitorCapacity201_(sheet) {
  var required = PAYMENT_MONITOR_201.HEADERS.length;
  if (sheet.getMaxColumns() < required) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      required - sheet.getMaxColumns()
    );
  }
}

function paymentAccountKey201_(platform, accountId) {
  return String(platform || "").trim() + "|" +
    String(accountId || "").trim();
}

function isoPaymentDate201_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      "yyyy-MM-dd"
    );
  }
  var text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function numberOrNull201_(value) {
  return value === "" || value === null || value === undefined ||
    !isFinite(Number(value))
    ? null
    : Number(value);
}

function validatePaymentNumber201_(value, label, allowZero) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }
  var number = Number(value);
  if (!isFinite(number) || (allowZero ? number < 0 : number <= 0)) {
    throw new Error(
      label + (allowZero ? " cannot be negative." : " must be greater than 0.")
    );
  }
  return number;
}

function validatePaymentWarning201_(value) {
  var warning = Number(
    value || PAYMENT_MONITOR_201.DEFAULT_WARNING_PERCENT
  );
  if (!isFinite(warning) || warning < 1 || warning > 100) {
    throw new Error("Warning percent must be from 1 to 100.");
  }
  return warning;
}

function roundPaymentNumber201_(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}
