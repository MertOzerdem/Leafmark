import { expect, test } from '@playwright/test';

test('reader records dated totals and sees fixed categories, measure baselines, and Book events in the tracker offline', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill('reader-tracker');
  await page.getByLabel('Password', { exact: true }).fill('reading tracker password');
  await page.getByLabel('Confirm password', { exact: true }).fill('reading tracker password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByText('Local shelf for reader-tracker')).toBeVisible();

  await page.getByRole('button', { name: 'Open TBR' }).click();
  await page.getByRole('button', { name: 'Add book manually' }).click();
  await page.getByLabel('Book title').fill('The Garden Between Us');
  await page.getByLabel('Authors').fill('A. Reader');
  await page.getByLabel('Categories').fill('Romance');
  await page.getByLabel('Page count').fill('320');
  await page.getByRole('button', { name: 'Save to TBR' }).click();

  await page.getByRole('button', { name: 'Add book manually' }).click();
  await page.getByLabel('Book title').fill('A Map of Quiet Stars');
  await page.getByLabel('Authors').fill('M. Writer');
  await page.getByLabel('Categories').fill('Fantasy');
  await page.getByLabel('Page count').fill('275');
  await page.getByRole('button', { name: 'Save to TBR' }).click();

  await page.getByRole('button', { name: 'Add book manually' }).click();
  await page.getByLabel('Book title').fill('Cedar Coast');
  await page.getByLabel('Authors').fill('S. Writer');
  await page.getByLabel('Categories').fill('Historical Romance');
  await page.getByLabel('Page count').fill('340');
  await page.getByRole('button', { name: 'Save to TBR' }).click();

  await page.getByRole('button', { name: 'Open Reading tracker' }).click();
  await page.getByRole('button', { name: 'Set reading measure to Pages' }).click();
  await page.getByLabel('Reading baseline starts on').fill('2027-01-01');
  await page.getByLabel('Category 1 upper limit').fill('4');
  await page.getByLabel('Category 2 upper limit').fill('8');
  await page.getByRole('button', { name: 'Save reading settings' }).click();
  await expect(page.getByText('Reading settings saved.')).toBeVisible();

  await page.getByLabel('Book start date').fill('2027-01-02');
  await page.getByRole('button', { name: 'Start The Garden Between Us' }).click();
  await expect(page.getByText('Current book: The Garden Between Us')).toBeVisible();

  await page.getByLabel('Reading date').fill('2027-01-04');
  await page.getByLabel('Pages read').fill('8');
  await page.getByRole('button', { name: 'Save daily total' }).click();
  await expect(page.getByText('Daily total saved.')).toBeVisible();

  await page.getByRole('button', { name: 'Choose A Map of Quiet Stars for daily total' }).click();
  await page.getByLabel('Reading date').fill('2027-01-05');
  await page.getByLabel('Pages read').fill('12');
  await page.getByRole('button', { name: 'Save daily total' }).click();
  await expect(page.getByText('A Map of Quiet Stars · 2027-01-05 · 12 pages')).toBeVisible();

  await page.getByRole('button', { name: 'Set reading measure to Minutes' }).click();
  await page.getByLabel('Reading baseline starts on').fill('2027-01-10');
  await page.getByRole('button', { name: 'Save reading settings' }).click();
  await expect(page.getByText('Reading settings saved.')).toBeVisible();
  await page.getByLabel('Reading date').fill('2027-01-11');
  await expect(page.getByLabel('Minutes read')).toBeVisible();
  await page.getByLabel('Minutes read').fill('25');
  await page.getByRole('button', { name: 'Save daily total' }).click();
  await expect(page.getByText('The Garden Between Us · 2027-01-11 · 25 minutes')).toBeVisible();

  await page.getByRole('button', { name: 'Choose A Map of Quiet Stars for daily total' }).click();
  await page.getByLabel('Reading date').fill('2028-01-05');
  await page.getByLabel('Minutes read').fill('25');
  await page.getByRole('button', { name: 'Save daily total' }).click();
  await page.getByRole('button', { name: 'Next year' }).click();
  await expect(page.getByText('2028 at a glance')).toBeVisible();
  await expect(page.getByText('A Map of Quiet Stars · 2028-01-05 · 25 minutes')).toBeVisible();
  const annualMinutesDay = page.getByRole('button', { name: /January 5: 25 minutes, category 11–30 minutes/ });
  await expect.poll(() => annualMinutesDay.getByText('♥').evaluate((heart) => getComputedStyle(heart).color)).toBe('rgb(215, 181, 192)');

  await page.getByRole('button', { name: 'Open January 2028' }).click();
  const otherYearTotalDay = page.getByRole('button', { name: /2028-01-05,.*25 minutes/ });
  await expect(otherYearTotalDay).toBeVisible();
  await expect.poll(() => otherYearTotalDay.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(215, 181, 192)');
  await page.getByRole('button', { name: '‹ 2028 at a glance' }).click();
  await page.getByRole('button', { name: 'Previous year' }).click();
  await expect(page.getByText('2027 at a glance')).toBeVisible();

  await page.getByRole('textbox', { name: 'Custom color for category 2' }).fill('#ABCDEF');
  await page.getByRole('button', { name: 'Save custom color for category 2' }).click();
  await expect.poll(() => page.getByLabel('Category 1 upper limit').evaluate((input) => (input as HTMLInputElement).readOnly)).toBe(true);
  await expect(page.getByLabel('Category 1 upper limit')).toHaveValue('10');
  await expect(page.getByLabel('Category 2 upper limit')).toHaveValue('30');
  const recoloredAnnualPageDay = page.getByRole('button', { name: /January 4: 8 pages, category 5–8 pages/ });
  await expect.poll(() => recoloredAnnualPageDay.getByText('♥').evaluate((heart) => getComputedStyle(heart).color)).toBe('rgb(171, 205, 239)');

  await page.getByRole('button', { name: 'Finish current book' }).click();
  await page.getByLabel('Finish date').fill('2027-01-12');
  await page.getByRole('button', { name: 'Rate 4.5 stars' }).click();
  await page.getByRole('button', { name: 'Finish book' }).click();
  await expect(page.getByText('Book finished and added to Read Books.')).toBeVisible();

  await page.getByRole('button', { name: 'Choose Cedar Coast for daily total' }).click();
  await page.getByLabel('Reading date').fill('2027-01-13');
  await page.getByLabel('Minutes read').fill('20');
  await page.getByRole('button', { name: 'Save daily total' }).click();
  await expect(page.getByText('Current book: Cedar Coast')).toBeVisible();
  await expect(page.getByText('Cedar Coast · 2027-01-13 · 20 minutes')).toBeVisible();
  const annualBookStart = page.getByRole('button', { name: /January 2: no reading total, book started/ });
  await expect(annualBookStart.getByText('✦')).toBeVisible();
  const annualBookFinish = page.getByRole('button', { name: /January 12: no reading total, book finished/ });
  await expect(annualBookFinish.getByText('♛')).toBeVisible();

  await page.getByRole('button', { name: 'Open January 2027' }).click();
  const pageTotalDay = page.getByRole('button', { name: /2027-01-04,.*8 pages/ });
  await expect(pageTotalDay).toBeVisible();
  await expect.poll(() => pageTotalDay.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(171, 205, 239)');
  await page.getByRole('button', { name: /2027-01-04,.*8 pages/ }).click();
  await expect(page.getByText('Day total · 8 pages')).toBeVisible();
  await expect(page.getByText('The Garden Between Us · 8 pages')).toBeVisible();
  await page.getByRole('button', { name: /2027-01-02,.*started The Garden Between Us/ }).click();
  await expect(page.getByText('✦ Started The Garden Between Us')).toBeVisible();
  await page.getByRole('button', { name: /2027-01-12,.*finished The Garden Between Us/ }).click();
  await expect(page.getByText('♛ Finished The Garden Between Us')).toBeVisible();
  await page.getByRole('button', { name: /2027-01-11,.*25 minutes/ }).click();
  await expect(page.getByText('Day total · 25 minutes')).toBeVisible();
  await page.getByRole('button', { name: /2027-01-13,.*started Cedar Coast/ }).click();
  await expect(page.getByText('✦ Started Cedar Coast')).toBeVisible();
  await page.getByRole('button', { name: '‹ 2027 at a glance' }).click();
  await page.getByRole('button', { name: 'Next year' }).click();
  await expect(page.getByText('2028 at a glance')).toBeVisible();
  await expect.poll(() => annualMinutesDay.getByText('♥').evaluate((heart) => getComputedStyle(heart).color)).toBe('rgb(171, 205, 239)');
  await page.getByRole('button', { name: 'Open January 2028' }).click();
  const recoloredOtherYearTotalDay = page.getByRole('button', { name: /2028-01-05,.*25 minutes/ });
  await expect.poll(() => recoloredOtherYearTotalDay.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(171, 205, 239)');

  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.getByText('Welcome back, reader-tracker.')).toBeVisible();
  await page.getByRole('button', { name: 'Open Reading tracker' }).click();
  await expect(page.getByText('The Garden Between Us · 2027-01-04 · 8 pages')).toBeVisible();
  await expect(page.getByText('A Map of Quiet Stars · 2027-01-05 · 12 pages')).toBeVisible();
  await expect(page.getByText('The Garden Between Us · 2027-01-11 · 25 minutes')).toBeVisible();
  await expect(page.getByText('Cedar Coast · 2027-01-13 · 20 minutes')).toBeVisible();
  await expect(page.getByText('Current book: Cedar Coast')).toBeVisible();
  await page.getByRole('button', { name: 'Open January 2027' }).click();
  const persistedPageTotalDay = page.getByRole('button', { name: /2027-01-04,.*8 pages/ });
  await expect.poll(() => persistedPageTotalDay.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(171, 205, 239)');
  await page.getByRole('button', { name: '‹ 2027 at a glance' }).click();
  await page.getByRole('button', { name: 'Next year' }).click();
  await expect(page.getByText('A Map of Quiet Stars · 2028-01-05 · 25 minutes')).toBeVisible();
  await page.getByRole('button', { name: 'Open January 2028' }).click();
  const persistedOtherYearTotalDay = page.getByRole('button', { name: /2028-01-05,.*25 minutes/ });
  await expect.poll(() => persistedOtherYearTotalDay.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(171, 205, 239)');
  await page.context().setOffline(false);
});
