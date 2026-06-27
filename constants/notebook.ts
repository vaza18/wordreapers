/** Legacy mockup row height before tightness (42px at 18px word size). */
export const WORD_LIST_ROW_HEIGHT = 42;

/** Less vertical air between word glyphs and ruled lines (~20%). */
export const NOTEBOOK_ROW_HEIGHT_TIGHTNESS = 0.8;

/** Ruled-row height at the design font scale — used by WordList and fillers. */
export const NOTEBOOK_ROW_HEIGHT = Math.round(WORD_LIST_ROW_HEIGHT * NOTEBOOK_ROW_HEIGHT_TIGHTNESS);

/** Top spiral-bound holes strip layout (must match NotebookHolesHeader). */
export const NOTEBOOK_HOLES_PADDING_TOP = 20;
export const NOTEBOOK_HOLES_BAND_HEIGHT = 30;
export const NOTEBOOK_HOLES_STEP = 32;
export const NOTEBOOK_HOLE_DIAMETER = 16;
/** Min gap from paper edge to hole center (matches half-step inset on each side). */
export const NOTEBOOK_HOLES_END_GAP = NOTEBOOK_HOLES_STEP / 2;

export const NOTEBOOK_HOLES_HEADER_HEIGHT = NOTEBOOK_HOLES_PADDING_TOP + NOTEBOOK_HOLES_BAND_HEIGHT;
