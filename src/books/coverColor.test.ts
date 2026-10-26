import { prominentCoverColor, textColorOnSpine } from './coverColor';

describe('bookshelf cover colors', () => {
  it('uses the native dominant color on Android and web', () => {
    expect(prominentCoverColor({ platform: 'android', dominant: '#A87542' })).toBe('#A87542');
    expect(prominentCoverColor({ platform: 'web', dominant: '#48627A' })).toBe('#48627A');
  });

  it('uses the prominent primary color on iPad and falls back to the background color', () => {
    expect(prominentCoverColor({ platform: 'ios', primary: '#73805C', background: '#F5F0DF' })).toBe('#73805C');
    expect(prominentCoverColor({ platform: 'ios', primary: 'unavailable', background: '#F5F0DF' })).toBe('#F5F0DF');
  });

  it('chooses readable lettering for both light and dark spine colors', () => {
    expect(textColorOnSpine('#F5F0DF')).toBe('#3C392E');
    expect(textColorOnSpine('#363A2D')).toBe('#FFFCF2');
  });
});
