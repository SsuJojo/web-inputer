import { reactive } from 'vue'

const STORAGE_KEY = 'remoteInputSettings'

export function createDefaultSettings(stored = {}) {
  return {
    keyBubble: stored.keyBubble ?? true,
    vibrate: stored.vibrate ?? true,
    wheelSensitivity: stored.wheelSensitivity ?? 24,
    touchSensitivity: stored.touchSensitivity ?? 1.6,
    directHost: stored.directHost ?? '',
    directPort: stored.directPort ?? '8790',
    directConfirmedAt: stored.directConfirmedAt ?? 0,
    directSuspectUntil: stored.directSuspectUntil ?? 0,
    textInput: stored.textInput ?? '',
    textSelectionStart: stored.textSelectionStart ?? 0,
    textSelectionEnd: stored.textSelectionEnd ?? 0,
    screenFrameZoom: stored.screenFrameZoom ?? null,
    screenFrameScrollLeft: stored.screenFrameScrollLeft ?? 0,
    screenFrameScrollTop: stored.screenFrameScrollTop ?? 0,
  }
}

function loadStoredSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return {}
  }
}

export function loadSettings() {
  const settings = reactive(createDefaultSettings(loadStoredSettings()))
  hydrateDirectSettingsFromLocation(settings)
  return settings
}

export function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...settings }))
}

export function hydrateDirectSettingsFromLocation(settings) {
  const publicOrigin = String(window.PUBLIC_ORIGIN || '').replace(/\/+$/, '')
  const match = /^https?:\/\/([^/:?#]+)/i.exec(publicOrigin)
  const publicHostname = match ? match[1] : ''
  const isPublicHost = publicHostname && location.hostname === publicHostname
  const isLocalHost = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  if (location.protocol !== 'http:' || isPublicHost || isLocalHost) return
  if (!settings.directHost) settings.directHost = location.hostname
  if (!settings.directPort) settings.directPort = location.port || '8790'
  saveSettings(settings)
}
