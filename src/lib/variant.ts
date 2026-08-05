/**
 * Build variants (#151).
 *
 * One codebase, two products: `notedude` (every note) and `todude` (only notes carrying a
 * `#tasks-*` tag). There is no task data model to fork — a task *is* a note with a tag, and
 * a task list is a search filter — so the two products differ by this record and nothing else.
 * `App.tsx` reads it; it holds no `if (todude)` branches.
 *
 * The variant is resolved **once at build time** from `NEXT_PUBLIC_APP_VARIANT`, which Next
 * inlines into the static export. A runtime flag would put both products on one URL, which is
 * exactly what the separate-branding requirement rules out.
 */

export type VariantId = "notedude" | "todude";

/** The five task lists, in the order they are offered everywhere. */
export const TASK_LISTS: readonly string[] = [
  "#tasks-inbox",
  "#tasks-today",
  "#tasks-nearterm",
  "#tasks-longterm",
  "#tasks-done",
];

/** A note the app starts with when there is no account behind it — signed-out and `/test`. */
export interface SeedNote {
  id: string;
  content: string;
  pinned: boolean;
  tagPinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Variant {
  id: VariantId;
  /** Product name: document title, PWA name, login screen, footer credit. */
  name: string;
  description: string;
  /** Path to this product's PWA manifest under `public/`. */
  manifest: string;
  icons: {
    /** `<link rel="icon">` entries, in the order they should be offered. */
    icon: { href: string; sizes?: string; type?: string }[];
    /** iOS home-screen icon. Must be PNG — Safari does not accept SVG here. */
    apple: string;
  };
  /** Filter applied on first load. Empty opens unfiltered. */
  initialFilter: string;
  /** Lists shown as first-class navigation. Empty means no nav bar. */
  taskLists: readonly string[];
  /** Hide every note that carries no `#tasks-*` tag. */
  tasksOnly: boolean;
  /**
   * The list a new note falls into when it would otherwise carry no list tag. Without this,
   * `Shift+C` — which deliberately clears the active filter — would create a task that is
   * invisible the instant it exists.
   */
  fallbackList: string | null;
  seed: SeedNote[];
  /** First note in demo mode. */
  demoWelcome: string;
}

const seed = (
  id: string,
  content: string,
  createdAt: number,
  pinned = false
): SeedNote => ({ id, content, pinned, tagPinned: false, createdAt, updatedAt: createdAt });

const NOTEDUDE: Variant = {
  id: "notedude",
  name: "notedude",
  description: "Keyboard-driven note-taking app",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { href: "/notedude-n_d-icon-32.png", sizes: "32x32" },
      { href: "/notedude-n_d-icon-16.png", sizes: "16x16" },
    ],
    apple: "/notedude-n_d-icon-180.png",
  },
  initialFilter: "",
  taskLists: [],
  tasksOnly: false,
  fallbackList: null,
  seed: [
    seed("1", "Welcome to notedude #intro\nYour keyboard-driven note app.", 1, true),
    seed("2", "Getting started #intro #guide\nPress 'c' to create a new note.\nPress '/' to search.", 2),
    seed("3", "Keyboard shortcuts #guide\nEnter to edit, Esc to save.", 3),
    seed("4", "Tips #tips\nUse 'j' and 'k' to navigate.", 4),
    seed("5", "Projects #project\nOrganize notes by project.", 5),
    seed("6", "Archive #archive\nOld notes go here.", 6),
    seed("7", "Ideas #ideas\nCapture them here.", 7),
  ],
  demoWelcome: "Demo mode - data is stored locally only.\n\nPress ? for keyboard shortcuts.",
};

const TODUDE: Variant = {
  id: "todude",
  name: "todude",
  description: "Keyboard-driven to-do lists",
  manifest: "/manifest.todude.json",
  icons: {
    icon: [
      { href: "/todude-t_d-icon-32.png", sizes: "32x32" },
      { href: "/todude-t_d-icon-16.png", sizes: "16x16" },
      { href: "/todude-t_d-icon.svg", type: "image/svg+xml" },
    ],
    apple: "/todude-t_d-icon-180.png",
  },
  initialFilter: "#tasks-today",
  taskLists: TASK_LISTS,
  tasksOnly: true,
  fallbackList: "#tasks-inbox",
  // The two untagged notes are not filler. Both products read one `users/{uid}/notes`
  // collection, so a real todude account holds notes todude must not show — the seed has to
  // contain that case or `/test/todude` would never exercise the scope rule.
  seed: [
    seed("t1", "Grocery list\nmilk, eggs, coffee", 1),
    seed("t2", "Meeting notes #work\nQ3 planning session", 2),
    seed("t3", "Welcome to todude #tasks-today\nPress ⌘/ (Ctrl+/) for keyboard shortcuts.", 3, true),
    seed("t4", "Triage the inbox #tasks-inbox", 4),
    seed("t5", "Ship the build variant #tasks-today", 5),
    seed("t6", "Plan next quarter #tasks-nearterm", 6),
    seed("t7", "Learn a language #tasks-longterm", 7),
    seed("t8", "Set up the repo #tasks-done", 8),
  ],
  // Carries a list tag deliberately: the scope rule would hide an untagged welcome note, and
  // demo mode would open on an empty list.
  demoWelcome: "Demo mode #tasks-today\ntasks are stored locally only.\n\nPress ? for keyboard shortcuts.",
};

export const VARIANTS: Record<VariantId, Variant> = {
  notedude: NOTEDUDE,
  todude: TODUDE,
};

/**
 * Anything unrecognised falls back to `notedude`, so a typo in the CI environment ships the
 * default product rather than failing the build — the deploy stays green and the mistake is
 * visible in the app itself.
 */
export function resolveVariant(id: string | undefined | null): Variant {
  return id === "todude" ? VARIANTS.todude : VARIANTS.notedude;
}

/** The variant this bundle was built as. */
export const activeVariant = resolveVariant(process.env.NEXT_PUBLIC_APP_VARIANT);
