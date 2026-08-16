import { describe, expect, it } from 'vitest';
import {
  GestureAnalyzer,
  buildHandData,
  defaultGestureOptions,
  mapLandmarkToCanvas,
  type HandScreenData,
} from '../src/gesture/gesture';

function hand(tipDist: number, x = 100, y = 100, scale = 100): HandScreenData {
  return { pinchPoint: { x, y }, handScale: scale, tipDist };
}

describe('mapLandmarkToCanvas', () => {
  it('maps with object-fit cover and no mirror', () => {
    // 640x480 video into 1280x800 canvas: cover scale = max(2, 1.667) = 2.
    const p = mapLandmarkToCanvas(0.5, 0.5, 640, 480, 1280, 800, false);
    expect(p).toEqual({ x: 640, y: 400 });
  });

  it('mirrors X to match the selfie view', () => {
    const p = mapLandmarkToCanvas(0.25, 0.5, 640, 480, 1280, 800, true);
    expect(p).not.toBeNull();
    expect(p!.x).toBeCloseTo(1280 - 320, 6); // mirrored
    expect(p!.y).toBeCloseTo(400, 6);
  });

  it('returns null for points outside the visible video box', () => {
    // Video taller than canvas → horizontal letterbox → x=0.02 might be outside.
    const p = mapLandmarkToCanvas(0.001, 0.5, 640, 480, 800, 800, false);
    expect(p).toBeNull();
  });
});

describe('GestureAnalyzer pinch', () => {
  it('emits pinch-start on first frame below the threshold, then move, then end', () => {
    const a = new GestureAnalyzer(defaultGestureOptions);
    expect(a.analyze([hand(30)])).toEqual([{ type: 'pinch-start', x: 100, y: 100 }]);
    expect(a.analyze([hand(25)])).toEqual([{ type: 'pinch-move', x: 100, y: 100 }]);
    // Open wide → release (above releaseRatio * scale = 62).
    expect(a.analyze([hand(80)])).toEqual([{ type: 'pinch-end' }]);
    expect(a.analyze([])).toEqual([]);
  });

  it('uses hysteresis: releases only above releaseRatio', () => {
    const a = new GestureAnalyzer(defaultGestureOptions);
    a.analyze([hand(30)]); // start (threshold 42)
    // Still below pinchRatio but above... e.g. 50 > 42 → without hysteresis it would
    // toggle off; with hysteresis (release 62) it stays pinching.
    expect(a.analyze([hand(50)])).toEqual([{ type: 'pinch-move', x: 100, y: 100 }]);
  });

  it('emits pinch-end when the hand disappears', () => {
    const a = new GestureAnalyzer(defaultGestureOptions);
    a.analyze([hand(30)]);
    expect(a.analyze([])).toEqual([{ type: 'pinch-end' }]);
  });

  it('ignores hands smaller than minHandScalePx', () => {
    const a = new GestureAnalyzer(defaultGestureOptions);
    expect(a.analyze([hand(10, 100, 100, 20)])).toEqual([]); // scale 20 < 40
  });
});

describe('GestureAnalyzer zoom', () => {
  it('emits zoom factors from the two-hand distance ratio (clamped per frame)', () => {
    const a = new GestureAnalyzer({ ...defaultGestureOptions, zoomMax: 1.2 });
    a.analyze([hand(30, 0, 0), hand(30, 100, 0)]); // establish baseline (dist 100)
    const events = a.analyze([hand(30, 0, 0), hand(30, 110, 0)]); // dist 110 → 1.1
    const zoom = events.find((e) => e.type === 'zoom');
    expect(zoom && zoom.type === 'zoom' ? zoom.factor : 0).toBeCloseTo(1.1, 6);
  });

  it('resets the zoom baseline when the hand count changes', () => {
    const a = new GestureAnalyzer(defaultGestureOptions);
    a.analyze([hand(30, 0, 0), hand(30, 100, 0)]);
    a.analyze([hand(30, 0, 0)]); // one hand disappears → baseline reset
    const events = a.analyze([hand(30, 0, 0), hand(30, 120, 0)]);
    expect(events.find((e) => e.type === 'zoom')).toBeUndefined(); // no zoom on re-gain
  });
});

describe('buildHandData', () => {
  it('computes pinch point, scale and tip distance', () => {
    const d = buildHandData({ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 0, y: 0 }, { x: 0, y: 40 });
    expect(d).not.toBeNull();
    expect(d!.pinchPoint).toEqual({ x: 20, y: 10 });
    expect(d!.tipDist).toBe(20);
    expect(d!.handScale).toBe(40);
  });

  it('returns null when a landmark is missing', () => {
    expect(buildHandData({ x: 0, y: 0 }, null, { x: 0, y: 0 }, { x: 0, y: 40 })).toBeNull();
  });
});
