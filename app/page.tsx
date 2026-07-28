// Archivo: app/page.tsx
// Pegá este contenido reemplazando el page.tsx que viene por defecto

'use client';

import dynamic from 'next/dynamic';

// Importamos BrandKit sin SSR porque usa Canvas API del navegador
const BrandKit = dynamic(() => import('../components/BrandKit'), {
  ssr: false,
  loading: () => (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <p style={{ color: '#888', fontSize: 16 }}>Cargando BrandKit...</p>
    </div>
  ),
});

export default function Home() {
  return <BrandKit />;
}
