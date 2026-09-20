import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';
test.use({ permissions: ['microphone'], launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });

async function scene(page: Page) {
  return page.evaluate(async () => { const path = '/src/core/store.ts'; return (await import(path)).studio.get().project; });
}
async function openDirector(page: Page) {
  await page.goto('/#editor');
  await expect(page.getByRole('region', { name: 'Scene editor', exact: true })).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Director', exact: true }).click();
}
async function markFloor(page: Page) {
  await page.getByRole('button', { name: 'Pick placement point', exact: true }).click();
  const canvas = page.getByLabel('Interactive 3D character viewport'); const bounds = (await canvas.boundingBox())!;
  await page.mouse.click(bounds.x + bounds.width * .3, bounds.y + bounds.height * .7);
  await expect(page.getByRole('button', { name: 'Placement point set' })).toBeVisible();
}
async function ask(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Message director' }).fill(text);
  await page.getByRole('button', { name: 'Send to director' }).click();
}

test('director clarifies, previews, applies and saves a desk with undo/redo', async ({ page }) => {
  await openDirector(page);
  await ask(page, 'Add a desk here');
  await expect(page.getByRole('log')).toContainText('Click Pick placement point');
  expect((await scene(page)).objects).toHaveLength(1);
  await markFloor(page); await ask(page, 'Add a desk here');
  const proposal = page.getByRole('region', { name: 'Director proposal' });
  await expect(proposal).toBeVisible(); expect((await scene(page)).objects).toHaveLength(1);
  await proposal.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.getByText('Suggestion preview · not applied')).toBeVisible(); expect((await scene(page)).objects).toHaveLength(1);
  await proposal.getByRole('button', { name: 'End preview' }).click();
  await ask(page, 'Yes please');
  await expect(page.getByText('Changes applied', { exact: true })).toBeVisible();
  const applied = await scene(page); expect(applied.objects).toHaveLength(2); expect(applied.objects[1].geometry.parts).toHaveLength(5);
  await page.screenshot({ path: 'test-results-director/director-desktop.png' });
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); expect((await scene(page)).objects).toHaveLength(1);
  await page.getByRole('button', { name: 'Director', exact: true }).focus(); await page.keyboard.press('Control+Shift+Z'); expect((await scene(page)).objects).toHaveLength(2);
  await page.getByRole('button', { name: 'Save current project' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saving project' })).toHaveCount(0);
  await page.reload(); await expect.poll(async () => (await scene(page)).objects.length).toBe(2);
  expect((await scene(page)).objects[1].geometry.parts).toHaveLength(5);
  const guide = await page.evaluate(async () => { const path = '/src/scene/guideExport.ts'; const { blob } = await (await import(path)).exportGuide(); return { size: blob.size, type: blob.type }; });
  expect(guide.size).toBeGreaterThan(1000); expect(guide.type).toContain('video/');
});

test('cancel leaves the scene unchanged and a scene edit requires renewed approval', async ({ page }) => {
  await openDirector(page); await markFloor(page); await ask(page, 'Add a desk here');
  const proposal = page.getByRole('region', { name: 'Director proposal' });
  await proposal.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(proposal).toHaveCount(0); expect((await scene(page)).objects).toHaveLength(1);
  await ask(page, 'Add a desk here'); await expect(proposal).toBeVisible();
  await page.evaluate(async () => { const path = '/src/core/store.ts'; (await import(path)).studio.addBox(); });
  await proposal.getByRole('button', { name: 'Refresh & review' }).click();
  await expect(page.getByRole('log')).toContainText('refreshed the proposal'); expect((await scene(page)).objects).toHaveLength(2);
  await proposal.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect.poll(async () => (await scene(page)).objects.length).toBe(3);
});

test('clear chat removes the conversation and pending proposal without changing the scene', async ({ page }) => {
  await openDirector(page); const before = await scene(page);
  await ask(page, 'Frame the character with the camera');
  await expect(page.getByRole('region', { name: 'Director proposal' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear director chat', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Director proposal' })).toHaveCount(0);
  await expect(page.locator('.director-message')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'What are we making?', exact: true })).toBeVisible();
  expect(await scene(page)).toEqual(before);
  const sessionState = await page.evaluate(async () => {
    const storePath = '/src/core/store.ts', sessionPath = '/src/core/directorSession.ts';
    const studio = (await import(storePath)).studio;
    return (await import(sessionPath)).directorSession(studio.get().project.id).get();
  });
  expect(sessionState).toMatchObject({ messages: [], proposal: null, execution: null, busy: false, error: '' });
});

test('director places a relative marker through preview and approval then builds a desk there', async ({ page }) => {
  await openDirector(page);
  await page.evaluate(async () => { const path = '/src/core/store.ts'; const studio = (await import(path)).studio; studio.setValue([2, 0, -1]); });
  const before = await scene(page);
  const placement = () => page.evaluate(async () => { const path = '/src/core/store.ts'; const state = (await import(path)).studio.get(); return { marker: state.directorPlacement, preview: state.directorPreviewPlacement, undo: state.undoCount }; });
  const undo = (await placement()).undo;
  await ask(page, 'Place the marker 5 units to the right of the humanoid');
  const proposal = page.getByRole('region', { name: 'Director proposal' }); await expect(proposal).toContainText('world +X');
  expect((await placement()).marker).toBeNull();
  await proposal.getByRole('button', { name: 'Preview', exact: true }).click();
  expect(await placement()).toEqual({ marker: null, preview: [7, 0, -1], undo });
  await proposal.getByRole('button', { name: 'End preview' }).click(); expect((await placement()).preview).toBeNull();
  await proposal.getByRole('button', { name: 'Cancel', exact: true }).click(); expect((await placement()).marker).toBeNull();
  await ask(page, 'Place the marker 5 units to the right of the humanoid'); await expect(proposal).toBeVisible(); await ask(page, 'Yes please');
  await expect(page.getByText('Marker placed', { exact: true })).toBeVisible();
  expect(await placement()).toEqual({ marker: [7, 0, -1], preview: null, undo }); expect(await scene(page)).toEqual(before);
  await ask(page, 'Add a desk here'); await expect(proposal).toBeVisible(); await ask(page, 'Yes please');
  await expect.poll(async () => (await scene(page)).objects.length).toBe(2);
  expect((await scene(page)).objects[1].position).toEqual([7, 0, -1]);
});

test('director creates a camera and handles provider errors without a scene edit', async ({ page }) => {
  await openDirector(page); await ask(page, 'Frame the character with the camera');
  await page.getByRole('region', { name: 'Director proposal' }).getByRole('button', { name: 'Apply', exact: true }).click();
  await expect.poll(async () => (await scene(page)).camera?.position).toEqual([0, 2, 5]);
  await ask(page, 'FAIL_DIRECTOR_TEST'); await expect(page.getByRole('alert')).toContainText('Test director failed');
  expect((await scene(page)).objects).toHaveLength(1);
});

test('director fits a mobile viewport with reachable input and approval controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await openDirector(page);
  await expect(page.getByRole('textbox', { name: 'Message director' })).toBeInViewport();
  await ask(page, 'Frame the character with the camera');
  await expect(page.getByRole('region', { name: 'Director proposal' }).getByRole('button', { name: 'Apply', exact: true })).toBeInViewport();
  await page.screenshot({ path: 'test-results-director/director-mobile.png' });
});

test('delayed recovery cannot replace or apply over a newer approved request', async ({ page }) => {
  await openDirector(page);
  const recovered = await page.evaluate(async () => {
    const apiPath = '/src/core/api.ts', storePath = '/src/core/store.ts', projectPath = '/src/core/project.ts';
    const api = (await import(apiPath)).api, project = (await import(storePath)).studio.get().project;
    const result = await api.directorTurn({ sessionId: (await import(projectPath)).uid(), project, context: { objectId: null, clipId: null, time: 0, placement: null }, messages: [], text: 'Frame the character with the camera' });
    localStorage.setItem('composition-director-execution', JSON.stringify({ projectId: project.id, sessionId: result.proposal.sessionId, executionId: result.proposal.id }));
    return { id: result.proposal.id, proposal: { ...result.proposal, status: 'approved' }, status: 'ready', animations: {} };
  });
  let release!: () => void, started = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/api/director/executions/${recovered.id}`, async route => { started = true; await gate; await route.fulfill({ json: recovered }); });
  await page.route('**/api/director/proposals/*/decision', async route => { const response = await route.fetch(); await route.fulfill({ json: { ...await response.json(), status: 'running' } }); });
  await page.evaluate(async () => {
    const sessionPath = '/src/core/directorSession.ts', storePath = '/src/core/store.ts';
    const session = new (await import(sessionPath)).DirectorSession((await import(storePath)).studio.get().project.id);
    (window as unknown as { recoverySession: typeof session }).recoverySession = session;
    session.setActive(true);
  });
  await expect.poll(() => started).toBe(true);
  const newerId = await page.evaluate(async () => {
    const session = (window as unknown as { recoverySession: { send(text: string): Promise<void>; decide(decision: string): Promise<void>; get(): { proposal: { id: string } } } }).recoverySession;
    await session.send('Frame the character with the camera'); await session.decide('approve'); return session.get().proposal.id;
  });
  release(); await page.waitForTimeout(100);
  expect(await page.evaluate(() => (window as unknown as { recoverySession: { get(): { proposal: { id: string } } } }).recoverySession.get().proposal.id)).toBe(newerId);
  expect((await scene(page)).camera).toBeUndefined();
  await page.evaluate(() => (window as unknown as { recoverySession: { setActive(value: boolean): void } }).recoverySession.setActive(false));
});

test.describe('director voice', () => {
  test('spoken approval uses the current proposal and stopping releases the microphone', async ({ page }) => {
    await page.addInitScript(() => {
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      (window as unknown as { directorTracks: MediaStreamTrack[] }).directorTracks = [];
      navigator.mediaDevices.getUserMedia = async constraints => { const stream = await original(constraints); (window as unknown as { directorTracks: MediaStreamTrack[] }).directorTracks.push(...stream.getTracks()); return stream; };
    });
    await page.route('**/api/capabilities', async route => { const response = await route.fetch(); await route.fulfill({ json: { ...await response.json(), directorVoice: true } }); });
    let socket!: WebSocketRoute; const replies: { type: string; id?: string; result?: string }[] = [];
    await page.routeWebSocket('**/api/director/live', ws => { socket = ws; ws.onMessage(raw => {
      if (typeof raw !== 'string') return; const data = JSON.parse(raw); replies.push(data);
      if (data.type === 'start') ws.send(JSON.stringify({ type: 'ready' }));
    }); });
    await openDirector(page); await markFloor(page);
    await page.getByRole('button', { name: 'Start director voice' }).click();
    await expect(page.getByRole('button', { name: 'Stop director voice' })).toContainText('listening');
    socket.send(JSON.stringify({ type: 'transcript', role: 'user', text: 'Add a desk here', turn: 1 }));
    socket.send(JSON.stringify({ type: 'tool', id: 'plan1', name: 'director_request', args: { request: 'Add a desk here' }, utterance: 'Add a desk here', turn: 1 }));
    await expect.poll(() => replies.find(reply => reply.id === 'plan1')).toBeTruthy();
    const pending = JSON.parse(replies.find(reply => reply.id === 'plan1')!.result!).proposal;
    socket.send(JSON.stringify({ type: 'input-start', turn: 2 }));
    socket.send(JSON.stringify({ type: 'tool', id: 'bad-approval', name: 'director_decision', args: { decision: 'approve', proposalId: pending.id, revision: pending.revision }, utterance: 'Yes but make it larger', turn: 2 }));
    await expect.poll(() => replies.find(reply => reply.id === 'bad-approval')).toBeTruthy();
    expect(JSON.parse(replies.find(reply => reply.id === 'bad-approval')!.result!).error).toContain('clear yes'); expect((await scene(page)).objects).toHaveLength(1);
    socket.send(JSON.stringify({ type: 'input-start', turn: 3 }));
    socket.send(JSON.stringify({ type: 'tool-cancelled', id: 'cancel-before-dispatch' }));
    socket.send(JSON.stringify({ type: 'tool', id: 'cancel-before-dispatch', name: 'director_decision', args: { decision: 'approve', proposalId: pending.id, revision: pending.revision }, utterance: 'Yes please', turn: 3 }));
    await page.waitForTimeout(100); expect((await scene(page)).objects).toHaveLength(1);
    await page.evaluate(async () => { const storePath = '/src/core/store.ts'; const studio = (await import(storePath)).studio; studio.addBox(); });
    socket.send(JSON.stringify({ type: 'tool', id: 'stale-approval', name: 'director_decision', args: { decision: 'approve', proposalId: pending.id, revision: pending.revision }, utterance: 'Yes please', turn: 3 }));
    await expect.poll(() => replies.find(reply => reply.id === 'stale-approval')).toBeTruthy();
    const refreshed = JSON.parse(replies.find(reply => reply.id === 'stale-approval')!.result!).proposal;
    expect(refreshed.revision).toBe(pending.revision + 1);
    socket.send(JSON.stringify({ type: 'tool', id: 'reused-approval', name: 'director_decision', args: { decision: 'approve', proposalId: refreshed.id, revision: refreshed.revision }, utterance: 'Yes please', turn: 3 }));
    await expect.poll(() => replies.find(reply => reply.id === 'reused-approval')).toBeTruthy();
    expect(JSON.parse(replies.find(reply => reply.id === 'reused-approval')!.result!).error).toContain('clear yes');
    await expect.poll(async () => (await scene(page)).objects.length).toBe(2);
    socket.send(JSON.stringify({ type: 'input-start', turn: 4 }));
    socket.send(JSON.stringify({ type: 'tool', id: 'approve1', name: 'director_decision', args: { decision: 'approve', proposalId: refreshed.id, revision: refreshed.revision }, utterance: 'Yes please', turn: 4 }));
    await expect.poll(async () => (await scene(page)).objects.length).toBe(3);
    await page.getByRole('button', { name: 'Minimize director' }).click();
    await expect(page.getByRole('region', { name: 'Director voice controls' })).toBeVisible();
    await page.getByRole('button', { name: 'Stop director voice' }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { directorTracks: MediaStreamTrack[] }).directorTracks.every(track => track.readyState === 'ended'))).toBe(true);
  });
  test('microphone denial leaves typed chat usable', async ({ page }) => {
    await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); }; });
    await page.route('**/api/capabilities', async route => { const response = await route.fetch(); await route.fulfill({ json: { ...await response.json(), directorVoice: true } }); });
    await openDirector(page); await page.getByRole('button', { name: 'Start director voice' }).click();
    await expect(page.getByRole('alert')).toContainText('Microphone access was denied');
    await ask(page, 'Frame the character with the camera'); await expect(page.getByRole('region', { name: 'Director proposal' })).toBeVisible();
  });
  test('an interrupted approval cannot apply after its delayed HTTP response', async ({ page }) => {
    await page.route('**/api/capabilities', async route => { const response = await route.fetch(); await route.fulfill({ json: { ...await response.json(), directorVoice: true } }); });
    let socket!: WebSocketRoute;
    await page.routeWebSocket('**/api/director/live', ws => { socket = ws; ws.onMessage(raw => { if (typeof raw === 'string' && JSON.parse(raw).type === 'start') ws.send(JSON.stringify({ type: 'ready' })); }); });
    await openDirector(page); await ask(page, 'Frame the character with the camera');
    await expect(page.getByRole('region', { name: 'Director proposal' })).toBeVisible();
    const pending = await page.evaluate(async () => { const storePath = '/src/core/store.ts', sessionPath = '/src/core/directorSession.ts'; const studio = (await import(storePath)).studio; return (await import(sessionPath)).directorSession(studio.get().project.id).get().proposal; });
    let release!: () => void, started = false;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/director/proposals/*/decision', async route => {
      if (route.request().postDataJSON().decision !== 'approve') { await route.continue(); return; }
      const response = await route.fetch(); started = true; await gate; await route.fulfill({ response });
    });
    await page.getByRole('button', { name: 'Start director voice' }).click(); await expect(page.getByRole('button', { name: 'Stop director voice' })).toContainText('listening');
    socket.send(JSON.stringify({ type: 'input-start', turn: 1 }));
    socket.send(JSON.stringify({ type: 'tool', id: 'interrupt-approval', name: 'director_decision', args: { decision: 'approve', proposalId: pending.id, revision: pending.revision }, utterance: 'Yes please', turn: 1 }));
    await expect.poll(() => started).toBe(true);
    socket.send(JSON.stringify({ type: 'tool-cancelled', id: 'interrupt-approval' })); await page.waitForTimeout(80); release();
    await expect(page.getByRole('log')).toContainText('Cancelled. Your scene has not changed.');
    expect((await scene(page)).camera).toBeUndefined();
    await page.getByRole('button', { name: 'Stop director voice' }).click();
  });
});
