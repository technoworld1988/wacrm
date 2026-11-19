'use client'

/**
 * Browser-side helpers for Web Push: service worker registration,
 * subscribing this device and telling the server about it.
 */

/** localStorage flag: this device has an active push subscription. */
export const PUSH_DEVICE_FLAG = 'wacrm:push-device'

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** iPhone/iPad: push only works once the app is added to the home screen. */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function readPushDeviceFlag(): boolean {
  try {
    return localStorage.getItem(PUSH_DEVICE_FLAG) === '1'
  } catch {
    return false
  }
}

function writePushDeviceFlag(on: boolean) {
  try {
    if (on) localStorage.setItem(PUSH_DEVICE_FLAG, '1')
    else localStorage.removeItem(PUSH_DEVICE_FLAG)
  } catch {
    /* storage unavailable — the flag is only an optimisation */
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
  } catch (err) {
    console.error('[push] service worker registration failed:', err)
    return null
  }
}

/**
 * Show a notification from the page. Android Chrome throws on
 * `new Notification()` and only allows notifications through a service
 * worker, so prefer the registration and fall back to the constructor
 * (desktop browsers without a worker). Returns false when neither works.
 */
export async function showLocalNotification(
  title: string,
  options: { body?: string; tag?: string; url?: string },
): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  if ('serviceWorker' in navigator) {
    try {
      const reg = (await navigator.serviceWorker.getRegistration('/')) ?? (await registerServiceWorker())
      if (reg) {
        await reg.showNotification(title, {
          body: options.body,
          tag: options.tag,
          icon: '/icons/icon-192.png',
          badge: '/icons/badge-96.png',
          data: { url: options.url ?? '/inbox' },
        })
        return true
      }
    } catch (err) {
      console.error('[notify] service worker notification failed:', err)
    }
  }
  try {
    const n = new Notification(title, { body: options.body, tag: options.tag, icon: '/icon' })
    if (options.url) {
      const url = options.url
      n.onclick = () => {
        window.focus()
        window.location.assign(url)
        n.close()
      }
    }
    return true
  } catch {
    return false
  }
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration('/')
  return (await reg?.pushManager.getSubscription()) ?? null
}

export type EnablePushResult = 'enabled' | 'denied' | 'unsupported' | 'not-configured' | 'error'

export async function enablePushOnThisDevice(): Promise<EnablePushResult> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!publicKey) return 'not-configured'
  if (!isPushSupported()) return 'unsupported'

  const permission =
    Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'

  const reg = await registerServiceWorker()
  if (!reg) return 'error'
  await navigator.serviceWorker.ready

  try {
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
    }
    const res = await fetch('/api/push/subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub.toJSON()),
    })
    if (!res.ok) return res.status === 503 ? 'not-configured' : 'error'
    writePushDeviceFlag(true)
    return 'enabled'
  } catch (err) {
    console.error('[push] subscribe failed:', err)
    return 'error'
  }
}

export async function disablePushOnThisDevice(): Promise<void> {
  const sub = await getCurrentSubscription()
  writePushDeviceFlag(false)
  if (!sub) return
  try {
    await fetch('/api/push/subscription', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    })
  } finally {
    await sub.unsubscribe().catch(() => undefined)
  }
}

export async function sendTestPush(title: string, body: string): Promise<number> {
  const res = await fetch('/api/push/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body }),
  })
  if (!res.ok) return -1
  const data = (await res.json().catch(() => ({}))) as { delivered?: number }
  return data.delivered ?? 0
}
