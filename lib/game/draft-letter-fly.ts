/** Window-coordinate rectangle from `measureInWindow`. */
export type WindowRect = { x: number; y: number; width: number; height: number };

/** 2D point in the same coordinate space as {@link WindowRect}. */
export type Point = { x: number; y: number };

/** Inputs for computing ghost-letter fly start/end in panel-local coords. */
export type DraftLetterFlyInput = {
  keyRect: WindowRect;
  panelOrigin: Point;
  draftBox: WindowRect;
  /**
   * Measured width of the current draft string (after shrink-to-fit), so the next
   * glyph lands immediately after existing letters instead of using a fixed advance.
   */
  measuredDraftWidth: number;
  draftFontSize: number;
  draftPaddingHorizontal: number;
};

/**
 * Panel-local start/end for the ghost letter that flies from a key into the draft.
 * Landing uses the measured draft text width (left-aligned), not a fixed glyph advance.
 */
export function draftLetterFlyEndpoints(input: DraftLetterFlyInput): {
  start: Point;
  end: Point;
} {
  const {
    keyRect,
    panelOrigin,
    draftBox,
    measuredDraftWidth,
    draftFontSize,
    draftPaddingHorizontal,
  } = input;

  const halfX = draftFontSize * 0.3;
  const halfY = draftFontSize * 0.5;

  const startX = keyRect.x - panelOrigin.x + keyRect.width / 2 - halfX;
  const startY = keyRect.y - panelOrigin.y + keyRect.height / 2 - halfY;

  const contentLeft = draftBox.x - panelOrigin.x + draftPaddingHorizontal;
  const contentRight = draftBox.x - panelOrigin.x + draftBox.width - draftPaddingHorizontal;
  // Absolute left of the ghost letter ≈ left edge of the new glyph after existing text.
  const endX = Math.min(contentLeft + Math.max(0, measuredDraftWidth), contentRight - halfX * 2);
  const endY = draftBox.y - panelOrigin.y + draftBox.height / 2 - halfY;

  return {
    start: { x: startX, y: startY },
    end: { x: endX, y: endY },
  };
}
