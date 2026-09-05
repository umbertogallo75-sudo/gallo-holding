"use client";

import { useEffect, useRef, useState } from "react";
import { clock, currentChapter, matchingChapters, youtubeWatchUrl, type Chapter, type Guide, type GuideKey } from "@/lib/guide";
import { consentSnapshot, subscribeConsent } from "@/lib/consent-store";
import { track } from "@/lib/track-client";
import styles from "./guide.module.css";

type YtPlayer = {
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  playVideo: () => void;
  pauseVideo: () => void;
  getIframe: () => HTMLIFrameElement;
  destroy: () => void;
};
type YtApi = { Player: new (element: HTMLElement, options: Record<string, unknown>) => YtPlayer };
type PlayerEvent = { target: YtPlayer; data: number };
type Status = "idle" | "loading" | "ready" | "playing" | "paused" | "ended" | "blocked" | "error";
let apiPromise: Promise<YtApi> | null = null;

/** No script until the visitor explicitly loads this external content. */
function loadYouTubeApi(): Promise<YtApi> {
  const w = window as unknown as { YT?: YtApi; onYouTubeIframeAPIReady?: () => void };
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YtApi>((resolve, reject) => {
    const previous = w.onYouTubeIframeAPIReady;
    const script = document.createElement("script");
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (w.onYouTubeIframeAPIReady === ready) w.onYouTubeIframeAPIReady = previous;
      if (error) { script.remove(); reject(error); }
      else resolve(w.YT as YtApi);
    };
    const ready = () => {
      try { previous?.(); } finally {
        if (w.YT?.Player) finish();
        else finish(new Error("youtube-api-unavailable"));
      }
    };
    const timeout = window.setTimeout(() => finish(new Error("youtube-api-timeout")), 15000);
    w.onYouTubeIframeAPIReady = ready;
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => finish(new Error("youtube-api-network"));
    document.head.append(script);
  }).catch((error) => { apiPromise = null; throw error; });
  return apiPromise;
}

const messages: Record<Status, string> = {
  idle: "Scegli un capitolo, poi carica il video.",
  loading: "Caricamento del video…",
  ready: "Premi play oppure scegli un capitolo.",
  playing: "In riproduzione",
  paused: "In pausa · riprendi o scegli un capitolo.",
  ended: "Guida completata · puoi tornare a qualsiasi capitolo.",
  blocked: "Capitolo selezionato. Premi play nel video per iniziare.",
  error: "Non riusciamo a riprodurre il video qui. Riprova oppure aprilo su YouTube.",
};

export function GuidePlayer({ guides, initial, startAt }: { guides: Guide[]; initial: GuideKey; startAt: number }) {
  const mount = useRef<HTMLDivElement>(null);
  const player = useRef<YtPlayer | null>(null);
  const ready = useRef(false);
  const pending = useRef(startAt);
  const positions = useRef<Record<GuideKey, number>>({ manuale: 0, sintesi: 0 });
  const opened = useRef(false);
  const copyTimer = useRef(0);
  const [key, setKey] = useState(initial);
  const [armed, setArmed] = useState(false);
  const [at, setAt] = useState(startAt);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState("");
  const [copyFallback, setCopyFallback] = useState("");
  const [selectionMessage, setSelectionMessage] = useState("");
  const guide = guides.find((one) => one.key === key) ?? guides[0];
  const shown = matchingChapters(guide.chapters, query);
  const current = currentChapter(guide.chapters, at);
  const watchUrl = youtubeWatchUrl(guide, at);

  useEffect(() => {
    if (!opened.current) { opened.current = true; track("guide_open", { where: initial }); }
    // Content permission does not grant marketing consent. A site-wide refusal
    // or withdrawal also stops this optional content, including delayed loads.
    const unsubscribe = subscribeConsent(() => {
      if (consentSnapshot() !== "granted") {
        ready.current = false;
        player.current?.pauseVideo?.();
        setArmed(false);
        setStatus("idle");
      }
    });
    return () => { unsubscribe(); window.clearTimeout(copyTimer.current); };
  }, [initial]);

  useEffect(() => {
    if (!armed || !guide.youtube || !mount.current) return;
    let live = true;
    let failed = false;
    let instance: YtPlayer | null = null;
    let ticker = 0;
    const wrapper = mount.current;
    // YouTube replaces its argument. Only this child belongs to the API;
    // React keeps the stable wrapper through retry, switching and StrictMode.
    const element = document.createElement("div");
    wrapper.replaceChildren(element);
    ready.current = false;
    const sync = () => {
      if (!live || failed || !ready.current) return;
      const time = instance?.getCurrentTime?.();
      if (typeof time === "number" && Number.isFinite(time) && time >= 0) {
        positions.current[guide.key] = time;
        setAt(time);
      }
    };
    const fail = () => {
      if (!live || failed) return;
      failed = true;
      window.clearInterval(ticker);
      window.clearTimeout(timeout);
      ready.current = false;
      instance?.pauseVideo?.();
      if (player.current === instance) player.current = null;
      instance?.destroy?.();
      instance = null;
      wrapper.replaceChildren();
      setStatus("error");
    };
    const timeout = window.setTimeout(fail, 22000);
    loadYouTubeApi().then((api) => {
      if (!live || failed) return;
      instance = new api.Player(element, {
        host: "https://www.youtube-nocookie.com",
        videoId: guide.youtube,
        width: "100%", height: "100%",
        playerVars: { autoplay: 0, rel: 0, playsinline: 1, hl: "it", cc_lang_pref: "it", origin: window.location.origin, enablejsapi: 1 },
        events: {
          onReady: (event: PlayerEvent) => {
            if (!live || failed) return;
            window.clearTimeout(timeout);
            ready.current = true;
            const iframe = event.target.getIframe();
            iframe.title = `ExecLingo — ${guide.title}`;
            iframe.referrerPolicy = "strict-origin-when-cross-origin";
            event.target.seekTo(pending.current, true);
            setStatus("ready");
            event.target.playVideo();
          },
          onStateChange: (event: PlayerEvent) => {
            if (!live || failed) return;
            window.clearInterval(ticker);
            sync();
            if (event.data === 1) {
              setStatus("playing");
              ticker = window.setInterval(sync, 500);
            } else if (event.data === 2) setStatus("paused");
            else if (event.data === 0) setStatus("ended");
          },
          onAutoplayBlocked: () => { if (live && !failed) setStatus("blocked"); },
          onError: fail,
        },
      });
      player.current = instance;
    }).catch(fail);
    return () => {
      live = false;
      ready.current = false;
      window.clearTimeout(timeout);
      window.clearInterval(ticker);
      if (player.current === instance) player.current = null;
      instance?.destroy?.();
      wrapper.replaceChildren();
    };
  }, [armed, guide.youtube, guide.key, guide.title, attempt]);

  function loadVideo() {
    pending.current = at;
    setStatus("loading");
    if (armed) setAttempt((value) => value + 1);
    setArmed(true);
  }

  function go(chapter: Chapter) {
    track("guide_chapter", { where: `${guide.key}:${chapter.slug}` });
    pending.current = chapter.start;
    positions.current[key] = chapter.start;
    setAt(chapter.start);
    setSelectionMessage(`${chapter.title}, da ${clock(chapter.start)}.${!armed ? " Premi Carica il video YouTube per iniziare." : ""}`);
    if (ready.current && player.current) {
      player.current.seekTo(chapter.start, true);
      player.current.playVideo();
    }
    // Selecting a chapter alone never silently grants permission to YouTube.
  }

  function switchTo(next: GuideKey) {
    if (next === key) return;
    positions.current[key] = at;
    player.current?.pauseVideo?.();
    ready.current = false;
    pending.current = positions.current[next];
    setArmed(false);
    setStatus("idle");
    setKey(next);
    setAt(positions.current[next]);
    setQuery("");
    setCopied("");
    setCopyFallback("");
    setSelectionMessage("");
    track("guide_switch", { where: next });
  }

  function stopYouTube() {
    player.current?.pauseVideo?.();
    ready.current = false;
    setArmed(false);
    setStatus("idle");
  }

  async function copy(chapter: Chapter) {
    const link = `${window.location.origin}/guida?v=${guide.key}&c=${chapter.slug}`;
    setCopyFallback("");
    try {
      await navigator.clipboard.writeText(link);
      setCopied(chapter.slug);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(""), 2200);
    } catch { setCopyFallback(link); }
  }

  return (
    <div className={styles.player} data-kind={guide.key}>
      <div className={styles.switcher} role="group" aria-label="Scegli il video">
        {guides.map((one) => <button key={one.key} type="button" aria-pressed={one.key === key} onClick={() => switchTo(one.key)}>
          {one.title}<span>{clock(one.seconds)}</span>
        </button>)}
      </div>
      <p className={styles.blurb}>{guide.blurb}</p>
      <div className={styles.layout}>
        <section aria-label="Riproduzione del video">
          <div className={styles.stage}>
            <div className={styles.screen}>
              {armed && guide.youtube ? <div ref={mount} className={styles.frame} /> :
                <div className={styles.poster}>
                  <span className={styles.playIcon} aria-hidden="true">▶</span>
                  <h2>{guide.title}</h2>
                  <p>{clock(guide.seconds)} · Voce, musica e sottotitoli</p>
                  {guide.youtube ? <>
                    <button type="button" className={styles.load} onClick={loadVideo}>Carica il video YouTube</button>
                    <p className={styles.permission}>Il video è ospitato su YouTube. Caricandolo ti colleghi a Google; puoi interrompere il collegamento qui sotto. La scelta vale solo per questo lettore, non per i cookie pubblicitari.</p>
                    {at > 0 ? <p>Partenza da {clock(at)}</p> : null}
                  </> : <p>Questo video non è disponibile al momento. L’indice resta consultabile.</p>}
                </div>}
            </div>
            <div className={styles.bar}>
              <div><strong>{current?.title ?? guide.title}</strong><span role="status">{messages[status]}</span></div>
              <span className={styles.clock}>{clock(at)} / {clock(guide.seconds)}</span>
            </div>
          </div>
          {status === "error" ? <div className={styles.notice} role="alert">
            {messages.error} <button type="button" onClick={loadVideo}>Riprova</button>
          </div> : null}
          <div className={styles.external}>
            {watchUrl ? <a href={watchUrl} target="_blank" rel="noopener noreferrer">Guarda su YouTube ↗</a> : null}
            {armed ? <button type="button" onClick={stopYouTube}>Interrompi YouTube</button> : null}
          </div>
          <p className={styles.note}>Voce italiana generata con intelligenza artificiale OpenAI, musica discreta e sottotitoli. La traccia aggiuntiva YouTube è facoltativa: i testi sono già visibili nel video.</p>
        </section>
        <aside className={styles.index} aria-label="Indice e materiali">
          <div className={styles.panelHead}><h2>Vai al punto</h2><span>{guide.chapters.length} capitoli</span></div>
          <p className={styles.hint}>Tocca un capitolo per scegliere da dove iniziare. Durante il video viene evidenziata la sezione corrente.</p>
          <input className={styles.filter} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca: pagamento, mail, notifiche…" aria-label="Cerca un capitolo" />
          <p className={styles.srOnly} aria-live="polite">{query ? `${shown.length} risultati` : ""}</p>
          <nav aria-label="Capitoli del video"><ol className={styles.chapters}>
            {shown.map(({ chapter, index }) => <li key={chapter.slug}>
              <button type="button" className={styles.chapter} aria-current={current?.slug === chapter.slug ? "true" : undefined} onClick={() => go(chapter)}>
                <span className={styles.num}>{String(index + 1).padStart(2, "0")}</span>
                <span>{chapter.title}</span><span className={styles.chapterTime}>{clock(chapter.start)}</span>
              </button>
              <button type="button" className={styles.copy} onClick={() => void copy(chapter)} aria-label={`Copia il link a «${chapter.title}»`}>
                {copied === chapter.slug ? "✓" : "↗"}
              </button>
            </li>)}
          </ol></nav>
          {!shown.length ? <p className={styles.hint}>Nessun capitolo corrisponde alla ricerca. Prova con Sam, email, pagamenti o notifiche. <button type="button" onClick={() => setQuery("")}>Cancella ricerca</button></p> : null}
          <p className={styles.selection} role="status">{copied ? "Link copiato" : selectionMessage}</p>
          {copyFallback ? <label className={styles.hint}>Copia questo link:<input className={styles.filter} readOnly value={copyFallback} onFocus={(e) => e.currentTarget.select()} /></label> : null}
          <div className={styles.tools} aria-label="Materiali del video selezionato">
            <a href={guide.subtitles} download>Sottotitoli SRT</a>
            <a href={guide.captions} download>Sottotitoli VTT</a>
            <a href={guide.chapterFile} download>Indice e tempi</a>
          </div>
          <p className={styles.note}>Schermo iPhone illustrato: interfaccia ricostruita a scopo dimostrativo. Nomi, email e contenuti sono esempi. Nessun account creato e nessun pagamento eseguito per queste scene.</p>
          <details className={styles.help}><summary>Come usare la guida</summary><p>Scegli manuale o sintesi, cerca un argomento e carica il video. Il pulsante accanto a ogni capitolo copia un link che apre questa pagina nel punto scelto. Per fermare il collegamento usa Interrompi YouTube.</p><p>Le condizioni mostrate si riferiscono alla preparazione del video, il 5 settembre 2026. Prima di acquistare verifica prezzi e condizioni nel gestore di pagamento.</p></details>
        </aside>
      </div>
    </div>
  );
}
