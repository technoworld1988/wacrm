import type { MetadataRoute } from 'next'

/**
 * Web app manifest — lets the CRM be installed to a phone or desktop
 * home screen (required on iPhone before push notifications work).
 * NEXT_PUBLIC_APP_NAME lets a white-label deployment rename the app.
 */
export default function manifest(): MetadataRoute.Manifest {
  const name = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'TECHNO WORLD CRM'
  return {
    name,
    short_name: name.length > 12 ? 'CRM' : name,
    description: 'Shared WhatsApp inbox, contacts, pipelines and automations.',
    id: '/',
    start_url: '/inbox',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F1F2FA',
    theme_color: '#1B1655',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
