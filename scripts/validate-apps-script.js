#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const errors = [];

const requiredFiles = [
  'appsscript.json',
  'Core.gs',
  'Code.gs',
  'Credentials.gs',
  'ApiClient.gs',
  'Accounts.gs',
  'DataStore.gs',
  'Aggregation.gs',
  'MasterOrchestrator.gs',
  'AutomationTrigger.gs',
  'ProjectControlPanel.gs',
  'ProjectControlPanel.html',
  'PaymentMonitoring.gs',
  'Dashboard.gs'
];

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) {
    errors.push(`Missing required file: ${file}`);
  }
}

let manifest;
try {
  manifest = JSON.parse(
    fs.readFileSync(path.join(root, 'appsscript.json'), 'utf8')
  );
} catch (error) {
  errors.push(`Invalid appsscript.json: ${error.message}`);
}

if (manifest) {
  if (manifest.runtimeVersion !== 'V8') {
    errors.push('appsscript.json must use the V8 runtime.');
  }
  if (!manifest.timeZone) {
    errors.push('appsscript.json must declare a timezone.');
  }
}

const gsFiles = fs.readdirSync(root)
  .filter(file => file.endsWith('.gs'))
  .sort();

const functionOwners = new Map();
let combinedSource = '';

for (const file of gsFiles) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  combinedSource += `\n${source}`;
  try {
    new Function(source);
  } catch (error) {
    errors.push(`${file}: syntax error: ${error.message}`);
  }

  const matcher = /(?:^|\n)\s*function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let match;
  while ((match = matcher.exec(source)) !== null) {
    const name = match[1];
    if (functionOwners.has(name)) {
      errors.push(
        `Duplicate global function ${name}: ${functionOwners.get(name)} and ${file}`
      );
    } else {
      functionOwners.set(name, file);
    }
  }
}

const requiredFunctions = [
  'setupMarketingSpendHub',
  'openMarketingHubControlPanel',
  'step200SetupProjectControlPanel',
  'step210TestProjectUpgrade',
  'step181RunLoggedSyncRange',
  'syncAllPlatformsPerformanceRange',
  'runScheduledMarketingPerformanceSync'
];

for (const name of requiredFunctions) {
  if (!functionOwners.has(name)) {
    errors.push(`Missing required public/runtime function: ${name}`);
  }
}

const htmlPath = path.join(root, 'ProjectControlPanel.html');
if (fs.existsSync(htmlPath)) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  if (!scripts.length) {
    errors.push('ProjectControlPanel.html contains no script block.');
  }
  scripts.forEach((match, index) => {
    try {
      new Function(match[1]);
    } catch (error) {
      errors.push(
        `ProjectControlPanel.html script ${index + 1}: syntax error: ${error.message}`
      );
    }
  });
  if (!html.includes('google.script.run')) {
    errors.push('ProjectControlPanel.html is not connected to google.script.run.');
  }
}

if (/SpreadsheetApp\.getUi\(\)\.alert/.test(
  fs.readFileSync(path.join(root, 'AutomationTrigger.gs'), 'utf8')
)) {
  errors.push('AutomationTrigger.gs must not use blocking UI alerts.');
}

if (!combinedSource.includes('sanitizeLogText_')) {
  errors.push('Shared log sanitizer is missing.');
}

if (errors.length) {
  console.error(`Validation FAILED (${errors.length} error(s)):`);
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log(
  `Validation PASSED: ${gsFiles.length} Apps Script files, ` +
  `${functionOwners.size} global functions, manifest and HTML verified.`
);

