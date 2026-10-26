import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

test('reader saves every local profile to one backup and restores it offline from a clean installation', async ({ browser, page }) => {
  test.setTimeout(120_000);
  page.on('pageerror', (error) => console.error('PWA page error:', error.message));
  page.on('console', (message) => { if (message.type() === 'error') console.error('PWA console error:', message.text()); });
  await page.route('https://images.example.com/backup-illustration.svg', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      headers: { 'access-control-allow-origin': '*' },
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="120"><rect width="80" height="120" fill="#A6AA88"/></svg>',
    });
  });

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
  });
  await page.goto('./');
  await createAccount(page, 'reader-backup-one', 'first private reading password');
  await addBook(page, 'The Garden Notebook', '240');
  await addBook(page, 'Cedar Road', '320');

  await page.getByRole('button', { name: 'Open Reading tracker' }).click();
  await page.getByRole('button', { name: 'Set reading measure to Pages' }).click();
  await page.getByLabel('Reading baseline starts on').fill('2027-01-01');
  await page.getByLabel('Category 1 upper limit').fill('4');
  await page.getByLabel('Category 2 upper limit').fill('8');
  await page.getByRole('button', { name: 'Save reading settings' }).click();
  await page.getByLabel('Book start date').fill('2027-01-02');
  await page.getByRole('button', { name: 'Start The Garden Notebook' }).click();
  await page.getByLabel('Reading date').fill('2027-01-04');
  await page.getByLabel('Pages read').fill('8');
  await page.getByRole('button', { name: 'Save daily total' }).click();
  await page.getByRole('button', { name: 'Finish current book' }).click();
  await page.getByLabel('Finish date').fill('2027-01-12');
  await page.getByRole('button', { name: 'Rate 4.5 stars' }).click();
  await page.getByRole('button', { name: 'Finish book' }).click();

  await page.getByRole('button', { name: 'Open Read Books' }).click();
  await page.getByRole('button', { name: 'Open The Garden Notebook' }).click();
  await page.getByLabel('Favorite quotes', { exact: true }).fill('“Find me in the garden.”');
  await page.getByRole('button', { name: 'Save Favorite quotes' }).click();
  await page.getByLabel('Illustration', { exact: true }).fill('https://images.example.com/backup-illustration.svg');
  await page.getByRole('button', { name: 'Save Illustration' }).click();
  await expect(page.getByRole('img', { name: 'Illustration' })).toBeVisible();
  await page.getByRole('button', { name: 'Open My Bookshelf' }).click();
  await page.getByRole('button', { name: '＋ Plant' }).click();
  await expect(page.getByRole('button', { name: 'Shelf decoration Small plant' })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await createAccount(page, 'reader-backup-two', 'second private reading password');
  await addBook(page, 'A Map of Quiet Stars', '275');
  await addBook(page, 'A Quiet Atlas', '280');
  await page.getByRole('button', { name: 'Move A Quiet Atlas up' }).click();
  await expect(page.getByTestId('tbr-book-title').nth(0)).toHaveText('A Quiet Atlas');
  await expect(page.getByTestId('tbr-book-title').nth(1)).toHaveText('A Map of Quiet Stars');

  await page.getByRole('button', { name: 'Sign out' }).click();
  await signIn(page, 'reader-backup-one', 'first private reading password');
  const appOrigin = new URL(process.env.PWA_BASE_URL ?? 'http://127.0.0.1:4173/Leafmark/').origin;
  const externalRequestsDuringBackup: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== appOrigin) externalRequestsDuringBackup.push(request.url());
  });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup' }).click();
  const download = await downloadPromise;
  const backupPath = await download.path();
  if (!backupPath) throw new Error('Leafmark did not create a downloadable backup file.');
  const backupDocument = JSON.parse(await readFile(backupPath, 'utf8')) as {
    format: string;
    version: number;
    profiles: Array<{ id: string; username: string }>;
    workspaces: Array<{ accountId: string; state: { values: Array<[string, string]> } }>;
  };
  expect(backupDocument.format).toBe('leafmark-local-backup');
  expect(backupDocument.version).toBe(1);
  expect(new Set(backupDocument.profiles.map(({ username }) => username))).toEqual(new Set(['reader-backup-one', 'reader-backup-two']));
  const firstProfileId = backupDocument.profiles.find(({ username }) => username === 'reader-backup-one')?.id;
  expect(backupDocument.workspaces.find(({ accountId }) => accountId === firstProfileId)?.state.values.some(([, value]) => value.startsWith('data:image/svg+xml;base64,'))).toBe(true);
  expect(externalRequestsDuringBackup).toEqual([]);

  page.on('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Open TBR' }).click();
  await page.getByRole('button', { name: 'Restore backup' }).click();
  await page.getByLabel('Choose a Leafmark backup file').setInputFiles({
    name: 'damaged.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{'),
  });
  await expect(page.getByText('This file is not a valid Leafmark backup.')).toBeVisible();
  await expect(page.getByText('Cedar Road')).toBeVisible();

  await page.getByRole('button', { name: 'Restore backup' }).click();
  await page.getByLabel('Choose a Leafmark backup file').setInputFiles(backupPath);
  await expect(page.getByText('Restore cancelled. Your current data is unchanged.')).toBeVisible();
  await expect(page.getByText('Cedar Road')).toBeVisible();

  const baseURL = process.env.PWA_BASE_URL ?? 'http://127.0.0.1:4173/Leafmark/';
  const cleanContext = await browser.newContext({ baseURL, viewport: { width: 1194, height: 834 }, deviceScaleFactor: 1 });
  try {
    await cleanContext.addInitScript(() => {
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
    });
    const cleanPage = await cleanContext.newPage();
    await cleanPage.goto('./');
    await cleanPage.evaluate(async () => { await navigator.serviceWorker.ready; });
    await expect.poll(() => cleanPage.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await cleanContext.setOffline(true);
    await cleanPage.reload();
    await expect(cleanPage.getByRole('button', { name: 'Restore backup' })).toBeVisible();
    await cleanPage.getByRole('button', { name: 'Restore backup' }).click();
    await cleanPage.getByLabel('Choose a Leafmark backup file').setInputFiles(backupPath);
    await expect(cleanPage.getByLabel('Username', { exact: true })).toBeVisible();

    await signIn(cleanPage, 'reader-backup-one', 'first private reading password');
    await cleanPage.getByRole('button', { name: 'Open Reading tracker' }).click();
    await expect(cleanPage.getByText('The Garden Notebook · 2027-01-04 · 8 pages')).toBeVisible();
    await cleanPage.getByRole('button', { name: 'Open Read Books' }).click();
    await cleanPage.getByRole('button', { name: 'Open The Garden Notebook' }).click();
    await expect(cleanPage.getByLabel('Favorite quotes', { exact: true })).toHaveValue('“Find me in the garden.”');
    const restoredIllustration = cleanPage.getByRole('img', { name: 'Illustration' });
    await expect(restoredIllustration).toBeVisible();
    await expect.poll(() => restoredIllustration.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBe(80);
    await cleanPage.getByRole('button', { name: 'Open My Bookshelf' }).click();
    await expect(cleanPage.getByRole('button', { name: 'Shelf decoration Small plant' })).toBeVisible();
    await cleanPage.getByRole('button', { name: 'Sign out' }).click();
    await signIn(cleanPage, 'reader-backup-two', 'second private reading password');
    await cleanPage.getByRole('button', { name: 'Open TBR' }).click();
    await expect(cleanPage.getByTestId('tbr-book-title').nth(0)).toHaveText('A Quiet Atlas');
    await expect(cleanPage.getByTestId('tbr-book-title').nth(1)).toHaveText('A Map of Quiet Stars');
  } finally {
    await cleanContext.close();
  }
});

async function createAccount(page: Page, username: string, password: string) {
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByText(`Local shelf for ${username}`)).toBeVisible();
}

async function signIn(page: Page, username: string, password: string) {
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText(`Local shelf for ${username}`)).toBeVisible();
}

async function addBook(page: Page, title: string, pageCount: string) {
  await page.getByRole('button', { name: 'Open TBR' }).click();
  await page.getByRole('button', { name: 'Add book manually' }).click();
  await page.getByLabel('Book title').fill(title);
  await page.getByLabel('Authors').fill('A. Reader');
  await page.getByLabel('Categories').fill('Fiction');
  await page.getByLabel('Page count').fill(pageCount);
  await page.getByRole('button', { name: 'Save to TBR' }).click();
}
