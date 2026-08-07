import Link from "next/link";

const modes = [
  { icon:"✍︎", title:"2 min", meta:"One useful answer", mode:"text-2" },
  { icon:"✍︎", title:"5 min", meta:"Quick written chat", mode:"text-5" },
  { icon:"🎧", title:"Listen + Type", meta:"Phase 3 · interface ready", mode:"listen", disabled:true },
  { icon:"◉", title:"Voice", meta:"Phase 4 · realtime", mode:"voice", disabled:true },
];

export function ModeGrid() {
  return <div className="modeGrid">
    {modes.map(m => m.disabled ? <div className="mode" key={m.mode} style={{opacity:.55}}><span className="modeIcon">{m.icon}</span><div><div className="modeTitle">{m.title}</div><div className="modeMeta">{m.meta}</div></div></div> :
      <Link href={`/buddy?mode=${m.mode}`} className="mode" key={m.mode}><span className="modeIcon">{m.icon}</span><div><div className="modeTitle">{m.title}</div><div className="modeMeta">{m.meta}</div></div></Link>)}
    <Link href="/buddy?mode=guided" className="mode wide"><span className="modeIcon">↗</span><div><div className="modeTitle">20 min guided session</div><div className="modeMeta">Business English, correction and adaptive review</div></div></Link>
    <Link href="/buddy?mode=surprise" className="mode wide"><span className="modeIcon">✦</span><div><div className="modeTitle">Surprise me</div><div className="modeMeta">Let the coach choose what matters most today</div></div></Link>
  </div>;
}
