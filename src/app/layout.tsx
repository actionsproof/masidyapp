import type { Metadata, Viewport } from 'next'
import './globals.css'
import './workspace.css'

export const metadata: Metadata = {
  title: 'Masidy — Build and ship software',
  description: 'Describe what you need. Masidy builds it, previews it, and puts it live.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  userScalable: true,
  themeColor: '#f7f7f4',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
