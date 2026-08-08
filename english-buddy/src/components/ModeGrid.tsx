import Link from "next/link";

// Each activity gets its own tint so the Home reads at a glance.
const tint = (hex: string) => ({ background: `color-mix(in srgb, ${hex} 18%, var(--surface))` });
const cardTint = (hex: string) => ({
  background: `linear-gradient(135deg, color-mix(in srgb, ${hex} 10%, var(--surface)), var(--surface) 75%)`,
  borderColor: `color-mix(in srgb, ${hex} 30%, var(--line))`,
});

type ModeCard = { icon:string; title:string; meta:string; it:string; mode:string; color:string; href?:string };
const modes: ModeCard[] = [
  { icon:"✍︎", title:"2 min", meta:"One useful answer", it:"2 minuti: una risposta utile", mode:"text-2", color:"#3b6ea5" },
  { icon:"✍︎", title:"5 min", meta:"Quick written chat", it:"5 minuti di conversazione scritta", mode:"text-5", color:"#3b6ea5" },
  { icon:"🎧", title:"Listen + Type", meta:"Hear a sentence, type what you heard", it:"Ascolta una frase e scrivi quello che senti", mode:"listen", color:"#7a5aa0" },
  { icon:"🎙️", title:"Voice", meta:"Real conversation, out loud", it:"Parla davvero col coach, a voce", mode:"voice", color:"#b0567a", href:"/voice" },
];

function Wide({ href, icon, title, meta, it, color }: { href:string; icon:string; title:string; meta:string; it:string; color:string }) {
  return <Link href={href} className="mode wide" style={cardTint(color)}><span className="modeIcon" style={tint(color)}>{icon}</span><div><div className="modeTitle">{title}</div><div className="modeMeta">{meta}</div><div className="itHint">{it}</div></div></Link>;
}

export function ModeGrid({ beginner = false }: { beginner?: boolean }) {
  return <div className="modeGrid">
    {beginner ? <>
      <Wide href="/buddy?mode=zero" icon="🌱" title="Start from Zero · guided path" meta="Today's step-by-step micro-lesson: listen, read, repeat, use" it="Il percorso guidato di oggi: ascolta, leggi, ripeti, usa — un passo alla volta" color="#1d6b4c" />
      <Wide href="/buddy?mode=mission" icon="🎯" title="Real-life mission" meta="Introduce yourself, order food, survive the airport…" it="Una missione reale: presentarti, ordinare, cavartela in viaggio…" color="#d98e2b" />
    </> : null}
    {modes.map(m =>
      <Link href={m.href ?? `/buddy?mode=${m.mode}`} className="mode" key={m.mode} style={cardTint(m.color)}><span className="modeIcon" style={tint(m.color)}>{m.icon}</span><div><div className="modeTitle">{m.title}</div><div className="modeMeta">{m.meta}</div><div className="itHint">{m.it}</div></div></Link>)}
    {!beginner ? <>
      <Wide href="/buddy?mode=guided" icon="↗" title="20 min guided session" meta="Business English, correction and adaptive review" it="Sessione guidata di 20 minuti: business English, correzioni e ripasso" color="#1d6b4c" />
      <Wide href="/buddy?mode=mission" icon="🎯" title="Real-life mission" meta="Meetings, calls, negotiation, travel — one goal per scene" it="Una missione reale: riunioni, telefonate, trattative, viaggi" color="#d98e2b" />
    </> : <Wide href="/buddy?mode=guided" icon="↗" title="20 min guided session" meta="A longer guided lesson when you have time" it="Una lezione guidata più lunga, quando hai tempo" color="#1d6b4c" />}
    <Wide href="/buddy?mode=essentials" icon="🍽️" title="Everyday essentials" meta="Basic words for restaurants, travel and getting around" it="Parole di base per ristorante, viaggi e situazioni quotidiane" color="#c07a3a" />
    <Wide href="/buddy?mode=buddy" icon="☕︎" title="Buddy question" meta="One quick question from your English-speaking friend" it="Una domanda veloce dal tuo amico che parla inglese" color="#8a6d3b" />
    <Wide href="/rescue" icon="🆘" title="English Rescue" meta="I need English now — say it right, right now" it="Mi serve l'inglese adesso: scrivi in italiano, te lo do in inglese con l'audio" color="#c4483a" />
    <Wide href="/buddy?mode=surprise" icon="✦" title="Surprise me" meta="Let the coach choose what matters most today" it="Sorprendimi: lascia scegliere al coach cosa ti serve oggi" color="#7a5aa0" />
    <div className="kicker" style={{ gridColumn: "1 / -1", margin: "14px 2px 2px" }}>Accelerators · Acceleratori</div>
    <Wide href="/buddy?mode=warmup" icon="🎯" title="Meeting warm-up" meta="A call is coming — get the exact phrases, now" it="Hai una call tra poco? 5 minuti di riscaldamento mirato con le frasi che ti serviranno" color="#b3362a" />
    <Wide href="/buddy?mode=review" icon="🔁" title="Daily review" meta="2-minute quiz on what you're learning" it="Quiz di 2 minuti sulle tue espressioni ed errori: è così che si fissano" color="#1d6b4c" />
    <Wide href="/buddy?mode=shadow" icon="🗣️" title="Shadowing" meta="Listen and repeat aloud — rhythm and pronunciation" it="Ascolta e ripeti a voce alta imitando ritmo e pronuncia: la tecnica degli interpreti" color="#3b6ea5" />
    <Wide href="/buddy?mode=briefing" icon="📰" title="Daily read" meta="A 60-second business read at your level" it="Una lettura business di 60 secondi sul tuo livello, con domande" color="#7a5aa0" />
    <Wide href="/voice?mode=diary" icon="📔" title="Spoken diary" meta="One minute out loud about your day" it="Un minuto a voce sulla tua giornata: il coach ascolta e ti aiuta a dirla meglio" color="#b0567a" />
    <Wide href="/phrasebook" icon="📖" title="Phrasebook" meta="All your phrases, with audio, in one place" it="Il tuo frasario personale: tutte le frasi imparate, con l'audio" color="#8a6d3b" />
  </div>;
}
