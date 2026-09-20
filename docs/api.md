# Shared composition contracts

Clients exchange JSON with the local single-user API at `http://127.0.0.1:3001/api`. The server binds to loopback and rejects foreign browser origins. Native clients can omit Origin. Public hosting requires authentication and tenant storage.

## Project v2

```json
{
  "version": 2,
  "id": "project-id",
  "rig": "take-one-mannequin-v1",
  "name": "Untitled take",
  "duration": 5,
  "fps": 30,
  "demo": false,
  "objects": [{
    "id": "box-id", "kind": "box", "name": "Plinth",
    "dimensions": [1, 0.5, 1], "position": [0, 0, 0],
    "rotation": [0, 0, 0], "scale": [1, 1, 1],
    "referenceAssetIds": ["stored-image-id"]
  }],
  "tracks": [{
    "objectId": "box-id", "target": "model", "channel": "position",
    "keys": [
      {"id": "start-key", "time": 0, "value": [0, 0, 0], "ease": "smooth"},
      {"id": "end-key", "time": 5, "value": [2, 0, 0], "ease": "smooth"}
    ]
  }]
}
```

- Maximum 32 objects. Object IDs are unique, using 1–80 ASCII letters, numbers, underscores, or hyphens. `humanoid` remains the reserved primary character ID used by generated motion and prepared web effects; additional humanoids may use other IDs and own independent joint tracks.
- Coordinates: right-handed, Y up, meters, bottom-center pivots. Dimensions `[width,height,depth]` range from 0.05–20; scale components from 0.05–10 multiply dimensions.
- Rotations: XYZ Euler degrees. Numeric rotation keys preserve signed turns. An incoming `rotationPath` on a rotation key describes the route from the preceding key, with 2–4096 points and matching endpoints. Interpolate consecutive quaternions by angular distance, then unwrap Euler angles. Ease belongs to the preceding key: `smooth` uses `t*t*(3-2*t)`, `ease-in` uses `t*t`, `ease-out` uses `1-(1-t)^2`, and `linear` uses `t`.
- Optional key `valueHandles: {in?: [x,y,z], out?: [x,y,z]}` stores per-axis horizontal Bézier influence fractions, each `null` (unchanged) or finite in `[0.01,1]`. For a segment from A to B, A's outgoing handle and B's incoming handle control its value interpolation. Handle time is the fraction of that source-time interval, and handle value equals its key's value (zero endpoint slope). Solve the cubic time coordinate before evaluating its value coordinate. An untouched opposite handle uses one-third interval with the legacy ease's endpoint tangent, bounded to the endpoint values. Axes with neither handle use the original ease/rotation path unchanged; edited rotation axes use signed numeric Euler values. Handles remain attached when keys move, persist in library assets, and participate in guide staleness. Value Graph labels use scene time after clip stretch and optional velocity retiming; values use scene units, degrees, or scale factors, not speed.
- Track identity: `(objectId,target,channel)`. Every object supports model position/rotation/scale. Humanoids additionally support rotation-only targets from `BONES` in `project.ts`. The rig adapter maps these canonical joint rotations to the imported skeleton.
- Optional `camera`: `{position:[x,y,z],rotation:[x,y,z]}` is the fixed 38-degree vertical-FOV, 16:9 scene camera. Its tracks use reserved object ID `__shot_camera__`, target `model`, and only `position` or `rotation`. The ID cannot belong to a prop. Camera data and tracks participate in guide staleness. Scenes without `camera` retain their existing signatures and export behavior. Editor navigation is transient and does not change camera data.
- Optional `clips`: up to 64 self-contained animation blocks. Each has `id`, `name`, `objectId`, `source` (`prepared`, `ai`, or `edited`), scene `start` and `duration`, `sourceDuration`, `sourceStart`, `sourceEnd`, and local-source `tracks`. Source time is `sourceStart + clamp((time-start)/duration,0,1)*(sourceEnd-sourceStart)`. Blocks on the same object cannot overlap; gaps and times after the last block hold its last pose. A block's tracks override that object's base tracks; absent channels use the object's static transform or the joint rest pose. Splitting copies the source tracks and divides the source window, preserving interpolation exactly. Clip data participates in guide staleness and scene persistence.
- Optional humanoid `appearance: "spider"` selects the prepared demo's simple vertex-color appearance. A clip may carry `web: {anchor:[x,y,z],start,end}` with timing in source seconds; the line connects the right hand to the scene-local anchor while active. It is rendered into the guide.
- Optional scene `velocities`: an array of `{objectId,duration,keys:[{id,time,speed}]}`, one per object/camera. The velocity duration remains fixed when the scene extends; it defaults to scene duration in files that omit it. Clips and library assets instead carry optional `velocityKeys` in their full source timeline. These keys are independent of transform keys; speed is finite in `[0,4]` and key times must be strictly increasing within the relevant duration. Values blend linearly and hold outside their keys. The normalized integral maps timeline time to motion time: `motionTime = duration * integral(0,time) / integral(0,duration)`. An all-zero envelope holds the starting pose. For clips, apply this mapping after the linear source-window conversion above. Optional `velocityWindow: {start,end,from,to}` bounds the input integral and its output poses: this pins a split's original boundary poses when its velocity is edited. Unedited splits retain their parent's mapping; cached manual motion can hold past its velocity duration. UI edits snap in scene time (source times may be fractional after stretching). Velocity data participates in guide staleness.
- Animation library JSON is an array of assets with `id`, `name`, `kind` (`humanoid`, `box`, `camera`), `source`, source `duration`, and `tracks`; optional `range: {start,end,duration}` preserves a split or stretched source window, optional `velocityKeys` preserves its speed envelope, and optional `web` carries the demo effect. Import validates assets before changing the local library. Instantiation remaps object and key IDs and copies all source data, so editing an instance cannot alter the cached asset.
- Without tracks, sample base transforms or joint rest pose. Outside a track's keys, hold its nearest endpoint. Times align to 30 fps within the 2–10 second timeline. Retiming onto another key in the same track replaces it.
- Optional `hidden:true` preserves removed legacy humanoids and their tracks. Hidden objects do not render or contribute generation references.
- Optional `generation`: `{guideAssetId,sourceSignature,jobId?,outputAssetId?,instructions?,imageRequest?,imageAssetIds?,referenceAssetIds?}`. `imageRequest` is `{id,prompt}`; `imageAssetIds` stores up to 24 generated images; `referenceAssetIds` selects up to nine additional image references. The signature covers scene state, excluding output metadata. Selecting generated references does not stale a guide, but does change the video request fingerprint. This is a stale-data detector, not a security digest.

V1 imports add track ownership without rewriting motion. `validateProject` validates a cloned input; `parseProject` also migrates. Import limit: 8 MB. Scene JSON is not a media archive; transfer asset files/metadata with projects.

## HTTP endpoints

| Method/path | Input | Result |
| --- | --- | --- |
| `GET /capabilities` | None | `{gemini,fal,videoExport}`; no credentials |
| `POST /assets?role=reference` | Raw PNG/JPEG/WebP | Asset metadata, 201 |
| `POST /assets?role=guide&duration=5` | Raw WebM/MP4 | Converted MP4 metadata, 201 |
| `GET /assets/:id` | None | Asset metadata |
| `GET /assets/:id/file` | Optional Range header | File bytes with range playback |
| `GET /assets/:id/file?download=1` | None | Attachment download |
| `PUT /projects/:id` | Project | Saved project; missing references rejected |
| `GET /projects` | None | `[{id,name,updatedAt,duration,objectCount,hasMotion,preview}]`, newest first; preview is a compact first-frame scene snapshot (objects, joints, optional camera/web effect) without animation tracks |
| `GET /projects/:id` | None | Project |
| `DELETE /projects/:id` | None | 204, idempotent removal of the project record; shared media and jobs are retained |
| `POST /director/turns` | Director input containing project, context, history, and request text | Cached-first demo or live Director turn; known Demo commands do not require Gemini |
| `POST /director/proposals/:id/decision` | Session, revision, decision, and current project | Persistent approval/cancel/refresh result |
| `GET /director/executions/:id` | None | Director execution status |
| `POST /objects` | `{name,kind,dimensions,scale?,referenceAssetIds}` | `{id,object,createdAt}`, 201 |
| `GET /objects` | None | Saved object library |
| `POST /proposals` | `{mode:"live",kind,prompt,project,objectId}` | Proposal, 201 |
| `POST /jobs` | `{mode:"live",id,prompt,project}` | Persistent Job, 202 |
| `GET /jobs/:id` | None | Job status; may refresh provider state |
| `POST /image-jobs` | `{id,projectId,prompt}` | Persistent image job, 202; request must already be saved in the project |
| `GET /image-jobs/:id` | None | Image job status; never submits another generation |

JSON writes use `application/json`; uploads use raw bytes and image/video Content-Type, without multipart/base64. Asset IDs are SHA-256 of role plus bytes, deduplicated by content. Metadata contains `id,role,mimeType,size,createdAt`, plus guide `width,height,duration`. Roles: reference, guide, output.

Errors: `{"error":{"code":"INVALID_INPUT","message":"...","details":[]}}`; details are optional. Missing credentials return 503 with `GEMINI_NOT_CONFIGURED` / `FAL_NOT_CONFIGURED`. No prepared result substitutes for a failure.

When `project.demo` is true, Director checks the deterministic classroom intent catalog before calling Gemini. Cached turns and proposals carry `source:"demo-cache"`; fallbacks carry `source:"live"`. Cached scene changes still require approval and use the same atomic Director actions as live requests. Demo mode never changes camera state.

## Proposals

Envelope: `{id,mode:"live"|"demo",baseSignature,prompt,content}`. Live proposals are stored server-side; Demo suggestions are local and explicitly labeled. Server AI/job routes accept only Live mode.

```json
{"kind":"object","object":{"name":"Plinth","kind":"box","dimensions":[1,0.5,1],"referenceAssetIds":["image-id"]}}
```

```json
{"kind":"composition","placements":[{"objectId":"box-id","position":[2,0,0],"rotation":[0,45,0]}]}
```

```json
{"kind":"movement","tracks":[{"objectId":"box-id","target":"model","channel":"position","keys":[{"time":0,"value":[0,0,0],"ease":"smooth"},{"time":5,"value":[2,0,0],"ease":"smooth"}]}]}
```

Composition offsets the whole object path relative to its time-zero pose. Movement replaces only listed tracks, assigning key IDs on application. All replacement tracks are validated together before merging. Preview applies the same pure function to a copy; actual application validates again and commits once to undo history. Source changes invalidate suggestions. Library objects omit placement/motion and preserve the sampled scale.

## Generation

Jobs contain `{id,projectId,mode,status,guideAssetId,referenceAssetIds,prompt,duration,resolution,createdAt,requestId?,outputAssetId?,error?}`. Internal records also retain model, input fingerprint, and source signature.

States: preparing → queued/running → completed or failed. The server stores an application ID before submission. Reusing that ID with identical scene/guide/prompt returns the same job; changed input returns 409. Automatic provider submission retries are disabled. Poll errors retry separately; known provider rejections fail explicitly. Completed MP4 files are downloaded to local asset storage.

Guide and image uploads use fal storage, keeping this server on loopback. The request references `@Video1` and `@Image1`, etc. Defaults: five seconds, 720p, 16:9, audio off. Output requires a whole duration of 4–10 seconds. Clients persist the application job ID and instructions before sending POST, then poll about every three seconds. If a response is lost, the same ID survives reload. A missing server record offers an explicit retry using that ID and the saved instructions; it never silently starts another request.

After restart, jobs with provider IDs resume polling. A preparing job without one fails with an ambiguity message: check fal before manually retrying because it may have accepted the request. Atomic JSON writes serialize record access to avoid Windows read/rename races. Run one server process per data directory and back up the whole directory, including `.bin` assets.

The client requires a successful server project save before submitting an image or video request. Browser draft storage is only a best-effort recovery cache and never gates provider submission. If server storage is unavailable, submission stops and the panel offers an explicit retry. Switching projects during submission leaves the request reachable from Saved projects. Undo and redo retain the current project's generation metadata; changing the scene can mark its guide stale without losing the running job or completed output.

## Image generation

Image jobs contain `{id,projectId,prompt,status,createdAt,assetId?,error?}`. States are running, completed, or failed. Gemini creates an image from the text prompt and the server stores its bytes as a reference asset. Requests are persisted before provider calls; repeating identical input and ID returns the same request, while different input returns 409. Interrupted jobs fail on server restart without automatic resubmission. Generated images remain independently downloadable and are sent to video generation only when explicitly selected. The combined object/generated reference count must not exceed nine.

## Live acceptance — pending by user request

1. Configure both keys, restart, and check capabilities.
2. In a five-second non-Demo scene, request a live object, inspect the image/dimensions, preview, and Spawn.
3. Request Movement, preview/play/apply, and verify editable/undoable keys.
4. Save/open the project and confirm objects/images return.
5. Frame, export, play/review the guide, enter instructions, and generate live.
6. Play/download the output, then reopen the project and verify persistent media.

Automated tests run this flow using actual browser capture/encoding and mocked external providers. They verify integration and persistence, not provider account access or generation quality.
