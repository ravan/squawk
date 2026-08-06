export const TEXT_FONT_FAMILY = 'SUSE Mono, monospace';

const FONT_FACE_FAMILY = 'SUSE Mono';
const SERIALIZED_FONT_FACE_FAMILY = `"${FONT_FACE_FAMILY}"`;
const FONT_FACES: readonly Readonly<{
  path:
    | '/fonts/suse-mono/SUSEMono-Regular-latin.woff2'
    | '/fonts/suse-mono/SUSEMono-Regular-latin-ext.woff2'
    | '/fonts/suse-mono/SUSEMono-Regular-vietnamese.woff2';
  unicodeRange: string;
}>[] = [
  {
    path: '/fonts/suse-mono/SUSEMono-Regular-vietnamese.woff2',
    unicodeRange:
      'U+102-103, U+110-111, U+128-129, U+168-169, U+1A0-1A1, U+1AF-1B0, U+300-301, U+303-304, U+308-309, U+323, U+329, U+1EA0-1EF9, U+20AB',
  },
  {
    path: '/fonts/suse-mono/SUSEMono-Regular-latin-ext.woff2',
    unicodeRange:
      'U+100-2BA, U+2BD-2C5, U+2C7-2CC, U+2CE-2D7, U+2DD-2FF, U+304, U+308, U+329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF',
  },
  {
    path: '/fonts/suse-mono/SUSEMono-Regular-latin.woff2',
    unicodeRange:
      'U+0-FF, U+131, U+152-153, U+2BB-2BC, U+2C6, U+2DA, U+2DC, U+304, U+308, U+329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
  },
];

export type TextFontInstallation = Readonly<{ ready: Promise<void> }>;

export function installTextFont(): TextFontInstallation {
  const installed: FontFace[] = [];
  for (const { path, unicodeRange } of FONT_FACES) {
    const existing = [...document.fonts].find(
      (font) =>
        font.family === SERIALIZED_FONT_FACE_FAMILY &&
        font.style === 'normal' &&
        font.weight === '400' &&
        font.unicodeRange === unicodeRange,
    );
    if (existing !== undefined) {
      installed.push(existing);
      continue;
    }

    const font = new FontFace(
      FONT_FACE_FAMILY,
      `url('${browser.runtime.getURL(path)}') format('woff2')`,
      {
        display: 'block',
        style: 'normal',
        weight: '400',
        unicodeRange,
      },
    );
    document.fonts.add(font);
    installed.push(font);
  }

  const ready = Promise.allSettled(installed.map((font) => font.load()))
    .then(() => document.fonts.ready)
    .then(() => undefined);
  return { ready };
}
