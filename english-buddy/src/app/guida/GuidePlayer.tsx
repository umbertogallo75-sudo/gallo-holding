"use client";

import { useEffect, useRef, useState } from "react";
import { clock, type Chapter, type Guide, type GuideKey } from "@/lib/guide";
import { track } from "@/lib/track-client";

/**
 * The manual, made searchable.
 *
 * Nobody watches eighteen minutes of anything to find out how to forward an
 * email. So the index is the main object on this page and the film is what it
 * points at: every chapter can be jumped to, searched for by the word somebody
 * would actually type, and copied as a link that opens here at that minute.
 *
 * Two ways of holding the film, because they fail differently. YouTube sends
 * whoever is on a train a smaller picture instead of a stalled one, which a
 * single fat file on our own storage can never do — so it wins when it is
 * configured. The file remains for the day we want the video on our own
 * domain with nothing else in the frame.
 *
 * Nothing from YouTube is fetched until somebody asks for the video: no
 * iframe, no script, no cookie, no request. The panel you see before that is
 * ours, which is both the honest reading of consent and a page that loads in
 * one tenth of the weight.
 */

type YtPlayer = {
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  playVideo: () => void;
  destroy: () => void;
};
type YtApi = {
  Player: new (element: HTMLElement, options: Record<string, unknown>) => YtPlayer;
};

const API_SRC = "https://www.youtube.com/iframe_api";

/** Loads YouTube's player script once, and only once somebody wants it. */
function loadYouTubeApi(): Promise<YtApi> {
  const w = window as unknown as { YT?: YtApi; __ytReady?: Promise<YtApi>; onYouTubeIframeAPIReady?: () => void };
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (w.__ytReady) return w.__ytReady;
  w.__ytReady = new Promise<YtApi>((resolve, reject) => {
    w.onYouTubeIframeAPIReady = () => resolve(w.YT as YtApi);
    const script = document.createElement("script");
    script.src = API_SRC;
    script.async = true;
    script.onerror = () => reject(new Error("youtube-api"));
    document.head.append(script);
  });
  return w.__ytReady;
}

function search(value: string): string {
  return value.toLocaleLowerCase("it").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function GuidePlayer({ guides, initial, startAt }: { guides: Guide[]; initial: GuideKey; startAt: number }) {
  const video = useRef<HTMLVideoElement | null>(null);
  const mount = useRef<HTMLDivElement | null>(null);
  const player = useRef<YtPlayer | null>(null);
  const pending = useRef<number | null>(startAt > 0 ? startAt : null);
  const opened = useRef(false);

  const [key, setKey] = useState<GuideKey>(initial);
  const [armed, setArmed] = useState(false);
  const [at, setAt] = useState(startAt);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState("");
  const [broken, setBroken] = useState(false);

  const guide = guides.find((one) => one.key === key) ?? guides[0];
  const needle = search(query.trim());
  const shown = needle
    ? guide.chapters.map((chapter, index) => ({ chapter, index })).filter((row) => search(row.chapter.title).includes(needle))
    : guide.chapters.map((chapter, index) => ({ chapter, index }));

  // The chapter you are inside is the last one that has already started.
  const current = guide.chapters.reduce<Chapter | null>(
    (found, chapter) => (chapter.start <= at + 0.25 ? chapter : found),
    null
  );

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    track("guide_open", { where: initial });
  }, [initial]);

  // The YouTube player exists only while it is wanted, and is taken down when
  // the guide changes so the two films can never fight over one frame.
  useEffect(() => {
    if (!armed || !guide.youtube || !mount.current) return;
    let live = true;
    let ticker = 0;
    const element = mount.current;
    loadYouTubeApi()
      .then((api) => {
        if (!live) return;
        player.current = new api.Player(element, {
          host: "https://www.youtube-nocookie.com",
          videoId: guide.youtube,
          playerVars: { start: Math.floor(pending.current ?? 0), autoplay: 1, rel: 0, modestbranding: 1, playsinline: 1, hl: "it" },
        });
        pending.current = null;
        ticker = window.setInterval(() => {
          const seconds = player.current?.getCurrentTime?.();
          if (typeof seconds === "number") setAt(seconds);
        }, 500);
      })
      .catch(() => { if (live) setBroken(true); });
    return () => {
      live = false;
      window.clearInterval(ticker);
      player.current?.destroy?.();
      player.current = null;
    };
  }, [armed, guide.youtube]);

  function start(seconds: number) {
    pending.current = seconds;
    setAt(seconds);
    setArmed(true);
  }

  function go(chapter: Chapter) {
    track("guide_chapter", { where: `${guide.key}:${chapter.slug}` });
    setBroken(false);
    if (guide.youtube) {
      if (player.current) {
        player.current.seekTo(chapter.start, true);
        player.current.playVideo();
        setAt(chapter.start);
      } else {
        start(chapter.start);
      }
      return;
    }
    const element = video.current;
    if (!element) return;
    if (element.readyState >= 1) {
      element.currentTime = chapter.start;
      setAt(chapter.start);
      void element.play().catch(() => {});
    } else {
      pending.current = chapter.start;
      element.load();
    }
  }

  function switchTo(next: GuideKey) {
    if (next === key) return;
    track("guide_switch", { where: next });
    pending.current = null;
    setArmed(false);
    setBroken(false);
    setKey(next);
    setAt(0);
    setQuery("");
  }

  async function copy(chapter: Chapter) {
    const link = `${window.location.origin}/guida?v=${guide.key}&c=${chapter.slug}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(chapter.slug);
      window.setTimeout(() => setCopied(""), 2200);
    } catch {
      window.prompt("Copia il link a questo capitolo:", link);
    }
  }

  const playable = Boolean(guide.youtube || guide.video);
  const downloads = [
    guide.video ? { href: guide.video, label: "Scarica il video" } : null,
    guide.subtitles ? { href: guide.subtitles, label: "Sottotitoli SRT" } : null,
    guide.captions ? { href: guide.captions, label: "Sottotitoli VTT" } : null,
  ].filter((one): one is { href: string; label: string } => one !== null);

  return (
    <>
      <div className="guideSwitch" role="group" aria-label="Scegli la guida">
        {guides.map((one) => (
          <button
            key={one.key}
            type="button"
            className={one.key === key ? "guideTab on" : "guideTab"}
            aria-pressed={one.key === key}
            onClick={() => switchTo(one.key)}
          >
            {one.title}
            <span className="guideTabTime">{clock(one.seconds)}</span>
          </button>
        ))}
      </div>
      <p className="muted guideBlurb">{guide.blurb}</p>

      <div className="guideLayout">
        <div className="guideStage">
          <div className="guideScreen">
            {guide.youtube ? (
              armed ? (
                <div className="guideFrame"><div ref={mount} /></div>
              ) : (
                <button type="button" className="guidePoster" onClick={() => start(pending.current ?? 0)}>
                  <span className="guidePlay" aria-hidden>▶</span>
                  <span className="guidePosterTitle">{guide.title}</span>
                  <span className="guidePosterNote">
                    Tocca per avviare. Il video parte da YouTube: prima di questo momento non gli viene chiesto niente.
                  </span>
                </button>
              )
            ) : guide.video ? (
              <video
                key={guide.key}
                ref={video}
                className="guideVideo"
                controls
                playsInline
                preload="metadata"
                aria-label={`Guida video: ${guide.title}`}
                onLoadedMetadata={() => {
                  const element = video.current;
                  if (!element) return;
                  const target = pending.current;
                  pending.current = null;
                  if (target !== null && target > 0) {
                    element.currentTime = target;
                    setAt(target);
                    void element.play().catch(() => {});
                  }
                }}
                onTimeUpdate={() => setAt(video.current?.currentTime ?? 0)}
                onSeeked={() => setAt(video.current?.currentTime ?? 0)}
                onError={() => setBroken(true)}
              >
                <source src={guide.video} type="video/mp4" />
                {guide.captions ? <track kind="captions" srcLang="it" label="Italiano" src={guide.captions} /> : null}
                Il tuo browser non riesce a mostrare il video.
              </video>
            ) : (
              <div className="guideMissing">
                <p><strong>Il video sta arrivando.</strong></p>
                <p style={{ margin: 0 }}>
                  L&rsquo;indice qui accanto è già quello definitivo: appena il filmato è online, ogni capitolo diventa cliccabile.
                </p>
              </div>
            )}
          </div>
          <div className="guideBar">
            <span className="guideNow">{current ? current.title : guide.title}</span>
            <span className="guideClock">{clock(at)} / {clock(guide.seconds)}</span>
          </div>
        </div>

        <aside className="guideIndex" aria-label="Capitoli">
          <div className="sectionHead" style={{ marginTop: 0 }}>
            <h2>Vai al punto</h2>
            <span className="muted" style={{ fontSize: 12 }}>{guide.chapters.length} capitoli</span>
          </div>
          <input
            className="linkInput"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cerca: mail, pagamento, voce…"
            aria-label="Cerca un capitolo"
          />
          <ol className="guideChapters">
            {shown.map(({ chapter, index }) => (
              <li key={chapter.slug}>
                <button
                  type="button"
                  className={current?.slug === chapter.slug ? "guideChapter on" : "guideChapter"}
                  aria-current={current?.slug === chapter.slug ? "true" : undefined}
                  disabled={!playable}
                  onClick={() => go(chapter)}
                >
                  <span className="guideChapterNum">{String(index + 1).padStart(2, "0")}</span>
                  <span className="guideChapterTitle">{chapter.title}</span>
                  <span className="guideChapterTime">{clock(chapter.start)}</span>
                </button>
                <button
                  type="button"
                  className="guideCopy"
                  onClick={() => copy(chapter)}
                  aria-label={`Copia il link a «${chapter.title}»`}
                >
                  {copied === chapter.slug ? "copiato" : "link"}
                </button>
              </li>
            ))}
          </ol>
          {shown.length ? null : <p className="muted" style={{ fontSize: 13 }}>Nessun capitolo con questa parola.</p>}
          {downloads.length ? (
            <div className="guideTools">
              {downloads.map((one) => (
                <a key={one.label} href={one.href} download>{one.label}</a>
              ))}
            </div>
          ) : null}
        </aside>
      </div>

      {broken ? (
        <div className="notice" style={{ marginTop: 12 }}>
          Il video non è partito. Riprova, oppure aprilo direttamente su YouTube: a volte è una rete che blocca il player.
        </div>
      ) : null}
    </>
  );
}
