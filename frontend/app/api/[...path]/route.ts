import { NextRequest } from 'next/server'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
async function proxy(request: NextRequest, context: {params: Promise<{path: string[]}>}) {
  const {path} = await context.params
  const base = process.env.BACKEND_URL || 'http://127.0.0.1:8000'
  const url = new URL('/api/' + path.map(encodeURIComponent).join('/') + request.nextUrl.search, base)
  const headers = new Headers()
  for (const name of ['content-type','cookie','origin','range']) {
    const value = request.headers.get(name)
    if (value) headers.set(name,value)
  }
  try {
    const upstream = await fetch(url, {method:request.method,headers,
      body:['GET','HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
      cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(path[0]==='ai'?90000:20000)})
    const output = new Headers({'Cache-Control':'no-store'})
    output.set('Content-Type', upstream.headers.get('content-type') || 'application/json')
    for (const name of ['accept-ranges','content-range','content-length','content-disposition']) {
      const value=upstream.headers.get(name)
      if(value)output.set(name,value)
    }
    for (const cookie of upstream.headers.getSetCookie()) output.append('Set-Cookie',cookie)
    return new Response(upstream.body,{status:upstream.status,headers:output})
  } catch {
    return Response.json({detail:'Máy chủ học tập tạm thời chưa sẵn sàng. Hãy thử lại.'},{status:503})
  }
}
export {proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE}
