// The marker is carried IN the image, so an earlier decoded frame cannot complete a pulse.
export const LATENCY_MARKER = { x: 8, y: 8, cell: 12, height: 24, cells: 18 };
export function drawLatencyMarker(context: CanvasRenderingContext2D, id: number) {
  const { x, y, cell, height, cells } = LATENCY_MARKER;
  for (let i = 0; i < cells; i++) {
    const white = i === 0 || i > 1 && !!(id & (1 << (i - 2)));
    context.fillStyle = white ? '#fff' : '#000';
    context.fillRect(x + i * cell, y, cell, height);
  }
}
export function latencyPercentile(samples: number[], percentile: number): number | null {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * percentile) - 1)];
}
