/**
 * @notedude/ui — the notedude design system.
 *
 * Wrap any tree in `<ThemeProvider theme="dark">` before using these; components read
 * colours from it and throw without one.
 */

export {
  parseNote,
  toggleHeading,
  clearHeading,
  toggleList,
  continueList,
  indentList,
  stripMarkdownPrefix,
  type Block,
  type HeadingLevel,
  type ListMarker,
  type TextEdit,
} from "./markdown";

export {
  tokens,
  colors,
  fonts,
  fontSizes,
  fontWeights,
  lineHeights,
  space,
  radii,
  opacities,
  sizes,
  zIndices,
  letterSpacings,
  transitions,
  type Tokens,
  type ThemedColor,
} from "./tokens";

export {
  ThemeProvider,
  useTheme,
  type Theme,
  type ThemeName,
  type ThemeProviderProps,
  type ResolvedColors,
} from "./theme";

export { Button, type ButtonProps, type ButtonVariant } from "./Button";
export { Rule, PaneDivider, type RuleProps, type PaneDividerProps } from "./Rule";
export { SearchBar, type SearchBarProps } from "./SearchBar";
export {
  TagDropdown,
  type TagDropdownProps,
  type TagDropdownVariant,
  type TagSuggestion,
} from "./TagDropdown";
export { NoteList, type NoteListProps } from "./NoteList";
export { NoteListItem, type NoteListItemProps } from "./NoteListItem";
export { NoteContent, NoteText, type NoteContentProps, type NoteTextProps } from "./NoteContent";
export { NoteEditor, type NoteEditorProps } from "./NoteEditor";
export {
  HelpOverlay,
  type HelpOverlayProps,
  type ShortcutRow,
  type ShortcutSection,
} from "./HelpOverlay";
export { TaskMoveDialog, type TaskMoveDialogProps } from "./TaskMoveDialog";
export {
  AppShell,
  AppSlot,
  AccountHeader,
  type AppShellProps,
  type AppSlotProps,
  type AccountHeaderProps,
} from "./AppShell";
export { Footer, type FooterProps } from "./Footer";
export { ModeLine, type ModeLineProps, type ModeLineSaveState } from "./ModeLine";
export { MobileToolbar, type MobileToolbarProps } from "./MobileToolbar";
export {
  LoginScreen,
  LoadingScreen,
  type LoginScreenProps,
  type LoadingScreenProps,
} from "./screens";

export {
  getNoteTitle,
  getNoteMetaSnippet,
  formatTimestamp,
  renderWithLinks,
  contentWithoutTags,
  type NoteSummary,
} from "./noteText";
