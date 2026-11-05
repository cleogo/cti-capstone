import type { Metadata } from 'next';
import { Outfit, Rubik } from 'next/font/google';
import './globals.css';

// docs/ui-design-decisions.md D3. next/font self-hosts the files, so text does not move on load.
const heading = Outfit({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-heading' });
const body = Rubik({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-body' });

const TITLE = 'CTI Product Assistant';
const DESCRIPTION =
  'Ask about CTI products and prices from the CTI catalog — 1,056 items of ' +
  'workplace safety, facility and institutional equipment, plus BLUETTI power ' +
  'stations. Every answer quotes the ' +
  'product code and the exact listed price.';
const SITE_URL = 'https://cti-product-assistant.vercel.app';

/**
 * metadataBase is what lets Next resolve relative OG URLs; without it the
 * Open Graph block is silently dropped from the served HTML in production,
 * which is the failure mode worth avoiding here — a link preview is only
 * checkable by pasting the URL somewhere, so it fails quietly.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: TITLE,
    locale: 'en_PH',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable}`}>
      <body className="bg-paper font-body text-ink antialiased">{children}</body>
    </html>
  );
}
