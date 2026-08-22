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
      <body>{children}</body>
    </html>
  )
}
