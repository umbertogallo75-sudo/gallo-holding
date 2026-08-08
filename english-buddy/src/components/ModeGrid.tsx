import Link from "next/link";

const modes = [
  { icon:"✍︎", title:"2 min", meta:"One useful answer", it:"2 minuti: una risposta utile", mode:"text-2" },
  { icon:"✍︎", title:"5 min", meta:"Quick written chat", it:"5 minuti di conversazione scritta", mode:"text-5" },
  { icon:"🎧", title:"Listen + Type", meta:"Phase 3 · interface ready", it:"In arrivo: ascolta e scrivi", mode:"listen", disabled:true },
  { icon:"◉", title:"Voice", meta:"Phase 4 · realtime", it:"In arrivo: conversazione a voce", mode:"voice", disabled:true },
];

export function ModeGrid() {
  return <div className="modeGrid">
    {modes.map(m => m.disabled ? <div className="mode" key={m.mode} style={{opacity:.55}}><span className="modeIcon">{m.icon}</span><div><div className="modeTitle">{m.title}</div><div className="modeMeta">{m.meta}</div><div className="itHint">{m.it}</div></div></div> :
      <Link href={`/buddy?mode=${m.mode}`} className="mode" key={m.mode}><span className="modeIcon">{m.icon}</span><div><div className="modeTitle">{m.title}</div><div className="modeMeta">{m.meta}</div><div className="itHint">{m.it}</div></div></Link>)}
    <Link href="/buddy?mode=guided" className="mode wide"><span className="modeIcon">↗</span><div><div className="modeTitle">20 min guided session</div><div className="modeMeta">Business English, correction and adaptive review</div><div className="itHint">Sessione guidata di 20 minuti: business English, correzioni e ripasso</div></div></Link>
    <Link href="/buddy?mode=essentials" className="mode wide"><span className="modeIcon">🍽️</span><div><div className="modeTitle">Everyday essentials</div><div className="modeMeta">Basic words for restaurants, travel and getting around</div><div className="itHint">Parole di base per ristorante, viaggi e situazioni quotidiane</div></div></Link>
    <Link href="/buddy?mode=buddy" className="mode wide"><span className="modeIcon">☕︎</span><div><div className="modeTitle">Buddy question</div><div className="modeMeta">One quick question from your English-speaking friend</div><div className="itHint">Una domanda veloce dal tuo amico che parla inglese</div></div></Link>
    <Link href="/buddy?mode=surprise" className="mode wide"><span className="modeIcon">✦</span><div><div className="modeTitle">Surprise me</div><div className="modeMeta">Let the coach choose what matters most today</div><div className="itHint">Sorprendimi: lascia scegliere al coach cosa ti serve oggi</div></div></Link>
  </div>;
}
