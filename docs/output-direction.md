# Output direction and image inputs

In Output > Direction, enter a short idea beside **Video direction** or **Visual baseline**, then choose **Optimize**. Gemini receives the current composition's first frame, every uploaded reference image and a local vocabulary of camera treatment, distortion, visual quality, mood, lighting and texture. The optimized prompt appears in the same editable field. Edit it or choose **Reoptimize**, then **Generate images** to use that exact prompt. Image generation waits for optimization to finish; optimizing never automatically starts image or video generation.

The local prompt bank is [`server/prompts/video-prompt-bank.json`](../server/prompts/video-prompt-bank.json). It contains original examples and concise guidance informed by these public references:

- [Google video generation prompt guide](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/video-gen-prompt-guide): explicit subject, action, setting and visual treatment.
- [Runway Gen-4 Video Prompting Guide](https://help.runwayml.com/hc/en-us/articles/39789879462419-Gen-4-Video-Prompting-Guide): concise motion descriptions and incremental refinement.
- [Runway Camera Terms, Prompts, & Examples](https://help.runwayml.com/hc/en-us/articles/46749315925395-Camera-Terms-Prompts-Examples): distinct camera and lens vocabulary.

The application uses this bank locally; it does not fetch prompt websites when users generate drafts. Gemini uses the existing `GEMINI_API_KEY` and `GEMINI_TEXT_MODEL` configuration. Image generation uses `GEMINI_IMAGE_MODEL`.

## Matched frames

**Generate images** creates another matched pair (two image generations) each time you click it. There is no image-count selector or application limit on accumulated images. Each first image is conditioned on the guide's actual first frame and all uploaded references. Each last image receives the guide's actual final frame, the same creative direction, all uploaded references and the generated first image as an appearance reference. Framing and pose come from the respective composition frame; character identity, materials and lighting come from the shared look. Generation remains probabilistic.

Select **Use frame pair** to place both images ahead of supporting references in the Seedance request. The current reference-to-video integration identifies their endpoint roles in the prompt; these are reference images, not a guarantee of pixel-exact endpoint interpolation. A new guide clears selection of an older baseline. Earlier images remain available for downloading or removal.

## Uploading and removing

Upload PNG, JPEG or WebP images up to 30 MB each. The gallery has no application image-count cap. Every uploaded image is used for prompt optimization and image generation, independently of its **Use for video** checkbox. Video uses at most nine references; uploads are selected for video automatically when slots are available. A matched pair occupies two video slots.

Gemini model request-size, input-image and quota limits still apply; inputs are never silently truncated. Google documents the supported input limits in its [image generation guide](https://ai.google.dev/gemini-api/docs/generate-content/image-generation). Provider failures leave uploaded images available.

The reference-strip remove control deselects an input. Gallery removal removes that image from output inputs and gallery metadata, including pair/selection links. Deleting the first image of a pair leaves the last available as an ordinary supporting reference. Removal does not delete shared server asset files or alter source scene objects. Dismissed image IDs prevent the saved job's polling from restoring removed images on reload.

## API additions

- `GET /api/assets/:id/last-frame` returns and caches the final decoded guide frame. Existing `/first-frame` remains available.
- `POST /api/output-prompts` accepts `{project, target: "video" | "baseline", prompt, previous?}` and returns `{prompt, intent, qualities}`. It validates inputs, checks guide freshness and validates Gemini's structured response.
- `POST /api/image-jobs` additionally accepts `paired: true` with `guideAssetId`. `referenceAssetIds` snapshots every uploaded input used by the request and participates in retry identity checks. Optional `count` is a positive integer with no application three-look cap; the UI omits it to create one new pair per click. Jobs retain `assetIds` and `imagePairs` and preserve partial results if generation fails. Request IDs remain idempotent.
- Optional generation metadata includes `imagePairs`, `imagePrompt`, `uploadedImageAssetIds`, `dismissedImageAssetIds` and `excludedReferenceAssetIds`. Legacy uploads are recovered from source-free gallery entries. Old saved projects and unpaired requests remain supported.

Provider tests mock paid requests. Frame extraction tests use real FFmpeg frames, and browser tests cover editable drafts, uploads, selection and deletion persistence.
