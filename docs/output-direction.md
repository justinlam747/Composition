# Output direction and image inputs

In Output → Direction, enter a short idea beside **Video direction** or **Visual baseline**, then choose **Generate prompt**. Gemini receives the current composition's first frame and a local vocabulary of camera treatment, distortion, visual quality, mood, lighting and texture. It returns a suggested prompt and an explanation of its choices. Edit the suggestion, regenerate it from the original idea, or select **Use prompt**. Drafting never automatically starts image or video generation.

The local prompt bank is [`server/prompts/video-prompt-bank.json`](../server/prompts/video-prompt-bank.json). It contains original examples and concise guidance informed by these public references:

- [Google video generation prompt guide](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/video-gen-prompt-guide): explicit subject, action, setting and visual treatment.
- [Runway Gen-4 Video Prompting Guide](https://help.runwayml.com/hc/en-us/articles/39789879462419-Gen-4-Video-Prompting-Guide): concise motion descriptions and incremental refinement.
- [Runway Camera Terms, Prompts, & Examples](https://help.runwayml.com/hc/en-us/articles/46749315925395-Camera-Terms-Prompts-Examples): distinct camera and lens vocabulary.

The application uses this bank locally; it does not fetch prompt websites when users generate drafts. Gemini uses the existing `GEMINI_API_KEY` and `GEMINI_TEXT_MODEL` configuration. Image generation uses `GEMINI_IMAGE_MODEL`.

## Matched frames

**Generate images** creates one matched pair (two image generations), or three alternative pairs (six generations). Each first image is conditioned on the guide's actual first frame. Each last image receives the guide's actual final frame, the same creative direction and the generated first image as an appearance reference. Framing and pose come from the respective composition frame; character identity, materials and lighting come from the shared look. Generation remains probabilistic.

Select **Use frame pair** to place both images ahead of supporting references in the Seedance request. The current reference-to-video integration identifies their endpoint roles in the prompt; these are reference images, not a guarantee of pixel-exact endpoint interpolation. A new guide clears selection of an older baseline. Earlier images remain available for downloading or removal.

## Uploading and removing

Upload PNG, JPEG or WebP images up to 30 MB each. The gallery holds up to 24 images; video uses at most nine references. Uploads are selected automatically when reference slots are available. A matched pair occupies two slots.

The reference-strip remove control deselects an input. Gallery removal removes that image from output inputs and gallery metadata, including pair/selection links. Deleting the first image of a pair leaves the last available as an ordinary supporting reference. Removal does not delete shared server asset files or alter source scene objects. Dismissed image IDs prevent the saved job's polling from restoring removed images on reload.

## API additions

- `GET /api/assets/:id/last-frame` returns and caches the final decoded guide frame. Existing `/first-frame` remains available.
- `POST /api/output-prompts` accepts `{project, target: "video" | "baseline", prompt, previous?}` and returns `{prompt, intent, qualities}`. It validates inputs, checks guide freshness and validates Gemini's structured response.
- `POST /api/image-jobs` additionally accepts `paired: true` with `guideAssetId`. `count` is the number of looks (1 or 3), with two images per paired look. Jobs retain `assetIds` and `imagePairs` and preserve partial results if generation fails. Request IDs remain idempotent.
- Optional generation metadata includes `imagePairs`, `imagePrompt`, `dismissedImageAssetIds` and `excludedReferenceAssetIds`. Old saved projects and unpaired requests remain supported.

Provider tests mock paid requests. Frame extraction tests use real FFmpeg frames, and browser tests cover editable drafts, uploads, selection and deletion persistence.
