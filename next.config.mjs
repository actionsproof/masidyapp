/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    return supabaseUrl ? [{ source: '/sb/:path*', destination: `${supabaseUrl}/:path*` }] : []
  },
}

export default nextConfig
