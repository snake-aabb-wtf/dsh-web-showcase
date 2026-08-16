/**
 * HandTracker — owns the camera stream + MediaPipe HandLandmarker inference loop.
 * The heavy @mediapipe/tasks-vision bundle is dynamic-imported on first use so
 * the main app chunk stays small.
 */
import type { HandLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision';

export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private raf = 0;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private running = false;

  /** Called every inference frame with the detected hands (null when none). */
  onFrame: ((hands: NormalizedLandmark[][] | null) => void) | null = null;
  /** Called on runtime inference errors. */
  onError: ((message: string) => void) | null = null;

  /** Load WASM + model and construct the tracker. */
  static async create(): Promise<HandTracker> {
    const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
    const tracker = new HandTracker();
    const wasm = await FilesetResolver.forVisionTasks('./mediapipe/wasm');
    const baseOptions = { modelAssetPath: './mediapipe/hand_landmarker.task' };
    try {
      tracker.landmarker = await HandLandmarker.createFromOptions(wasm, {
        baseOptions: { ...baseOptions, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: 2,
      });
    } catch {
      // Headless browsers / weak GPUs fall back to CPU.
      tracker.landmarker = await HandLandmarker.createFromOptions(wasm, {
        baseOptions: { ...baseOptions, delegate: 'CPU' },
        runningMode: 'VIDEO',
        numHands: 2,
      });
    }
    return tracker;
  }

  /** Request the front camera, attach it to `video` and start the inference loop. */
  async start(video: HTMLVideoElement): Promise<void> {
    if (this.running) return;
    if (!this.landmarker) throw new Error('HandLandmarker 未初始化');
    this.video = video;
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    video.srcObject = this.stream;
    await video.play();
    this.running = true;

    const loop = () => {
      if (!this.running) return;
      if (video.readyState >= 2 && this.landmarker) {
        try {
          const result = this.landmarker.detectForVideo(video, performance.now());
          this.onFrame?.(result.landmarks.length > 0 ? result.landmarks : null);
        } catch (err) {
          this.onError?.(err instanceof Error ? err.message : String(err));
        }
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Stop the loop and release the camera. */
  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }
  }

  dispose(): void {
    this.stop();
    void this.landmarker?.close();
    this.landmarker = null;
  }
}
