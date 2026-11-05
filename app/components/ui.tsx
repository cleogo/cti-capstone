'use client';

/**
 * Shared UI pieces for the chat (docs/ui-design-decisions.md): the CTI logo chathead, inline
 * SVG icons (Lucide shapes), the product photo tile and the class strings that every card uses.
 */
import Image from 'next/image';
import { useState } from 'react';

// ---------- class strings ----------

export const card = 'rounded-2xl border border-line bg-white shadow-sm';
export const eyebrow = 'text-[11px] font-semibold uppercase tracking-wider';
export const btnPrimary =
  'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-brand px-4 font-medium text-ink transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40';
export const btnGhost =
  'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-4 text-muted transition hover:bg-paper hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink';
export const btnSmallDark =
  'inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-ink px-3 text-xs font-medium text-white transition hover:bg-ink/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 active:scale-[0.97]';
export const field =
  'w-full rounded-lg border border-line bg-white px-3 py-2 text-base text-ink placeholder:text-faint focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink sm:text-sm';

/** Inline style for a staggered card entrance. */
export const stagger = (i: number, step = 60) => ({ animationDelay: `${Math.min(i, 8) * step}ms` });

// ---------- icons ----------

type IconProps = { className?: string };
const I = ({ d, className = 'h-5 w-5' }: IconProps & { d: string }) => (
  <svg className={`shrink-0 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
export const IconSend = (p: IconProps) => <I {...p} d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />;
export const IconStop = (p: IconProps) => <I {...p} d="M6 6h12v12H6z" />;
export const IconPlus = (p: IconProps) => <I {...p} d="M12 5v14M5 12h14" />;
export const IconReplay = (p: IconProps) => <I {...p} d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />;
export const IconSparkle = (p: IconProps) => <I {...p} d="m12 3-1.9 5.8L4 10.7l6.1 1.9L12 18.5l1.9-5.9 6.1-1.9-6.1-1.9z" />;
export const IconNoPhoto = (p: IconProps) => <I {...p} d="m2 2 20 20M9 9a3 3 0 0 0 4.2 4.2M7 4h10l2 3h1a2 2 0 0 1 2 2v9M17 21H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1" />;
export const IconBattery = (p: IconProps) => <I {...p} d="M6 7h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM22 11v2M11 9l-2 3h4l-2 3" />;
export const IconAlert = (p: IconProps) => <I {...p} d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />;
export const IconCheck = (p: IconProps) => <I {...p} d="M20 6 9 17l-5-5" />;
export const IconPrinter = (p: IconProps) => <I {...p} d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" />;
export const IconHeadset = (p: IconProps) => <I {...p} d="M3 14v-2a9 9 0 0 1 18 0v2M21 14a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2zM3 14a2 2 0 0 0 2 2h1v-6H5a2 2 0 0 0-2 2zM18 16v1a4 4 0 0 1-4 4h-2" />;
export const IconSearch = (p: IconProps) => <I {...p} d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3" />;
export const IconList = (p: IconProps) => <I {...p} d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />;
export const IconBook = (p: IconProps) => <I {...p} d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />;
export const IconLink = (p: IconProps) => <I {...p} d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />;
/** The sources toggle: a panel with its right column filled when sources show. */
export const IconPanel = ({ className = 'h-5 w-5', on }: IconProps & { on: boolean }) => (
  <svg className={`shrink-0 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M15 4v16" />
    {on && <path d="M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4z" fill="currentColor" />}
  </svg>
);

// ---------- brand ----------

/** The CTI logo as the assistant's chathead (D2). `busy` adds a soft gold pulse ring. */
export function Logo({ size = 32, busy = false }: { size?: number; busy?: boolean }) {
  return (
    <span className="relative inline-grid shrink-0" style={{ width: size, height: size }}>
      {busy && <span className="absolute inset-0 animate-ping rounded-full bg-brand/40" aria-hidden="true" />}
      <Image src="/brand/cti-logo.png" alt="CTI" width={size} height={size} className="relative rounded-full ring-1 ring-brand/40" priority={size >= 56} />
    </span>
  );
}

// ---------- product photo ----------

/**
 * A square photo tile (D5). A missing or failed photo shows a neutral tile, never a photo of
 * another code. Tiles 64 px and wider show an icon. Tiles 120 px and wider also show the text.
 */
export function Photo({ src, alt, size, className = '', icon }: { src?: string; alt: string; size: number; className?: string; icon?: React.ReactNode }) {
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>('loading');
  if (!src || state === 'failed') {
    return (
      <div className={`flex shrink-0 flex-col items-center justify-center gap-1 bg-paper text-faint ${className}`} style={{ aspectRatio: '1' }} role="img" aria-label="Photo not on file">
        {size >= 64 ? (icon ?? <IconNoPhoto className="h-7 w-7" />) : <span className="text-[10px]">—</span>}
        {size >= 120 && <span className="text-xs">Photo not on file</span>}
      </div>
    );
  }
  const loaded = state === 'loaded';
  return (
    <div className={`relative shrink-0 overflow-hidden ${loaded ? 'bg-paper' : 'animate-pulse bg-line'} ${className}`} style={{ aspectRatio: '1' }}>
      <Image
        src={src}
        alt={alt}
        width={480}
        height={480}
        sizes={`${size}px`}
        onLoad={() => setState('loaded')}
        onError={() => setState('failed')}
        className={`h-full w-full object-contain transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
}
