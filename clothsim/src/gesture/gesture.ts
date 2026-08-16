/**
 * Pure gesture logic — no DOM. Everything needed to turn hand landmarks into
 * drag/zoom events, fully unit-testable.
 *
 * Coordinate conventions:
 * - MediaPipe landmarks are normalized [0..1] in the *unmirrored* camera frame.
 * - `mapLandmarkToCanvas` maps them to CSS pixels of the WebGL canvas using the
 *   same object-fit:cover box the <video> background is displayed with, and
 *   mirrors X so "the hand you see" matches "where the cloth gets grabbed".
 */

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface HandScreenData {
  /** Midpoint of thumb tip (4) and index tip (8) — the pinch point. */
  pinchPoint: ScreenPoint;
  /** Characteristic hand size in px (wrist→middle MCP), for scale-relative thresholds. */
  handScale: number;
  /** Thumb→index tip distance in screen px (drives the pinch test). */
  tipDist: number;
}

/**
 * Map a normalized landmark to canvas CSS pixels. Returns null when the point
 * falls outside the visible (cover-fitted) video area.
 */
export function mapLandmarkToCanvas(
  lx: number,
  ly: number,
  videoWidth: number,
  videoHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  mirror: boolean,
): ScreenPoint | null {
  if (videoWidth <= 0 || videoHeight <= 0 || canvasWidth <= 0 || canvasHeight <= 0) return null;
  // Same box as CSS object-fit: cover.
  const scale = Math.max(canvasWidth / videoWidth, canvasHeight / videoHeight);
  const dispW = videoWidth * scale;
  const dispH = videoHeight * scale;
  const offX = (canvasWidth - dispW) / 2;
  const offY = (canvasHeight - dispH) / 2;
  const px = offX + lx * dispW;
  const py = offY + ly * dispH;
  if (px < 0 || px > canvasWidth || py < 0 || py > canvasHeight) return null;
  return mirror ? { x: canvasWidth - px, y: py } : { x: px, y: py };
}

export type GestureEvent =
  | { type: 'pinch-start'; x: number; y: number }
  | { type: 'pinch-move'; x: number; y: number }
  | { type: 'pinch-end' }
  | { type: 'zoom'; factor: number };

export interface GestureAnalyzerOptions {
  /** Pinch grabs when tipDist < pinchRatio * handScale. */
  pinchRatio: number;
  /** Pinch releases when tipDist > releaseRatio * handScale (hysteresis). */
  releaseRatio: number;
  /** Hands smaller than this many px are ignored (too far / too small). */
  minHandScalePx: number;
  /** Per-frame zoom factor clamp. */
  zoomMin: number;
  zoomMax: number;
}

export const defaultGestureOptions: GestureAnalyzerOptions = {
  pinchRatio: 0.42,
  releaseRatio: 0.62,
  minHandScalePx: 40,
  zoomMin: 0.95,
  zoomMax: 1.06,
};

export class GestureAnalyzer {
  private pinching = false;
  private handCount = 0;
  private prevTwoHandDist: number | null = null;

  constructor(private readonly opts: GestureAnalyzerOptions = defaultGestureOptions) {}

  /**
   * @param hands Screen-space hand data, one entry per detected hand.
   * @returns Events for this frame (empty when nothing changed).
   */
  analyze(hands: HandScreenData[]): GestureEvent[] {
    const events: GestureEvent[] = [];
    const valid = hands.filter((h) => h.handScale >= this.opts.minHandScalePx);

    // Hand count changed → reset all transient state.
    if (valid.length !== this.handCount) {
      this.handCount = valid.length;
      this.prevTwoHandDist = null;
      if (this.pinching) {
        this.pinching = false;
        events.push({ type: 'pinch-end' });
      }
    }

    // Zoom: two hands → distance between pinch points drives the camera zoom.
    if (valid.length >= 2) {
      const a = valid[0].pinchPoint;
      const b = valid[1].pinchPoint;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.prevTwoHandDist !== null && this.prevTwoHandDist > 1e-6) {
        const ratio = dist / this.prevTwoHandDist;
        const factor = Math.min(this.opts.zoomMax, Math.max(this.opts.zoomMin, ratio));
        if (Math.abs(factor - 1) > 0.002) events.push({ type: 'zoom', factor });
      }
      this.prevTwoHandDist = dist;
    }

    // Primary hand: pinch grab/drag/release with hysteresis.
    const hand = valid[0];
    if (hand) {
      const now = this.pinching
        ? hand.tipDist < this.opts.releaseRatio * hand.handScale
        : hand.tipDist < this.opts.pinchRatio * hand.handScale;
      if (!this.pinching && now) {
        this.pinching = true;
        events.push({ type: 'pinch-start', x: hand.pinchPoint.x, y: hand.pinchPoint.y });
      } else if (this.pinching && now) {
        events.push({ type: 'pinch-move', x: hand.pinchPoint.x, y: hand.pinchPoint.y });
      } else if (this.pinching && !now) {
        this.pinching = false;
        events.push({ type: 'pinch-end' });
      }
    } else if (this.pinching) {
      this.pinching = false;
      events.push({ type: 'pinch-end' });
    }

    return events;
  }

  /** Whether the primary hand is currently pinching (overlay feedback). */
  get isPinching(): boolean {
    return this.pinching;
  }

  reset(): void {
    this.pinching = false;
    this.handCount = 0;
    this.prevTwoHandDist = null;
  }
}

/**
 * Build the HandScreenData for one hand from its landmark screen positions.
 * Returns null if any required landmark is missing.
 */
export function buildHandData(
  thumbTip: ScreenPoint | null,
  indexTip: ScreenPoint | null,
  wrist: ScreenPoint | null,
  midMcp: ScreenPoint | null,
): HandScreenData | null {
  if (!thumbTip || !indexTip || !wrist || !midMcp) return null;
  return {
    pinchPoint: { x: (thumbTip.x + indexTip.x) / 2, y: (thumbTip.y + indexTip.y) / 2 },
    handScale: Math.max(1, Math.hypot(wrist.x - midMcp.x, wrist.y - midMcp.y)),
    tipDist: Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y),
  };
}
