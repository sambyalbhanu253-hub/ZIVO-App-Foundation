import { useEffect } from 'react'
import type { StoredPost } from '../lib/posts'

export default function useSharedContentMeta(post: StoredPost | null) {
  useEffect(() => {
    if (!post || post.visibility !== 'Public') return
    const title = `${post.title || post.caption || 'Watch this video'} | ZIVO`
    const description = (post.description || post.caption || `Watch ${post.creatorName} on ZIVO`).slice(0, 200)
    const candidateImage = post.thumbnailUrl || (post.mediaType === 'photo' ? post.mediaUrl : '')
    const image = /^(https?:\/\/|\/api\/apps\/)/i.test(candidateImage) ? candidateImage : ''
    const url = `${window.location.origin}${window.location.pathname}#/${post.format === 'short' ? 'shorts' : 'content'}/${encodeURIComponent(post.id)}`
    const tags: [string, string, string][] = [
      ['property', 'og:title', title], ['property', 'og:description', description],
      ['property', 'og:type', 'video.other'], ['property', 'og:site_name', 'ZIVO'],
      ['property', 'og:url', url], ['name', 'twitter:card', 'summary_large_image'],
      ['name', 'twitter:title', title], ['name', 'twitter:description', description],
      ['name', 'description', description],
    ]
    if (image) {
      const absoluteImage = new URL(image, window.location.origin).href
      tags.push(['property', 'og:image', absoluteImage], ['name', 'twitter:image', absoluteImage])
    }
    const previous = tags.map(([attribute, key, value]) => {
      let element = document.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`)
      const created = !element
      if (!element) { element = document.createElement('meta'); element.setAttribute(attribute, key); document.head.appendChild(element) }
      const oldValue = element.getAttribute('content')
      element.setAttribute('content', value)
      return { element, created, oldValue }
    })
    const oldTitle = document.title
    document.title = title
    return () => {
      document.title = oldTitle
      previous.forEach(({ element, created, oldValue }) => {
        if (created) element.remove()
        else if (oldValue === null) element.removeAttribute('content')
        else element.setAttribute('content', oldValue)
      })
    }
  }, [post])
}
