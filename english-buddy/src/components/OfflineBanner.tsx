"use client";

import { useEffect, useState } from "react";

/**
 * Global connectivity notice: English Buddy needs the internet (AI coach,
 * voice, sync). Shown fixed at the top of every screen while offline.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="offlineBar" role="alert">
      📶 <strong>No internet connection.</strong> English Buddy needs the internet to work.
      <span style={{ display: "block", fontSize: 13, opacity: 0.9 }}>Sei offline: English Buddy ha bisogno di Internet per funzionare. Riconnettiti e riprova.</span>
    </div>
  );
}
