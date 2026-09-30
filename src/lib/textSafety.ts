// React escapes text nodes. These checks additionally keep markup-like input and
// invisible control characters out of persisted public-facing text.
export function validateText(value: string, label: string, maxLength: number, required = false): string {
  const cleaned = value.normalize('NFKC').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '').trim()
  if (required && !cleaned) throw new Error(`${label} is required.`)
  if (cleaned.length > maxLength) throw new Error(`${label} must be ${maxLength} characters or fewer.`)
  if (/[<>]/.test(cleaned)) throw new Error(`${label} cannot contain HTML markup (< or >).`)
  return cleaned
}

export function validateHashtags(tags: string[]): string[] {
  if (tags.length > 30) throw new Error('Use 30 hashtags or fewer.')
  return tags.map(tag => validateText(tag, 'Hashtag', 64)).filter(Boolean)
}
