import { expect, test } from '@playwright/test';

test('reader customizes a shared Book page, saves private notes and media, undoes an edit, and preserves data offline', async ({ page }) => {
  let illustrationRequests = 0;
  await page.route('https://images.example.com/leafmark-flower.svg', async (route) => {
    illustrationRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      headers: { 'access-control-allow-origin': '*' },
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="120"><rect width="80" height="120" fill="#A6AA88"/></svg>',
    });
  });

  await page.goto('./');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill('reader-book-pages');
  await page.getByLabel('Password', { exact: true }).fill('book page customization password');
  await page.getByLabel('Confirm password', { exact: true }).fill('book page customization password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByText('Local shelf for reader-book-pages')).toBeVisible();

  await page.getByRole('button', { name: 'Open TBR' }).click();
  await page.getByRole('button', { name: 'Add book manually' }).click();
  await page.getByLabel('Book title').fill('The Garden Notebook');
  await page.getByLabel('Authors').fill('A. Reader');
  await page.getByLabel('Categories').fill('Romance');
  await page.getByLabel('Page count').fill('240');
  await page.getByRole('button', { name: 'Save to TBR' }).click();

  await page.getByRole('button', { name: 'Open Reading tracker' }).click();
  await page.getByLabel('Book start date').fill('2027-01-02');
  await page.getByRole('button', { name: 'Start The Garden Notebook' }).click();
  await page.getByRole('button', { name: 'Finish current book' }).click();
  await page.getByLabel('Finish date').fill('2027-01-12');
  await page.getByRole('button', { name: 'Rate 4.5 stars' }).click();
  await page.getByRole('button', { name: 'Finish book' }).click();
  await expect(page.getByText('Book finished and added to Read Books.')).toBeVisible();

  await page.getByRole('button', { name: 'Open Read Books' }).click();
  await page.getByRole('button', { name: 'Customize Book page template' }).click();
  await page.getByLabel('Template field 1').fill('Series title');
  await page.getByRole('button', { name: 'Save Series field name' }).click();
  await expect(page.getByRole('button', { name: 'Save Series title field name' })).toBeVisible();
  await page.getByLabel('Template field name').fill('Mood');
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await page.getByRole('button', { name: 'Add to all Book pages' }).click();
  await expect(page.getByLabel('Template field 6')).toHaveValue('Mood');
  await page.getByRole('button', { name: 'Move Mood up' }).click();
  await page.getByRole('button', { name: 'Remove Couple from template' }).click();

  await page.getByRole('button', { name: '‹ Read Books' }).click();
  await page.getByRole('button', { name: 'Customize Book page template' }).click();
  await expect(page.getByLabel('Template field 1')).toHaveValue('Series title');
  await expect(page.getByLabel('Template field 4')).toHaveValue('Mood');
  await expect(page.getByLabel('Template field 5')).toHaveValue('Illustration');
  await expect(page.getByLabel('Template field 6')).toHaveCount(0);

  await page.getByRole('button', { name: '‹ Read Books' }).click();
  await page.getByRole('button', { name: 'Open The Garden Notebook' }).click();
  await expect(page.getByText('Series title · template')).toBeVisible();
  await expect(page.getByText('Mood · template')).toBeVisible();
  await expect(page.getByText('Couple · template')).toHaveCount(0);
  await expect(page.getByText('Reading attempts · 1')).toBeVisible();
  await expect(page.getByText('2027-01-02 → 2027-01-12 · 4.5 stars')).toBeVisible();

  await page.getByRole('button', { name: 'Edit Book details' }).click();
  await page.getByLabel('Book authors').fill('A. Reader, M. Reader');
  await page.getByLabel('Book page count').fill('245');
  await page.getByRole('button', { name: 'Save Book details' }).click();
  await expect(page.getByText('Author: A. Reader, M. Reader')).toBeVisible();
  await expect(page.getByText('Pages: 245')).toBeVisible();

  await page.getByLabel('Series title', { exact: true }).fill('Maple series');
  await page.getByRole('button', { name: 'Save Series title' }).click();
  await page.getByLabel('Favorite quotes', { exact: true }).fill('“Find me in the garden.”\n“Always.”');
  await page.getByRole('button', { name: 'Save Favorite quotes' }).click();
  await page.getByLabel('Mood', { exact: true }).fill('Slow burn\nFound family');
  await page.getByRole('button', { name: 'Save Mood' }).click();
  await page.getByLabel('Illustration', { exact: true }).fill('https://images.example.com/leafmark-flower.svg');
  await page.getByRole('button', { name: 'Save Illustration' }).click();
  await expect(page.getByRole('img', { name: 'Illustration' })).toBeVisible();
  await expect(page.getByText('Illustration saved.')).toBeVisible();

  await page.getByLabel('Book-only field name').fill('Favorite chapter');
  await page.getByRole('button', { name: 'Add Book-only field' }).click();
  await page.getByLabel('Favorite chapter', { exact: true }).fill('Chapter 4');
  await page.getByRole('button', { name: 'Save Favorite chapter' }).click();
  await page.getByLabel('Favorite chapter', { exact: true }).fill('Chapter 12');
  await page.getByRole('button', { name: 'Save Favorite chapter' }).click();
  await page.getByRole('button', { name: 'Undo last edit to Favorite chapter' }).click();
  await expect(page.getByLabel('Favorite chapter', { exact: true })).toHaveValue('Chapter 4');

  const illustrationRequestsBeforeOffline = illustrationRequests;
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.getByText('Welcome back, reader-book-pages.')).toBeVisible();
  await page.getByRole('button', { name: 'Open Read Books' }).click();
  await expect(page.getByText('Read books · 1 unique Book')).toBeVisible();
  await page.getByRole('button', { name: 'Open The Garden Notebook' }).click();
  await expect(page.getByText('Author: A. Reader, M. Reader')).toBeVisible();
  await expect(page.getByText('Pages: 245')).toBeVisible();
  await expect(page.getByText('Reading attempts · 1')).toBeVisible();
  await expect(page.getByLabel('Series title', { exact: true })).toHaveValue('Maple series');
  await expect(page.getByLabel('Favorite quotes', { exact: true })).toHaveValue('“Find me in the garden.”\n“Always.”');
  await expect(page.getByLabel('Mood', { exact: true })).toHaveValue('Slow burn\nFound family');
  await expect(page.getByLabel('Favorite chapter', { exact: true })).toHaveValue('Chapter 4');
  const savedIllustration = page.getByRole('img', { name: 'Illustration' });
  await expect(savedIllustration).toBeVisible();
  await expect.poll(() => savedIllustration.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBe(80);

  await page.getByRole('button', { name: 'Delete Book page' }).click();
  await expect(page.getByText('Delete “The Garden Notebook”?')).toBeVisible();
  await page.getByRole('button', { name: 'Keep Book' }).click();
  await expect(page.getByTestId('book-page')).toBeVisible();
  await expect(page.getByLabel('Favorite chapter', { exact: true })).toHaveValue('Chapter 4');
  expect(illustrationRequests).toBe(illustrationRequestsBeforeOffline);
  await page.context().setOffline(false);
});
