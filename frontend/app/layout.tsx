import './globals.css'
import { Rajdhani, JetBrains_Mono, Inter } from 'next/font/google'
import { Operator } from '@/components/Operator'

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
          {/* CT (left, M4) / T (right, AK47) — original filled silhouettes, see Operator.tsx */}
          <Operator
            color="#22d3ee"
            weapon="straight"
            className="operator-idle-a absolute bottom-[-6%] left-[-2%] w-[26vw] max-w-[420px] h-[95vh] opacity-[0.09]"
          />
          <Operator
            color="#fb923c"
            weapon="curved"
            flip
            className="operator-idle-b absolute bottom-[-6%] right-[-2%] w-[26vw] max-w-[420px] h-[95vh] opacity-[0.09]"
          />
        </div>
        {children}
      </body>
    </html>
  )
}
