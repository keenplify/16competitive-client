import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
const server=await createServer({configFile:false,root:new URL('.',import.meta.url).pathname,plugins:[react(),tailwind()],server:{host:'127.0.0.1',port:5199,strictPort:true,fs:{allow:[process.cwd()]}}})
await server.listen(); server.printUrls()
