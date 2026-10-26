import { isValidStarRating } from './readingTypes';

describe('isValidStarRating', () => {
  it.each([1, 1.5, 2, 4.5, 5])('accepts %s stars', (rating) => {
    expect(isValidStarRating(rating)).toBe(true);
  });

  it.each([null, 0.5, 5.5, 2.2, Number.NaN, Number.POSITIVE_INFINITY])('rejects %s', (rating) => {
    expect(isValidStarRating(rating)).toBe(false);
  });
});
