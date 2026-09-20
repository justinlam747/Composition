# Composition — Devpost story draft

**Tagline:** Agentic videography: film with your phone, direct with your voice, generate from your composition.

## Inspiration

We wanted AI filmmaking to preserve the physical process of finding a shot: moving around a subject, choosing an angle, and directing its performance. Composition makes those decisions editable inputs to video generation.

## What it does

Composition combines a Three.js scene editor, phone-controlled camera capture, and a live voice director. Users place objects, direct character animation, and record camera movement. Reusable animation blocks preserve the authored motion; the composed scene becomes a guide for generated imagery and video.

## How we built it

**Handheld capture:** An ARKit companion sends position and quaternion orientation through a Node WebSocket relay. The editor receives pose events over SSE and returns rendered JPEG previews to the phone. A rigid alignment transform maps physical movement onto the starting scene camera. Recorded poses are resampled at 30 fps using linear position interpolation and quaternion SLERP, then converted into editable camera tracks with unwrapped rotations.

**Agentic direction:** Gemini receives structured scene state and a viewport image, then proposes typed actions for object placement, camera control, and animation. Gemini Live invokes the same proposal workflow through nonblocking tools; Hunyuan handles generated humanoid motion asynchronously. Zod validation, explicit approval, and scene-signature checks precede application through one atomic command path.

**Reusable blocks:** Animation clips retain source keyframes and source-time windows. Splitting, retiming, and saving a block preserve its underlying motion data for reuse.

**Generation:** The browser exports a 30 fps composition guide. Gemini generates appearance references from its first and last frames, conditioning the last image on the generated first image for visual continuity. Seedance via fal receives the guide video and selected image references. Scene signatures reject stale guides; persisted request IDs and input fingerprints prevent duplicate submissions of the same request.

## Challenges we ran into

Handheld latency was the main architectural tradeoff. We kept rendering in the desktop editor and decoupled tracking from preview delivery: poses are capped at 30 Hz, while 480×270 JPEG previews are capped at roughly 6 fps. Single in-flight sends and dropping previews under socket backpressure limit queue buildup.

Agent execution also had to tolerate a changing scene. Proposals carry a scene signature and revision; if editing makes a result stale, it requires review before application. We also compacted the model-facing JSON schema to fit Gemini's constraints while retaining full application-side validation.

## Accomplishments that we're proud of

- Representing handheld takes, manual animation, and generated motion as editable timeline blocks.
- Connecting live voice direction to validated scene operations.
- Separating motion guidance from appearance references in the generation pipeline.

## What we learned

Separating tracking, preview rendering, and generation lets each run at an appropriate rate. Keeping motion as structured data makes physical capture reusable throughout the workflow.

## What's next for Composition

Measure handheld latency and tracking drift on devices, tune preview delivery across networks, and evaluate how consistently generated video follows the authored camera and character motion.

---

## Implementation references — not submission copy

The current repository implements **Seedance via fal**, not Veo. The draft reflects that implementation. Capture rates are code settings; device performance and generative fidelity are not presented as measured results.

- Handheld transport and preview: [MotionController.swift](C:/Users/Justin/comp/ios/CompositionCamera/MotionController.swift), [phoneRelay.ts](C:/Users/Justin/comp/server/phoneRelay.ts), [phoneCamera.ts](C:/Users/Justin/comp/src/scene/phoneCamera.ts).
- Alignment, interpolation, and rotation continuity: [phoneMotion.ts](C:/Users/Justin/comp/src/core/phoneMotion.ts).
- Director actions, versioning, and compact schema: [director.ts](C:/Users/Justin/comp/src/core/director.ts), [server director](C:/Users/Justin/comp/server/director.ts), [directorSchema.ts](C:/Users/Justin/comp/server/directorSchema.ts), [directorLive.ts](C:/Users/Justin/comp/server/directorLive.ts).
- Source-preserving animation blocks: [clips.ts](C:/Users/Justin/comp/src/core/clips.ts), [animationLibrary.ts](C:/Users/Justin/comp/src/core/animationLibrary.ts).
- Guide capture, paired image references, and video jobs: [guideExport.ts](C:/Users/Justin/comp/src/scene/guideExport.ts), [imageJobs.ts](C:/Users/Justin/comp/server/imageJobs.ts), [providers.ts](C:/Users/Justin/comp/server/providers.ts), [jobs.ts](C:/Users/Justin/comp/server/jobs.ts).
