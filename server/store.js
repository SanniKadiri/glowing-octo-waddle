import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import pg from 'pg';
import { blank } from '../src/domain.js';

const table = 'action_review_register';
const select = 'SELECT revision, register FROM ' + table + ' WHERE id = 1';
const initial = JSON.stringify(blank());

export async function openStore({ sqlite, databaseUrl, ca }) {
  if (databaseUrl) {
    const url = new URL(databaseUrl);
    // Connection-string SSL flags otherwise override node-postgres TLS settings.
    const sslMode = url.searchParams.get('sslmode');
    for (const flag of ['sslmode','sslcert','sslkey','sslrootcert','uselibpqcompat','ssl']) url.searchParams.delete(flag);
    if (!['disable', 'require', 'verify-full', null].includes(sslMode)) throw Error('Use PostgreSQL sslmode=disable, require or verify-full.');
    if (ca && sslMode === 'disable') throw Error('A PostgreSQL CA requires TLS.');
    const ssl = sslMode === 'disable' ? false : { rejectUnauthorized:true, ...(ca && { ca }) };
    const pool = new pg.Pool({connectionString:url.toString(),ssl,connectionTimeoutMillis:5000});
    pool.on('error', error => console.error('PostgreSQL connection lost:',error.code || error.name));
    try {
      await pool.query('CREATE TABLE IF NOT EXISTS '+table+' (id integer PRIMARY KEY CHECK (id = 1), revision integer NOT NULL, register jsonb NOT NULL)');
      await pool.query('INSERT INTO '+table+' VALUES (1, 0, $1) ON CONFLICT DO NOTHING',[initial]);
    } catch (error) {
      await pool.end();
      throw error;
    }
    return {
      read: async () => (await pool.query(select)).rows[0],
      write: async (revision,register) => (await pool.query(
        'UPDATE '+table+' SET revision = revision + 1, register = $1 WHERE id = 1 AND revision = $2',
        [JSON.stringify(register),revision])).rowCount === 1,
      close: () => pool.end()
    };
  }
  if (sqlite !== ':memory:') mkdirSync(dirname(sqlite),{recursive:true,mode:0o700});
  const db = new DatabaseSync(sqlite);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS '+table+' (id INTEGER PRIMARY KEY CHECK (id = 1), revision INTEGER NOT NULL, register TEXT NOT NULL)');
  db.prepare('INSERT OR IGNORE INTO '+table+' VALUES (1, 0, ?)').run(initial);
  const read = db.prepare(select);
  const write = db.prepare('UPDATE '+table+' SET revision = revision + 1, register = ? WHERE id = 1 AND revision = ?');
  return {
    read: () => { const row = read.get(); return {revision:row.revision,register:JSON.parse(row.register)}; },
    write: (revision,register) => write.run(JSON.stringify(register),revision).changes === 1,
    close: () => db.close()
  };
}
