import { cn } from "@/lib/utils";

/**
 * The PagePilot mark: a folded page whose corner has taken off as a paper plane.
 * The geometry lives here once — `LogoMark` renders it as JSX for the site and
 * `logoSvg()` renders the identical shape as markup for the favicon, the Apple
 * touch icon and the OG image, so they can never drift apart.
 */
const PATHS = {
  page: "M13 11.5a2.5 2.5 0 0 1 2.5-2.5h11L35 17.5v19a2.5 2.5 0 0 1-2.5 2.5h-17A2.5 2.5 0 0 1 13 36.5Z",
  fold: "M26.5 9 35 17.5h-8.5Z",
  wing: "M37.5 14.5 12.5 26.75l9.75 2.5Z",
  body: "M37.5 14.5 22.25 29.25l1.1 8.25Z",
};

const GRADIENT = `<linearGradient id="pp-bg" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse"><stop stop-color="#818cf8"/><stop offset="0.55" stop-color="#4f46e5"/><stop offset="1" stop-color="#3730a3"/></linearGradient>`;

export function logoSvg(size = 48, radius = 12): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48" fill="none"><defs>${GRADIENT}</defs><rect width="48" height="48" rx="${radius}" fill="url(#pp-bg)"/><path d="${PATHS.page}" fill="#fff" fill-opacity="0.16"/><path d="${PATHS.fold}" fill="#fff" fill-opacity="0.38"/><path d="${PATHS.wing}" fill="#fff"/><path d="${PATHS.body}" fill="#fff" fill-opacity="0.75"/></svg>`;
}

export function LogoMark({
  className,
  radius = 12,
}: {
  className?: string;
  radius?: number;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-8 w-8", className)}
      aria-hidden="true"
    >
      <defs dangerouslySetInnerHTML={{ __html: GRADIENT }} />
      <rect width="48" height="48" rx={radius} fill="url(#pp-bg)" />
      <path d={PATHS.page} fill="#fff" fillOpacity="0.16" />
      <path d={PATHS.fold} fill="#fff" fillOpacity="0.38" />
      <path d={PATHS.wing} fill="#fff" />
      <path d={PATHS.body} fill="#fff" fillOpacity="0.75" />
    </svg>
  );
}

/** lucide v1 dropped brand icons, so the GitHub mark lives here. */
export function GithubIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={cn("size-4", className)}
      aria-hidden="true"
    >
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.11.79-.25.79-.56v-2c-3.2.7-3.88-1.54-3.88-1.54-.53-1.34-1.29-1.7-1.29-1.7-1.06-.72.08-.7.08-.7 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.73 1.27 3.4.97.1-.75.4-1.27.73-1.56-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.3 1.19-3.11-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.19a11 11 0 0 1 5.79 0c2.2-1.5 3.17-1.19 3.17-1.19.63 1.59.24 2.76.12 3.05.74.81 1.19 1.85 1.19 3.11 0 4.43-2.7 5.4-5.27 5.69.42.36.79 1.07.79 2.15v3.19c0 .31.21.68.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className="h-8 w-8" />
      <span className="text-foreground text-lg font-semibold tracking-tight">
        Page<span className="text-brand-400">Pilot</span>
      </span>
    </span>
  );
}
