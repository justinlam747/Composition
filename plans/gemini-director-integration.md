# Gemini Director integration

## Implemented experience

The editor's microphone icon opens a nonmodal Director panel. Users can type or start a continuous Gemini Live conversation, hear spoken replies, interrupt, and keep working while the panel is minimized. Director clarifies ambiguous requests, presents a concrete proposal, and applies changes only after explicit approval of that revision.

For “add a desk here,” the user can click **Pick placement point** or ask Director to place the marker, for example “5 units to the right of the humanoid.” The `set_placement` command supports absolute floor coordinates or a world-space offset from a visible object's sampled position at a specified time. Right is world +X; one unit is one meter. The marker remains temporary editor context and is validated within the existing ±20 X/Z floor bounds. Preview shows the proposed marker without changing the active one; approval applies it without a project undo entry. Gemini then proposes a composite prop with a top and legs. Apply creates an editable object as one undoable change. Composite geometry is preserved in saved projects, object assets, thumbnails and guide rendering.

Supported commands cover object creation, updates and deletion; static camera poses; camera and prop animation; Hunyuan humanoid motion; and clip retiming. Existing limits remain one humanoid, 32 objects and ten seconds. Unsupported or conflicting operations return clarification instead of silently changing unrelated animation.

## Architecture

- `src/core/director.ts` defines a closed Zod action contract, compact scene context and pure atomic application. It reuses project validation, composition placements and clip helpers.
- `server/director.ts` coordinates proposals and durable executions. Motion preparation calls the existing `MotionJobs` pipeline and `fal-ai/hunyuan-motion` only after approval.
- `server/providers.ts` uses Gemini structured output. `server/directorSchema.ts` sends a compact provider-compatible schema, normalizes bare six-digit colors, and validates the result against the full contract.
- `src/core/directorSession.ts` coordinates typed and live input, preview, explicit approval, recovery, status polling and application through the existing store/undo path.
- `server/directorLive.ts` relays Gemini Live audio and the three closed tools `director_request`, `director_decision` and `director_status`. Credentials remain on the server.
- `src/core/directorVoice.ts` and `public/director-audio.js` manage microphone capture, 16 kHz PCM input, 24 kHz playback, interruption and cleanup.
- `src/core/propGeometry.ts` and `src/scene/prop.ts` provide shared composite geometry for the editor and saved previews.

HTTP endpoints are `POST /api/director/turns`, `POST /api/director/proposals/:id/decision`, and `GET /api/director/executions/:id`. Voice uses `/api/director/live`. Existing `/api/capabilities` exposes availability.

## Approval and recovery

Every request carries its project/session identity and scene signature. A proposal has an ID and monotonically increasing revision. Scene edits invalidate the old approval; refresh rebases cached motion, produces a pending revision and requires approval again. A voice approval is bound to the proposal visible when that input turn began, and that turn can be consumed only once. Interrupted or cancelled tools cannot apply delayed responses.

Execution records survive server restarts. A recovered execution requires review; it never replays automatically. Missing motion-job records can be recreated with their previously reserved ID. Completed motion is retained and added to the animation library. Cancelling prevents application even if a provider finishes later. A status lookup failure exposes a progress retry action.

Project mutations remain one atomic undo entry and use normal save/autosave. Conversation history and floor markers are transient. Closing Director, switching projects, navigating away or hiding the tab releases microphone resources. Minimizing retains conversation controls.

## Context and configuration

Gemini receives visible object state, selection, playhead, animation summaries, placement marker, camera state and a rendered virtual-scene JPEG. Physical camera feeds are excluded. Scene capture is unavailable during export, transforms, phone recording or AR.

Use server-only `GEMINI_API_KEY` and `FAL_KEY`. The planner uses `GEMINI_DIRECTOR_MODEL`, then `GEMINI_TEXT_MODEL`, then `gemini-2.5-flash`. Live voice defaults to `gemini-3.8-live`, overridable with `GEMINI_LIVE_MODEL`. Voice requires localhost or HTTPS, microphone permission and AudioWorklet support. `.env.example` lists the settings.

## Verification

Unit/API tests cover atomic application, invalid targets and geometry, camera and animation edits, scale-animation conflicts, motion anchoring, approval/revision checks, cancellation and restart recovery. Relay tests cover audio/transcripts, cancelled/duplicate tools and resumption. Browser tests cover clarification, placement, preview, approval, stale refresh, undo/redo, save/reload, mobile layout, microphone denial/release and delayed voice approval cancellation.

Live smoke checks validated a Gemini desk proposal, Gemini Live session setup, and a two-second Hunyuan performance retargeted into 19 editable tracks. A full live spoken conversation still requires manual microphone acceptance. Existing phone recording and guide export remain independent editor workflows.
