import { useCallback, useEffect, useState } from 'react'
import { Platform } from 'react-native'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

let deferredPrompt: InstallPromptEvent | null = null
let listenersStarted = false
const subscribers = new Set<() => void>()

function isStandalone() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true
}

function wasInstalled() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false
  return isStandalone() || window.localStorage.getItem('decouverte-pwa-installed') === 'true'
}

function notify() {
  subscribers.forEach((subscriber) => subscriber())
}

function startInstallListeners() {
  if (listenersStarted || Platform.OS !== 'web' || typeof window === 'undefined') return
  listenersStarted = true

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    window.localStorage.removeItem('decouverte-pwa-installed')
    deferredPrompt = event as InstallPromptEvent
    notify()
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    window.localStorage.setItem('decouverte-pwa-installed', 'true')
    notify()
  })

  window.matchMedia('(display-mode: standalone)').addEventListener('change', notify)

  if ('serviceWorker' in navigator) {
    const registerServiceWorker = () => {
      void navigator.serviceWorker.register('/service-worker.js')
    }
    if (document.readyState === 'loading') {
      window.addEventListener('load', registerServiceWorker, { once: true })
    } else {
      registerServiceWorker()
    }
  }
}

startInstallListeners()

export function usePwaInstall() {
  const [, refresh] = useState(0)

  useEffect(() => {
    const update = () => refresh((value) => value + 1)
    subscribers.add(update)
    update()
    return () => {
      subscribers.delete(update)
    }
  }, [])

  const install = useCallback(async () => {
    if (!deferredPrompt || wasInstalled()) return false
    const prompt = deferredPrompt
    await prompt.prompt()
    const choice = await prompt.userChoice
    if (choice.outcome === 'accepted') {
      deferredPrompt = null
      window.localStorage.setItem('decouverte-pwa-installed', 'true')
      notify()
      return true
    }
    return false
  }, [])

  return {
    canInstall: Platform.OS === 'web' && !wasInstalled() && deferredPrompt !== null,
    install,
  }
}
