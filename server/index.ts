import 'dotenv/config';
import { createApp } from './app';
import { PhoneRelay } from './phoneRelay';
const phone = process.argv.includes('--phone') ? new PhoneRelay() : undefined;
if (phone) { await phone.listen(Number(process.env.PHONE_PORT || 3003)); console.log('Phone tracking bridge enabled. Pair from the editor.'); }
const { app, jobs } = await createApp({ phone });
const port = Number(process.env.PORT || 3001);
const server = app.listen(port, '127.0.0.1', () => console.log(`composition server: http://127.0.0.1:${port}`));
let checking = false;
const timer = setInterval(async () => { if (checking) return; checking = true; try { await jobs.tick(); } catch { console.error('Could not update saved generation jobs.'); } finally { checking = false; } }, 5000);
timer.unref();
function stop() { clearInterval(timer); server.close(); void phone?.close(); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
