# Gemini Director Integration Plan

## Product goal

Turn the editor into a live AI cinematography tool. A user pairs the iPhone, calibrates it to the scene camera, speaks or types a creative direction, and receives safe, previewable, editable camera and animation changes.

Demo line:

> Move the phone to direct the shot. Gemini watches the virtual take, understands the scene, and helps refine it like a cinematographer.

## Scope for the hackathon

### Must ship

- Gemini-powered shot planning from a natural-language brief.
- A live or near-live director panel that receives the current scene, camera state, phone calibration state, and a rendered scene preview.
- Structured Gemini actions that map to existing editor operations.
- Preview, accept, reject, and undo for every AI change.
- One complete workflow: pair phone → calibrate → record camera take → ask Gemini to refine → preview → export guide.
- A visible explanation of the AI contribution for the Gemini prize demo.

### Stretch goals

- Gemini Live voice conversation with spoken director cues.
- Upload a recorded guide and receive a shot breakdown or continuity critique.
- Generate storyboard frames and visual references for the current shot.
- Generate a visual character or prop concept and add it as a reference asset.

### Out of scope

- Replacing the existing animation model or timeline.
- Allowing Gemini to mutate project state without validation or user approval.
- Sending private phone camera frames to Gemini. Use the virtual scene preview and phone pose data unless the user explicitly enables another input.
- Building a general-purpose autonomous agent.

## Proposed experience

1. The user opens **Director** and selects a goal such as reveal, chase, product-style hero shot, or emotional close-up.
2. The user pairs the phone and presses **Calibrate**. The current phone pose becomes the reference for the scene camera.
3. The user records a physical camera move. Existing phone motion code creates a camera clip.
4. Gemini receives a compact scene snapshot, camera path summary, current guide preview or selected frames, and the user’s direction.
5. Gemini returns an explanation plus validated actions such as slowing a move, adding a hold, changing a target, reframing an object, or adding a transition.
6. The editor applies the proposal to a temporary preview state.
7. The user previews it, accepts it as one undoable edit, or rejects it.
8. The user exports the clean guide and optionally sends it through the existing video-generation flow.

## Gemini capabilities to use

### Phase 1: structured shot director

Use the existing server-side Gemini request path and add a director-specific schema. The model should return JSON only, with an explanation and a bounded list of actions. Structured output is the execution contract; it is not trusted as raw project state.

Suggested actions:

- `set_camera_target`
- `adjust_camera_key`
- `scale_camera_clip`
- `add_camera_hold`
- `move_object_track`
- `add_pose_key`
- `set_scene_direction`
- `request_storyboard`

Every action must include a reason, affected IDs, and a confidence value. The server validates IDs, channels, time ranges, duration limits, and object ownership before returning the proposal.

### Phase 2: visual shot critique

Capture a short guide or selected frames from the virtual scene and ask Gemini to identify framing, pacing, continuity, and visibility issues. Return critique items linked to timestamps where possible. Critique is advisory until converted into a structured proposal.

### Phase 3: Gemini Live director

Add a WebSocket session for audio input and spoken output. Give the model a small function surface that calls proposal generation rather than mutating the scene directly. Start with commands such as “hold,” “wider,” “follow the subject,” and “make the reveal slower.”

## Data contracts

Add a director-specific contract near `src/core/proposals.ts`:

```ts
type DirectorAction =
  | { kind: 'set_camera_target'; objectId: string; time: number; reason: string }
  | { kind: 'adjust_camera_key'; keyId: string; value: [number, number, number]; reason: string }
  | { kind: 'scale_camera_clip'; clipId: string; factor: number; reason: string }
  | { kind: 'add_camera_hold'; time: number; duration: number; reason: string }
  | { kind: 'add_pose_key'; objectId: string; target: string; time: number; value: [number, number, number]; reason: string };

type DirectorProposal = {
  id: string;
  mode: 'live' | 'demo';
  prompt: string;
  baseSignature: string;
  summary: string;
  actions: DirectorAction[];
};
```

The exact schema should reuse existing project types and validation helpers instead of duplicating track logic.

The director context should be a compact derived object, not the entire renderer state:

- Project duration and scene signature.
- Visible objects, dimensions, references, and current transforms.
- Camera transform and camera tracks.
- Phone connection, calibration, and recording status.
- Camera clip summaries and key timestamps.
- Selected object and current playhead time.
- User direction.

## Backend changes

### Provider layer

- Add `director(project, context, prompt)` to the provider interface.
- Keep Gemini credentials server-only.
- Use a dedicated Gemini model/configuration for structured JSON.
- Parse and validate the model response with Zod.
- Return actionable provider errors for missing credentials, invalid model output, and quota failures.
- Keep the existing object/composition/movement proposals working unchanged.

### API routes

Add routes in `server/app.ts`:

- `POST /api/director/proposals` — create a validated proposal from scene context and prompt.
- `POST /api/director/critique` — optional guide/frames critique endpoint.
- `GET /api/director/capabilities` — expose structured director, critique, and live-session availability.

Do not persist a proposal as project state until the client accepts it. Persist accepted edits through the existing project save/autosave path.

### Live session

For the stretch goal, add a separate server relay or provider session module. Keep the browser-to-server session separate from the existing phone WebSocket so phone pose transport remains deterministic and testable.

## Frontend changes

Add `src/components/DirectorPanel.tsx` with:

- Direction input and example prompts.
- Phone/calibration status.
- Current scene and camera summary.
- Record-take and stop-take controls.
- Critique/proposal loading and error states.
- Action list showing affected objects and timestamps.
- Preview, Accept, Reject, and Undo controls.
- Optional voice-session status.

Add a director store slice or local state only if the existing store cannot represent temporary proposals. Preview state must remain separate from saved `Project` state, matching the existing proposal preview behavior.

Extend the existing editor actions rather than adding a second camera-editing implementation. Camera edits should continue to flow through the current key and clip helpers, undo stack, `sceneSignature`, and persistence logic.

## Asset and video inputs

- Use the existing guide export as the canonical visual result.
- For critique, either send the guide MP4 or extract a small number of representative frames server-side.
- Keep the phone’s physical camera feed local by default.
- Send phone orientation samples and the rendered virtual shot only when the director request is active.
- Reuse existing asset roles and storage validation for any generated storyboard or reference images.

## Validation and safety

- Reject unknown object IDs, key IDs, clip IDs, tracks, targets, and channels.
- Clamp camera and object values to the project’s existing bounds.
- Reject edits outside the scene duration.
- Reject overlapping camera blocks where the existing timeline disallows them.
- Require the proposal base signature to match the current project before preview or accept.
- Apply accepted actions atomically as one undoable change.
- Never execute arbitrary function names returned by Gemini; map a closed set of action kinds to explicit application code.

## Implementation order

### Milestone 1: deterministic foundation

- Add director context derivation.
- Add Zod schemas for director actions and proposals.
- Add pure action validation/application helpers.
- Add unit tests for valid actions, stale signatures, invalid IDs, invalid times, and atomic failure.

### Milestone 2: structured Gemini director

- Add the provider method and server route.
- Add a mocked provider fixture.
- Add the Director panel.
- Support camera-only actions first.
- Add preview and accept/reject behavior.

### Milestone 3: phone-directed workflow

- Connect the panel to existing phone pairing and camera-take state.
- Show calibration and recording state in the director UI.
- Add the end-to-end flow from recorded phone take to Gemini refinement to guide export.

### Milestone 4: visual critique

- Add guide upload or frame sampling.
- Return timestamped critique items.
- Convert one critique type, such as pacing or framing, into a structured proposal.

### Milestone 5: live voice stretch goal

- Add a Gemini Live session.
- Implement three spoken commands: hold, wider, and follow subject.
- Route each command through the same proposal validation path.
- Add a clear disconnect and fallback state.

## Tests and verification

### Unit tests

- Director context excludes renderer instances and stays serializable.
- Valid camera actions apply expected key or clip edits.
- Invalid model output is rejected.
- Stale proposals cannot be accepted.
- Multiple actions apply atomically.
- Undo and redo restore the project exactly.

### API tests

- Gemini-not-configured returns an actionable error.
- Mocked director output produces a validated proposal.
- Invalid provider output returns a safe error without mutating the project.
- The route never persists unaccepted proposals.

### Browser tests

- Open Director panel and submit a direction.
- Preview then reject leaves the scene unchanged.
- Preview then accept creates one undoable edit.
- Phone recording appears as director context.
- Stale proposal is rejected after a scene edit.
- Accepted proposal survives save/reload.
- Guide export still works after a director edit.

## Demo script

1. Start with a humanoid, a generated or authored prop, and a scene camera.
2. Open Director and say: “Make this a tense reveal. Keep the subject hidden, push in slowly, and hold before the reveal.”
3. Pair the phone and calibrate it.
4. Move the phone to create the rough shot.
5. Ask Gemini to refine the take.
6. Show the returned actions and preview the result.
7. Accept the edit, undo it, then redo it to prove editability.
8. Export the clean guide and show the final generated video.

## Success criteria

- The user can complete the phone → AI refinement → export loop in under two minutes.
- Gemini actions are visibly grounded in the actual scene and camera take.
- Every AI change is editable, previewable, and undoable.
- The demo has one clear multimodal “wow” moment rather than several disconnected AI features.
- The product still works in manual mode without Gemini credentials.
