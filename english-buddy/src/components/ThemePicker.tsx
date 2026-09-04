"use client";

import { useState, useSyncExternalStore } from "react";
import { applyTheme, readTheme, THEMES, type Theme } from "@/lib/theme";

const LABELS: Record<Theme, { label: string; meta: string; icon: string }> = {
  system: { icon: "📱", label: "Come il telefono", meta: "Segue l'impostazione del sistema" },
  light: { icon: "☀️", label: "Chiaro", meta: "Sempre chiaro, anche di notte" },
  dark: { icon: "🌙", label: "Scuro", meta: "Sempre scuro, anche di giorno" },
};

/** Another tab changing the setting is the one external source worth hearing. */
function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/**
 * The three-way theme choice.
 *
 * Nothing is marked as chosen until the device has been read, because the
 * stored value only exists in the browser: rendering "Come il telefono" on the
 * server and correcting it a moment later would look like the setting had
 * reset itself.
 */
export function ThemePicker() {
  const stored = useSyncExternalStore<Theme | null>(subscribe, readTheme, () => null);
  const [picked, setPicked] = useState<Theme | null>(null);
  const theme = picked ?? stored;

  function choose(next: Theme) {
    setPicked(next);
    applyTheme(next);
  }

  return (
    <section className="card">
      <h2>Aspetto</h2>
      <p className="composerNote" style={{ marginTop: 2 }}>
        Vale su questo dispositivo. Cambia subito, senza ricaricare.
      </p>
      <div className="themeRow" role="radiogroup" aria-label="Tema">
        {THEMES.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={theme === option}
            className={theme === option ? "themeOption on" : "themeOption"}
            onClick={() => choose(option)}
          >
            <span className="themeIcon" aria-hidden>{LABELS[option].icon}</span>
            <strong>{LABELS[option].label}</strong>
            <span className="themeMeta">{LABELS[option].meta}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
