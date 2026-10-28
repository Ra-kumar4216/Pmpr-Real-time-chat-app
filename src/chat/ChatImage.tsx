import { createElement, useEffect, useState } from 'react'
import { clearSignedUrlCache, getSignedImageUrl } from '../lib/api'
import { Modal } from '../components/Modal'

function useSignedUrl(path: string) {
  const [state, setState] = useState<{ url: string | null; error: boolean }>({ url: null, error: false })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    setState({ url: null, error: false })
    getSignedImageUrl(path)
      .then((url) => live && setState({ url, error: false }))
      .catch(() => live && setState({ url: null, error: true }))
    return () => {
      live = false
    }
  }, [path, attempt])

  const retry = () => {
    clearSignedUrlCache()
    setAttempt((a) => a + 1)
  }
  return { ...state, retry }
}

/** A photo from the private chat bucket, loaded through a short-lived signed URL. */
export function ChatImage({ path, onOpen }: { path: string; onOpen: (url: string) => void }) {
  const { url, error, retry } = useSignedUrl(path)
  const [broken, setBroken] = useState(false)

  if (error || broken) {
    return createElement(
      'button',
      {
        type: 'button',
        onClick: () => {
          setBroken(false)
          retry()
        },
        className: 'flex h-24 w-48 flex-col items-center justify-center gap-1 rounded-xl bg-slate-100 text-xs text-slate-500 hover:bg-slate-200',
      },
      createElement(
        'svg',
        { 'aria-hidden': true, className: 'size-5', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
        createElement('path', { d: 'M10.5 10.5 21 21' }),
        createElement('path', { d: 'M8.5 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3.5' }),
        createElement('path', { d: 'M3 3l18 18' }),
        createElement('path', { d: 'M8.5 10.5a2 2 0 1 0 2.8 2.8' }),
      ),
      'Photo unavailable. Tap to retry',
    )
  }
  if (!url) return createElement('div', { role: 'img', 'aria-label': 'Loading photo', className: 'h-40 w-52 animate-pulse rounded-xl bg-slate-200/70' })

  return createElement(
    'button',
    { type: 'button', onClick: () => onOpen(url), 'aria-label': 'Open photo', className: 'block rounded-xl focus-visible:outline-2 focus-visible:outline-fuchsia-500' },
    createElement('img', {
      src: url,
      alt: 'Photo shared in this chat',
      loading: 'lazy',
      onError: () => setBroken(true),
      className: 'max-h-72 max-w-full rounded-xl object-cover',
    }),
  )
}

export function Lightbox({ url, onClose }: { url: string | null; onClose: () => void }) {
  return createElement(
    Modal,
    {
      open: url !== null,
      onClose,
      title: 'Photo',
      hideTitle: true,
      size: 'lg',
      children: [
        createElement(
          'button',
          {
            type: 'button',
            onClick: onClose,
            'aria-label': 'Close photo',
            className: 'absolute top-3 right-3 z-10 grid size-9 place-items-center rounded-full bg-slate-900/70 text-white hover:bg-slate-900',
          },
          createElement(
            'svg',
            { 'aria-hidden': true, className: 'size-5', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
            createElement('path', { d: 'M18 6 6 18' }),
            createElement('path', { d: 'm6 6 12 12' }),
          ),
        ),
        url && createElement('img', { src: url, alt: 'Full size photo', className: 'mx-auto max-h-[75dvh] max-w-full rounded-xl object-contain' }),
      ],
    },
  )
}
