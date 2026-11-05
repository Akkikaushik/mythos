import { LocalBackend } from './local';
import type { Backend } from './types';

export * from './types';

function createBackend(): Backend {
  const kind = import.meta.env.VITE_BACKEND ?? 'local';
  if (kind === 'local') {
    // empty = same origin (Vite dev proxy or the Node server serving the built app)
    return new LocalBackend((import.meta.env.VITE_API_URL ?? '').replace(/\/$/, ''));
  }
  throw new Error(`VITE_BACKEND="${kind}" is not available yet. Use VITE_BACKEND=local (see docs/DEPLOYMENT.md).`);
}

export const backend: Backend = createBackend();
