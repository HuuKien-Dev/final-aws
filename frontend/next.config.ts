import type { NextConfig } from 'next'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'
export default function configuration(phase: string): NextConfig {
const development = phase === PHASE_DEVELOPMENT_SERVER
// React debugging and hot reload need these permissions only in next dev.
const scriptSources = development ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'"
const connectSources = development ? "'self' ws: wss:" : "'self'"
const config: NextConfig = {
  output: 'standalone', poweredByHeader: false,
  experimental: { useTypeScriptCli: false, cpus: 1 },
  async headers() { return [{source: '/:path*', headers: [
    {key:'X-Content-Type-Options',value:'nosniff'},
    {key:'Referrer-Policy',value:'same-origin'},
    {key:'Content-Security-Policy',value:`default-src 'self'; script-src ${scriptSources}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src ${connectSources}; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`}
  ]}] }
}
return config
}
