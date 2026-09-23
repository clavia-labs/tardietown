import { useCallback, useEffect, useRef, useState } from "react"
import { DemoTownScene } from "./scene/DemoTownScene"
import { DEFAULT_AGENT_COUNT, makeResidents } from "./world"
import "./demo-recording.css"

/** Clean local preview for capturing a short town demo. No server or model calls. */
export function DemoRecording() {
  const [residents] = useState(() => makeResidents(DEFAULT_AGENT_COUNT, DEFAULT_AGENT_COUNT))
  const [recording, setRecording] = useState(false)
  const [take, setTake] = useState(0)
  const [message, setMessage] = useState("")
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const frameRef = useRef<number | null>(null)

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current
    if (recorder?.state === "recording") recorder.stop()
  }, [])

  useEffect(() => {
    if (!recording) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "r" && !event.repeat) stopRecording()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [recording, stopRecording])

  async function startRecording() {
    setMessage("")
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false,
        preferCurrentTab: true,
      } as DisplayMediaStreamOptions)
      streamRef.current = stream
      const video = document.createElement("video")
      video.srcObject = stream
      video.muted = true
      await video.play()
      const canvas = document.createElement("canvas")
      canvas.width = 1440
      canvas.height = 810
      const context = canvas.getContext("2d")
      if (!context) throw new Error("Canvas recording is unavailable")
      const drawFrame = () => {
        context.fillStyle = "#fffefa"
        context.fillRect(0, 0, 1440, 810)
        const scale = Math.min(1440 / video.videoWidth, 810 / video.videoHeight)
        const width = video.videoWidth * scale
        const height = video.videoHeight * scale
        context.drawImage(video, (1440 - width) / 2, (810 - height) / 2, width, height)
        frameRef.current = requestAnimationFrame(drawFrame)
      }
      drawFrame()
      const output = canvas.captureStream(30)
      const sourceSize = `${video.videoWidth}×${video.videoHeight}`
      const mimeType = ["video/mp4;codecs=avc1.640028", "video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm"]
        .find((type) => MediaRecorder.isTypeSupported(type))
      const chunks: BlobPart[] = []
      const recorder = new MediaRecorder(output, mimeType ? { mimeType, videoBitsPerSecond: 20_000_000 } : undefined)
      recorderRef.current = recorder
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
      recorder.onstop = () => {
        if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
        output.getTracks().forEach((track) => track.stop())
        video.srcObject = null
        stream.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        recorderRef.current = null
        setRecording(false)
        const ext = recorder.mimeType.includes("mp4") ? "mp4" : "webm"
        const blob = new Blob(chunks, { type: recorder.mimeType })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = `tardie-town-demo.${ext}`
        link.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
        setMessage(`Saved tardie-town-demo.${ext} · source ${sourceSize}`)
      }
      stream.getVideoTracks()[0]?.addEventListener("ended", stopRecording, { once: true })
      setTake((current) => current + 1)
      setRecording(true)
      window.setTimeout(() => recorder.start(1000), 1200)
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop())
      setMessage(error instanceof Error ? error.message : "Could not start recording")
    }
  }

  return <main className="demo-recording entry-land" aria-label="Tardie Town demo">
    <div className="demo-recording-title"><h1>Tardie Town</h1><p>Give a swarm of agents a mission. See how they work together.</p><small>Simulated scenario</small></div>
    <DemoTownScene key={take} residents={residents} recording onFirstThreadComplete={recording ? stopRecording : undefined} />
    {!recording && <div className="demo-recording-control">
      <button type="button" onClick={startRecording}>Record tab</button>
      {message && <span role="status">{message}</span>}
    </div>}
  </main>
}
