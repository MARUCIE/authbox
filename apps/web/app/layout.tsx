import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Auth Box - Zero-Knowledge Password Manager & AI Gateway',
  description:
    'Manage passwords, OAuth authorizations, and AI agent access in one encrypted vault. Your credentials never leave your device in plaintext.',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased min-h-screen">{children}</body>
    </html>
  );
}
