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
 * There is not a single effect in this component. Everything happens because
 * the person did something or the video said something — a click, a seek, a
 * tick of playback — which is also why the current chapter never lies.
 */

function search(value: string): string {
  return value.toLocaleLowerCase("it").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function GuidePlayer({ guides, initial, startAt }: { guides: Guide[]; initial: GuideKey; startAt: number }) {
  const video = useRef<HTMLVideoElement | null>(null);
  const pending = useRef<number | null>(startAt > 0 ? startAt : null);
  const [key, setKey] = useState<GuideKey>(initial);
  const [at, setAt] = useState(startAt);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState("");

  const guide = guides.find((g) => g.key === key) ?? guides[0];

  // One line of bookkeeping, and the only effect here: it reports, it does not
  // decide anything, so nothing on screen waits for it.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    track("guide_open", { where: initial });
  }, [initial]);
  const needle = search(query.trim());
  const shown = needle ? guide.chapters.filter((c) => search(c.title).includes(needle)) : guide.chapters;

  // The chapter you are inside is the last one that has already started.
  const current = guide.chapters.reduce<Chapter | null>((found, chapter) => (chapter.start <= at + 0.25 ? chapter : found), null);

  function go(chapter: Chapter) {
    track("guide_chapter", { where: `${guide.key}:${chapter.slug}` });
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
          {guide.video ? (
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
            >
              <source src={guide.video} type="video/mp4" />
              {guide.captions ? <track kind="captions" srcLang="it" label="Italiano" src={guide.captions} /> : null}
              Il tuo browser non riesce a mostrare il video.
            </video>
          ) : (
            <div className="guideMissing">
              <p><strong>Il video sta arrivando.</strong></p>
              <p className="muted" style={{ margin: 0 }}>
                L&rsquo;indice qui accanto è già quello definitivo: appena il filmato è online, ogni capitolo diventa cliccabile.
              </p>
            </div>
          )}
          <p className="guideNow">
            <span>{current ? current.title : guide.title}</span>
            <span className="guideClock">{clock(at)} / {clock(guide.seconds)}</span>
          </p>
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
            {shown.map((chapter) => (
              <li key={chapter.slug}>
                <button
                  type="button"
                  className={current?.slug === chapter.slug ? "guideChapter on" : "guideChapter"}
                  aria-current={current?.slug === chapter.slug ? "true" : undefined}
                  disabled={!guide.video}
                  onClick={() => go(chapter)}
                >
                  <span className="guideChapterTime">{clock(chapter.start)}</span>
                  <span className="guideChapterTitle">{chapter.title}</span>
                </button>
                <button type="button" className="guideCopy" onClick={() => copy(chapter)} aria-label={`Copia il link a «${chapter.title}»`}>
                  {copied === chapter.slug ? "copiato" : "link"}
                </button>
              </li>
            ))}
          </ol>
          {shown.length ? null : <p className="muted" style={{ fontSize: 13 }}>Nessun capitolo con questa parola.</p>}
        </aside>
      </div>
    </>
  );
}
