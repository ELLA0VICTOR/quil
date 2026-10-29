import type { CSSProperties, ReactNode } from "react";

export type IconName =
  | "feather"
  | "arrow"
  | "arrow-up"
  | "search"
  | "globe"
  | "check"
  | "shield"
  | "spark"
  | "pause"
  | "play"
  | "layers"
  | "pin"
  | "external"
  | "copy"
  | "chevron"
  | "mail"
  | "clock"
  | "download"
  | "close"
  | "menu"
  | "settings"
  | "bookmark"
  | "back"
  | "refresh"
  | "target"
  | "file"
  | "plus";
const paths: Record<IconName, ReactNode> = {
  feather: (
    <>
      <path d="M19.9 3.8c-5.8-1-11.7 1.7-13.2 7.2-.7 2.4-.3 4.6.1 6.1 1.6.3 3.7.4 5.9-.6 5.2-2.3 7.6-7.1 7.2-12.7Z" />
      <path d="M3 22 16.6 7.2M8.4 12.5l4.3-.2M11.3 9.4l.4-3.5" />
    </>
  ),
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  "arrow-up": <path d="M6 18 18 6M6 6h12v12" />,
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18M5 6.5h14M5 17.5h14" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  shield: (
    <>
      <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  spark: (
    <>
      <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3ZM20 2v4m-2-2h4" />
    </>
  ),
  pause: <path d="M8 5v14M16 5v14" />,
  play: <path d="m8 5 11 7-11 7V5Z" />,
  layers: <path d="m12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5" />,
  pin: (
    <>
      <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  external: <path d="M14 3h7v7m0-7L10 14M10 4H4v16h16v-6" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="13" rx="2" />
      <path d="M16 8V3H3v13h5" />
    </>
  ),
  chevron: <path d="m6 9 6 6 6-6" />,
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 6 9 7 9-7" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  download: <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  settings: (
    <>
      <path d="M4 7h16M4 17h16" />
      <circle cx="8" cy="7" r="3" />
      <circle cx="16" cy="17" r="3" />
    </>
  ),
  bookmark: <path d="M6 3h12v18l-6-4-6 4V3Z" />,
  back: <path d="M20 12H4m6-6-6 6 6 6" />,
  refresh: (
    <>
      <path d="M20 7v5h-5M4 17v-5h5" />
      <path d="M5.5 7a7 7 0 0 1 12-2l2.5 3M4 16l2.5 3a7 7 0 0 0 12-2" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H5v18h14V8l-5-5Z" />
      <path d="M14 3v5h5M8 13h8M8 17h6" />
    </>
  ),
  plus: <path d="M12 4v16M4 12h16" />,
};
export function Icon({
  name,
  size = 20,
  className = "",
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.45}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      {paths[name]}
    </svg>
  );
}
