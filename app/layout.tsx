import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_ORIGIN || 'http://localhost:3000'),
  icons: { icon: '/favicon.svg' },
  title: 'Cutroom — Poster Wall Studio',
  description: 'Turn photos and collage sheets into measured, print-ready poster walls.',
  openGraph: {
    title: 'Cutroom — Poster Wall Studio',
    description: 'Build the wall. Print the plan. Turn photos and collage sheets into a measured poster layout.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Cutroom poster wall studio' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Cutroom — Poster Wall Studio',
    description: 'Build the wall. Print the plan.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
