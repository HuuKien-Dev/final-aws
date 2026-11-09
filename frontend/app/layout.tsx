import type { Metadata } from 'next'
import './globals.css'
export const metadata: Metadata = {title:'Vươn Xa · Học tiếng Anh',description:'Tiếng Anh thực tế cho người Việt. Học từ dữ liệu có sẵn, không cần AI.'}
export default function Layout({children}:{children:React.ReactNode}) {
 return <html lang="vi"><body>{children}</body></html>
}
