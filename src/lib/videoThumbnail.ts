// Capture an actual frame from a locally selected video; never persist its blob URL.
export function captureVideoThumbnail(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)
    let settled = false
    const fallback = window.setTimeout(() => finish(null), 10000)
    const finish = (blob: Blob | null) => {
      if (settled) return
      settled = true
      window.clearTimeout(fallback)
      video.pause()
      video.removeAttribute('src')
      video.load()
      URL.revokeObjectURL(url)
      resolve(blob)
    }
    const capture = () => {
      if (settled || !video.videoWidth || !video.videoHeight) return finish(null)
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 480
        canvas.height = Math.max(1, Math.round(480 * video.videoHeight / video.videoWidth))
        const context = canvas.getContext('2d')
        if (!context) return finish(null)
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        canvas.toBlob((blob) => finish(blob), 'image/jpeg', 0.82)
      } catch { finish(null) }
    }
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.onloadeddata = () => {
      if (settled) return
      const target = Number.isFinite(video.duration) && video.duration > 0 ? Math.min(0.5, video.duration / 2) : 0
      if (target > 0) {
        video.onseeked = capture
        try { video.currentTime = target } catch { capture() }
      } else capture()
    }
    video.onerror = () => finish(null)
    video.src = url
  })
}
