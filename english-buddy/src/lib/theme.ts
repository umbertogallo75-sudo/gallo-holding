/**
 * Light, dark, or whatever the phone says.
 *
 * The app had only the third: the stylesheet followed `prefers-color-scheme`
 * and nothing could overrule it. That was fine until the iOS wrapper started
 * forcing its whole scene into dark mode, at which point every iPhone showed
 * the dark palette even with the system set to light, and no setting on any
 * screen could argue with it.
 *
 * So the choice is stamped as `data-theme` on the root element and the CSS
 * lets it win in both directions. Nothing there means "follow the system",
 * which stays the default.
 */

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_KEY = "execlingo-theme";

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/**
 * Applies a choice to the live document and remembers it on this device.
 *
 * Per-device on purpose: the phone in the sun and the laptop at night are not
 * the same question, and answering it should not need an account.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* private browsing: the choice holds for this page and no longer */
  }
}

export function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (isTheme(stored)) return stored;
  } catch {
    /* unreadable storage is the same as no choice */
  }
  return "system";
}

/**
 * Runs before the first paint, straight from the document head.
 *
 * It has to be inline and synchronous: anything deferred repaints the page in
 * the wrong colours first, which is worse than not offering the setting at
 * all. Kept to one line, with its own try/catch, because a throw here would
 * stop the page from rendering.
 */
export const THEME_SCRIPT =
  `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});` +
  `if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;
