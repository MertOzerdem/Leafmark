import { prominentCoverColor, textColorOnSpine } from './coverColor';

describe('bookshelf cover colors', () => {
  it('uses the prominent primary color on iPad and falls back to the background color', () => {
    expect(prominentCoverColor({ platform: 'ios', primary: '#73805C', background: '#F5F0DF' })).toBe('#73805C');
    expect(prominentCoverColor({ platform: 'ios', primary: 'unavailable', background: '#F5F0DF' })).toBe('#F5F0DF');
  });

  it('returns null when iOS provides no valid cover color', () => {
    expect(prominentCoverColor({ platform: 'ios', primary: 'unavailable', background: 'not-a-color' })).toBeNull();
  });

  it('chooses readable lettering for both light and dark spine colors', () => {
    expect(textColorOnSpine('#F5F0DF')).toBe('#3C392E');
    expect(textColorOnSpine('#363A2D')).toBe('#FFFCF2');
  });
});
