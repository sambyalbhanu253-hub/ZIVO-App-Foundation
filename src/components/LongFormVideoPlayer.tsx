import { Expand, LoaderCircle, Pause, Play, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '../lib/utils'

type LongFormVideoPlayerProps = {
  src: string
  poster?: string
  title: string
  className?: string
  onDurationChange?: (durationSeconds: number) => void
}

function formatTime(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00'
  const seconds = Math.floor(totalSeconds)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`
}

export default function LongFormVideoPlayer({ src, poster, title, className, onDurationChange }: LongFormVideoPlayerProps) {
  const playerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const fallbackFullscreenRef = useRef(false)
  const [isFallbackFullscreen, setIsFallbackFullscreen] = useState(false)
  const setFallbackFullscreen = (active: boolean) => {
    fallbackFullscreenRef.current = active
    setIsFallbackFullscreen(active)
    setIsFullscreen(active)
    document.body.style.overflow = active ? 'hidden' : ''
  }
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [playbackError, setPlaybackError] = useState('')
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [fullscreenError, setFullscreenError] = useState('')

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === playerRef.current || document.fullscreenElement === videoRef.current || fallbackFullscreenRef.current)
      setFullscreenError('')
    }
    const handleWebkitBegin = () => setIsFullscreen(true)
    const handleWebkitEnd = () => setIsFullscreen(false)
    const video = videoRef.current
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && fallbackFullscreenRef.current) setFallbackFullscreen(false)
    }
    document.addEventListener('keydown', handleEscape)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    video?.addEventListener('webkitbeginfullscreen', handleWebkitBegin)
    video?.addEventListener('webkitendfullscreen', handleWebkitEnd)
    return () => {
      if (fallbackFullscreenRef.current) document.body.style.overflow = ''
      document.removeEventListener('keydown', handleEscape)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      video?.removeEventListener('webkitbeginfullscreen', handleWebkitBegin)
      video?.removeEventListener('webkitendfullscreen', handleWebkitEnd)
    }
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    // Explicitly apply the inline flag as a property as well as an attribute. This keeps
    // a user-initiated play request in the embedded Android feed instead of handing it off.
    video.playsInline = true
    setIsPlaying(false)
    setIsLoading(true)
    setPlaybackError('')
    setCurrentTime(0)
    setDuration(0)
    video.load()
  }, [src])

  const handlePlayPause = async () => {
    const video = videoRef.current
    if (!video || playbackError) return
    try {
      if (video.paused) {
        await video.play()
        setIsPlaying(true)
      } else {
        video.pause()
        setIsPlaying(false)
      }
    } catch (error) {
      setPlaybackError(error instanceof Error ? error.message : 'Video playback could not start.')
    }
  }

  const handleSeek = (nextTime: number) => {
    const video = videoRef.current
    if (!video || !Number.isFinite(nextTime)) return
    video.currentTime = nextTime
    setCurrentTime(nextTime)
  }

  const handleFullscreen = async () => {
    const video = videoRef.current
    if (!video) return
    setFullscreenError('')
    try {
      if (isFallbackFullscreen) {
        setFallbackFullscreen(false)
      } else if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else if (playerRef.current?.requestFullscreen) {
        await playerRef.current.requestFullscreen()
      } else {
        // Some embedded WebViews cannot enter element fullscreen; fill the viewport in-app.
        setFallbackFullscreen(true)
      }
    } catch (error) {
      setFullscreenError(error instanceof Error ? error.message : 'Fullscreen is not available in this browser.')
    }
  }

  return (
    <div
      ref={playerRef}
      className={cn('zivo-long-player group relative aspect-video overflow-hidden rounded-2xl bg-[var(--video-background)] shadow-premium', isFallbackFullscreen && 'zivo-long-player-fallback w-screen h-screen', className)}
      aria-label={`${title} video player`}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        preload="metadata"
        playsInline
        controls={false}
        className="block h-full w-full bg-[var(--video-background)] object-contain"
        aria-label={title}
        onLoadStart={() => {
          setIsLoading(true)
          setPlaybackError('')
        }}
        onLoadedMetadata={(event) => {
          const nextDuration = event.currentTarget.duration
          setDuration(nextDuration)
          setIsLoading(false)
          onDurationChange?.(nextDuration)
        }}
        onCanPlay={() => setIsLoading(false)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onVolumeChange={(event) => setIsMuted(event.currentTarget.muted || event.currentTarget.volume === 0)}
        onEnded={() => setIsPlaying(false)}
        onError={() => {
          setIsLoading(false)
          setPlaybackError('This video is unavailable or could not be played.')
        }}
      />

      {fullscreenError && <p role="alert" className="absolute left-3 top-3 z-20 rounded-lg bg-card px-3 py-2 text-xs text-card-foreground">{fullscreenError}</p>}

      {isLoading && !playbackError && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/65 text-card-foreground" role="status">
          <span className="inline-flex items-center gap-2 rounded-xl bg-card/90 px-3 py-2 text-xs font-bold shadow-premium">
            <LoaderCircle size={16} className="zivo-loader" aria-hidden="true" /> Loading video
          </span>
        </div>
      )}

      {playbackError ? (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 p-4 text-center" role="alert">
          <div>
            <p className="text-sm font-extrabold text-card-foreground">Video unavailable</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-muted-foreground">{playbackError}</p>
          </div>
        </div>
      ) : (
        <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-background via-background/70 to-transparent px-3 pb-3 pt-10">
          <input
            type="range"
            aria-label="Video progress"
            min="0"
            max={Number.isFinite(duration) && duration > 0 ? duration : 0}
            step="0.1"
            value={Math.min(currentTime, duration || 0)}
            disabled={!duration}
            onChange={(event) => handleSeek(Number(event.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full accent-primary disabled:cursor-not-allowed disabled:opacity-50"
          />
          <div className="mt-2 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void handlePlayPause()}
              aria-label={isPlaying ? 'Pause video' : 'Play video'}
              className="flex size-9 touch-manipulation items-center justify-center rounded-full bg-card/90 text-card-foreground shadow-premium backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {isPlaying ? <Pause size={17} fill="currentColor" aria-hidden="true" /> : <Play size={17} fill="currentColor" aria-hidden="true" />}
            </button>
            <span className="min-w-20 text-xs font-bold tabular-nums text-card-foreground">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
            <button
              type="button"
              onClick={() => {
                const video = videoRef.current
                if (!video) return
                video.muted = !video.muted
                setIsMuted(video.muted)
              }}
              aria-label={isMuted ? 'Unmute video' : 'Mute video'}
              className="ml-auto flex size-9 items-center justify-center rounded-full bg-card/90 text-card-foreground shadow-premium backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {isMuted ? <VolumeX size={17} aria-hidden="true" /> : <Volume2 size={17} aria-hidden="true" />}
            </button>
            <button
              type="button"
              onClick={() => void handleFullscreen()}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              className="flex size-9 touch-manipulation items-center justify-center rounded-full bg-card/90 text-card-foreground shadow-premium backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Expand size={17} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
