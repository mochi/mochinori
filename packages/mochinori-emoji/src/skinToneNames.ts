/**
 * A skin tone, as Slack numbers them: 1 is the default yellow, and 2 to 6
 * are the Fitzpatrick types that `:skin-tone-2:` to `:skin-tone-6:` add
 */
export type SkinTone = 1 | 2 | 3 | 4 | 5 | 6;

/** Every skin tone, for a picker's skin tone menu */
export const SKIN_TONES: readonly SkinTone[] = [1, 2, 3, 4, 5, 6];

/** The `:skin-tone-N:` that a typed name ends with, if any */
export const SKIN_TONE_SHORTCODE = /:skin-tone-([2-6]):$/;

/** The shortcode that adds `tone`, or '' for the default */
export function skinToneShortcode(tone: SkinTone): string {
  return tone === 1 ? '' : `:skin-tone-${tone}:`;
}
