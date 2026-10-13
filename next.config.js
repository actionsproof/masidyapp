// Replace next.config.ts with this file.
// /sb/* forwards auth and database calls through your own domain, so users' browsers never talk to the database supplier directly.
module.exports = {
  async rewrites() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    return supabaseUrl ? [{ source: '/sb/:path*', destination: `${supabaseUrl}/:path*` }] : []
  },
}
