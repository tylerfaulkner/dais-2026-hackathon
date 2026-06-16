import { test, expect } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

let testArtifactsDir: string;
let consoleLogs: string[] = [];
let consoleErrors: string[] = [];
let pageErrors: string[] = [];
let failedRequests: string[] = [];

test('smoke test - app loads assistant and clinics page', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.goto('/');

  await expect(page.getByRole('dialog', { name: 'Set patient details' })).toBeVisible();
  await page.getByLabel('Select your location on the map').click({ position: { x: 360, y: 240 } });
  await page.getByRole('button', { name: 'Insured', exact: true }).click();
  await page.getByRole('button', { name: 'Middle income' }).click();
  await page.getByRole('button', { name: 'Use these details' }).click();
  await expect(page.getByRole('button', { name: /Selected patient details/ })).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Referra' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ask Referra' })).toBeVisible();
  await expect(page.getByText('How can I help?')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Genie Results' })).toBeVisible();
  await expect(page.getByLabel('No Genie query results')).toBeVisible();
  await expect(page.getByText('Results will appear here')).toBeVisible();
  await expect(page.getByPlaceholder('Ask about care options or referrals')).toBeVisible();

  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();

  await page.getByRole('button', { name: 'Find care' }).click();
  await expect(page.getByRole('heading', { name: 'Facility Grid' })).toBeVisible();
  await expect(page.getByLabel('Search facilities')).toBeVisible();
  await expect(page.getByLabel('Filter by state')).toBeVisible();
  await expect(page.getByText('Data Profile')).toBeVisible();

  await page.getByRole('button', { name: 'NFHS Data' }).click();
  await expect(page.getByRole('heading', { name: 'NFHS District Health' })).toBeVisible();
  await expect(page.getByLabel('Choose health indicator')).toBeVisible();
  await expect(page.getByLabel('Search districts')).toBeVisible();
});

test.beforeEach(async ({ page }) => {
  consoleLogs = [];
  consoleErrors = [];
  pageErrors = [];
  failedRequests = [];

  testArtifactsDir = join(process.cwd(), '.smoke-test');
  mkdirSync(testArtifactsDir, { recursive: true });

  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();

    if (!text.trim() || /^%[osd]$/.test(text.trim())) {
      return;
    }

    const location = msg.location();
    const locationStr = location.url ? ` at ${location.url}:${location.lineNumber}:${location.columnNumber}` : '';

    consoleLogs.push(`[${type}] ${text}${locationStr}`);

    if (type === 'error') {
      consoleErrors.push(`${text}${locationStr}`);
    }
  });

  page.on('pageerror', (error) => {
    const errorDetails = `Page error: ${error.message}\nStack: ${error.stack || 'No stack trace available'}`;
    pageErrors.push(errorDetails);
    console.error('Page error detected:', errorDetails);
  });

  page.on('requestfailed', (request) => {
    failedRequests.push(`Failed request: ${request.url()} - ${request.failure()?.errorText}`);
  });
});

test.afterEach(async ({ page }, testInfo) => {
  const testName = testInfo.title.replace(/ /g, '-').toLowerCase();
  const screenshotPath = join(testArtifactsDir, `${testName}-app-screenshot.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const logsPath = join(testArtifactsDir, `${testName}-console-logs.txt`);
  const allLogs = [
    '=== Console Logs ===',
    ...consoleLogs,
    '\n=== Console Errors (React errors) ===',
    ...consoleErrors,
    '\n=== Page Errors ===',
    ...pageErrors,
    '\n=== Failed Requests ===',
    ...failedRequests,
  ];
  writeFileSync(logsPath, allLogs.join('\n'), 'utf-8');

  console.log(`Screenshot saved to: ${screenshotPath}`);
  console.log(`Console logs saved to: ${logsPath}`);
  if (consoleErrors.length > 0) {
    console.log('Console errors detected:', consoleErrors);
  }
  if (pageErrors.length > 0) {
    console.log('Page errors detected:', pageErrors);
  }
  if (failedRequests.length > 0) {
    console.log('Failed requests detected:', failedRequests);
  }

  await page.close();
});
