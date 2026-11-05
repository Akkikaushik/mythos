import { networkInterfaces } from 'node:os';
import { startServer } from './app';
import { configFromEnv } from './config';

const cfg = configFromEnv();
const server = await startServer(cfg);

const lan = Object.values(networkInterfaces())
  .flat()
  .filter((n) => n && n.family === 'IPv4' && !n.internal)
  .map((n) => `http://${n!.address}:${server.port}`);
if (lan.length) console.log(`[mythos] friends on your network can use: ${lan.join('  ')}`);

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  console.log('[mythos] shutting down...');
  await server.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
