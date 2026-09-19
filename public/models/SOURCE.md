# Humanoid mannequin

- Author: Quaternius
- Pack: Universal Animation Library, Standard
- License: CC0 1.0 Universal. Original notice is in LICENSE.txt.
- Creator: https://quaternius.com/packs/universalanimationlibrary.html
- Original download: https://opengameart.org/sites/default/files/universal_animation_librarystandard.zip
- Source file: Animation Library[Standard]/Godot/AnimationLibrary_Godot_Standard.glb

The bundled humanoid.glb retains the source model, normals, mesh weights, original
bones and bind matrices. The first Idle_Loop pose is baked as the static starting
pose; animation clips and their unused binary data are removed. Materials are
changed to light gray and slate blue. No geometry is generated or re-rigged.

Rebuild from the source with:

```sh
node scripts/prepare-humanoid.mjs data/assets/quaternius-source.glb
```

The app exposes 17 major body controls. Additional source bones, including fingers,
remain in the original rig and follow their parents. All motion during editing is
driven by the app's keyframe tracks, not an imported animation mixer.
