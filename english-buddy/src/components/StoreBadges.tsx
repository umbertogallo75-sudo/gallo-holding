import Image from "next/image";
import { configuredAppStoreUrl, configuredPlayStoreUrl } from "@/lib/store-links";

const APP_STORE_BADGE =
  "/store-badges/app-store-it.svg";
const GOOGLE_PLAY_BADGE =
  "/store-badges/google-play-it.svg";

type StoreBadgesProps = {
  where: string;
  appStoreUrl?: string | null;
  playStoreUrl?: string | null;
  compact?: boolean;
  centered?: boolean;
  className?: string;
};

/**
 * One canonical pair of unaltered, localized store badges. Apple comes first
 * and both artworks keep the same visual height, as required when they appear
 * together. Destinations default to the validated production listings; paid
 * landing pages can pass an attributed Play URL without changing the artwork.
 */
export function StoreBadges({
  where,
  appStoreUrl,
  playStoreUrl,
  compact = false,
  centered = false,
  className = "",
}: StoreBadgesProps) {
  const apple = appStoreUrl === undefined ? configuredAppStoreUrl() : appStoreUrl;
  const google = playStoreUrl === undefined ? configuredPlayStoreUrl() : playStoreUrl;
  if (!apple && !google) return null;

  const classes = [
    "storeBadges",
    compact ? "storeBadgesCompact" : "",
    centered ? "storeBadgesCentered" : "",
    className,
  ].filter(Boolean).join(" ");
  const artworkHeight = compact ? 40 : 48;
  const linkStyle = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    borderRadius: 12,
  } as const;

  return (
    <div
      className={classes}
      role="group"
      aria-label="Scarica ExecLingo dagli store ufficiali"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: centered ? "center" : "flex-start",
        margin: "8px -10px",
      }}
    >
      {apple ? (
        <a
          href={apple}
          className="storeBadgeLink"
          data-track="landing_store_ios"
          data-where={where}
          aria-label="Scarica ExecLingo su App Store per iPhone e iPad"
          style={linkStyle}
        >
          <Image
            src={APP_STORE_BADGE}
            alt=""
            width={120}
            height={40}
            className="storeBadgeArtwork"
            style={{ width: "auto", height: artworkHeight }}
            unoptimized
          />
        </a>
      ) : null}
      {google ? (
        <a
          href={google}
          className="storeBadgeLink"
          data-track="landing_store_android"
          data-where={where}
          aria-label="Scarica ExecLingo su Google Play per Android"
          style={linkStyle}
        >
          <Image
            src={GOOGLE_PLAY_BADGE}
            alt=""
            width={239}
            height={71}
            className="storeBadgeArtwork"
            style={{ width: "auto", height: artworkHeight }}
            unoptimized
          />
        </a>
      ) : null}
    </div>
  );
}
