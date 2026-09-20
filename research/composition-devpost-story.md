# Composition — Devpost story draft

Editorial note: This draft follows the team's latest description of the project. It uses **Veo** as requested; the local video provider currently names **Seedance**, so the model name needs reconciliation before publication. No measured latency, device-validation result, or exact generative motion fidelity is claimed here.

**Tagline:** An agentic videography tool. Film with your phone, direct with your voice, and turn your composition into AI-generated video.

## Inspiration

Filmmaking is physical. You find a shot by moving closer to a subject, changing your angle, and discovering what works through the camera. We wanted to keep that freedom in AI video creation.

With a text prompt, those decisions have to be described before you can see how they feel. We wanted a workflow where creators could compose a scene, move through it, and direct the action through conversation.

That became Composition: an agentic videography tool that combines a handheld virtual camera, a director you can speak to, and a generation pipeline built around the shot you compose.

## What it does

Composition lets you stage and film a virtual scene, then use that composition to guide AI video generation.

In **handheld mode**, your phone becomes a camera into the scene. Moving and rotating the phone changes the virtual camera's position and orientation, while a streamed view lets you see your framing. You can record that movement as an editable camera animation and return to it as part of your composition.

The **agentic director** lets you change the scene through live voice. You can ask it to place objects or change character animations, keeping direction conversational as you develop the shot.

The **generation pipeline** turns the composition into reusable generation blocks. These carry the shot's movement and staging into the generation workflow, so you can build on the composition you already made. Gemini generates imagery, and Veo generates video from the prepared inputs.

The creative loop is simple: arrange the scene, direct the action, move the camera, and generate the shot.

## How we built it

We built the scene editor with Three.js and TypeScript. The composition stores scene elements and animation over time, including recorded camera movement. Keeping that motion editable lets a handheld take become part of a reusable project.

Gemini powers the agentic director, connecting live voice instructions to supported changes in the scene, including object placement and character animation. We also use Gemini for image generation, with Veo handling video generation downstream.

Our handheld mode uses a **two-way streaming setup**. The editor renders the virtual scene and streams the view back to the phone over WebSockets. In the other direction, the phone sends position and orientation data, which drives the scene's virtual camera.

This keeps scene rendering in the editor while the phone handles tracking and displays the shot. We could build a focused camera companion without duplicating the full renderer or recreating the editor on mobile.

The generation workflow builds on the saved composition and its reusable blocks, carrying motion and visual direction forward into the inputs prepared for generation.

## Challenges we ran into

One of our hardest problems was balancing latency and preview quality in handheld mode. A detailed preview is useful for framing, but a delayed preview makes camera movement harder to judge. The phone's view needs to stay connected to the movement of your hands.

We considered adding another renderer on the phone or moving the experience into a full mobile editor. Both would introduce more rendering work and another environment to keep consistent with the main scene.

Instead, we split the responsibilities: the editor renders the scene, the phone receives the view, and lightweight position and orientation messages travel back to control the camera. That gave us a focused tradeoff to manage—how much preview detail to transmit and how frequently to update it—while keeping one scene renderer responsible for the image.

Another central design problem was keeping a filmed take useful after capture. We made camera movement part of the editable composition, so it can be replayed and reused in the generation workflow rather than existing only as a temporary live view.

## Accomplishments that we're proud of

- Connecting physical phone movement to a camera inside an editable virtual scene.
- Giving creators a live voice director for object placement and character animation.
- Bringing scene composition, recorded movement, generated imagery, and video generation into one workflow.
- Making compositions reusable through generation blocks, so a shot can become a starting point for further work.

## What we learned

We learned that the feel of a creative tool depends on the feedback between an action and its visible result. For handheld filming, preview quality and responsiveness have to be considered together.

We also learned the value of keeping creative decisions in an editable representation. When camera movement and scene animation remain part of the composition, generation can build on decisions the creator has already made.

## What's next for Composition

We want to refine the handheld experience across different devices and network conditions, with particular attention to the balance between preview clarity and responsiveness.

We also want to evaluate and improve how faithfully generated video follows the movement and staging in each composition, and make it easier to reuse generation blocks across a sequence of shots.
