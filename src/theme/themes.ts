/**
 * PostCat theming engine.
 *
 * A theme is a plain JSON object. Every entry under `colors` maps 1:1 to a CSS
 * custom property: `"panel-2": "#221d17"` becomes `--panel-2: #221d17`. That
 * means a user can override any token — or add new ones — just by editing JSON,
 * with no code change. Fonts and a couple of UI knobs work the same way.
 */

export interface ThemeFonts {
  /** UI font (menus, labels, buttons) → --sans */
  system?: string;
  /** editor & response font (code, JSON) → --mono */
  editor?: string;
}

export interface Theme {
  id: string;
  name: string;
  /** base appearance — drives native color-scheme (scrollbars, form controls) */
  type: "dark" | "light";
  author?: string;
  colors: Record<string, string>;
  fonts?: ThemeFonts;
  ui?: { radius?: string; shadow?: string };
  /** injected at load time; not part of the JSON on disk */
  __source?: "builtin" | "user";
  __file?: string;
}

/** Editor/font overrides the user sets in Settings, applied on top of the theme. */
export interface FontOverride {
  systemFamily?: string;
  systemSize?: number;
  editorFamily?: string;
  editorSize?: number;
  /** spaces (or a tab) per indent level — used by editors, Beautify and pretty JSON */
  indentCount?: number;
  indentType?: "space" | "tab";
}

/** Resolved indentation: the string for one level and the JSON.stringify arg. */
export function indentUnitStr(f?: FontOverride): string {
  return f?.indentType === "tab" ? "\t" : " ".repeat(f?.indentCount ?? DEFAULT_INDENT);
}
export function indentJsonArg(f?: FontOverride): string | number {
  return f?.indentType === "tab" ? "\t" : f?.indentCount ?? DEFAULT_INDENT;
}

export const DEFAULT_SANS =
  'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const DEFAULT_MONO =
  '"Cascadia Code", "JetBrains Mono", "Fira Code", Consolas, ui-monospace, monospace';
export const DEFAULT_UI_SIZE = 14;
export const DEFAULT_EDITOR_SIZE = 13;
export const DEFAULT_INDENT = 2;

const SANS = DEFAULT_SANS;
const MONO = DEFAULT_MONO;

export const DARK: Theme = {
  id: "postcat-dark",
  name: "PostCat Dark",
  type: "dark",
  author: "PostCat",
  colors: {
    bg: "#141210",
    panel: "#1b1713",
    "panel-2": "#221d17",
    line: "#2d261f",
    "line-2": "#3c332a",
    text: "#f1eae1",
    "text-soft": "#b4a99c",
    "text-faint": "#7d7367",
    accent: "#f0713f",
    "accent-2": "#ff8a5c",
    "accent-soft": "#33241b",
    "on-accent": "#1a0e07",
    get: "#4cc088",
    post: "#e2ac36",
    put: "#5b93ee",
    patch: "#a97ef0",
    delete: "#ec6060",
    head: "#8fb0c9",
    options: "#c9a2d8",
    "s-2xx": "#4cc088",
    "s-3xx": "#5b93ee",
    "s-4xx": "#e2ac36",
    "s-5xx": "#ec6060",
    "j-key": "#f0a978",
    "j-str": "#6fce9c",
    "j-num": "#77a9f5",
    "j-bool": "#d38ef0",
    "j-null": "#9b8f82",
  },
  fonts: { system: SANS, editor: MONO },
  ui: {
    radius: "10px",
    shadow: "0 1px 2px rgba(0,0,0,.3), 0 10px 26px -14px rgba(0,0,0,.6)",
  },
  __source: "builtin",
};

export const LIGHT: Theme = {
  id: "postcat-light",
  name: "PostCat Light",
  type: "light",
  author: "PostCat",
  colors: {
    bg: "#f4f1ec",
    panel: "#fffdfa",
    "panel-2": "#f7f2ec",
    line: "#e6ddd2",
    "line-2": "#d6c9bb",
    text: "#241f1b",
    "text-soft": "#5c5349",
    "text-faint": "#8d8378",
    accent: "#d8532a",
    "accent-2": "#c2461f",
    "accent-soft": "#f2e4da",
    "on-accent": "#fffaf6",
    get: "#1f9463",
    post: "#b3820f",
    put: "#2b64c4",
    patch: "#7d47cf",
    delete: "#cf3b3b",
    head: "#4d7893",
    options: "#8a5aa6",
    "s-2xx": "#1f9463",
    "s-3xx": "#2b64c4",
    "s-4xx": "#b3820f",
    "s-5xx": "#cf3b3b",
    "j-key": "#b8531d",
    "j-str": "#1f8a52",
    "j-num": "#2b64c4",
    "j-bool": "#7d47cf",
    "j-null": "#8d8378",
  },
  fonts: { system: SANS, editor: MONO },
  ui: {
    radius: "10px",
    shadow: "0 1px 2px rgba(70,55,40,.06), 0 10px 26px -16px rgba(70,55,40,.22)",
  },
  __source: "builtin",
};

export const NORD: Theme = {
  id: "postcat-nord",
  name: "Nord",
  type: "dark",
  author: "PostCat",
  colors: {
    bg: "#2e3440",
    panel: "#333b49",
    "panel-2": "#3b4252",
    line: "#3b4252",
    "line-2": "#4c566a",
    text: "#eceff4",
    "text-soft": "#d8dee9",
    "text-faint": "#7b88a1",
    accent: "#88c0d0",
    "accent-2": "#8fbcbb",
    "accent-soft": "#2b3a41",
    "on-accent": "#22303a",
    get: "#a3be8c",
    post: "#ebcb8b",
    put: "#81a1c1",
    patch: "#b48ead",
    delete: "#bf616a",
    head: "#8fbcbb",
    options: "#b48ead",
    "s-2xx": "#a3be8c",
    "s-3xx": "#81a1c1",
    "s-4xx": "#ebcb8b",
    "s-5xx": "#bf616a",
    "j-key": "#8fbcbb",
    "j-str": "#a3be8c",
    "j-num": "#b48ead",
    "j-bool": "#d08770",
    "j-null": "#616e88",
  },
  fonts: { system: SANS, editor: MONO },
  ui: {
    radius: "10px",
    shadow: "0 1px 2px rgba(0,0,0,.35), 0 10px 26px -14px rgba(0,0,0,.6)",
  },
  __source: "builtin",
};

export const SOLARIZED: Theme = {
  id: "postcat-solarized",
  name: "Solarized",
  type: "dark",
  author: "PostCat",
  colors: {
    bg: "#002b36",
    panel: "#073642",
    "panel-2": "#0c3d49",
    line: "#0f4653",
    "line-2": "#1d5561",
    text: "#c5cec9",
    "text-soft": "#93a1a1",
    "text-faint": "#5f7680",
    accent: "#268bd2",
    "accent-2": "#4ba3e3",
    "accent-soft": "#0a3a4a",
    "on-accent": "#eef7fb",
    get: "#859900",
    post: "#b58900",
    put: "#268bd2",
    patch: "#6c71c4",
    delete: "#dc322f",
    head: "#2aa198",
    options: "#d33682",
    "s-2xx": "#859900",
    "s-3xx": "#268bd2",
    "s-4xx": "#b58900",
    "s-5xx": "#dc322f",
    "j-key": "#2aa198",
    "j-str": "#859900",
    "j-num": "#6c71c4",
    "j-bool": "#d33682",
    "j-null": "#586e75",
  },
  fonts: { system: SANS, editor: MONO },
  ui: {
    radius: "10px",
    shadow: "0 1px 2px rgba(0,0,0,.4), 0 10px 26px -14px rgba(0,0,0,.65)",
  },
  __source: "builtin",
};

export const BUILTIN_THEMES: Theme[] = [DARK, LIGHT, NORD, SOLARIZED];

/** Apply a theme to the document, with optional user font overrides on top. */
export function applyTheme(theme: Theme, fonts?: FontOverride) {
  const s = document.documentElement.style;

  for (const [key, value] of Object.entries(theme.colors ?? {})) {
    s.setProperty(`--${key}`, value);
  }

  const sysFam = fonts?.systemFamily || theme.fonts?.system || DEFAULT_SANS;
  const editFam = fonts?.editorFamily || theme.fonts?.editor || DEFAULT_MONO;
  s.setProperty("--sans", sysFam);
  s.setProperty("--mono", editFam);
  s.setProperty("--ui-font-size", `${fonts?.systemSize ?? DEFAULT_UI_SIZE}px`);
  s.setProperty("--editor-font-size", `${fonts?.editorSize ?? DEFAULT_EDITOR_SIZE}px`);

  if (theme.ui?.radius) s.setProperty("--radius", theme.ui.radius);
  if (theme.ui?.shadow) s.setProperty("--shadow", theme.ui.shadow);

  document.documentElement.setAttribute("data-theme", theme.type);
  s.colorScheme = theme.type;
}

/** Loosely validate an object parsed from a user theme file. */
export function coerceTheme(raw: unknown, file: string): Theme | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!o.colors || typeof o.colors !== "object") return null;
  const id = typeof o.id === "string" ? o.id : `user:${file}`;
  const name = typeof o.name === "string" ? o.name : file.replace(/\.json$/i, "");
  const type = o.type === "light" ? "light" : "dark";
  return {
    id,
    name,
    type,
    author: typeof o.author === "string" ? o.author : undefined,
    colors: o.colors as Record<string, string>,
    fonts: (o.fonts as ThemeFonts) ?? undefined,
    ui: (o.ui as Theme["ui"]) ?? undefined,
    __source: "user",
    __file: file,
  };
}

/** Serialize a theme to the on-disk JSON shape (drops internal fields). */
export function themeToJson(theme: Theme): string {
  const { id, name, type, author, colors, fonts, ui } = theme;
  return JSON.stringify(
    { id, name, type, author: author ?? "me", colors, fonts, ui },
    null,
    2,
  );
}
