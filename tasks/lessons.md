# Implementation lessons

## Composition workflow and video generation - 2026-09-19

- Persist the application job ID and instructions locally and in the saved project before submitting a paid video request. Stop when either save fails. A lost response is ambiguous: poll or explicitly retry the same ID and input; never allocate a replacement automatically. The server must persist intent before provider submission and reject reuse with different input. See `src/components/OutputPage.tsx` and `server/jobs.ts`.
- Generation metadata represents an external resource. Preserve it through same-project undo/redo, and keep a submitted request reachable from its original saved project after a project switch. Use the scene signature to mark an old guide stale without discarding the job or completed output. Async object uploads also need both project and object identity checks because humanoid IDs repeat between projects.
- Validate an AI proposal as a complete transaction against its source scene before committing any changes. Preview and application should share the same pure operation. Migration must preserve complete rotation paths, signed turns, key IDs, easing, and independent track ownership; matching endpoints alone does not prove motion survived. Regression tests compare migrated tracks and samples across the timeline.
- On Windows, atomic JSON replacement can fail while the destination is being read. Serialize reads and writes per record, then use bounded retries for transient rename errors. Preserve concurrency across different records and test simultaneous reads/replacements. The current file store assumes one server process per data directory.
- Keep verification boundaries explicit. Actual browser capture, FFmpeg conversion, saved assets, playback, and download can be exercised with mocked provider transport. Those results do not establish provider account access or live generation quality. Paid Gemini/Seedance acceptance remains pending at the user's request; no live success is claimed.
- Test asynchronous restoration by awaiting the resulting state, not just the click or network response that starts it. For concurrent uploads, choose mock responses by content or MIME type rather than call order. Keep sequential expectations only where the workflow itself requires sequencing.

No existing `CLAUDE.md` was found in the workspace or its ancestors, so no agent-rule file was created or changed. Lessons were grounded in source and tests; Git history was unavailable because this workspace has no Git repository.

## Scene camera editing - 2026-09-19

- Route every camera-view entry point through the same navigation operation, including inspector buttons, so Orbit and Camera view stay synchronized. See `src/scene/cameraNavigation.ts` and `src/scene/Viewport.tsx`.
- Reuse one key-edit operation for numeric fields, gizmos, and camera piloting. Tweaking a rotation key must preserve its incoming authored path and the outgoing path stored on the following key; test samples between endpoints so a lost arc cannot hide behind correct endpoint values. See `src/core/keyEditing.ts` and `tests/shot-camera.test.ts`.
- Keep the saved shot camera separate from the editor navigation camera. Orbiting to inspect a scene must not change the shot; preview framing and export must use the saved camera's aspect and sampled pose regardless of the active editor view. See `src/scene/shotCamera.ts` and `src/scene/Viewport.tsx`.
- When adding a selectable target outside the ordinary object collection, include it in selection validation and fallback logic for initial restoration, import, and deletion. A valid camera-only project should still expose a usable timeline after reload. See `primaryTarget` in `src/core/project.ts` and `tests/browser/shot-camera.spec.ts`.
- Verify camera export through decoded frames of the actual encoded guide, using a static scene and a moving camera while the editor remains in Orbit view. This catches an exporter that freezes the editor view despite correct animation state; mocked provider transport still permits that local export check. See `tests/browser/shot-camera.spec.ts`.

## Phone camera capture - 2026-09-19

- Keep incoming phone poses transient while framing and recording. Resample the completed take into one validated camera clip and commit it as a single undoable edit; reject the commit if the project changed during capture. This preserves existing scene motion and prevents tracking packets from flooding history or autosave. See `src/scene/phoneCamera.ts`, `src/core/phoneMotion.ts`, and `studio.recordCameraTake` in `src/core/store.ts`.
- Require increasing frame sequence numbers and monotonic capture timestamps, and treat tracking loss or a material packet gap as a take boundary. Save the usable portion, clear the alignment, and require a new starting pose rather than joining motion across a tracking reset. Test stale packets, gaps, and limited tracking separately. See `src/core/phoneProtocol.ts`, `src/scene/phoneCamera.ts`, and the phone motion and browser tests.
- When leaving the page can create a final project edit, flush persistence after that edit. An earlier pagehide autosave listener may have already saved the pre-recording project, and its debounce cannot be trusted to run afterward. Verify the stored project immediately after pagehide and again after reload. See `stopTake` in `src/scene/phoneCamera.ts` and `tests/browser/phone-camera.spec.ts`.
- Use synthetic poses over the real WebSocket/SSE transport to verify pairing, returned previews, recording, undo, and restoration on Windows, while keeping native acceptance separate. Passing those tests does not validate Xcode compilation, ARKit tracking accuracy, device orientation, or physical movement; document the remaining Mac/iPhone checks explicitly. See `tests/phone-relay.test.ts`, `tests/browser/phone-camera.spec.ts`, and `docs/phone-camera.md`.

## Editor toolbar relocation - 2026-09-19

- Before deleting CSS associated with a removed component, search all class consumers. Removing the bottom dock also removed `.saved-dot`, which `PhoneCameraPanel` still uses for tracking readiness; retain shared styles beside their remaining consumer.
- Moving a toolbar changes the usable space for adjacent floating controls. Check their hit areas together at narrow widths, including camera modes: shifting `.viewport-top` caused it to overlap the camera-match button. Verify clickability as well as the new toolbar's geometry. See `src/styles.css`.

## Project home and persistence - 2026-09-19

- A single browser recovery draft cannot preserve multiple projects. Save the current draft to project storage before creating, opening, or importing another scene; validate imports before mutation, and clear undo history only when the replacement is ready. Failed saves or loads must retain the current scene and history. See `src/core/projectSession.ts`, `studio.openProject` in `src/core/store.ts`, and `tests/project-session.test.ts`.
- A successful save response only confirms the submitted snapshot. If an asynchronous edit changes the same project while saving, save the newer snapshot before reporting completion or leaving the editor. Test this with an edit made while the first save is pending. See `saveCurrentProject` and `tests/project-session.test.ts`.
- Verify saved-project loading in a fresh browser context without local storage, separately from draft recovery after reload. A reload alone can pass by restoring the recovery draft even when server persistence is broken. Also distinguish an actual restored draft from the store's generated default scene so a fresh workspace does not show a misleading resume action. See `tests/browser/projects.spec.ts` and `studio.getDraft`.

No `CLAUDE.md` was found in the workspace or its ancestors during this review, so no agent-rule file was created or changed.

## Separate output workflow - 2026-09-19

- When export depends on the editor's transient camera and renderer, preserve that instance and its dimensions across output navigation. Make the retained editor inert and hidden, and guard its global shortcuts and interactive render work with an explicit active state. CSS hiding alone does not stop window listeners from editing the scene. See `src/App.tsx`, `src/Editor.tsx`, `src/scene/Viewport.tsx`, and `tests/browser/output.spec.ts`.
- Reuse the same prerequisite predicate for both step navigation and Continue buttons. Otherwise a clickable step heading can bypass validation such as the reference-image limit. Verify every forward entry point when a prerequisite is invalid. See `canReviewGeneration` in `src/components/OutputPage.tsx` and `tests/browser/output.spec.ts`.
- Show completed or pending output details from the saved job and guide metadata. The current editable project's duration and references can change after submission, so using them to describe an earlier result misrepresents what was generated. Keep the earlier result available and explicitly identify its stale source. See `src/components/OutputPage.tsx`.

## Scene priority and timeline overlay - 2026-09-19

- Keep resizable timeline overlays outside the editor's layout flow. Share the overlay height only to reposition floating controls, and remove that value when the overlay unmounts. Assert unchanged scene and camera-frame bounds after resizing, minimizing, and restoring at desktop and mobile widths. See `src/components/TimelinePanel.tsx`, `src/styles.css`, and `tests/browser/editor.spec.ts`.
- A compact timeline must still fit its fixed toolbar, ruler, footer, and at least one usable track row. Position the playhead against an inner wrapper containing all tracks, rather than the scroll viewport, so it reaches the final row after scrolling. See `.timeline-tracks` in `src/styles.css` and the timeline components.

## Project sidebar and scene previews - 2026-09-19

- Derive project thumbnails from a compact sampled scene snapshot, including the saved camera, posed joints, visible objects, and active effects. Share effect sampling with the editor so trimmed clips retain the same web progress. Automatic framing must update posed skin bounds and extend the far clipping plane for distant geometry; verify both distant content and effect visibility in rendered images. See `src/core/projectPreview.ts`, `src/core/webEffect.ts`, `src/scene/projectPreview.ts`, and the preview and browser project tests.
- A project grid should not keep one WebGL renderer per card. Render visible cards through one serialized, idle-disposed renderer and a bounded image cache keyed by project revision. Recheck the cache inside the queue so duplicate requests do not render twice, and cancel stale component updates when a card unmounts. Compute skin bounds only when automatic framing requires them. See `src/components/ProjectPreviewImage.tsx` and `src/scene/projectPreview.ts`.
- Place decorative entry, hover, and preview transitions under `prefers-reduced-motion: no-preference`. Browser checks should verify computed animation and transition behavior in both motion modes, as well as mobile overflow and the actual thumbnail images. See the home styles in `src/styles.css` and `tests/browser/projects.spec.ts`.

## Output image generation - 2026-09-19

- Distinguish a new paid request from a retry when persistence fails. A new request that never dispatched can clear its pending ID so an optional feature does not block the workflow; a retry may refer to an already accepted request and must retain its ID. Clear a dispatched ID only after a definitive rejection. See `submit` in `src/components/OutputImages.tsx`.
- Keep transient request errors separate from project-save errors. A successful status poll should remove a recovered connection warning without hiding a failed save of the completed asset. See `requestError` and `error` in `src/components/OutputImages.tsx`.
- Disable preview approval while replacing the preview. Leaving the previous checkbox active lets a user approve the old guide during capture, only for the new guide to reset that approval afterward. See `review-check` in `src/components/OutputPage.tsx` and `tests/browser/output.spec.ts`.
- Output-only reference selections should affect the paid video request fingerprint without invalidating the unchanged composition guide. Use one deduplicated reference selector for client limits and server submission, and preserve compatibility with existing fingerprints when no extra references are selected. See `videoReferences` in `src/core/proposals.ts`, `server/jobs.ts`, and `tests/image-jobs.test.ts`.

## Project deletion and action menus - 2026-09-19

- Deleting a saved project must also retire its matching recovery draft, pending autosave, and undo history after server success; otherwise a later project switch can save it back into existence. Preserve the draft on failure or when deleting a different project. Verify absence after reload and after creating another project. See `deleteSavedProject`, `studio.forgetProject`, and the project session and browser tests.
- When a confirmed action removes its own menu trigger, dialog dismissal needs a stable focus fallback. Custom menu items should stay outside the document Tab sequence; close the menu on Tab and resume navigation from its trigger. Verify keyboard navigation and focus after successful deletion, not just menu clicks. See `DropdownMenu.tsx`, `ProjectDeleteDialog.tsx`, and `tests/browser/projects.spec.ts`.

## Velocity retiming and key editing - 2026-09-19

- A normalized speed integral depends on its authored time window. Persist that window before extending the scene, and carry it through animation caching. Split clips in the time domain before velocity mapping; retain the parent's map until a split is edited, then pin that split's boundary source poses. Compare interior samples across extension, split, cache, and reload, including insertion of a collinear speed key, which should leave playback unchanged. See `src/core/velocity.ts`, `src/core/clips.ts`, and the velocity tests.
- A selected pose key's exact source time must survive scene-frame rounding and repeated edits. Resolve the selected key by ID when its mapped, snapped scene time matches the playhead, preserve selection after the edit, and use the same resolved time for both camera channels. Test repeated edits at a source frame such as `91 / 30` under nonlinear retiming; assert that values change without extra keys or shifted times. See `poseTime` in `src/core/store.ts` and `tests/velocity-store.test.ts`.
- Recompute each key-drag preview from the gesture's starting keys when collisions temporarily replace another key. Updating from the previous preview permanently loses a key crossed during the drag, even if the pointer moves past it. Test landing on an occupied time and then moving away, with both keys restored and the whole gesture represented by one undo/redo step. See `updateVelocityKey` in `src/core/store.ts` and `tests/velocity-store.test.ts`.

## Value graph and dropdown theme - 2026-09-19

- Include authored values of visible keys when computing graph bounds, alongside sampled curve values. A zero-speed envelope can hold playback at one value while other authored keys still need to remain visible and selectable. Check key bounds and selection while asserting that playback remains held. See `src/components/ValueTimeline.tsx` and `tests/browser/value-graph.spec.ts`.
- Native `base-select` popups can target keyboard events at options or their descendants. Guard editor shortcuts with ancestor-aware control detection such as `closest('input,textarea,select,option')`. Exercise the opened popup at desktop and mobile widths, checking picker styling, focus, overflow, and selection without triggering playback; selecting an option programmatically alone does not cover popup behavior. See `src/Editor.tsx` and `tests/browser/timeline-theme.spec.ts`.

## Output frame pairs and prompt refinement - 2026-09-19

- Paired generation needs separate pose and appearance inputs: anchor the last image to the actual last composition frame and use the generated first image only for identity, materials and lighting. Preserve endpoint roles in job metadata and request fingerprints; an image's role can change even when the asset list does not. See `server/imageJobs.ts`, `server/jobs.ts`, and `server/providers.ts`.
- Scope deletion tombstones to assets returned by the currently polled image job. Unrelated upload removals must neither accumulate in that set nor evict a deleted job result, which polling would otherwise restore after reload. Clear the set when replacing the request. See `removeOutputImage` in `src/core/outputImages.ts`, `src/components/OutputImages.tsx`, and the output input and browser tests.
- With content-deduplicated assets, a gallery upload can also be an object reference. Derive checkbox state and toggling from the effective video reference set, and deselect every output inclusion path without changing source objects or deleting shared bytes. See `excludeVideoReference`, `toggleReference`, and `tests/output-inputs.test.ts`.
- Keep the original short request, editable AI draft and applied prompt distinct. Regeneration should send the original request plus the previous draft, and applying a draft should be an explicit action. Invalidate pending drafts when their project or guide changes. See `src/components/OutputPromptField.tsx` and `tests/browser/output.spec.ts`.

No `CLAUDE.md` was found in the workspace or its ancestors during this review, so no agent-rule file was created or changed.

## Uploaded references across generation stages - 2026-09-19

- Keep the uploaded-image inventory separate from the provider-limited video selection. Prompt refinement and image generation must use the same full upload list, even when an upload is excluded from the video request. Persist explicit upload provenance; infer source-free gallery uploads only for older projects without that metadata, so generated results do not become new input references accidentally. See `imageGenerationReferences` in `src/core/outputImages.ts`, `server/promptRefinement.ts`, and `tests/output-inputs.test.ts`.

## Gemini Director chat and voice - 2026-09-19

- Bind spoken approval to the proposal ID and revision present when the utterance starts, and consume that utterance once. A stale-scene refresh must require a new yes; the model cannot reuse the previous transcript to approve the revised proposal. Reject conditional assent and cancelled tool calls, and recheck authorization after the decision response. See `src/core/directorSession.ts`, `server/directorLive.ts`, and `tests/browser/director.spec.ts`.
- Guard both success and failure callbacks with the request, execution, and project identities they started with. Late recovery must not replace a newer proposal, and a stale polling failure must not revoke a newer approval. Recovered executions require review rather than automatic replay; expose an explicit progress retry when polling fails. See `DirectorSession` and the delayed-response browser tests.
- Keep provider-facing JSON schemas compact when a model rejects deeply nested application constraints, but retain the complete local schema and scene validation before execution. Normalize only equivalent representations, such as a six-digit color missing its `#`; do not coerce invalid commands or numeric bounds. Verify the real provider boundary as well as mocked responses. See `server/directorSchema.ts` and `tests/director-provider.test.ts`.
- Rebase generated root motion against the scene after all preceding actions in its batch, preserving position and heading and rotating displacement by the same orientation delta. Keep completed animation assets through refreshes and partial failures so review or retry can reuse generation. Test a nonzero starting heading and an earlier placement action. See `rebaseMotion` in `src/core/director.ts`, `server/director.ts`, and the director tests.

No `CLAUDE.md` was found in the workspace or its ancestors during this review, so no agent-rule file was created or changed.

## Director placement markers - 2026-09-19

- Agent commands can change transient editor tools without changing the saved scene. Return those effects alongside the prepared project, keep proposed markers separate until approval, and skip scene-history commits and Undo controls for marker-only actions; otherwise Undo can revert an unrelated scene edit. Verify both unchanged project/history and preview cancellation. See `prepareDirectorActions`, `studio.applyDirector`, `DirectorPanel.tsx`, and the director tests.
