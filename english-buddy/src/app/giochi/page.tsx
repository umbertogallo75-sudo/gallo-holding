import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { requireUserId } from "@/lib/auth";
import { GAMES } from "@/lib/games/catalog";
import styles from "./games.module.css";

export const metadata = { title: "Giochi · ExecLingo" };

/** The games department: exercise that does not feel like exercise. */
export default async function GiochiPage() {
  await requireUserId();
  return (
    <main className="shell">
      <div className="topbar">
        <div className="brand">Giochi</div>
        <Link className="chip" href="/home">← Home</Link>
      </div>
      <div className={styles.hub}>
        <header className={styles.head}>
          <h1>Allenati giocando</h1>
          <p>
            Partite brevi, costruite sulle parole che stai imparando — comprese quelle che hai sbagliato con Sam.
            Quello che indovini avanza nel ripasso, quello che sbagli torna prima.
          </p>
        </header>
        <div className={styles.list}>
          {GAMES.map((game) =>
            game.status === "live" ? (
              <Link
                key={game.slug}
                href={`/giochi/${game.slug}`}
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
        <p className="itHint" style={{ margin: 0 }}>
          Altri giochi stanno arrivando. Se ne hai in mente uno che ti farebbe tornare ogni giorno, dillo a Sam: le richieste le leggiamo.
        </p>
      </div>
      <BottomNav active="home" />
    </main>
  );
}
