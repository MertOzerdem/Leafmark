import { prominentCoverColor, textColorOnSpine } from './coverColor';

describe('bookshelf cover colors', () => {
  it('uses the prominent primary color on iPad and falls back to the background color', () => {
    expect(prominentCoverColor({ platform: 'ios', primary: '#73805C', background: '#F5F0DF' })).toBe('#73805C');
    expect(prominentCoverColor({ platform: 'ios', primary: 'unavailable', background: '#F5F0DF' })).toBe('#F5F0DF');
  });

  it('returns null when iOS provides no valid cover color', () => {
    expect(prominentCoverColor({ platform: 'ios', primary: 'unavailable', background: 'not-a-color' })).toBeNull();
  });

  it('uses the dominant web cover color and falls back through the web palette', () => {
    expect(prominentCoverColor({ platform: 'web', dominant: '#D59AAA', vibrant: '#9A7181' })).toBe('#D59AAA');
    expect(prominentCoverColor({ platform: 'web', dominant: 'unavailable', vibrant: '#9A7181' })).toBe('#9A7181');
  });

  it('chooses readable lettering for both light and dark spine colors', () => {
    expect(textColorOnSpine('#F5F0DF')).toBe('#3C392E');
    expect(textColorOnSpine('#363A2D')).toBe('#FFFCF2');
  });
});
