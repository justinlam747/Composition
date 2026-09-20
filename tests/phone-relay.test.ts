import { afterEach, describe, expect, it } from 'vitest';
import { once } from 'node:events';
import express from 'express';
import { WebSocket } from 'ws';
import request from 'supertest';
import { connect } from 'node:net';
import { PhoneRelay } from '../server/phoneRelay';
import { AppError } from '../server/storage';

const relays: PhoneRelay[] = [];
afterEach(async () => { await Promise.all(relays.splice(0).map(relay => relay.close())); });
async function setup() {
  const relay = new PhoneRelay(); relays.push(relay); const port = await relay.listen(0, '127.0.0.1');
  const app = express(); relay.routes(app);
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error instanceof AppError ? error.status : 500).json({ error: String(error) });
  });
  return { relay, port, app, pairing: relay.pair() };
}
describe('phone relay', () => {
  it('serves only the paired receiver on the LAN listener and revokes it on re-pairing', async () => {
    const { relay, pairing, port } = await setup();
    const url = `http://127.0.0.1:${port}`;
    expect((await fetch(`${url}/receiver?code=00000000`)).status).toBe(404);
    expect((await fetch(`${url}/api/projects?code=${pairing.code}`)).status).toBe(404);
    const response = await fetch(`${url}/receiver?code=${pairing.code}`);
    expect(response.status).toBe(200); expect(await response.text()).toContain('Run 20 latency pulses');
    expect((await fetch(`${url}/receiver?code=${pairing.code}`, { headers: { Origin: 'https://foreign.example' } })).status).toBe(404);
    relay.pair(); expect((await fetch(`${url}/receiver?code=${pairing.code}`)).status).toBe(404);
  });
  it('relays bounded preview configuration and SDP only for the active session', async () => {
    const { pairing, port, app, relay } = await setup();
    const phone = new WebSocket(`ws://127.0.0.1:${port}/phone?code=${pairing.code}`);
    await once(phone, 'open');
    const config = { type: 'preview-config', version: 1, streamId: 'de346203-e0f9-4a58-8af8-8469b0193206', mode: 'webrtc', fps: 60 };
    const received = once(phone, 'message');
    await request(app).post(`/api/phone/${pairing.id}/signal`).send(config).expect(204);
    expect(JSON.parse((await received)[0].toString())).toEqual(config);
    await request(app).post(`/api/phone/${pairing.id}/signal`).send({ ...config, fps: 500 }).expect(400);
    await request(app).post(`/api/phone/${pairing.id}/signal`).send({ type: 'signal', version: 1, streamId: config.streamId, kind: 'offer', sdp: 'a'.repeat(64001) }).expect(400);
    await request(app).post('/api/phone/wrong/signal').send(config).expect(404);
    relay.pair(); await request(app).post(`/api/phone/${pairing.id}/signal`).send(config).expect(404);
  });
  it('accepts a paired native sender and returns only desktop preview/state data', async () => {
    const { pairing, port, app } = await setup();
    const phone = new WebSocket(`ws://127.0.0.1:${port}/phone?code=${pairing.code}`);
    const hello = once(phone, 'message'); await once(phone, 'open');
    expect(JSON.parse((await hello)[0].toString()).type).toBe('connected');
    const preview = once(phone, 'message');
    await request(app).post(`/api/phone/${pairing.id}/preview`).set('Content-Type', 'image/jpeg').send(Buffer.from([255, 216, 255, 217])).expect(204);
    expect((await preview)[1]).toBe(true);
    const state = once(phone, 'message');
    await request(app).post(`/api/phone/${pairing.id}/state`).send({ aligned: true, recording: true }).expect(204);
    expect(JSON.parse((await state)[0].toString())).toEqual({ type: 'state', aligned: true, recording: true });
    const closed = once(phone, 'close');
    phone.send(JSON.stringify({ type: 'pose', version: 1, seq: 1, time: 1, tracking: 'normal', position: [0, 0, 0], quaternion: [0, 0, 0, 8] }));
    expect((await closed)[0]).toBe(1008);
  });
  it('rejects wrong codes and browser origins, and revokes old sessions on re-pairing', async () => {
    const { relay, pairing, port } = await setup();
    for (const options of [{ code: '00000000' }, { code: pairing.code, origin: 'https://example.com' }]) {
      const socket = new WebSocket(`ws://127.0.0.1:${port}/phone?code=${options.code}`, options.origin ? { origin: options.origin } : {});
      const error = await new Promise<Error>(resolve => socket.once('error', resolve));
      expect(error.message).toContain('403');
    }
    const phone = new WebSocket(`ws://127.0.0.1:${port}/phone?code=${pairing.code}`); await once(phone, 'open');
    const closed = once(phone, 'close'); const next = relay.pair(); await closed;
    expect(next.id).not.toBe(pairing.id);
  });
  it('rejects malformed WebSocket URLs without taking down the listener', async () => {
    const { port, pairing } = await setup();
    const socket = connect(port, '127.0.0.1'); await once(socket, 'connect');
    const response = once(socket, 'data');
    socket.write('GET http://[ HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n');
    expect((await response)[0].toString()).toContain('400 Bad Request'); socket.destroy();
    const phone = new WebSocket(`ws://127.0.0.1:${port}/phone?code=${pairing.code}`); await once(phone, 'open'); phone.close();
  });
});
