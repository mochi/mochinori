/**
 * A name being typed right before the caret: a `:` at the start of the text
 * or after anything but a letter, digit or underscore (a space, or an emoji
 * typed with the system keyboard, but not the `:` in `10:30` or `https://`),
 * then the name so far
 */
export const NAME_BEFORE_CARET = /(?:^|[^\p{L}\p{N}_]):([^\s:]+)$/u;
