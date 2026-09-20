import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { WebSocket, WebSocketServer } from 'ws';
import { attachDirectorLive, directorLiveSetup, liveClientMessageSchema } from '../server/directorLive';

describe('director voice relay', () => {
  const cleanup: (() => Promise<unknown> | void)[] = [];
  afterEach(async () => { for (const close of cleanup.reverse()) await close(); cleanup.length = 0; });
  async function setup() {
    const upstream = new WebSocketServer({ port: 0 }); await once(upstream, 'listening');
    cleanup.push(async () => { upstream.clients.forEach(client => client.terminate()); await new Promise<void>(resolve => upstream.close(() => resolve())); });
    const server: Server = createServer(); const closeRelay = attachDirectorLive(server, { connect: () => new WebSocket(`ws://127.0.0.1:${(upstream.address() as { port: number }).port}`) });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    cleanup.push(async () => { closeRelay(); await new Promise<void>(resolve => server.close(() => resolve())); });
    const incoming: Record<string, any>[] = [], remoteMessages: Record<string, any>[] = []; let remote!: WebSocket;
    upstream.on('connection', socket => { remote = socket; socket.on('message', raw => { const value = JSON.parse(raw.toString()); remoteMessages.push(value); if (value.setup) socket.send(JSON.stringify({ setupComplete: {} })); }); });
    const client = new WebSocket(`ws://127.0.0.1:${(server.address() as { port: number }).port}/api/director/live`, { origin: 'http://127.0.0.1:5173' });
    client.on('message', raw => incoming.push(JSON.parse(raw.toString()))); await once(client, 'open'); cleanup.push(() => { client.terminate(); });
    client.send(JSON.stringify({ type: 'start', sessionId: 'test', messages: [], context: '{}' }));
    await vi.waitFor(() => expect(incoming.some(message => message.type === 'ready')).toBe(true));
    return { client, incoming, remoteMessages, remote: () => remote };
  }
  it('forwards PCM and transcripts but keeps native Gemini audio out of browser playback', async () => {
    const relay = await setup(); relay.client.send(Buffer.from([0, 0, 1, 0]));
    await vi.waitFor(() => expect(relay.remoteMessages.some(message => message.realtimeInput?.audio?.data === 'AAABAA==')).toBe(true));
    relay.remote().send(JSON.stringify({ serverContent: { inputTranscription: { text: 'Hello' }, outputTranscription: { text: 'Hi there' }, modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'AAA=' } }, { inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'AQA=' } }] }, turnComplete: true } }));
    await vi.waitFor(() => expect(relay.incoming.some(message => message.type === 'turn-complete')).toBe(true));
    expect(relay.incoming.filter(message => message.type === 'audio')).toHaveLength(0);
    expect(relay.incoming.find(message => message.type === 'turn-complete')).toMatchObject({ text: 'Hi there', turn: 0 });
    expect(relay.incoming.some(message => message.type === 'transcript' && message.text === 'Hello')).toBe(true);
    relay.remote().send(JSON.stringify({ serverContent: { interrupted: true } }));
    await vi.waitFor(() => expect(relay.incoming.some(message => message.type === 'interrupted')).toBe(true));
  });
  it('does not dispatch a cancelled deferred tool and deduplicates tool IDs', async () => {
    const relay = await setup();
    relay.client.send(JSON.stringify({ type: 'activity', active: true }));
    relay.remote().send(JSON.stringify({ serverContent: { inputTranscription: { text: 'Yes' } } }));
    const call = { id: 'cancel-me', name: 'director_decision', args: { decision: 'approve', proposalId: 'p', revision: 1 } };
    relay.remote().send(JSON.stringify({ toolCall: { functionCalls: [call] } }));
    relay.remote().send(JSON.stringify({ toolCallCancellation: { ids: ['cancel-me'] } }));
    relay.client.send(JSON.stringify({ type: 'activity', active: false }));
    await new Promise(resolve => setTimeout(resolve, 950));
    expect(relay.incoming.some(message => message.type === 'tool' && message.id === 'cancel-me')).toBe(false);
    relay.remote().send(JSON.stringify({ toolCall: { functionCalls: [{ id: 'status1', name: 'director_status', args: {} }, { id: 'status1', name: 'director_status', args: {} }] } }));
    await vi.waitFor(() => expect(relay.incoming.filter(message => message.type === 'tool' && message.id === 'status1')).toHaveLength(1));
    relay.client.send(JSON.stringify({ type: 'tool-result', id: 'status1', result: '{"status":"ready"}' }));
    await vi.waitFor(() => expect(relay.remoteMessages.some(message => message.toolResponse?.functionResponses[0].id === 'status1')).toBe(true));
  });
  it('resumes a long session without exposing its handle to the browser', async () => {
    const relay = await setup();
    relay.remote().send(JSON.stringify({ sessionResumptionUpdate: { resumable: true, newHandle: 'private-resume-token' } }));
    relay.remote().send(JSON.stringify({ goAway: { timeLeft: '5s' } }));
    await vi.waitFor(() => expect(relay.remoteMessages.filter(message => message.setup)).toHaveLength(2));
    expect(relay.remoteMessages.filter(message => message.setup)[1].setup.sessionResumption.handle).toBe('private-resume-token');
    expect(JSON.stringify(relay.incoming)).not.toContain('private-resume-token');
  });
  it('bounds browser payloads and declares only closed tools', () => {
    expect(liveClientMessageSchema.safeParse({ type: 'text', text: 'x'.repeat(4001) }).success).toBe(false);
    const setup = directorLiveSetup('{}'); expect(setup.setup.generationConfig.responseModalities).toEqual(['AUDIO']);
    expect(setup.setup.tools[0].functionDeclarations.map(tool => tool.name)).toEqual(['director_request', 'director_decision', 'director_status']);
    expect(JSON.stringify(setup)).not.toContain('apiKey');
    const demoInstruction = JSON.stringify(directorLiveSetup('{}', undefined, true));
    expect(demoInstruction).toContain('director_request for every scene-edit request');
    expect(demoInstruction).toContain('director_decision for approvals or cancellations');
    expect(JSON.stringify(directorLiveSetup('{}'))).toContain('ask exactly one concise question');
  });
});
