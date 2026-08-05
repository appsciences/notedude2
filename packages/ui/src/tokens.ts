/**
 * The notedude design tokens.
 *
 * Every value here was previously an inline literal in `App.tsx` or `page.tsx` — in several
 * cases the same literal derived independently in both files. Tokens are the single place a
 * colour, step, or size is decided; components read them and never hard-code.
 *
 * Colours come in dark/light pairs because the app ships both themes. `ThemeProvider`
 * resolves a pair to the active side, so a component asks for `c.bg.app`, never for
 * `darkMode ? "#1a1a1a" : "#ffffff"`.
 */

/** A colour that differs between the two themes. */
export interface ThemedColor {
  dark: string;
  light: string;
}

const pair = (dark: string, light: string): ThemedColor => ({ dark, light });

export const colors = {
  bg: {
    /** The app canvas. */
    app: pair("#1a1a1a", "#ffffff"),
    /** Dropdowns and the task-move dialog — one step up from the canvas. */
    raised: pair("#2a2a2a", "#f5f5f5"),
    /** The task-move dialog specifically: pure white in light mode, not the dropdown grey. */
    dialog: pair("#2a2a2a", "#ffffff"),
    /** The selected note, and the highlighted row in either tag dropdown. */
    selected: pair("#3a3a6a", "#e0e7ff"),
    /** The highlighted row inside the task-move dialog. */
    selectedMuted: pair("#444444", "#e8e8e8"),
    /** The green pulse confirming a note was saved. */
    saveFlash: pair("#1a7a1a", "#6fcf7f"),
    transparent: pair("transparent", "transparent"),
  },
  fg: {
    /** Body text. */
    default: pair("#e8e8e8", "#000000"),
    /** Note metadata — the timestamp and snippet line. */
    muted: pair("#999999", "#666666"),
    /** The account header and the secondary buttons on the pre-app screens. */
    dim: pair("#888888", "#666666"),
    /** The footer, and the underline under a link in note content — grey in both themes. */
    subtle: pair("#888888", "#888888"),
    /** The `- -` and `|` rules drawn as text. */
    rule: pair("#555555", "#000000"),
    /** Sign-in failure. */
    danger: pair("#ff8a8a", "#b00020"),
  },
  border: {
    /** Dropdown outlines and button outlines. */
    default: pair("#444444", "#cccccc"),
    /** Dropdown container edges, slightly lighter in light mode. */
    subtle: pair("#444444", "#dddddd"),
    /** The task-move dialog edge. */
    strong: pair("#555555", "#cccccc"),
    /** Above the mobile toolbar — darker than `default` so it reads as a seam, not an edge. */
    seam: pair("#333333", "#dddddd"),
  },
  overlay: {
    /** Behind the help overlay: near-opaque, so the app is hidden rather than dimmed. */
    help: pair("rgba(0,0,0,0.85)", "rgba(255,255,255,0.95)"),
    /** Behind the task-move dialog: a true scrim, identical in both themes. */
    scrim: pair("rgba(0,0,0,0.5)", "rgba(0,0,0,0.5)"),
  },
} as const;

/**
 * The app is monospace end to end — the layout leans on character cells (the `|` divider is
 * exactly `1ch` wide), so this is structural, not decorative.
 */
export const fonts = {
  mono: "'Fira Code', monospace",
} as const;

export const fontSizes = {
  /** Overlay titles. */
  lg: 16,
  /** Body, note titles, list rows. */
  md: 14,
  /** Note metadata, the footer, dialog labels. */
  sm: 12,
  /** Section headings inside the help overlay. */
  xs: 11,
  /** The "archived" divider label. */
  xxs: 10,
  /** The `#` tag-pin bullet, sized relative to the title it sits in. */
  bullet: "0.75em",
} as const;

/** Matches the `1.4` used for the rules, so their rows line up with note text. */
export const lineHeights = {
  normal: 1.4,
} as const;

export const space = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 6,
  md: 8,
  /** Vertical padding on touch targets — the mobile toolbar buttons, dialog labels. */
  touch: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

export const radii = {
  none: 0,
  sm: 4,
  md: 6,
} as const;

export const opacities = {
  /** Section labels and the "archived" divider. */
  label: 0.4,
  /** Archived rows in the list, and help-overlay key cells. */
  dim: 0.5,
  /** The `#` tag-pin bullet. */
  bullet: 0.6,
} as const;

export const sizes = {
  /** The list pane on a desktop viewport. */
  listPaneWidth: 250,
  /** One character cell — the vertical `|` rule is exactly this wide. */
  dividerWidth: "1ch",
  /** The help overlay's readable column. */
  overlayMaxWidth: 560,
  /** The task-move dialog. */
  dialogMinWidth: 220,
  /** The editor's tag-completion popup. */
  tagPopoverMinWidth: 120,
  /** Below this the two panes cannot sit side by side and stay usable (#108). */
  narrowBreakpoint: 640,
} as const;

export const zIndices = {
  /** The editor's tag popup, above note text. */
  popover: 10,
  /** The search tag dropdown, above both panes. */
  dropdown: 20,
  /** The help overlay. */
  overlay: 100,
  /** The task-move dialog, above the help overlay. */
  dialog: 200,
} as const;

/** Letter-spacing for the small uppercase labels. */
export const letterSpacings = {
  label: "0.08em",
} as const;

/** How long the save-confirmation background takes to fade back out. */
export const transitions = {
  flash: "background 0.3s ease",
} as const;

export const tokens = {
  colors,
  fonts,
  fontSizes,
  lineHeights,
  space,
  radii,
  opacities,
  sizes,
  zIndices,
  letterSpacings,
  transitions,
} as const;

export type Tokens = typeof tokens;
