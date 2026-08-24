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
          {/* CT (left) / T (right) — real in-game operator renders */}
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
      </body>
    </html>
  )
}
