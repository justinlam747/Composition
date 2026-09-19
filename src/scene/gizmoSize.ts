// TransformControls scales its half-unit rotation rings by camera factor * size / 4.
// Counteract that screen-size behavior so handles follow the selected part's size,
// with a small screen-space minimum to keep fingers and wrists usable.
export function gizmoSizeForPart(diameter: number, distance: number, fov: number, zoom: number, viewportHeight: number, coarsePointer = false) {
  const tangent = Math.tan(fov * Math.PI / 360) / Math.max(zoom, .01);
  const factor = Math.max(.001, distance * Math.min(1.9 * tangent, 7));
  const unitsPerPixel = 2 * distance * tangent / Math.max(1, viewportHeight);
  const radius = Math.max(diameter * .58, unitsPerPixel * (coarsePointer ? 25 : 18), .025);
  return radius * 8 / factor;
}
