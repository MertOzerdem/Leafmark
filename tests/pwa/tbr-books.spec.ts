import { expect, test } from '@playwright/test';

test('reader can search and edit catalog Books, manage TBR offline, and keep the saved order', async ({ page }) => {
  let catalogRequestUrl = '';
  await page.route('https://books.example/garden-cover.jpg', async (route) => {
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="76" height="112"><rect width="76" height="112" fill="#D59AAA"/></svg>',
    });
  });
  await page.route('https://www.googleapis.com/books/v1/volumes**', async (route) => {
    catalogRequestUrl = route.request().url();
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: 'volume-garden-42',
            volumeInfo: {
              title: 'A Garden of Stories',
              authors: ['A. Reader'],
              imageLinks: { thumbnail: 'http://books.example/garden-cover.jpg' },
              categories: ['Fiction', 'Romance'],
              pageCount: 384,
              description: 'A story among the flowers.',
            },
          },
        ],
      }),
    });
  });

  await page.goto('./');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill('reader-tbr');
  await page.getByLabel('Password', { exact: true }).fill('book journal password');
  await page.getByLabel('Confirm password', { exact: true }).fill('book journal password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByText('Local shelf for reader-tbr')).toBeVisible();

  await page.getByRole('button', { name: 'Open TBR' }).click();
  await page.getByLabel('Search books by title or author').fill('garden stories');
  await page.getByRole('button', { name: 'Search Google Books' }).click();
  await expect(page.getByRole('button', { name: 'Add to TBR: A Garden of Stories' })).toBeVisible();
  expect(new URL(catalogRequestUrl).origin).toBe('https://www.googleapis.com');
  expect(new URL(catalogRequestUrl).searchParams.get('q')).toBe('garden stories');
  await expect(page.getByText('A. Reader', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Fiction · Romance')).toBeVisible();
  await expect(page.getByText('384 pages').first()).toBeVisible();
  const catalogCover = page.getByRole('img', { name: 'Cover of A Garden of Stories' });
  await expect(catalogCover).toBeVisible();
  await expect.poll(() => catalogCover.evaluate((cover) => (cover as HTMLImageElement).naturalWidth)).toBe(76);
  await page.getByRole('button', { name: 'Add to TBR: A Garden of Stories' }).click();
  await expect(page.getByTestId('tbr-book-title')).toHaveText('A Garden of Stories');

  await page.getByRole('button', { name: 'Edit A Garden of Stories' }).click();
  await expect(page.getByLabel('Book title')).toHaveValue('A Garden of Stories');
  await expect(page.getByLabel('Authors')).toHaveValue('A. Reader');
  await expect(page.getByLabel('Page count')).toHaveValue('384');
  await expect(page.getByLabel('Description')).toHaveValue('A story among the flowers.');
  await page.getByLabel('Book title').fill('A Garden, Revised');
  await page.getByLabel('Page count').fill('390');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByTestId('tbr-book-title')).toHaveText('A Garden, Revised');

  await page.context().setOffline(true);
  await page.getByRole('button', { name: 'Add book manually' }).click();
  await page.getByLabel('Book title').fill('Map of Quiet Stars');
  await page.getByLabel('Authors').fill('M. Writer');
  await page.getByLabel('Categories').fill('Fantasy');
  await page.getByLabel('Page count').fill('275');
  await page.getByRole('button', { name: 'Save to TBR' }).click();
  await expect(page.getByTestId('tbr-book-title').nth(1)).toHaveText('Map of Quiet Stars');

  await page.getByRole('button', { name: 'Edit Map of Quiet Stars' }).click();
  await page.getByLabel('Book title').fill('Map of Quiet Stars, Revised');
  await page.getByLabel('Page count').fill('280');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByRole('button', { name: 'Move Map of Quiet Stars, Revised up' }).click();
  await expect(page.getByTestId('tbr-book-title').nth(0)).toHaveText('Map of Quiet Stars, Revised');
  await expect(page.getByTestId('tbr-book-title').nth(1)).toHaveText('A Garden, Revised');

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await page.reload();
  await expect(page.getByText('Welcome back, reader-tbr.')).toBeVisible();
  await page.getByRole('button', { name: 'Open TBR' }).click();
  await expect(page.getByTestId('tbr-book-title')).toHaveCount(2);
  await expect(page.getByTestId('tbr-book-title').nth(0)).toHaveText('Map of Quiet Stars, Revised');
  await expect(page.getByTestId('tbr-book-title').nth(1)).toHaveText('A Garden, Revised');

  await page.getByRole('button', { name: 'Edit Map of Quiet Stars, Revised' }).click();
  await expect(page.getByLabel('Authors')).toHaveValue('M. Writer');
  await expect(page.getByLabel('Categories')).toHaveValue('Fantasy');
  await expect(page.getByLabel('Page count')).toHaveValue('280');
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'Edit A Garden, Revised' }).click();
  await expect(page.getByLabel('Authors')).toHaveValue('A. Reader');
  await expect(page.getByLabel('Categories')).toHaveValue('Fiction, Romance');
  await expect(page.getByLabel('Page count')).toHaveValue('390');
  await expect(page.getByLabel('Cover image URL')).toHaveValue('https://books.example/garden-cover.jpg');
  await expect(page.getByLabel('Description')).toHaveValue('A story among the flowers.');

  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Remove Map of Quiet Stars, Revised from TBR' }).click();
  await expect(page.getByTestId('tbr-book-title')).toHaveCount(1);
  await expect(page.getByTestId('tbr-book-title').first()).toHaveText('A Garden, Revised');
  await page.context().setOffline(false);
});
