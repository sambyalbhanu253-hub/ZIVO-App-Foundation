import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { createPost, type PostFormat } from '../lib/posts'
import { captureVideoThumbnail } from '../lib/videoThumbnail'

type UploadJob = { id: string; name: string; percent: number; status: 'uploading' | 'saving' | 'done' | 'error'; error?: string }
type UploadInput = { file: File; format: PostFormat; title: string; caption: string; description: string; hashtags: string[]; duration?: number; channelId?: string; post_type: 'personal' | 'channel' }
type UploadContextValue = { jobs: UploadJob[]; start: (input: UploadInput) => void }
const UploadContext = createContext<UploadContextValue | null>(null)

export function useBackgroundUpload() {
  const context = useContext(UploadContext)
  if (!context) throw new Error('Background upload is unavailable outside the app shell.')
  return context
}

export default function BackgroundUpload({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [jobs, setJobs] = useState<UploadJob[]>([])
  const completedIds = jobs.filter(job => job.status === 'done').map(job => job.id).join('|')
  useEffect(() => {
    if (!completedIds) return
    const timers = completedIds.split('|').map(id => window.setTimeout(() => {
      setJobs(current => current.filter(job => job.id !== id || job.status !== 'done'))
    }, 3000))
    return () => timers.forEach(window.clearTimeout)
  }, [completedIds])
  const update = (id: string, changes: Partial<UploadJob>) => setJobs(current => current.map(job => job.id === id ? { ...job, ...changes } : job))
  const start = (input: UploadInput) => {
    if (!user) return
    const creator = user
    const id = crypto.randomUUID()
    setJobs(current => [...current, { id, name: input.file.name, percent: 0, status: 'uploading' }])
    void (async () => {
      try {
        await window.genmb.auth.ready()
        if (window.genmb.auth.getUser()?.id !== creator.id) throw new Error('Your session expired. Sign in and try again.')
        const thumbnail = await captureVideoThumbnail(input.file)
        const uploaded = await window.genmb.storage.upload(input.file, {
          folder: 'zivo-posts',
          onProgress: percent => update(id, { percent: Math.min(100, Math.max(0, Math.round(percent))) }),
        })
        update(id, { percent: 100, status: 'saving' })
        const savedThumbnail = thumbnail ? await window.genmb.storage.upload(new File([thumbnail], `${id}.jpg`, { type: 'image/jpeg' }), { folder: 'zivo-thumbnails' }) : null
        if (window.genmb.auth.getUser()?.id !== creator.id) throw new Error('Your session expired before the draft could be saved.')
        await createPost({
          user: creator, mediaType: 'video', format: input.format,
          title: input.title || input.file.name, caption: input.caption || input.title || input.file.name,
          description: input.description, hashtags: input.hashtags, visibility: 'Private',
          media: { ...uploaded, alt: input.title || input.file.name }, videoDurationSeconds: input.duration,
          idempotencyKey: id, thumbnailUrl: savedThumbnail?.url, channelId: input.channelId, post_type: input.post_type,
        })
        update(id, { status: 'done' })
      } catch (error) {
        update(id, { status: 'error', error: error instanceof Error ? error.message : String(error) })
      }
    })()
  }
  return <UploadContext.Provider value={{ jobs, start }}>
    {children}
    {jobs.length > 0 && <aside aria-label="Background uploads" className="fixed bottom-20 left-1/2 z-40 w-[min(calc(100%-2rem),26rem)] -translate-x-1/2 space-y-2 rounded-2xl border border-border bg-card p-3 text-card-foreground shadow-float">
      <div className="flex items-center justify-between gap-2"><strong className="text-sm">Uploads</strong><Link to="/creator/studio" className="text-xs font-bold text-primary">Creator Studio</Link></div>
      {jobs.map(job => <div key={job.id} className="text-xs" role={job.status === 'error' ? 'alert' : 'status'}>
        <div className="flex justify-between gap-2"><span className="truncate">{job.name}</span><span className="shrink-0">{job.status === 'uploading' ? `${job.percent}%` : job.status === 'saving' ? 'Saving draft…' : job.status === 'done' ? 'Private draft saved' : 'Failed'}</span></div>
        <div role="progressbar" aria-label={`Upload ${job.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={job.percent} className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width]" style={{ width: `${job.percent}%` }} /></div>
        {job.error && <p className="mt-1 text-primary">{job.error}</p>}
      </div>)}
    </aside>}
  </UploadContext.Provider>
}
