import './globals.css'
import { Rajdhani, JetBrains_Mono, Inter } from 'next/font/google'

const display = Rajdhani({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-display' })
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-mono' })
const body = Inter({ subsets: ['latin'], variable: '--font-body' })

export const metadata = {
  title: 'RoundSync',
  description: 'Personalized CS2 AI coaching that explains exactly what went wrong, moment by moment.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable} ${body.variable}`}>
      <body>
        <div className="app-backdrop">
          <div className="hero-mesh" />
          <div className="hero-grid" />
          {/* CT (left) / T (right) — AI-generated operator artwork, not extracted from CS2's
              own game files (corrected 2026-08-27; this comment previously said "real in-game
              operator renders", which was wrong). Still styled to evoke CS2's CT/T factions, so
              the Valve disclaimer below still applies the same way it would for a real asset. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/operators/ct.png"
            alt=""
            className="operator-idle-a absolute bottom-[-2%] left-[0%] w-[30vw] max-w-[580px] h-[100vh] object-contain object-bottom opacity-[0.6]"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/operators/t.png"
            alt=""
            className="operator-idle-b absolute bottom-[-2%] right-[0%] w-[30vw] max-w-[580px] h-[100vh] object-contain object-bottom opacity-[0.6]"
          />
        </div>
        {children}
        {/* Global fan-content disclaimer — lives here, not inside a specific tab's markup, so
            it's genuinely present everywhere the operator art (and any Valve-derived imagery
            elsewhere in the app) actually renders: every tab, and the pre-login landing page.
            Previously only rendered inside the Home tab's own JSX, invisible on every other
            tab — found 2026-08-27 while auditing layout.tsx's global backdrop. */}
        <p className="fixed bottom-0 inset-x-0 z-30 text-center text-[10px] leading-relaxed text-[var(--text-dim)] bg-[var(--void)]/80 backdrop-blur-sm px-4 py-1.5 pointer-events-none">
          RoundSync is an independent, fan-made tool and is not affiliated with or endorsed by Valve Corporation.
          Counter-Strike 2, map imagery, rank icons, and operator artwork are trademarks/property of Valve
          Corporation or depict Valve-owned characters; used here for identification purposes only.
        </p>
      </body>
    </html>
  )
}
