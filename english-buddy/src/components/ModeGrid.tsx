import Link from "next/link";

// Each activity gets its own tint so the Home reads at a glance.
const tint = (hex: string) => ({ background: `color-mix(in srgb, ${hex} 18%, var(--surface))` });
const cardTint = (hex: string) => ({
  background: `linear-gradient(135deg, color-mix(in srgb, ${hex} 10%, var(--surface)), var(--surface) 75%)`,
  borderColor: `color-mix(in srgb, ${hex} 30%, var(--line))`,
});

type ModeCard = { icon:string; title:string; meta:string; mode:string; color:string; href?:string };
const modes: ModeCard[] = [
  { icon:"✍︎", title:"2 minuti", meta:"Una domanda, una risposta utile", mode:"text-2", color:"#3b6ea5" },
  { icon:"✍︎", title:"5 minuti", meta:"Conversazione scritta veloce", mode:"text-5", color:"#3b6ea5" },
  { icon:"🎧", title:"Ascolta e scrivi", meta:"Senti una frase e scrivi quello che hai capito", mode:"listen", color:"#7a5aa0" },
  { icon:"🎙️", title:"A voce", meta:"Parla davvero con Sam, come in una call", mode:"voice", color:"#b0567a", href:"/voice" },
];

function Wide({ href, icon, title, meta, color }: { href:string; icon:string; title:string; meta:string; color:string }) {
  return <Link href={href} className="mode wide" style={cardTint(color)}><span className="modeIcon" style={tint(color)}>{icon}</span><div><div className="modeTitle">{title}</div><div className="modeMeta">{meta}</div></div></Link>;
}

/**
 * The four activities shown on the home screen itself.
 *
 * Not a second catalogue: every one of these is also in the grid below, and a
 * test holds them to it. They are the four that answer "what else is there?"
 * fastest — the two that are not writing at all, the one with a goal, and the
 * emergency — because the point of the rail is to prove the catalogue exists,
 * not to replace it.
 */
export const HOME_RAIL = [
  { icon: "🎙️", title: "A voce", meta: "Parla davvero con Sam, come in una call", href: "/voice" },
  { icon: "🎧", title: "Ascolta e scrivi", meta: "Senti una frase, scrivi quello che hai capito", href: "/buddy?mode=listen" },
  { icon: "🎯", title: "Missione", meta: "Un obiettivo per scena: riunioni, viaggi", href: "/buddy?mode=mission" },
  { icon: "🆘", title: "Mi serve adesso", meta: "Scrivi in italiano, esce in inglese", href: "/rescue" },
] as const;

export function ModeGrid({ beginner = false }: { beginner?: boolean }) {
  return <div className="modeGrid">
    {beginner ? <>
      <Wide href="/buddy?mode=zero" icon="🌱" title="Parto da zero" meta="La micro-lezione guidata di oggi: ascolta, leggi, ripeti, usa" color="#1d6b4c" />
      <Wide href="/buddy?mode=mission" icon="🎯" title="Missione" meta="Presentarti, ordinare al ristorante, cavartela in aeroporto" color="#d98e2b" />
    </> : null}
    {modes.map(m =>
      <Link href={m.href ?? `/buddy?mode=${m.mode}`} className="mode" key={m.mode} style={cardTint(m.color)}><span className="modeIcon" style={tint(m.color)}>{m.icon}</span><div><div className="modeTitle">{m.title}</div><div className="modeMeta">{m.meta}</div></div></Link>)}
    {!beginner ? <>
      <Wide href="/buddy?mode=guided" icon="↗" title="Sessione guidata · 20 minuti" meta="Inglese di lavoro, correzioni e ripasso su misura" color="#1d6b4c" />
      <Wide href="/buddy?mode=mission" icon="🎯" title="Missione" meta="Riunioni, telefonate, trattative, viaggi: un obiettivo per scena" color="#d98e2b" />
    </> : <Wide href="/buddy?mode=guided" icon="↗" title="Sessione guidata · 20 minuti" meta="Una lezione più lunga, quando hai tempo" color="#1d6b4c" />}
    <Wide href="/buddy?mode=essentials" icon="🍽️" title="Le basi di ogni giorno" meta="Ristorante, viaggi, spostarsi: le parole che servono davvero" color="#c07a3a" />
    <Wide href="/buddy?mode=buddy" icon="☕︎" title="Una domanda da Sam" meta="Come farebbe un amico che parla inglese" color="#8a6d3b" />
    <Wide href="/rescue" icon="🆘" title="Mi serve adesso" meta="Scrivi in italiano, te lo do in inglese con l'audio" color="#c4483a" />
    <Wide href="/buddy?mode=surprise" icon="✦" title="Scegli tu, Sam" meta="Lascia decidere a lui cosa ti serve di più oggi" color="#7a5aa0" />
    <div className="kicker" style={{ gridColumn: "1 / -1", margin: "14px 2px 2px" }}>Acceleratori</div>
    <Wide href="/buddy?mode=warmup" icon="🎯" title="Riscaldamento pre-call" meta="Hai una call tra poco: 5 minuti con le frasi esatte" color="#b3362a" />
    <Wide href="/buddy?mode=review" icon="🔁" title="Ripasso" meta="Due minuti sui tuoi errori ed espressioni: è così che si fissano" color="#1d6b4c" />
    <Wide href="/buddy?mode=shadow" icon="🗣️" title="Ripeti dietro a Sam" meta="Ascolta e ripeti a voce: ritmo e pronuncia, la tecnica degli interpreti" color="#3b6ea5" />
    <Wide href="/buddy?mode=briefing" icon="📰" title="La lettura del giorno" meta="Sessanta secondi di lettura al tuo livello, con due domande" color="#7a5aa0" />
    <Wide href="/voice?mode=diary" icon="📔" title="Diario parlato" meta="Un minuto a voce sulla tua giornata, e Sam ti aiuta a dirla meglio" color="#b0567a" />
    <Wide href="/mail" icon="📧" title="Le tue mail" meta="Inoltra una mail in inglese: Sam te la spiega e ti prepara la risposta" color="#3b6ea5" />
    <Wide href="/phrasebook" icon="📖" title="Il tuo frasario" meta="Tutte le frasi che hai imparato, con l'audio" color="#8a6d3b" />
  </div>;
}
