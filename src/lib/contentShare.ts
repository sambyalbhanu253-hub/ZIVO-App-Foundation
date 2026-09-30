import type { PostFormat } from './posts'

export function isValidZivoContentId(contentId: string) {
  return typeof contentId === 'string' && contentId.trim().length > 0
}

export function zivoContentPath(contentId: string, format: PostFormat) {
  if (!isValidZivoContentId(contentId)) return null
  const normalizedId = contentId.trim()
  return format === 'short' ? `/shorts/${encodeURIComponent(normalizedId)}` : `/content/${encodeURIComponent(normalizedId)}`
}

export function zivoContentUrl(contentId: string, format: PostFormat) {
  const path = zivoContentPath(contentId, format)
  if (!path || typeof window === 'undefined') return null

  // Keep the deployed preview/app path, but never leak transient auth/search parameters or an
  // existing content hash into a public content link.
  return `${window.location.origin}${window.location.pathname}#${path}`
}

export function zivoShareText(title: string, creatorName: string, link: string) {
  const contentTitle = title.trim() || 'this ZIVO content'
  const creator = creatorName.trim()
  return `Watch “${contentTitle}”${creator ? ` by ${creator}` : ''} on ZIVO.\n\n${link}`
}

type AndroidShareBridge = { shareText?: (text: string, title: string) => void }

export function isAndroidNativeShareEnvironment() {
  const nativeWindow = window as Window & {
    Android?: AndroidShareBridge
    Capacitor?: { isNativePlatform?: () => boolean }
    cordova?: unknown
  }
  return /Android/i.test(navigator.userAgent) && (
    /; wv\)/i.test(navigator.userAgent) ||
    Boolean(nativeWindow.Android?.shareText) ||
    Boolean(nativeWindow.cordova) ||
    nativeWindow.Capacitor?.isNativePlatform?.() === true
  )
}

export function openAndroidShareSheet(shareText: string, title: string) {
  const nativeWindow = window as Window & { Android?: AndroidShareBridge }
  if (!isAndroidNativeShareEnvironment() || typeof nativeWindow.Android?.shareText !== 'function') return false
  nativeWindow.Android.shareText(shareText, title)
  return true
}

function isCancelledShare(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') return true
  if (error && typeof error === 'object' && 'name' in error && (error as { name?: unknown }).name === 'AbortError') return true
  return error instanceof Error && /cancel|dismiss|abort/i.test(error.message)
}

export function isCancelledZivoShare(error: unknown) {
  return isCancelledShare(error)
}

export type ZivoCopyResult = 'copied' | 'manual'
export type ZivoShareResult = 'web' | 'android-native' | 'cancelled' | 'copied' | 'copied-after-error' | 'manual-copy' | 'manual-copy-after-error'

export async function copyZivoContentLink(link: string): Promise<ZivoCopyResult> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(link)
      return 'copied'
    }
  } catch {
    // A restricted clipboard is common in embedded previews; try the legacy browser path next.
  }

  const textArea = document.createElement('textarea')
  textArea.value = link
  textArea.setAttribute('readonly', '')
  textArea.setAttribute('aria-hidden', 'true')
  textArea.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'
  document.body.appendChild(textArea)

  const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
  try {
    textArea.focus()
    textArea.select()
    textArea.setSelectionRange(0, link.length)
    if (typeof document.execCommand === 'function' && document.execCommand('copy')) return 'copied'
  } catch {
    // Some browsers expose execCommand but throw when clipboard access is restricted.
  } finally {
    textArea.remove()
    previouslyFocused?.focus()
  }

  // The caller shows a selectable link when both clipboard methods are blocked.
  return 'manual'
}

export async function shareZivoContent({ title, text, url }: { title: string; text: string; url: string }): Promise<ZivoShareResult> {
  // Web Share is the correct Android Chrome/native-capable path and is intentionally attempted
  // before any WebView-only bridge. Browser preview never reaches the Android bridge below.
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url })
      return 'web'
    } catch (error) {
      if (isCancelledShare(error)) return 'cancelled'
      const copied = await copyZivoContentLink(url)
      return copied === 'copied' ? 'copied-after-error' : 'manual-copy-after-error'
    }
  }

  // Only a real Android WebView bridge can use ACTION_SEND. It is never used as a browser fallback.
  try {
    if (openAndroidShareSheet(text, title)) return 'android-native'
  } catch {
    const copied = await copyZivoContentLink(url)
    return copied === 'copied' ? 'copied-after-error' : 'manual-copy-after-error'
  }

  const copied = await copyZivoContentLink(url)
  return copied === 'copied' ? 'copied' : 'manual-copy'
}

export function shareStatusMessage(result: ZivoShareResult) {
  if (result === 'web' || result === 'android-native') return 'Shared'
  if (result === 'cancelled') return 'Share closed.'
  if (result === 'copied-after-error') return 'Share was unavailable. Link copied so you can paste it anywhere.'
  if (result === 'manual-copy-after-error') return 'Share was unavailable. Select and copy the link below.'
  if (result === 'manual-copy') return 'Select and copy the public link below.'
  return 'Link copied. You can paste it anywhere to share this ZIVO content.'
}
