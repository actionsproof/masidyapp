import '../src/app/globals.css'

export const metadata = {
  title: 'Masidy — Build and ship with AI',
  description: 'Masidy is your branded AI app builder and deployment workspace.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
