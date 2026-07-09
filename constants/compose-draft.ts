/** Ghost-letter move duration; draft reveal and fly removal happen at this instant. */
export const DRAFT_FLY_DURATION_MS = 300;

/** Typical glyph width ratio for centering a single letter in a square key. */
export const DRAFT_FLY_GLYPH_WIDTH_RATIO = 0.6;

/** Matches `letterSpacing` on draft `Text` in `OnlinePlayComposePanel`. */
export const DRAFT_DISPLAY_LETTER_SPACING = 1;

/** Matches `minimumFontScale` on draft `Text`. */
export const DRAFT_MIN_FONT_SCALE = 0.45;

/** Typical cap-height ratio for system UI font at a given font size. */
export const DRAFT_CAP_HEIGHT_RATIO = 0.71;

/** Max vertical fill for draft text inside the compose row (multi-char line). */
export const COMPOSE_DRAFT_MAX_FILL = 0.58;

/** Clear-draft icon size as a fraction of the compose key square. */
export const COMPOSE_CLEAR_ICON_FILL = 0.46;

/** Cap for backspace glyph size as a fraction of the compose key square. */
export const COMPOSE_BACKSPACE_GLYPH_CAP = 0.58;
