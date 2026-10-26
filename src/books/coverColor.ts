export type CoverColorPalette =
  | { platform: 'ios'; primary?: string; background?: string; secondary?: string }
  | { platform: 'web'; dominant?: string; vibrant?: string; muted?: string };

export function prominentCoverColor(palette: CoverColorPalette): string | null {
  const candidates = palette.platform === 'ios'
    ? [palette.primary, palette.background, palette.secondary]
    : [palette.dominant, palette.vibrant, palette.muted];
  return candidates.find(isHexColor)?.toUpperCase() ?? null;
}

export function textColorOnSpine(hexColor: string): '#3C392E' | '#FFFCF2' {
  if (!isHexColor(hexColor)) return '#3C392E';
  const channels = hexColor.slice(1).match(/.{2}/g)?.map((channel) => Number.parseInt(channel, 16) / 255) ?? [];
  const luminance = channels
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  return luminance > 0.45 ? '#3C392E' : '#FFFCF2';
}

function isHexColor(value: string | undefined): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}
