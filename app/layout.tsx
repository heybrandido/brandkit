// Archivo: app/layout.tsx
// Reemplazá el layout.tsx que viene por defecto

import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BrandKit — Tu kit de marca en minutos',
  description: 'Subí tu logo y recibí una paleta de colores, tipografías, templates para redes y guía de marca completa.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
