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
 * The four tabs.
 *
 * Sam used to open a sheet asking "scritta o vocale?" before any coaching
 * could start. It was a question in the way of an answer: somebody who taps
 * Sam wants to talk to Sam, and being asked to choose a medium first is the
 * kind of small friction that adds up to "I opened the app and did not know
 * what to do". The tab now goes straight into the written chat, which works
 * silently and in any situation, and the voice is a microphone inside that
 * chat for whoever wants it.
 */
export function BottomNav({ active }: { active: "home" | "buddy" | "progress" | "profile" }) {
  return (
    <nav className="bottomNav">
      <Link className={active === "home" ? "active" : ""} href="/home"><NavItem icon="🏠" label="Oggi" /></Link>
      <Link className={active === "buddy" ? "active" : ""} href="/buddy"><NavItem icon="💬" label="Sam" /></Link>
      <Link className={active === "progress" ? "active" : ""} href="/progress"><NavItem icon="📈" label="Progressi" /></Link>
      <Link className={active === "profile" ? "active" : ""} href="/profile"><NavItem icon="👤" label="Profilo" /></Link>
    </nav>
  );
}
