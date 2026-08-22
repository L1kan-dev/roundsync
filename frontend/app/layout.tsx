import './globals.css'
export const metadata = {
  title: 'RoundSync',
  description: 'Automated CS2 AI Coaching',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
