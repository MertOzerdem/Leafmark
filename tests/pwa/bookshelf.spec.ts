import { expect, test, type Page } from '@playwright/test';

test('finished Books use a cover-derived spine color in the iPad web app', async ({ page }) => {
  await page.route('https://images.example.com/shelf-cover.svg', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      headers: { 'access-control-allow-origin': '*' },
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="120"><rect width="80" height="120" fill="#D59AAA"/></svg>',
    });
  });

  await page.goto('./');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill('reader-shelf-colors');
  await page.getByLabel('Password', { exact: true }).fill('bookshelf color password');
  await page.getByLabel('Confirm password', { exact: true }).fill('bookshelf color password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();

  await addFinishedBook(page, {
    title: 'Blooming Pages', author: 'A. Reader', pageCount: '240',
    startDate: '2027-01-01', finishDate: '2027-01-02', rating: '4.5 stars',
    coverUrl: 'https://images.example.com/shelf-cover.svg',
  });
  await addFinishedBook(page, {
    title: 'A Second Shelf Book', author: 'B. Reader', pageCount: '600',
    startDate: '2027-01-03', finishDate: '2027-01-04', rating: '4 stars',
  });

  await page.getByRole('button', { name: 'Open My Bookshelf' }).click();
  const bookItem = page.getByRole('button', { name: 'Shelf item Blooming Pages' });
  const secondBookItem = page.getByRole('button', { name: 'Shelf item A Second Shelf Book' });
  const spines = page.locator('[data-testid^="book-spine-"]');
  await expect(bookItem).toBeVisible();
  await expect(secondBookItem).toBeVisible();
  await expect(spines).toHaveCount(2);
  await expect(spines.nth(0)).toHaveCSS('width', '36px');
  await expect(spines.nth(1)).toHaveCSS('width', '57px');
  const firstBookPosition = await bookItem.evaluate((element) => ({ left: getComputedStyle(element).left, top: getComputedStyle(element).top }));
  const secondBookPosition = await secondBookItem.evaluate((element) => ({ left: getComputedStyle(element).left, top: getComputedStyle(element).top }));
  expect(firstBookPosition).not.toEqual(secondBookPosition);
  const spine = spines.nth(0);
  await expect(spine).toHaveCSS('background-color', 'rgb(106, 46, 63)');
  const spineTitle = page.locator('[data-testid^="spine-title-"]').first();
  await expect(spineTitle).toHaveText('Blooming Pages');
  const uprightTitleBounds = await spineTitle.boundingBox();
  expect(uprightTitleBounds?.height).toBeGreaterThan(120);

  await bookItem.click();
  await page.getByRole('button', { name: 'Horizontal', exact: true }).click();
  await page.getByRole('button', { name: 'Set Blooming Pages spine color to #66798A' }).click();
  await expect(spine).toHaveCSS('background-color', 'rgb(102, 121, 138)');
  const horizontalTitleBounds = await spineTitle.boundingBox();
  expect(horizontalTitleBounds?.width).toBeGreaterThan(45);
  expect(horizontalTitleBounds?.height).toBeLessThan(25);

  const shelf = page.getByTestId('bookshelf-scroll-view');
  const initialPosition = await bookItem.evaluate((element) => ({ left: getComputedStyle(element).left, top: getComputedStyle(element).top }));
  const itemBounds = await bookItem.boundingBox();
  if (!itemBounds) throw new Error('The finished Book is not laid out on the bookshelf.');
  await page.mouse.move(itemBounds.x + itemBounds.width / 2, itemBounds.y + itemBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(itemBounds.x + itemBounds.width / 2 + 280, itemBounds.y + itemBounds.height / 2 + 230, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => bookItem.evaluate((element) => ({ left: getComputedStyle(element).left, top: getComputedStyle(element).top }))).not.toEqual(initialPosition);
  const movedBookPosition = await bookItem.evaluate((element) => ({ left: getComputedStyle(element).left, top: getComputedStyle(element).top }));

  await page.getByRole('button', { name: '＋ Plant' }).click();
  await page.getByRole('button', { name: '＋ Frame' }).click();
  const plant = page.getByRole('button', { name: 'Shelf decoration Small plant' });
  const frame = page.getByRole('button', { name: 'Shelf decoration Picture frame' });
  await expect(plant).toBeVisible();
  await expect(frame).toBeVisible();
  await frame.scrollIntoViewIfNeeded();
  const frameInitialPosition = await frame.evaluate((element) => ({ left: getComputedStyle(element).left, top: getComputedStyle(element).top }));
  const frameBounds = await frame.boundingBox();
  if (!frameBounds) throw new Error('The picture frame is not laid out on the bookshelf.');
  await page.mouse.move(frameBounds.x + frameBounds.width / 2, frameBounds.y + frameBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(frameBounds.x + frameBounds.width / 2 + 100, frameBounds.y + frameBounds.height / 2 + 90, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => frame.evaluate((element) => ({ left: getComputedStyle(element).left, top: getComputedStyle(element).top }))).not.toEqual(frameInitialPosition);
  const movedFramePosition = await frame.evaluate((element) => ({ left: getComputedStyle(element).left, top: getComputedStyle(element).top }));
  await plant.click();
  await page.getByRole('button', { name: 'Remove decoration' }).click();
  await expect(plant).toHaveCount(0);
  await expect(frame).toBeVisible();

  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.getByText('Welcome back, reader-shelf-colors.')).toBeVisible();
  await page.getByRole('button', { name: 'Open My Bookshelf' }).click();
  await expect(bookItem).toBeVisible();
  await expect(secondBookItem).toBeVisible();
  await expect(spine).toHaveCSS('background-color', 'rgb(102, 121, 138)');
  await expect.poll(() => bookItem.evaluate((element) => ({ left: getComputedStyle(element).left, top: getComputedStyle(element).top }))).toEqual(movedBookPosition);
  await frame.click();
  await expect.poll(() => frame.evaluate((element) => ({ left: getComputedStyle(element).left, top: getComputedStyle(element).top }))).toEqual(movedFramePosition);
  await bookItem.click();
  await expect(spine).toHaveCSS('height', '70px');
  await expect(frame).toBeVisible();
  await expect.poll(() => shelf.evaluate((element) => element.scrollHeight)).toBeGreaterThan(720);
  await page.context().setOffline(false);
});

async function addFinishedBook(page: Page, book: {
  title: string;
  author: string;
  pageCount: string;
  startDate: string;
  finishDate: string;
  rating: string;
  coverUrl?: string;
}) {
  await page.getByRole('button', { name: 'Open TBR' }).click();
  await page.getByRole('button', { name: 'Add book manually' }).click();
  await page.getByLabel('Book title').fill(book.title);
  await page.getByLabel('Authors').fill(book.author);
  await page.getByLabel('Categories').fill('Fiction');
  await page.getByLabel('Page count').fill(book.pageCount);
  if (book.coverUrl) await page.getByLabel('Cover image URL').fill(book.coverUrl);
  await page.getByRole('button', { name: 'Save to TBR' }).click();

  await page.getByRole('button', { name: 'Open Reading tracker' }).click();
  await page.getByLabel('Book start date').fill(book.startDate);
  await page.getByRole('button', { name: `Start ${book.title}` }).click();
  await page.getByRole('button', { name: 'Finish current book' }).click();
  await page.getByLabel('Finish date').fill(book.finishDate);
  await page.getByRole('button', { name: `Rate ${book.rating}` }).click();
  await page.getByRole('button', { name: 'Finish book' }).click();
}
