import Link from "next/link";

const modes = [
  { icon:"✍︎", title:"2 min", meta:"One useful answer", it:"2 minuti: una risposta utile", mode:"text-2" },
  { icon:"✍︎", title:"5 min", meta:"Quick written chat", it:"5 minuti di conversazione scritta", mode:"text-5" },
  { icon:"🎧", title:"Listen + Type", meta:"Phase 3 · interface ready", it:"In arrivo: ascolta e scrivi", mode:"listen", disabled:true },
  { icon:"◉", title:"Voice", meta:"Phase 4 · realtime", it:"In arrivo: conversazione a voce", mode:"voice", disabled:true },
];

function Wide({ href, icon, title, meta, it }: { href:string; icon:string; title:string; meta:string; it:string }) {
  return <Link href={href} className="mode wide"><span className="modeIcon">{icon}</span><div><div className="modeTitle">{title}</div><div className="modeMeta">{meta}</div><div className="itHint">{it}</div></div></Link>;
}

export function ModeGrid({ beginner = false }: { beginner?: boolean }) {
  return <div className="modeGrid">
    {beginner ? <>
      <Wide href="/buddy?mode=zero" icon="🌱" title="Start from Zero · guided path" meta="Today's step-by-step micro-lesson: listen, read, repeat, use" it="Il percorso guidato di oggi: ascolta, leggi, ripeti, usa — un passo alla volta" />
      <Wide href="/buddy?mode=mission" icon="🎯" title="Real-life mission" meta="Introduce yourself, order food, survive the airport…" it="Una missione reale: presentarti, ordinare, cavartela in viaggio…" />
    </> : null}
    {modes.map(m => m.disabled ? <div className="mode" key={m.mode} style={{opacity:.55}}><span className="modeIcon">{m.icon}</span><div><div className="modeTitle">{m.title}</div><div className="modeMeta">{m.meta}</div><div className="itHint">{m.it}</div></div></div> :
      <Link href={`/buddy?mode=${m.mode}`} className="mode" key={m.mode}><span className="modeIcon">{m.icon}</span><div><div className="modeTitle">{m.title}</div><div className="modeMeta">{m.meta}</div><div className="itHint">{m.it}</div></div></Link>)}
    {!beginner ? <>
      <Wide href="/buddy?mode=guided" icon="↗" title="20 min guided session" meta="Business English, correction and adaptive review" it="Sessione guidata di 20 minuti: business English, correzioni e ripasso" />
      <Wide href="/buddy?mode=mission" icon="🎯" title="Real-life mission" meta="Meetings, calls, negotiation, travel — one goal per scene" it="Una missione reale: riunioni, telefonate, trattative, viaggi" />
    </> : <Wide href="/buddy?mode=guided" icon="↗" title="20 min guided session" meta="A longer guided lesson when you have time" it="Una lezione guidata più lunga, quando hai tempo" />}
    <Wide href="/buddy?mode=essentials" icon="🍽️" title="Everyday essentials" meta="Basic words for restaurants, travel and getting around" it="Parole di base per ristorante, viaggi e situazioni quotidiane" />
    <Wide href="/buddy?mode=buddy" icon="☕︎" title="Buddy question" meta="One quick question from your English-speaking friend" it="Una domanda veloce dal tuo amico che parla inglese" />
    <Wide href="/rescue" icon="🆘" title="English Rescue" meta="I need English now — say it right, right now" it="Mi serve l'inglese adesso: scrivi in italiano, te lo do in inglese con l'audio" />
    <Wide href="/buddy?mode=surprise" icon="✦" title="Surprise me" meta="Let the coach choose what matters most today" it="Sorprendimi: lascia scegliere al coach cosa ti serve oggi" />
  </div>;
}
