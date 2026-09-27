import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const port = Number(process.env.WEB_PORT || 8080);
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};

createServer(async (req,res)=>{
  try{
    const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
    const safe = normalize(pathname).replace(/^([.][.][/\\])+/, '');
    const file = join(root, safe === '/' ? 'index.html' : safe);
    const body = await readFile(file);
    res.writeHead(200, {'content-type':types[extname(file).toLowerCase()]||'application/octet-stream'});
    res.end(body);
  }catch{
    res.writeHead(404, {'content-type':'text/plain; charset=utf-8'});
    res.end('Not found');
  }
}).listen(port, ()=>console.log(`United Delhi web client: http://localhost:${port}`));
