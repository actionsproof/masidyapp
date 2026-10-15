import '../src/app/globals.css'
import '../src/app/workspace.css'

export const metadata = {
  title: 'Masidy — Build and ship with AI',
  description: 'Masidy is your branded AI app builder and deployment workspace.',
  icons: {
    icon: '/icon.svg',
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
