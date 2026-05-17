import type { Metadata, Viewport } from 'next'
import Image from 'next/image'
import { ClientLayout } from '@/components/ClientLayout'
import './globals.css'

export const metadata: Metadata = {
  title: 'STC AutoTrade',
  description: 'Trading Bot Automation System',
  generator: 'v0.app',
  icons: {
    icon: [
      { url: '/logo.png', media: '(prefers-color-scheme: light)' },
      { url: '/logo.png',  media: '(prefers-color-scheme: dark)'  },
      { url: '/logo.png', type: 'image' },
    ],
    apple: '/logo.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // ✅ FIX: Nilai ini adalah initial/fallback sebelum JS berjalan.
  //    Karena app default = dark, kedua nilai pakai warna dark.
  //    ThemeWrapper akan override meta[name="theme-color"] secara dinamis
  //    setelah tema dimuat — inilah yang sebenarnya mengontrol warna status
  //    bar di Android WebView.
  themeColor: '#000000',
  viewportFit: 'cover',
}

const initialSplashStyles = `
  html, body { margin: 0; padding: 0; }
  html, body { background: #0a0a0a !important; }

  /* ── Overlay utama ── */
  #__stc_splash {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: #0a0a0a;
    z-index: 99999;
    transition: opacity 0.5s ease-out;
    overflow: hidden;
  }
  #__stc_splash.hide {
    opacity: 0;
    pointer-events: none;
  }

  /* ── Wrapper: logo + loading dalam satu kolom ── */
  #__stc_splash .splash-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  /* ── Logo: muncul besar → tahan 3 detik → mengecil + naik ── */
  #__stc_splash .splash-logo {
    width: 160px;
    height: 160px;
    object-fit: contain;
    border-radius: 36px;
    display: block;

    /* Satu animasi penuh mengurus seluruh lifecycle logo */
    animation:
      __stc_logo_seq  4s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards,
      __stc_logo_glow 2.8s ease-in-out 1s infinite;
  }

  /* ── Loading: slide up dari bawah logo di detik ke-3 ── */
  #__stc_splash .splash-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    margin-top: 28px;

    animation: __stc_loading_in 0.55s cubic-bezier(0.34, 1.2, 0.64, 1) 3s both;
  }

  #__stc_splash .splash-text {
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.35);
  }

  #__stc_splash .splash-dots {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  #__stc_splash .splash-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #00d4aa;
    animation: __stc_dot 1.4s ease-in-out infinite;
  }
  #__stc_splash .splash-dot:nth-child(1) { animation-delay: 0s;   }
  #__stc_splash .splash-dot:nth-child(2) { animation-delay: 0.2s; }
  #__stc_splash .splash-dot:nth-child(3) { animation-delay: 0.4s; }

  /* ── Keyframes ── */

  /* Logo: fade+scale in → hold → kecilkan + angkat ke atas */
  @keyframes __stc_logo_seq {
    0%   { opacity: 0;   transform: scale(0.65) translateY(0);     }
    15%  { opacity: 1;   transform: scale(1.06) translateY(0);     } /* overshoot */
    22%  { opacity: 1;   transform: scale(1)    translateY(0);     } /* settle */
    74%  { opacity: 1;   transform: scale(1)    translateY(0);     } /* tahan */
    100% { opacity: 1;   transform: scale(0.78) translateY(-32px); } /* mengecil + naik */
  }

  /* Glow hijau berulang */
  @keyframes __stc_logo_glow {
    0%, 100% { filter: drop-shadow(0 0  0px rgba(0,212,170,0.0));  }
    50%       { filter: drop-shadow(0 0 30px rgba(0,212,170,0.5)); }
  }

  /* Loading slide up dari bawah */
  @keyframes __stc_loading_in {
    from { opacity: 0; transform: translateY(22px); }
    to   { opacity: 1; transform: translateY(0);    }
  }

  /* Dot bounce */
  @keyframes __stc_dot {
    0%, 80%, 100% { opacity: 0.2;  transform: scale(0.75); }
    40%           { opacity: 1;    transform: scale(1.3);  }
  }
`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: initialSplashStyles }} />
      </head>
      <body className="font-sans antialiased">
        <div id="__stc_splash">
          <div className="splash-inner">
            {/* Logo besar di tengah */}
            <Image
              src="/logo.png"
              alt="STC AutoTrade"
              className="splash-logo"
              width={160}
              height={160}
            />

            {/* Loading slide up dari bawah logo setelah 3 detik */}
            <div className="splash-loading">
              <span className="splash-text">Loading</span>
              <div className="splash-dots">
                <span className="splash-dot" />
                <span className="splash-dot" />
                <span className="splash-dot" />
              </div>
            </div>
          </div>
        </div>

        <ClientLayout>
          {children}
        </ClientLayout>
      </body>
    </html>
  )
}