/**
 * An emoji that is an image rather than a Unicode character, like the custom
 * emoji of a Slack workspace or a Discord server
 */
export interface CustomEmoji {
  /**
   * The short name, typed between colons (`partyparrot` is typed as
   * `:partyparrot:`). It can't contain spaces or colons. Where a standard
   * emoji has the same short name, the standard emoji is used.
   */
  readonly name: string;
  /** The URL of the image */
  readonly src: string;
}

/** Custom emoji by name */
export type CustomEmojiMap = ReadonlyMap<string, CustomEmoji>;
