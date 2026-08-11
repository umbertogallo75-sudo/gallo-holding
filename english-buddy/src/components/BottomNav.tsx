"use client";

import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

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

export function BottomNav({ active }: { active: "home" | "buddy" | "progress" | "profile" }) {
  const [samOpen, setSamOpen] = useState(false);
  const [going, setGoing] = useState<"" | "text" | "voice">("");
  const router = useRouter();

  function go(kind: "text" | "voice") {
    setGoing(kind);
    router.push(kind === "text" ? "/buddy" : "/voice");
  }

  return <>
    {samOpen ? (
      <div className="sheetBack" onClick={() => { if (!going) setSamOpen(false); }}>
        <div className="sheet" role="dialog" aria-label="Scegli come allenarti" onClick={(e) => e.stopPropagation()}>
          <div className="kicker" style={{ marginBottom: 6 }}>Sam · come vuoi allenarti?</div>
          <button type="button" className="sheetOpt" disabled={going !== ""} onClick={() => go("text")}>
            <span className="modeIcon" aria-hidden>{going === "text" ? <span className="navSpin" /> : "💬"}</span>
            <span>
              <strong>Scritta</strong>
              <span className="itHint" style={{ display: "block" }}>Chat con Sam: leggi, scrivi, correzioni sul momento</span>
            </span>
          </button>
          <button type="button" className="sheetOpt" disabled={going !== ""} onClick={() => go("voice")}>
            <span className="modeIcon" aria-hidden>{going === "voice" ? <span className="navSpin" /> : "🎙️"}</span>
            <span>
              <strong>Vocale</strong>
              <span className="itHint" style={{ display: "block" }}>Parla con Sam a voce, come una vera call</span>
            </span>
          </button>
          <button type="button" className="pill" style={{ marginTop: 12, width: "100%" }} disabled={going !== ""} onClick={() => setSamOpen(false)}>Annulla</button>
        </div>
      </div>
    ) : null}
    <nav className="bottomNav">
      <Link className={active === "home" ? "active" : ""} href="/home"><NavItem icon="🏠" label="Oggi" /></Link>
      <button type="button" className={active === "buddy" ? "active" : ""} onClick={() => setSamOpen(true)}>
        <span className="navIcon" aria-hidden>💬</span> Sam
      </button>
      <Link className={active === "progress" ? "active" : ""} href="/progress"><NavItem icon="📈" label="Progressi" /></Link>
      <Link className={active === "profile" ? "active" : ""} href="/profile"><NavItem icon="👤" label="Profilo" /></Link>
    </nav>
  </>;
}
