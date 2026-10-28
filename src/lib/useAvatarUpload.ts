import { useCallback, useEffect, useState } from 'react'
import { removeAvatar, uploadAvatar } from './api'
import { AVATAR_EDGE, resizeImage, validateImageFile } from './image'
import { friendlyDataError } from './dataErrors'

interface Options {
  userId: string
  currentPath: string | null
  /** Persists the new path (e.g. profile save). Rejects on failure. */
  onUploaded: (path: string) => Promise<unknown>
}

/** Validate, square-crop and resize a picked photo, upload it, then save its path. Shows a local preview meanwhile. */
export function useAvatarUpload({ userId, currentPath, onUploaded }: Options) {
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])

  const pick = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return false
      const problem = validateImageFile(file)
      if (problem) {
        setError(problem)
        return false
      }
      setError(null)
      setBusy(true)
      try {
        const blob = await resizeImage(file, { maxEdge: AVATAR_EDGE, square: true, quality: 0.9 })
        setPreview(URL.createObjectURL(blob))
        const path = await uploadAvatar(userId, blob)
        await onUploaded(path)
        if (currentPath && currentPath !== path) void removeAvatar(currentPath)
        return true
      } catch (e) {
        setPreview(null)
        setError(e instanceof Error ? e.message : friendlyDataError(e, 'upload'))
        return false
      } finally {
        setBusy(false)
      }
    },
    [userId, currentPath, onUploaded],
  )

  return { preview, busy, error, pick, clearError: () => setError(null) }
}
