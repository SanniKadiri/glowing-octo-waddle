import { invoke, isTauri } from '@tauri-apps/api/core';
import { MAX_BYTES, validate } from './domain.js';

export const desktop = isTauri();

export function connect({ mode, server, key }) {
  async function send(method, payload) {
    const body = payload && JSON.stringify(payload);
    if (body && new Blob([body]).size > MAX_BYTES) throw Error('The register exceeds the 16 MB storage limit.');
    try {
      if (mode === 'local') return await invoke('local_register', { payload:payload ?? null });
      if (desktop) return await invoke('remote_register', { server, key, payload:payload ?? null });
      const response = await fetch('/api/register', {
        method, body, credentials:'same-origin', redirect:'error',
        headers:{ ...(key && {Authorization:'Bearer '+key}), ...(body && {'Content-Type':'application/json'}) },
        signal:AbortSignal.timeout(15000)
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'The server returned an error.');
      return data;
    } catch (error) {
      const message = typeof error === 'string' ? error : error.message;
      if (error instanceof TypeError || error instanceof SyntaxError || error.name === 'TimeoutError') {
        throw Error('Could not reach the Action Review server.');
      }
      throw Error(message || 'Could not access the register.');
    }
  }
  return {
    async read() {
      const data = await send('GET');
      if (!Number.isSafeInteger(data.revision) || data.revision < 0) throw Error('Invalid register revision.');
      return {...data,register:validate(data.register)};
    },
    async write(revision,register) {
      return (await send('PUT',{revision,register})).revision;
    }
  };
}

export async function saveFile(blob, filename) {
  if (desktop) {
    return invoke('save_export',{filename,bytes:Array.from(new Uint8Array(await blob.arrayBuffer()))});
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url),2000);
}
