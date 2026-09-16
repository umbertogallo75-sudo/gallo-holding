"use client";

import { useEffect, useRef, useState } from "react";

type Report = { body: string; strengths: string[]; focus: string[]; createdAt: string | null };

/**
 * Sam's written verdict, fetched after the page is already readable.
 *
 * The marks arrive with the page because they are already in the database;
 * this is the paragraph that has to be written, and writing it reads the whole
 * history. Asking for it on the server would mean a report card that takes
 * five seconds to open — so the page opens now, and the words land when they
 * land.
 */
export function CoachVerdict() {
  const [report, setReport] = useState<Report | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "empty">("loading");
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    void (async () => {
      try {
        const response = await fetch("/api/pagella");
        const data = await response.json();
        if (response.ok && data.report?.body) {
          setReport(data.report);
          setState("ready");
        } else {
          setState("empty");
        }
      } catch {
        setState("empty");
      }
    })();
  }, []);

  if (state === "loading") {
    return (
      <section className="card">
        <div className="kicker">Il giudizio di Sam</div>
        <p className="muted" style={{ margin: "8px 0 0" }}>Sta rileggendo le tue conversazioni…</p>
      </section>
    );
  }

  if (state === "empty" || !report) {
    return (
      <section className="card">
        <div className="kicker">Il giudizio di Sam</div>
        <p className="muted" style={{ margin: "8px 0 0" }}>
          Arriva dopo qualche conversazione: senza averti sentito parlare, un giudizio sarebbe inventato.
        </p>
      </section>
    );
  }

  return (
    <section className="card">
      <div className="kicker">Il giudizio di Sam</div>
      <p style={{ margin: "8px 0 0", fontSize: 15.5, lineHeight: 1.6 }}>{report.body}</p>
      {report.strengths.length ? (
        <>
          <h3 className="verdictHead">Su cosa puoi contare</h3>
          <ul className="verdictList">
            {report.strengths.map((line, i) => <li key={i}>✓ {line}</li>)}
          </ul>
        </>
      ) : null}
      {report.focus.length ? (
        <>
          <h3 className="verdictHead">Dove conviene lavorare adesso</h3>
          <ul className="verdictList verdictFocus">
            {report.focus.map((line, i) => <li key={i}>→ {line}</li>)}
          </ul>
        </>
      ) : null}
    </section>
  );
}
