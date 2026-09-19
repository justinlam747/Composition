import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { randomBytes, randomInt } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import type { Express, Response } from 'express';
import express from 'express';
import { phoneMessageSchema, type PhoneEvent, type PhonePairing } from '../src/core/phoneProtocol';
import { AppError } from './storage';

interface Session extends PhonePairing { phone?: WebSocket; viewers: Set<Response>; lastSeq: number; lastTime: number }
export class PhoneRelay {
  private session?: Session;
  private server = createServer((_req, res) => { res.writeHead(404).end(); });
  private sockets = new WebSocketServer({ noServer: true, maxPayload: 2048, perMessageDeflate: false });
  private timer?: ReturnType<typeof setInterval>;
  private port = 0;
  constructor() {
    let attempts = 0, windowStart = Date.now();
    this.server.on('upgrade', (req, socket, head) => {
      if (Date.now() - windowStart > 60_000) { attempts = 0; windowStart = Date.now(); }
      let url: URL;
      try { url = new URL(req.url ?? '/', 'http://localhost'); }
      catch { socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); return; }
      const session = this.session;
      // This dedicated listener exposes no project files or paid-provider API.
      if (++attempts > 30 || req.headers.origin || url.pathname !== '/phone' || !session || Date.now() > session.expiresAt ||
        url.searchParams.get('code') !== session.code || session.phone) { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return; }
      this.sockets.handleUpgrade(req, socket, head, phone => {
        session.phone = phone; session.lastSeq = -1; session.lastTime = -1;
        session.expiresAt = Date.now() + 60 * 60_000;
        this.emit({ type: 'connection', connected: true });
        phone.send(JSON.stringify({ type: 'connected' }));
        let count = 0, start = Date.now();
        phone.on('message', (data, binary) => {
          if (Date.now() - start > 1000) { count = 0; start = Date.now(); }
          if (binary || ++count > 90 || session !== this.session) { phone.close(1008, 'Invalid stream'); return; }
          try {
            const message = phoneMessageSchema.parse(JSON.parse(data.toString()));
            if (message.type === 'pose') {
              if (message.seq <= session.lastSeq || message.time <= session.lastTime) return;
              session.lastSeq = message.seq; session.lastTime = message.time;
            }
            this.emit(message);
          } catch { phone.close(1008, 'Invalid pose'); }
        });
        phone.on('error', () => phone.terminate());
        phone.on('close', () => {
          if (session.phone !== phone) return;
          session.phone = undefined;
          if (this.session === session) this.emit({ type: 'connection', connected: false });
        });
      });
    });
  }
  async listen(port = 3003, host = '0.0.0.0') {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(port, host, () => { this.server.removeListener('error', reject); resolve(); });
    });
    this.port = (this.server.address() as { port: number }).port;
    this.timer = setInterval(() => {
      if (this.session && Date.now() > this.session.expiresAt) this.end();
      else this.session?.viewers.forEach(res => res.write(': heartbeat\n\n'));
    }, 1000);
    this.timer.unref();
    return this.port;
  }
  pair(): PhonePairing {
    this.end();
    const hosts = [...new Set(Object.values(networkInterfaces()).flat().filter(net => net && !net.internal && net.family === 'IPv4').map(net => net!.address))];
    const session: Session = { id: randomBytes(24).toString('hex'), code: String(randomInt(10_000_000, 100_000_000)),
      addresses: hosts.map(host => `${host}:${this.port}`), expiresAt: Date.now() + 10 * 60_000, viewers: new Set(), lastSeq: -1, lastTime: -1 };
    this.session = session;
    return { id: session.id, code: session.code, addresses: session.addresses, expiresAt: session.expiresAt };
  }
  private require(id: string) {
    if (!this.session || this.session.id !== id || Date.now() > this.session.expiresAt) throw new AppError(404, 'PHONE_SESSION_ENDED', 'Pair the phone again.');
    return this.session;
  }
  private emit(event: PhoneEvent) {
    const message = `data: ${JSON.stringify(event)}\n\n`;
    this.session?.viewers.forEach(res => { if (res.writableLength > 64_000) { res.end(); this.session?.viewers.delete(res); } else res.write(message); });
  }
  routes(app: Express) {
    app.post('/api/phone/session', (_req, res) => res.status(201).json(this.pair()));
    app.get('/api/phone/:id/events', (req, res) => {
      const session = this.require(req.params.id);
      if (session.viewers.size >= 2) throw new AppError(409, 'PHONE_VIEWERS_FULL', 'This phone session is already open.');
      res.setHeader('Content-Type', 'text/event-stream'); res.setHeader('X-Accel-Buffering', 'no'); res.flushHeaders();
      res.write(`data: ${JSON.stringify({ type: 'connection', connected: !!session.phone })}\n\n`);
      session.viewers.add(res); req.on('close', () => session.viewers.delete(res));
    });
    app.post('/api/phone/:id/preview', express.raw({ type: 'image/jpeg', limit: '250kb' }), (req, res) => {
      const phone = this.require(req.params.id).phone;
      if (Buffer.isBuffer(req.body) && phone?.readyState === WebSocket.OPEN && phone.bufferedAmount < 250_000) phone.send(req.body, { binary: true });
      res.sendStatus(204);
    });
    app.post('/api/phone/:id/state', express.json({ limit: '1kb' }), (req, res) => {
      const phone = this.require(req.params.id).phone;
      if (typeof req.body?.recording !== 'boolean' || typeof req.body?.aligned !== 'boolean') throw new AppError(400, 'INVALID_PHONE_STATE', 'Invalid phone state.');
      if (phone?.readyState === WebSocket.OPEN) phone.send(JSON.stringify({ type: 'state', recording: req.body.recording, aligned: req.body.aligned }));
      res.sendStatus(204);
    });
    app.delete('/api/phone/:id', (req, res) => { this.require(req.params.id); this.end(); res.sendStatus(204); });
  }
  end() {
    const session = this.session; if (!session) return;
    this.emit({ type: 'ended' }); this.session = undefined;
    session.viewers.forEach(res => res.end()); session.viewers.clear(); session.phone?.terminate();
  }
  async close() {
    this.end(); clearInterval(this.timer); this.sockets.close();
    if (this.server.listening) await new Promise<void>(resolve => this.server.close(() => resolve()));
  }
}
