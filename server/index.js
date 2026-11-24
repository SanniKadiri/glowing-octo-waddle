import express from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openStore } from './store.js';
import { validate, MAX_BYTES } from '../src/domain.js';

const { HOST = '127.0.0.1', PORT = '8787', SQLITE_PATH = 'data/action-review.sqlite',
  DATABASE_URL, PG_CA_FILE, ACTION_REVIEW_KEY } = process.env;
const loopback = ['127.0.0.1', '::1', 'localhost'].includes(HOST);
if ((!loopback || ACTION_REVIEW_KEY) && (ACTION_REVIEW_KEY?.length ?? 0) < 24) {
  throw Error('Set ACTION_REVIEW_KEY to at least 24 characters for shared server access.');
}
const digest = value => createHash('sha256').update(value).digest();
const expected = ACTION_REVIEW_KEY && digest('Bearer '+ACTION_REVIEW_KEY);
const store = await openStore({sqlite:SQLITE_PATH,databaseUrl:DATABASE_URL,ca:PG_CA_FILE && readFileSync(PG_CA_FILE,'utf8')});
const app = express();
app.disable('x-powered-by');
app.use((req,res,next) => {
  res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
    'Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'"});
  next();
});
app.use('/api',(req,res,next) => {
  res.set('Cache-Control','no-store');
  if (expected && !timingSafeEqual(digest(req.get('authorization') ?? ''),expected)) {
    return res.status(401).json({error:'Enter the server access key in Storage settings.'});
  }
  next();
});
app.get('/api/register',async (_req,res) => res.json(await store.read()));
app.put('/api/register',express.json({limit:MAX_BYTES}),async (req,res) => {
  const revision = req.body?.revision;
  if (!Number.isInteger(revision) || revision < 0 || revision >= 2147483647) return res.status(400).json({error:'Invalid register revision.'});
  let register;
  try { register = validate(req.body.register); }
  catch (error) { return res.status(400).json({error:error.message}); }
  if (!await store.write(revision,register)) return res.status(409).json({error:'Someone updated the register. Reload before saving.'});
  res.json({revision:revision+1});
});
app.use('/api',(_req,res) => res.status(404).json({error:'Unknown API endpoint.'}));
app.use(express.static(resolve('dist')));
app.use((error,_req,res,_next) => {
  if (error.status === 400 || error.status === 413) return res.status(error.status).json({error:'The request is invalid or exceeds the register size limit.'});
  console.error('Request failed:',error.code || error.name);
  res.status(500).json({error:'The server could not access the register.'});
});
const listener = app.listen(Number(PORT),HOST,() => console.log('Action Review listening on '+HOST+':'+PORT));
for (const signal of ['SIGINT','SIGTERM']) process.once(signal,() => listener.close(async () => { await store.close(); }));
