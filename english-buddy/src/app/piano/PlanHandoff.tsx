"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** How long the plan stays on screen before the session it describes begins. */
const HANDOFF_MS = 2500;

/**
 * Starts the first session by itself.
 *
 * There is no button on purpose. The screen before this one already asked
 * three questions; asking a fourth — "ready?" — would undo the point of
 * answering them.
 */
export function PlanHandoff({ mode }: { mode: string }) {
  const router = useRouter();

  useEffect(() => {
    const go = setTimeout(() => {
      router.replace(`/buddy?mode=${encodeURIComponent(mode)}&prima=1`);
    }, HANDOFF_MS);
    return () => clearTimeout(go);
  }, [mode, router]);

  return <p className="planNote">Preparo la prima sessione…</p>;
}
