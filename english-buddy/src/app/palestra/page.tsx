import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { requireUserId } from "@/lib/auth";
import { GAMES } from "@/lib/games/catalog";
import styles from "./games.module.css";

export const metadata = { title: "Palestra · ExecLingo" };

/** The gym: exercise short enough that nobody puts it off. */
export default async function PalestraPage() {
  await requireUserId();
  return (
    <main className="shell">
      <div className="topbar">
        <div className="brand">Palestra</div>
        <Link className="chip" href="/home">← Home</Link>
      </div>
      <div className={styles.hub}>
        <header className={styles.head}>
          <h1>La palestra dell&rsquo;inglese</h1>
          <p>
            Ripetizioni brevi, tutti i giorni, sulle parole che stai imparando — comprese quelle che hai sbagliato con Sam.
            Quello che indovini avanza nel ripasso, quello che sbagli torna prima: qui non si gioca soltanto, si allena.
          </p>
        </header>
        <div className={styles.list}>
          {GAMES.map((game) =>
            game.status === "live" ? (
              <Link
                key={game.slug}
                href={`/palestra/${game.slug}`}
                className={styles.card}
                data-track="game_opened"
                data-where={game.slug}
              >
                <div className={styles.cardTop}>
                  <span className={styles.badge} aria-hidden>{game.icon}</span>
                  <h2>{game.title}</h2>
                </div>
                <p>{game.tagline}</p>
                <div className={styles.meta}>
                  <span className={styles.tag}>{game.trains}</span>
                  <span className={styles.tag}>~{game.minutes} min</span>
                  {game.usesOwnWords ? <span className={`${styles.tag} ${styles.tagOwn}`}>Le tue parole</span> : null}
                </div>
              </Link>
            ) : (
              <div key={game.slug} className={`${styles.card} ${styles.soon}`}>
                <div className={styles.cardTop}>
                  <span className={styles.badge} aria-hidden>{game.icon}</span>
                  <h2>{game.title}</h2>
                </div>
                <p>{game.tagline}</p>
                <div className={styles.meta}><span className={styles.tag}>In arrivo</span></div>
              </div>
            )
          )}
        </div>
        <p className={styles.footnote}>
          Altri esercizi stanno arrivando. Se ne hai in mente uno che ti farebbe tornare ogni giorno, dillo a Sam: le richieste le leggiamo.
        </p>
      </div>
      <BottomNav active="home" />
    </main>
  );
}
