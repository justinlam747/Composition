import { MathUtils } from 'three';
import { MAX_ROTATION_PATH_POINTS, fromQuaternion, toQuaternion, unwrapRotation, type Vec3 } from './project';

const copyPath = (path: Vec3[]) => path.map(value => [...value] as Vec3);

// Simplify in rotation space, not pointer space or editing time. Short segments
// protect winding; the reversal check distinguishes a turn from a small wobble.
export function simplifyRotationPath(path: Vec3[], toleranceDegrees = 2): Vec3[] {
  if (path.length < 3) return copyPath(path);
  const rotations = path.map(toQuaternion);
  const travel = [0];
  for (let i = 1; i < rotations.length; i++) travel.push(travel[i - 1] + rotations[i - 1].angleTo(rotations[i]));
  const tolerance = MathUtils.degToRad(toleranceDegrees);
  const keep = new Set([0, path.length - 1]);
  const pending: [number, number][] = [[0, path.length - 1]];
  while (pending.length) {
    const [first, last] = pending.pop()!;
    if (last - first < 2) continue;
    let split = -1;
    if (travel[last] - travel[first] > Math.PI / 2) {
      const middle = (travel[first] + travel[last]) / 2;
      split = first + 1;
      for (let i = first + 2; i < last; i++) {
        if (Math.abs(travel[i] - middle) < Math.abs(travel[split] - middle)) split = i;
      }
    } else {
      const start = rotations[first], end = rotations[last].clone();
      if (start.dot(end) < 0) end.set(-end.x, -end.y, -end.z, -end.w);
      const dot = MathUtils.clamp(start.dot(end), -1, 1);
      const halfAngle = Math.acos(dot), sine = Math.sin(halfAngle);
      let largestError = tolerance, furthest = 0, turn = first;
      for (let i = first + 1; i < last; i++) {
        const rotation = rotations[i];
        // Project onto the quaternion arc. This removes redundant speed changes
        // as well as samples, since the timeline owns the timing.
        const sign = start.dot(rotation) < 0 ? -1 : 1;
        const x = start.dot(rotation) * sign;
        const y = sine > 1e-8 ? (end.dot(rotation) * sign - dot * x) / sine : 0;
        const progress = halfAngle > 1e-8 ? MathUtils.clamp(Math.atan2(y, x) / halfAngle, 0, 1) : 0;
        const error = start.clone().slerp(end, progress).angleTo(rotation);
        if (error > largestError) { largestError = error; split = i; }
        if ((furthest - progress) * halfAngle * 2 > tolerance && turn > first) {
          split = turn;
          break;
        }
        if (progress > furthest) { furthest = progress; turn = i; }
      }
    }
    if (split > first && split < last) {
      keep.add(split);
      pending.push([first, split], [split, last]);
    }
  }
  return [...keep].sort((a, b) => a - b).map(index => [...path[index]] as Vec3);
}

// Bend a fixed copy of the route toward its edited endpoint. Recomputing from
// that copy prevents successive pointer events from accumulating corrections.
export function refineRotationPath(path: Vec3[], value: Vec3, edge: 'start' | 'end' = 'end'): Vec3[] {
  if (path.length < 2) return [[...value]];
  const reference = path[edge === 'start' ? 0 : path.length - 1];
  const delta = value.map((v, axis) => v - reference[axis]) as Vec3;
  if (delta.every(v => Math.abs(v) < 1e-9)) return copyPath(path);
  const rotations = path.map(toQuaternion);
  const travel = [0];
  for (let i = 1; i < rotations.length; i++) travel.push(travel[i - 1] + rotations[i - 1].angleTo(rotations[i]));
  const total = travel[travel.length - 1];
  const inverseReference = toQuaternion(reference).invert();
  // Retain original bends, and sample the correction densely enough to keep
  // complete turns even when both endpoint orientations happen to match.
  const progress = new Set(travel.map((distance, i) => total > 1e-9 ? distance / total : i / (path.length - 1)));
  const extra = Math.min(MAX_ROTATION_PATH_POINTS - path.length,
    Math.ceil((MathUtils.radToDeg(total) + 1.5 * delta.reduce((sum, v) => sum + Math.abs(v), 0)) / 5));
  for (let i = 1; i <= extra; i++) progress.add(i / (extra + 1));
  const result: Vec3[] = [];
  let segment = 0;
  for (const u of [...progress].sort((a, b) => a - b)) {
    const distance = u * total;
    while (segment < path.length - 2 && travel[segment + 1] < distance) segment++;
    const length = travel[segment + 1] - travel[segment];
    const local = length > 1e-9 ? MathUtils.clamp((distance - travel[segment]) / length, 0, 1) : 0;
    const pose = rotations[segment].clone().slerp(rotations[segment + 1], local);
    const t = edge === 'end' ? u : 1 - u;
    const weight = t * t * (3 - 2 * t);
    const offset = reference.map((v, axis) => v + delta[axis] * weight) as Vec3;
    const adjusted = toQuaternion(offset).multiply(inverseReference).multiply(pose).normalize();
    const previous = result[result.length - 1] ?? (edge === 'start' ? value : path[0]);
    result.push(unwrapRotation(fromQuaternion(adjusted), previous));
  }
  result[0] = [...(edge === 'start' ? value : path[0])];
  result[result.length - 1] = [...(edge === 'end' ? value : path[path.length - 1])];
  return result;
}
