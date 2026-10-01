import { ArrowLeft, ImagePlus, Mic, MoreHorizontal, Search, Send, Video } from 'lucide-react'
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { ZivoEmptyState, ZivoErrorState, ZivoLoadingState } from '../components/ZivoState'
import usePageMeta from '../hooks/usePageMeta'
import { conversationIdFor, messagePrefix, readPrivateMessage, savePrivateMessage, type ZivoPrivateMessage } from '../lib/messages'
import { canInteractBetween, loadSafetyRelationships } from '../lib/safety'
import { cn } from '../lib/utils'

type StoredProfile = {
  username: string
  displayName: string
  email: string
  bio?: string
}

type ChatContact = {
  id: string
  name: string
  handle: string
  avatar: string
}

type Conversation = ChatContact & {
  preview: string
  time: string
  lastMessageAt: number | null
}

function readStoredProfile(value: unknown): StoredProfile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const profile = value as Record<string, unknown>
  if (typeof profile.username !== 'string' || typeof profile.displayName !== 'string' || typeof profile.email !== 'string') return null

  return {
    username: profile.username,
    displayName: profile.displayName,
    email: profile.email,
    bio: typeof profile.bio === 'string' ? profile.bio : undefined,
  }
}

function contactFromUser(user: GenMBUser): ChatContact {
  const emailName = user.email.split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '') || 'zivo.member'
  return {
    id: user.id,
    name: user.name.trim() || emailName,
    handle: `@${emailName}`,
    avatar: user.picture || `https://picsum.photos/seed/zivo-member-${encodeURIComponent(user.id)}/160/160`,
  }
}

function fallbackContact(id: string): ChatContact {
  return {
    id,
    name: 'ZIVO member',
    handle: '@zivo.member',
    avatar: `https://picsum.photos/seed/zivo-member-${encodeURIComponent(id)}/160/160`,
  }
}

function formatMessageTime(timestamp: number) {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)
}

function formatConversationTime(timestamp: number | null) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  return isToday
    ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)
    : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
}

function formatMessageDay(timestamp?: number) {
  if (!timestamp) return 'New conversation'
  const date = new Date(timestamp)
  return date.toDateString() === new Date().toDateString()
    ? 'Today'
    : new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric' }).format(date)
}

export default function MessagesPage() {
  const { user, loading: isAuthLoading, error: authError } = useAuth()
  const [contacts, setContacts] = useState<ChatContact[]>([])
  const [messages, setMessages] = useState<ZivoPrivateMessage[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const navigate = useNavigate()

  usePageMeta('Messages on ZIVO', 'Send and receive private creator messages on ZIVO.')

  const loadInbox = useCallback(async () => {
    if (!user) return

    setIsLoading(true)
    setError('')
    try {
      const [profileResult, messageResult, relationships] = await Promise.all([
        window.genmb.kv.list('zivo:profile:'),
        window.genmb.kv.list(messagePrefix(user.id)),
        loadSafetyRelationships(user.id),
      ])
      const hiddenUserIds = new Set([...relationships.blockedUserIds, ...relationships.mutedUserIds])
      const profileContacts = profileResult.data.reduce<ChatContact[]>((result, item) => {
        const profile = readStoredProfile(item.value)
        const profileId = item.key.slice('zivo:profile:'.length)
        if (!profile || !profileId || profileId === user.id || hiddenUserIds.has(profileId)) return result
        result.push({
          id: profileId,
          name: profile.displayName.trim() || profile.username.replace(/^@/, '') || 'ZIVO member',
          handle: profile.username.startsWith('@') ? profile.username : `@${profile.username}`,
          avatar: `https://picsum.photos/seed/zivo-member-${encodeURIComponent(profileId)}/160/160`,
        })
        return result
      }, [])

      const storedMessages = messageResult.data
        .map((item) => readPrivateMessage(item.value))
        .filter((message): message is ZivoPrivateMessage => Boolean(message && (message.senderId === user.id || message.receiverId === user.id)))
        .sort((first, second) => first.createdAt - second.createdAt)

      const contactsById = new Map(profileContacts.map((contact) => [contact.id, contact]))
      storedMessages.forEach((message) => {
        const participantId = message.senderId === user.id ? message.receiverId : message.senderId
        if (!hiddenUserIds.has(participantId) && !contactsById.has(participantId)) contactsById.set(participantId, fallbackContact(participantId))
      })

      setContacts(Array.from(contactsById.values()))
      setMessages(storedMessages)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load your messages.')
    } finally {
      setIsLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (isAuthLoading) return
    if (!user) {
      setContacts([])
      setMessages([])
      setActiveConversationId(null)
      setIsLoading(false)
      return
    }
    void loadInbox()
  }, [isAuthLoading, loadInbox, user])

  useEffect(() => {
    if (!user) return
    const refreshInbox = () => void loadInbox()
    window.addEventListener('focus', refreshInbox)
    // The event contains no message body: persisted data is reloaded from storage.
    const unsubscribe = window.genmb.realtime.subscribe(`zivo:inbox:${user.id}`, refreshInbox)
    return () => {
      window.removeEventListener('focus', refreshInbox)
      unsubscribe()
    }
  }, [loadInbox, user]) 

  const returnToPreviousScreen = () => {
    if (window.history.length > 1) {
      navigate(-1)
      return
    }
    navigate('/')
  }

  const conversations = useMemo<Conversation[]>(() => {
    if (!user) return []
    return contacts.map((contact) => {
      const conversationMessages = messages.filter((message) => (
        (message.senderId === user.id && message.receiverId === contact.id)
        || (message.receiverId === user.id && message.senderId === contact.id)
      ))
      const lastMessage = conversationMessages[conversationMessages.length - 1]
      return {
        ...contact,
        preview: lastMessage ? lastMessage.text : 'Start a private conversation',
        time: formatConversationTime(lastMessage?.createdAt ?? null),
        lastMessageAt: lastMessage?.createdAt ?? null,
      }
    }).sort((first, second) => (second.lastMessageAt ?? 0) - (first.lastMessageAt ?? 0) || first.name.localeCompare(second.name))
  }, [contacts, messages, user])

  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId) ?? null
  const activeMessages = useMemo(() => {
    if (!activeConversation || !user) return []
    return messages.filter((message) => conversationIdFor(message.senderId, message.receiverId) === conversationIdFor(user.id, activeConversation.id))
  }, [activeConversation, messages, user])
  const filteredConversations = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    if (!query) return conversations
    return conversations.filter((conversation) => `${conversation.name} ${conversation.handle}`.toLowerCase().includes(query))
  }, [conversations, searchTerm])

  const openConversation = (id: string) => {
    setActiveConversationId(id)
    setDraft('')
    setStatus('Conversation opened.')
  }

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text || !activeConversation || !user || isSending) return
    try {
      if (!(await canInteractBetween(user.id, activeConversation.id))) {
        setError('This conversation is unavailable because one of you has blocked the other.')
        return
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to check this conversation.')
      return
    }

    const newMessage: ZivoPrivateMessage = {
      id: crypto.randomUUID(),
      senderId: user.id,
      receiverId: activeConversation.id,
      text,
      createdAt: Date.now(),
    }
    const previousMessages = messages
    setMessages((current) => [...current, newMessage])
    setDraft('')
    setIsSending(true)
    setError('')

    try {
      await savePrivateMessage(newMessage)
      setStatus('Message sent.')
      try {
        await window.genmb.realtime.publish(`zivo:inbox:${newMessage.receiverId}`, { changed: true })
      } catch (publishError) {
        setError(`Message saved, but live delivery failed: ${publishError instanceof Error ? publishError.message : String(publishError)}. The recipient can refresh their inbox.`)
      }
    } catch (caughtError) {
      setMessages(previousMessages)
      setDraft(text)
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to send your message.')
    } finally {
      setIsSending(false)
    }
  }

  if (isAuthLoading) {
    return (
      <section className="zivo-screen -mx-5 -mt-6 px-5 pt-6" aria-label="Loading messages">
        <ZivoLoadingState label="Checking your private inbox…" />
      </section>
    )
  }

  if (!user) {
    return (
      <section className="zivo-screen -mx-5 -mt-6 px-5 pt-6" aria-labelledby="messages-heading">
        <div className="mx-auto max-w-md">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={returnToPreviousScreen}
              className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-card-foreground shadow-premium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
              aria-label="Back to previous screen"
            >
              <ArrowLeft size={19} aria-hidden="true" />
            </button>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-primary">Your inbox</p>
              <h1 id="messages-heading" className="mt-1 text-3xl font-extrabold tracking-[-0.055em] text-foreground">Messages</h1>
            </div>
          </div>
          <ZivoEmptyState
            className="mt-6"
            title="Sign in to view messages"
            description={authError || 'Private conversations are available only to the signed-in ZIVO account.'}
            action={{ label: 'Sign in', onClick: () => navigate('/sign-in') }}
          />
        </div>
      </section>
    )
  }

  if (activeConversation) {
    return (
      <section className="zivo-screen -mx-5 -mt-6 flex min-h-[calc(100dvh-11.25rem)] flex-col" aria-labelledby="conversation-heading">
        <div className="border-b border-border/70 px-5 pb-3 pt-4">
          <div className="mx-auto flex max-w-md items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setActiveConversationId(null)
                setStatus('Back to messages.')
              }}
              className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-card-foreground shadow-premium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
              aria-label="Back to messages"
            >
              <ArrowLeft size={19} aria-hidden="true" />
            </button>
            <img
              data-genmb-img={`${activeConversation.name} chat avatar`}
              src={activeConversation.avatar}
              alt={`${activeConversation.name} profile placeholder`}
              className="size-11 shrink-0 rounded-full border border-border object-cover"
              onError={(event) => { event.currentTarget.src = `https://picsum.photos/seed/zivo-chat-${encodeURIComponent(activeConversation.id)}-fallback/160/160` }}
            />
            <div className="min-w-0 flex-1">
              <h1 id="conversation-heading" className="truncate text-sm font-extrabold text-foreground">{activeConversation.name}</h1>
              <p className="truncate text-xs font-semibold text-muted-foreground">{activeConversation.handle}</p>
            </div>
            <button
              type="button"
              disabled
              aria-label="More message options are unavailable"
              title="More message options are not available yet"
              className="flex size-10 cursor-not-allowed items-center justify-center rounded-xl text-muted-foreground opacity-60"
            >
              <MoreHorizontal size={20} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-5">
          {error && <ZivoErrorState className="mb-4 text-left" title="Message not sent" description={error} action={{ label: 'Try again', onClick: () => setError('') }} />}
          <p className="mb-5 text-center text-xs font-semibold text-muted-foreground">{formatMessageDay(activeMessages[0]?.createdAt)}</p>
          {isLoading ? (
            <ZivoLoadingState label="Loading this conversation…" />
          ) : activeMessages.length > 0 ? (
            <div className="space-y-3" aria-label={`Messages with ${activeConversation.name}`}>
              {activeMessages.map((message) => {
                const fromMe = message.senderId === user.id
                return (
                  <div key={message.id} className={cn('flex', fromMe ? 'justify-end' : 'justify-start')}>
                    <div className={cn('max-w-[82%]', fromMe ? 'items-end' : 'items-start')}>
                      <p className={cn(
                        'rounded-2xl px-3.5 py-2.5 text-sm font-medium leading-5',
                        fromMe ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md border border-border bg-card text-card-foreground',
                      )}>
                        {message.text}
                      </p>
                      <p className={cn('mt-1 px-1 text-xs font-medium text-muted-foreground', fromMe && 'text-right')}>
                        {formatMessageTime(message.createdAt)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <ZivoEmptyState
              title={`Message ${activeConversation.name}`}
              description="Start the conversation with a private note."
            />
          )}
        </div>

        <form onSubmit={(event) => void sendMessage(event)} className="border-t border-border/70 bg-background/90 px-5 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-xl">
          <div className="mx-auto flex max-w-md items-end gap-2">
            <button
              type="button"
              disabled
              aria-label="Image attachments are unavailable"
              title="Image attachments are not available yet"
              className="flex size-11 shrink-0 cursor-not-allowed items-center justify-center rounded-xl border border-border bg-card text-muted-foreground opacity-70"
            >
              <ImagePlus size={19} aria-hidden="true" />
            </button>
            <label htmlFor="message-draft" className="sr-only">Message {activeConversation.name}</label>
            <textarea
              id="message-draft"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={1}
              disabled={isSending}
              placeholder="Message..."
              className="min-h-11 max-h-28 flex-1 resize-none rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm font-medium text-card-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            />
            {draft.trim() ? (
              <button
                type="submit"
                disabled={isSending}
                className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-premium transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                aria-label={isSending ? 'Sending message' : 'Send message'}
              >
                <Send size={18} aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                disabled
                aria-label="Voice messages are unavailable"
                title="Voice messages are not available yet"
                className="flex size-11 shrink-0 cursor-not-allowed items-center justify-center rounded-xl border border-border bg-card text-muted-foreground opacity-70"
              >
                <Mic size={19} aria-hidden="true" />
              </button>
            )}
          </div>
        </form>
        <p className="sr-only" aria-live="polite">{status}</p>
      </section>
    )
  }

  return (
    <section className="zivo-screen -mx-5 -mt-6 pb-2" aria-labelledby="messages-heading">
      <div className="mx-auto max-w-md px-5 pt-6">
        <div className="flex items-end justify-between gap-4">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={returnToPreviousScreen}
              className="mt-1 flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-card-foreground shadow-premium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
              aria-label="Back to previous screen"
            >
              <ArrowLeft size={19} aria-hidden="true" />
            </button>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-primary">Your inbox</p>
              <h1 id="messages-heading" className="mt-1 text-3xl font-extrabold tracking-[-0.055em] text-foreground">Messages</h1>
            </div>
          </div>
          <span className="mb-1 inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-xs font-extrabold text-card-foreground">
            <Video size={14} className="text-primary" aria-hidden="true" />
            Private
          </span>
        </div>

        <div className="relative mt-5">
          <label htmlFor="conversation-search" className="sr-only">Search messages</label>
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            id="conversation-search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search conversations"
            className="min-h-12 w-full rounded-2xl border border-border bg-card py-3 pl-12 pr-4 text-sm font-semibold text-card-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring"
          />
        </div>

        {error && <ZivoErrorState className="mt-5 text-left" title="Your inbox could not load" description={error} action={{ label: 'Try again', onClick: () => void loadInbox() }} />}

        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-foreground">Recent conversations</h2>
            <span className="text-xs font-semibold text-muted-foreground">Private inbox</span>
          </div>
          {isLoading ? (
            <ZivoLoadingState className="mt-3" label="Loading your conversations…" />
          ) : filteredConversations.length > 0 ? (
            <div className="mt-3 space-y-2" aria-label="Recent conversations">
              {filteredConversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => openConversation(conversation.id)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]"
                  aria-label={`Open conversation with ${conversation.name}`}
                >
                  <img
                    data-genmb-img={`${conversation.name} message avatar`}
                    src={conversation.avatar}
                    alt={`${conversation.name} profile placeholder`}
                    className="size-14 shrink-0 rounded-full border border-border object-cover"
                    onError={(event) => { event.currentTarget.src = `https://picsum.photos/seed/zivo-message-${encodeURIComponent(conversation.id)}-fallback/160/160` }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-extrabold text-card-foreground">{conversation.name}</p>
                    <p className="mt-1 truncate text-xs font-medium leading-5 text-muted-foreground">{conversation.preview}</p>
                  </div>
                  {conversation.time && <span className="self-start text-xs font-semibold text-muted-foreground">{conversation.time}</span>}
                </button>
              ))}
            </div>
          ) : (
            <ZivoEmptyState
              className="mt-3"
              title={searchTerm ? 'No conversations found' : 'No private conversations yet'}
              description={searchTerm ? 'Try a different creator name or handle.' : 'When another ZIVO member has a saved profile, you can start a private conversation here.'}
              action={searchTerm ? { label: 'Clear search', onClick: () => setSearchTerm('') } : undefined}
            />
          )}
        </div>
        <p className="mt-6 text-center text-xs font-semibold text-muted-foreground">Private messages are saved to your ZIVO account.</p>
        <p className="sr-only" aria-live="polite">{status}</p>
      </div>
    </section>
  )
}
