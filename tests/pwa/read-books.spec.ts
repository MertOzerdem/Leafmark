import { expect, test } from '@playwright/test';

test('reader finishes and rereads one Book, then keeps its attempts, latest rating, and shelf copy offline', async ({ page }) => {
  await page.route('https://books.example/garden-cover.jpg', async (route) => {
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="76" height="112"><rect width="76" height="112" fill="#D59AAA"/></svg>',
    });
  });
  await page.route('https://www.googleapis.com/books/v1/volumes**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        items: [{
          id: 'volume-garden-42',
          volumeInfo: {
            title: 'A Garden of Stories',
            authors: ['A. Reader'],
            imageLinks: { thumbnail: 'http://books.example/garden-cover.jpg' },
            categories: ['Fiction', 'Romance'],
            pageCount: 384,
            description: 'A story among the flowers.',
          },
        }],
      }),
    });
  });

  await page.goto('./');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill('reader-rereads');
  await page.getByLabel('Password', { exact: true }).fill('reading attempt password');
  await page.getByLabel('Confirm password', { exact: true }).fill('reading attempt password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByText('Local shelf for reader-rereads')).toBeVisible();

  await page.getByRole('button', { name: 'Open TBR' }).click();
  await page.getByLabel('Search books by title or author').fill('garden stories');
  await page.getByRole('button', { name: 'Search Google Books' }).click();
  await page.getByRole('button', { name: 'Add to TBR: A Garden of Stories' }).click();
  await expect(page.getByTestId('tbr-book-title')).toHaveText('A Garden of Stories');

  await page.getByRole('button', { name: 'Open Reading tracker' }).click();
  await page.getByLabel('Book start date').fill('2027-01-02');
  await page.getByRole('button', { name: 'Start A Garden of Stories' }).click();
  await expect(page.getByText('Current book: A Garden of Stories')).toBeVisible();
  await page.getByRole('button', { name: 'Finish current book' }).click();
  await page.getByLabel('Finish date').fill('2027-01-12');
  await expect(page.getByRole('button', { name: /^Rate \d(?:\.\d)? stars$/ })).toHaveCount(9);
  await page.getByRole('button', { name: 'Rate 4.5 stars' }).click();
  await page.getByRole('button', { name: 'Finish book' }).click();
  await expect(page.getByText('Book finished and added to Read Books.')).toBeVisible();

  await page.getByRole('button', { name: 'Open TBR' }).click();
  await expect(page.getByText('Your list · 0')).toBeVisible();
  await page.getByRole('button', { name: 'Open Read Books' }).click();
  await expect(page.getByText('Read books · 1 unique Book')).toBeVisible();
  await expect(page.getByText('Reading attempts · 1')).toBeVisible();
  await expect(page.getByLabel('Latest rating: 4.5 stars')).toBeVisible();
  const finishedBookCover = page.getByRole('img', { name: 'A Garden of Stories cover' });
  await expect(finishedBookCover).toBeVisible();
  await expect.poll(() => finishedBookCover.evaluate((cover) => (cover as HTMLImageElement).naturalWidth)).toBe(76);

  await page.getByRole('button', { name: 'Open My Bookshelf' }).click();
  await expect(page.getByRole('button', { name: 'Shelf item A Garden of Stories' })).toBeVisible();
  await expect(page.locator('[data-testid^="book-spine-"]')).toHaveCount(1);

  await page.getByRole('button', { name: 'Open Read Books' }).click();
  await page.getByRole('button', { name: 'Open A Garden of Stories' }).click();
  await expect(page.getByText('2027-01-02 → 2027-01-12 · 4.5 stars')).toBeVisible();
  await page.getByLabel('Finish date for 2027-01-02').fill('2027-01-13');
  await page.getByRole('button', { name: 'Edit rating 4 stars for 2027-01-02' }).click();
  await page.getByRole('button', { name: 'Save finish details for 2027-01-02' }).click();
  await expect(page.getByText('2027-01-02 → 2027-01-13 · 4 stars')).toBeVisible();

  await page.getByLabel('Reread start date').fill('2027-01-20');
  await page.getByRole('button', { name: 'Read this Book again' }).click();
  await expect(page.getByText('Reading attempts · 2')).toBeVisible();
  await expect(page.getByText('In progress · started 2027-01-20')).toBeVisible();

  await page.getByRole('button', { name: 'Open Reading tracker' }).click();
  await expect(page.getByText('Current book: A Garden of Stories')).toBeVisible();
  await page.getByRole('button', { name: 'Finish current book' }).click();
  await page.getByLabel('Finish date').fill('2027-02-03');
  await page.getByRole('button', { name: 'Rate 3.5 stars' }).click();
  await page.getByRole('button', { name: 'Finish book' }).click();
  await expect(page.getByText('Book finished and added to Read Books.')).toBeVisible();

  await page.getByRole('button', { name: 'Open Read Books' }).click();
  await expect(page.getByText('Read books · 1 unique Book')).toBeVisible();
  await expect(page.getByText('Reading attempts · 2')).toBeVisible();
  await expect(page.getByLabel('Latest rating: 3.5 stars')).toBeVisible();
  await expect(page.getByRole('img', { name: 'A Garden of Stories cover' })).toBeVisible();
  await page.getByRole('button', { name: 'Open A Garden of Stories' }).click();
  await expect(page.getByText('Latest rating: 3.5 stars')).toBeVisible();
  await expect(page.getByText('2027-01-20 → 2027-02-03 · 3.5 stars')).toBeVisible();
  await expect(page.getByText('2027-01-02 → 2027-01-13 · 4 stars')).toBeVisible();

  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.getByText('Welcome back, reader-rereads.')).toBeVisible();
  await page.getByRole('button', { name: 'Open Read Books' }).click();
  await expect(page.getByText('Read books · 1 unique Book')).toBeVisible();
  await expect(page.getByText('Reading attempts · 2')).toBeVisible();
  await expect(page.getByLabel('Latest rating: 3.5 stars')).toBeVisible();
  await page.getByRole('button', { name: 'Open A Garden of Stories' }).click();
  await expect(page.getByText('Latest rating: 3.5 stars')).toBeVisible();
  await expect(page.getByText('2027-01-20 → 2027-02-03 · 3.5 stars')).toBeVisible();
  await expect(page.getByText('2027-01-02 → 2027-01-13 · 4 stars')).toBeVisible();

  await page.getByRole('button', { name: 'Open My Bookshelf' }).click();
  await expect(page.getByRole('button', { name: 'Shelf item A Garden of Stories' })).toBeVisible();
  await expect(page.locator('[data-testid^="book-spine-"]')).toHaveCount(1);
  await page.context().setOffline(false);
});
