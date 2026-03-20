import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Auth Box',
    short_name: 'AuthBox',
    description:
      'Zero-knowledge password manager, authorization hub, and AI agent gateway.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b1326',
    theme_color: '#3730a3',
    icons: [
      {
        src: '/favicon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  };
}
