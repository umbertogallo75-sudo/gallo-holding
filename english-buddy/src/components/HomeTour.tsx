"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { track } from "@/lib/track-client";

const TOUR_KEY = "execlingo-tour-seen";
const WELCOME_KEY = "buddy-welcome-seen";

/**
 * Fifteen seconds, three things, on the real screen.
 *
 * The welcome pages explained the product to somebody who had not seen it
 * yet, which is the worst moment to explain anything: it was read as an
 * advert and closed. What people needed was much smaller and had to happen
 * here, on the home screen, pointing at the actual buttons — what to do
 * today, where everything else lives, and that Sam can be spoken to.
 */
const STOPS = [
  {
    selector: ".todayCard",
    title: "Una cosa al giorno",
    text: "Qui c'è la sessione di oggi, già scelta per te. Se hai cinque minuti, fai questa e hai fatto.",
  },
  {
    selector: ".trainRail",
    title: "Se vuoi scegliere tu",
    text: "Sedici allenamenti: a voce, ascolto, missioni, ripasso. Li trovi tutti nella scheda Allenamenti, qui sotto.",
  },
  {
    selector: 'nav.bottomNav a[href="/buddy"]',
    title: "Sam è sempre qui",
    text: "Scrivigli quando vuoi. E se puoi parlare, dalla sua chat parte una conversazione a voce vera.",
  },
] as const;

/** The tour waits its turn: never on top of the welcome pages. */
function shouldRun(): boolean {
  try {
    return localStorage.getItem(WELCOME_KEY) === "1" && localStorage.getItem(TOUR_KEY) !== "1";
  } catch {
    return false;
  }
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("execlingo-welcome-done", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("execlingo-welcome-done", callback);
    window.removeEventListener("storage", callback);
  };
}

export function HomeTour() {
  const ready = useSyncExternalStore(subscribe, shouldRun, () => false);
  const [step, setStep] = useState(0);
  const [closed, setClosed] = useState(false);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);

  const running = ready && !closed && step < STOPS.length;

  /**
   * Positions the highlight over the real element.
   *
   * Everything here writes to the DOM through refs rather than through state:
   * measuring in an effect and storing the numbers would re-render on every
   * scroll and every resize, for geometry React has no reason to know about.
   */
  useEffect(() => {
    if (!running) return;
    let lit: HTMLElement | null = null;

    function place() {
      const ring = ringRef.current, bubble = bubbleRef.current;
      if (!ring || !bubble) return;
      const target = document.querySelector<HTMLElement>(STOPS[step].selector);
      if (lit && lit !== target) { lit.classList.remove("tourLit"); lit = null; }
      // A screen without this element — the rail is absent until there is
      // something in it — still gets the words, just not the circle.
      if (!target) {
        ring.style.display = "none";
        bubble.style.bottom = "24px";
        bubble.style.top = "auto";
        return;
      }
      if (!lit) { lit = target; target.classList.add("tourLit"); }
      ring.style.display = "";
      const box = target.getBoundingClientRect();
      ring.style.left = `${box.left - 5}px`;
      ring.style.top = `${box.top - 5}px`;
      ring.style.width = `${box.width + 10}px`;
      ring.style.height = `${box.height + 10}px`;
      // Below the target when there is room under it, above it otherwise.
      const below = window.innerHeight - box.bottom;
      if (below > bubble.offsetHeight + 40) {
        bubble.style.top = `${box.bottom + 16}px`;
        bubble.style.bottom = "auto";
      } else {
        bubble.style.bottom = `${window.innerHeight - box.top + 16}px`;
        bubble.style.top = "auto";
      }
    }

    document.querySelector(STOPS[step].selector)?.scrollIntoView({ block: "center", behavior: "auto" });
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      lit?.classList.remove("tourLit");
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [running, step]);

  if (!running) return null;

  function finish(how: "done" | "skipped") {
    try { localStorage.setItem(TOUR_KEY, "1"); } catch { /* it will offer itself once more */ }
    track("tour_end", { where: how });
    setClosed(true);
  }

  const stop = STOPS[step];
  const last = step === STOPS.length - 1;

  return (
    <>
      <div className="tourVeil" onClick={() => (last ? finish("done") : setStep(step + 1))} />
      <div className="tourRing" ref={ringRef} aria-hidden />
      <div className="tourBubble" ref={bubbleRef} role="dialog" aria-label={stop.title}>
        <h3>{stop.title}</h3>
        <p>{stop.text}</p>
        <div className="tourFoot">
          <button type="button" className="tourSkip" onClick={() => finish("skipped")}>
            {last ? "" : "Salta"}
          </button>
          <span className="tourDots" aria-hidden>
            {STOPS.map((s, i) => <span key={s.selector} className={i === step ? "tourDot on" : "tourDot"} />)}
          </span>
          <button
            type="button"
            className="primary tourNext"
            onClick={() => (last ? finish("done") : setStep(step + 1))}
          >
            {last ? "Iniziamo" : "Avanti"}
          </button>
        </div>
      </div>
    </>
  );
}
