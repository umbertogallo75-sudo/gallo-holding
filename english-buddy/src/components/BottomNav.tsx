"use client";

import Link, { useLinkStatus } from "next/link";

/**
 * Tab item content: the emoji swaps to a spinner the instant a navigation is
 * pending, so a tap is always visibly acknowledged even on a slow network.
 */
function NavItem({ icon, label }: { icon: string; label: string }) {
  const { pending } = useLinkStatus();
  return (
    <>
      <span className="navIcon" aria-hidden>{pending ? <span className="navSpin" /> : icon}</span> {label}
    </>
  );
}

/**
 * The five tabs.
 *
 * Sam used to open a sheet asking "scritta o vocale?" before any coaching
 * could start. It was a question in the way of an answer: somebody who taps
 * Sam wants to talk to Sam, and being asked to choose a medium first is the
 * kind of small friction that adds up to "I opened the app and did not know
 * what to do". The tab now goes straight into the written chat, which works
 * silently and in any situation, and the voice is a microphone inside that
 * chat for whoever wants it.
 *
 * Allenamenti is here for the same reason. All sixteen activities used to sit
 * behind a dashed grey line at the foot of the home screen — the weakest
 * thing on the page — and every single person interviewed said they had never
 * seen it. This bar is what people actually scan, so the door belongs in it.
 */
export function BottomNav({ active }: { active: "home" | "allenamenti" | "buddy" | "progress" | "profile" }) {
  return (
    <nav className="bottomNav">
      <Link className={active === "home" ? "active" : ""} href="/home"><NavItem icon="🏠" label="Oggi" /></Link>
      <Link className={active === "allenamenti" ? "active" : ""} href="/allenamenti"><NavItem icon="📋" label="Allenamenti" /></Link>
      <Link className={active === "buddy" ? "active" : ""} href="/buddy"><NavItem icon="💬" label="Sam" /></Link>
      <Link className={active === "progress" ? "active" : ""} href="/progress"><NavItem icon="📈" label="Progressi" /></Link>
      <Link className={active === "profile" ? "active" : ""} href="/profile"><NavItem icon="👤" label="Profilo" /></Link>
    </nav>
  );
}
