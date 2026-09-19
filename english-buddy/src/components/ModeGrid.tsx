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
  { icon:"🎙️", title:"A voce", meta:"Parla davvero con Sam, come in una call", mode:"voice", color:"#b0567a", href:"/voice" },
  { icon:"☕︎", title:"Una domanda da Sam", meta:"Come farebbe un amico che parla inglese", mode:"buddy", color:"#8a6d3b" },
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
  { icon: "✏️", title: "Ascolta e scrivi", meta: "Dieci frasi, e scegli tu l'accento", href: "/palestra/dettato" },
  { icon: "↗", title: "Sessione guidata", meta: "Venti minuti condotti da Sam", href: "/buddy?mode=guided" },
  { icon: "🆘", title: "Mi serve adesso", meta: "Scrivi in italiano, esce in inglese", href: "/rescue" },
] as const;

export function ModeGrid({ beginner = false }: { beginner?: boolean }) {
  return <div className="modeGrid">
    {/* Conversations and exercises are two different things and were one long
        list. A conversation is open — you talk, it lasts as long as it lasts.
        An exercise has a shape, a length and an end. Somebody who has ten
        minutes and wants to be told what to do was being handed a menu of
        sixteen doors with no way to tell which was which. */}
    <div className="kicker" style={{ gridColumn: "1 / -1", margin: "2px 2px 2px" }}>Conversazioni · parli tu, quanto vuoi</div>
    {beginner ? <Wide href="/buddy?mode=zero" icon="🌱" title="Parto da zero" meta="La micro-lezione guidata di oggi: ascolta, leggi, ripeti, usa" color="#1d6b4c" /> : null}
    {modes.map(m =>
      <Link href={m.href ?? `/buddy?mode=${m.mode}`} className="mode" key={m.mode} style={cardTint(m.color)}><span className="modeIcon" style={tint(m.color)}>{m.icon}</span><div><div className="modeTitle">{m.title}</div><div className="modeMeta">{m.meta}</div></div></Link>)}
    <Wide href="/buddy?mode=essentials" icon="🍽️" title="Le basi di ogni giorno" meta="Ristorante, viaggi, spostarsi: le parole che servono davvero" color="#c07a3a" />
    <Wide href="/buddy?mode=surprise" icon="✦" title="Scegli tu, Sam" meta="Lascia decidere a lui cosa ti serve di più oggi" color="#7a5aa0" />

    <div className="kicker" style={{ gridColumn: "1 / -1", margin: "14px 2px 2px" }}>Esercizi · una serie di domande, con una fine</div>
    <Wide href="/buddy?mode=guided" icon="↗" title="Sessione guidata · 20 minuti" meta="Sam dice il piano e conduce: espressioni, domande, role-play, chiusura" color="#1d6b4c" />
    <Wide href="/palestra/dettato" icon="✏️" title="Ascolta e scrivi" meta="Dieci frasi, trenta secondi l'una, punteggio — e cinque accenti fra cui scegliere" color="#7a5aa0" />
    <Wide href="/buddy?mode=review" icon="🔁" title="Ripasso" meta="Il contesto in italiano, poi la frase da completare: sono i tuoi errori" color="#1d6b4c" />
    <Wide href="/voice?mode=shadow" icon="🗣️" title="Ripeti dietro a Sam" meta="A voce: lui dice, tu ripeti, e ti corregge accento e ritmo" color="#3b6ea5" />
    <Wide href="/buddy?mode=briefing" icon="📰" title="La lettura del giorno" meta="Un testo corto, poi racconti in italiano cosa hai capito" color="#7a5aa0" />
    <Wide href="/palestra" icon="🏋️" title="Palestra" meta="Esercizi brevi sulle parole che hai sbagliato: due minuti" color="#d98e2b" />

    {/* Il lavoro vero della settimana, non un esercizio: sta qui perché è
        la ragione per cui uno apre l'app di lunedì mattina. */}
    <div className="kicker" style={{ gridColumn: "1 / -1", margin: "14px 2px 2px" }}>Il tuo lavoro di questa settimana</div>
    <Wide href="/documenti" icon="📄" title="Allenati su un documento" meta="Un contratto, un'offerta, delle slide: Sam le legge e ti prepara la riunione" color="#1d6b4c" />
    <Wide href="/mail" icon="📧" title="Le tue mail" meta="Inoltra una mail in inglese: te la traduce e ti prepara la risposta" color="#3b6ea5" />
    <Wide href="/buddy?mode=warmup" icon="🎯" title="Riscaldamento pre-call" meta="Hai una call tra poco: 5 minuti con le frasi esatte" color="#b3362a" />

    <div className="kicker" style={{ gridColumn: "1 / -1", margin: "14px 2px 2px" }}>Strumenti</div>
    <Wide href="/rescue" icon="🆘" title="Mi serve adesso" meta="Scrivi in italiano, te lo do in inglese in tre versioni con l'audio" color="#c4483a" />
    <Wide href="/phrasebook" icon="★" title="Le tue frasi" meta="Quelle che hai deciso di tenere, e quelle che Sam ti ha insegnato" color="#8a6d3b" />
    <Wide href="/prepara" icon="📅" title="La tua agenda" meta="Le riunioni in arrivo: note, documenti e la scheda pronta per ognuna" color="#d98e2b" />
  </div>;
}
