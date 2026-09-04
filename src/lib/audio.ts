// 音频：MediaRecorder 录音 → 解码 → WAV(16k 单声道)，供腾讯 ASR SentenceRecognition 使用
export interface Recording { blob: Blob; mime: string; seconds: number }

export class VoiceRecorder {
  private rec?: MediaRecorder
  private chunks: Blob[] = []
  private stream?: MediaStream
  private startedAt = 0

  static async supported(): Promise<boolean> {
    return !!(navigator.mediaDevices && typeof MediaRecorder !== 'undefined')
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mime = ['audio/webm', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) || ''
    this.rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined)
    this.chunks = []
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data)
    this.rec.start()
    this.startedAt = Date.now()
  }

  async stop(): Promise<Recording> {
    return new Promise((res, rej) => {
      if (!this.rec) return rej(new Error('未在录音'))
      this.rec.onstop = () => {
        this.stream?.getTracks().forEach((t) => t.stop())
        res({ blob: new Blob(this.chunks, { type: this.rec!.mimeType || 'audio/webm' }), mime: this.rec!.mimeType, seconds: (Date.now() - this.startedAt) / 1000 })
      }
      this.rec.stop()
    })
  }
}

// 任意浏览器可解码音频 → 16kHz 单声道 WAV Blob
export async function toWav16k(blob: Blob): Promise<Blob> {
  if (blob.size < 2048) throw new Error('录音太短，没有采到声音')
  const buf = await blob.arrayBuffer()
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
  try {
    const audio = await ctx.decodeAudioData(buf)
      .catch(() => { throw new Error('音频解码失败，请按住按钮说完整一句话再松开') })
    const rate = 16000
    const offline = new (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)(1, Math.ceil(audio.duration * rate), rate)
    const src = offline.createBufferSource()
    src.buffer = audio
    src.connect(offline.destination)
    src.start()
    const rendered = await offline.startRendering()
    return encodeWav(rendered.getChannelData(0), rate)
  } finally { ctx.close() }
}

function encodeWav(samples: Float32Array, rate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(buf)
  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  ws(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); ws(8, 'WAVE')
  ws(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  ws(36, 'data'); v.setUint32(40, samples.length * 2, true)
  let o = 44
  for (let i = 0; i < samples.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([buf], { type: 'audio/wav' })
}
