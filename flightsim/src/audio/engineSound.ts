/**
 * 程序化引擎/风声音效（WebAudio 合成，无任何外部音频文件，可离线）。
 * 引擎：锯齿波 + 次八度正弦，频率随转速；风声：白噪声 + 低通，增益随空速；
 * 失速警告：方波双音提示。全部参数随物理状态实时更新。
 */
import { clamp } from '../utils/math'

class EngineAudio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private engineOsc: OscillatorNode | null = null
  private engineSub: OscillatorNode | null = null
  private engineGain: GainNode | null = null
  private windSource: AudioBufferSourceNode | null = null
  private windFilter: BiquadFilterNode | null = null
  private windGain: GainNode | null = null
  private volume = 0.5
  private running = false
  private lastStall = false

  /** 需在用户手势（点击"开始飞行"）后调用 */
  init(): void {
    if (this.ctx) {
      void this.ctx.resume()
      return
    }
    try {
      const Ctx = window.AudioContext
      this.ctx = new Ctx()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.volume * 0.5
      this.master.connect(this.ctx.destination)

      // 引擎声
      this.engineOsc = this.ctx.createOscillator()
      this.engineOsc.type = 'sawtooth'
      this.engineSub = this.ctx.createOscillator()
      this.engineSub.type = 'sine'
      const filter = this.ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 900
      this.engineGain = this.ctx.createGain()
      this.engineGain.gain.value = 0
      this.engineOsc.connect(filter)
      this.engineSub.connect(filter)
      filter.connect(this.engineGain)
      this.engineGain.connect(this.master)
      this.engineOsc.start()
      this.engineSub.start()

      // 风声
      const len = this.ctx.sampleRate * 2
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
      this.windSource = this.ctx.createBufferSource()
      this.windSource.buffer = buf
      this.windSource.loop = true
      this.windFilter = this.ctx.createBiquadFilter()
      this.windFilter.type = 'lowpass'
      this.windFilter.frequency.value = 400
      this.windGain = this.ctx.createGain()
      this.windGain.gain.value = 0
      this.windSource.connect(this.windFilter)
      this.windFilter.connect(this.windGain)
      this.windGain.connect(this.master)
      this.windSource.start()

      this.running = true
    } catch {
      this.ctx = null
    }
  }

  setVolume(v: number): void {
    this.volume = clamp(v, 0, 1)
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.volume * 0.5, this.ctx.currentTime, 0.1)
    }
  }

  /** 每帧更新音效参数 */
  update(rpm: number, throttle: number, ias: number, stalled: boolean): void {
    if (!this.ctx || !this.running) return
    const t = this.ctx.currentTime
    if (this.engineOsc && this.engineSub) {
      const freq = 42 + rpm * 0.045
      this.engineOsc.frequency.setTargetAtTime(freq, t, 0.08)
      this.engineSub.frequency.setTargetAtTime(freq * 0.5, t, 0.08)
      this.engineGain?.gain.setTargetAtTime(0.02 + throttle * 0.09, t, 0.12)
    }
    if (this.windFilter && this.windGain) {
      const speed = clamp(ias / 75, 0, 1)
      this.windFilter.frequency.setTargetAtTime(250 + speed * 1600, t, 0.1)
      this.windGain.gain.setTargetAtTime(speed * speed * 0.14, t, 0.15)
    }
    if (stalled && !this.lastStall) {
      this.stallBeep()
    }
    this.lastStall = stalled
  }

  /** 失速警告音 */
  private stallBeep(): void {
    if (!this.ctx || !this.master) return
    const t = this.ctx.currentTime
    for (let i = 0; i < 3; i++) {
      const osc = this.ctx.createOscillator()
      osc.type = 'square'
      osc.frequency.value = 880
      const g = this.ctx.createGain()
      g.gain.setValueAtTime(0.0001, t + i * 0.22)
      g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.22 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.22 + 0.18)
      osc.connect(g)
      g.connect(this.master)
      osc.start(t + i * 0.22)
      osc.stop(t + i * 0.22 + 0.2)
    }
  }

  dispose(): void {
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined)
      this.ctx = null
      this.running = false
    }
  }
}

export const engineAudio = new EngineAudio()
