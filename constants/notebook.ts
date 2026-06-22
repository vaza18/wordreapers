/** Row height for WordList rows — ruled line interval must match. */
export const WORD_LIST_ROW_HEIGHT = 42;

export const notebookColors = {
  paper: '#FFFFFF',
  line: '#A8C4E0',
  hole: '#2A2A2A',
  holeRing: '#888888',
} as const;

/** Top spiral-bound holes strip layout (must match NotebookHolesHeader). */
export const NOTEBOOK_HOLES_PADDING_TOP = 20;
export const NOTEBOOK_HOLES_BAND_HEIGHT = 30;
export const NOTEBOOK_HOLES_STEP = 32;
export const NOTEBOOK_HOLE_DIAMETER = 16;
/** Min gap from paper edge to hole center (matches half-step inset on each side). */
export const NOTEBOOK_HOLES_END_GAP = NOTEBOOK_HOLES_STEP / 2;

export const NOTEBOOK_HOLES_HEADER_HEIGHT = NOTEBOOK_HOLES_PADDING_TOP + NOTEBOOK_HOLES_BAND_HEIGHT;
