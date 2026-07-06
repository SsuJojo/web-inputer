import { ref } from 'vue'
import { getJson, postJson } from '@/api/http'
import { saveSettings } from './useSettings'

export function useSession(settings, logSwitch = () => {}) {
  const authenticated = ref(false)
  const checking = ref(false)
  const loginError = ref('')
  let directFallbackTimer = 0

  const publicOrigin = String(window.PUBLIC_ORIGIN || '').replace(/\/+$/, '')
  const publicOriginConfigured = /^https?:\/\//i.test(publicOrigin)
  const publicHostname = (() => {
    const match = /^https?:\/\/([^/:?#]+)/i.exec(publicOrigin)
    return match ? match[1] : ''
  })()

  function directUrl() {
    if (!settings.directHost) return ''
    const port = settings.directPort || '8790'
    const params = new URLSearchParams(location.search)
    params.delete('direct')
    params.delete('directRetryAt')
    const query = params.toString()
    return `http://${settings.directHost}:${port}/${query ? `?${query}` : ''}${location.hash}`
  }

  function publicUrl() {
    if (!publicOriginConfigured) return ''
    const params = new URLSearchParams(location.search)
    params.set('direct', 'off')
    params.set('directRetryAt', String(Date.now() + 5000))
    const query = params.toString()
    return `${publicOrigin}/${query ? `?${query}` : ''}${location.hash}`
  }

  function directRetryDelay() {
    const params = new URLSearchParams(location.search)
    if (params.get('direct') !== 'off') return 0
    const retryAt = Number(params.get('directRetryAt') || 0)
    if (!Number.isFinite(retryAt)) return 0
    return Math.max(0, retryAt - Date.now())
  }

  function isSavedDirectHost() {
    return Boolean(settings.directHost && location.hostname === settings.directHost)
  }

  function hasRecentDirectConfirmation() {
    return Boolean(settings.directConfirmedAt && Date.now() - settings.directConfirmedAt < 120000)
  }

  function isDirectSuspect() {
    return Boolean(settings.directSuspectUntil && Date.now() < settings.directSuspectUntil)
  }

  function markDirectConfirmed() {
    if (!isSavedDirectHost()) return
    settings.directConfirmedAt = Date.now()
    settings.directSuspectUntil = 0
    saveSettings(settings)
    logSwitch('direct-client-confirmed')
  }

  function markDirectSuspect(reason) {
    if (!isSavedDirectHost()) return
    settings.directSuspectUntil = Date.now() + 30000
    saveSettings(settings)
    logSwitch('direct-suspect', { reason, until: settings.directSuspectUntil })
  }

  async function probeSavedDirect() {
    if (!settings.directHost) return false
    const port = settings.directPort || '8790'
    const params = new URLSearchParams({ host: settings.directHost, port })
    try {
      const result = await getJson(`/api/direct-probe?${params}`)
      return result.ok === true
    } catch {
      return false
    }
  }

  async function switchToSavedDirect() {
    const delay = directRetryDelay()
    if (delay > 0) {
      logSwitch('direct-retry-wait', { delay })
      clearTimeout(directFallbackTimer)
      directFallbackTimer = window.setTimeout(() => { switchToSavedDirect() }, delay)
      return false
    }
    const url = directUrl()
    if (!url || isSavedDirectHost() || location.protocol !== 'https:') return false
    if (!hasRecentDirectConfirmation()) {
      logSwitch('direct-skip-unconfirmed')
      return false
    }
    if (isDirectSuspect()) {
      logSwitch('direct-skip-suspect', { until: settings.directSuspectUntil })
      directFallbackTimer = window.setTimeout(() => { switchToSavedDirect() }, Math.max(1000, settings.directSuspectUntil - Date.now()))
      return false
    }
    if (!await probeSavedDirect()) {
      logSwitch('direct-probe-failed', { retryIn: 5000 })
      clearTimeout(directFallbackTimer)
      directFallbackTimer = window.setTimeout(() => { switchToSavedDirect() }, 5000)
      return false
    }
    logSwitch('direct-probe-ok', { url })
    window.location.href = url
    return true
  }

  function switchToPublic() {
    if (!isSavedDirectHost()) return false
    const url = publicUrl()
    if (!url) {
      logSwitch('public-fallback-missing-origin')
      return false
    }
    logSwitch('public-fallback-navigate', { url })
    window.location.href = url
    return true
  }

  function scheduleDirectFallback(reason = 'unknown') {
    if (!isSavedDirectHost()) return
    logSwitch('public-fallback-scheduled', { reason, delay: 5000 })
    clearTimeout(directFallbackTimer)
    directFallbackTimer = window.setTimeout(() => {
      logSwitch('public-fallback-fired', { reason, visibility: document.visibilityState || '', online: navigator.onLine ?? null })
      switchToPublic()
    }, 5000)
  }

  function clearDirectFallback() {
    clearTimeout(directFallbackTimer)
    directFallbackTimer = 0
  }

  async function checkSession() {
    checking.value = true
    try {
      await getJson('/api/session')
      authenticated.value = true
      return true
    } catch {
      authenticated.value = false
      return false
    } finally {
      checking.value = false
    }
  }

  async function login(password, keepSignedIn) {
    loginError.value = ''
    try {
      await postJson('/api/login', { password, keepSignedIn })
      authenticated.value = true
      return true
    } catch (error) {
      loginError.value = String(error.message || '').includes('429') || String(error.message || '').includes('Too many') ? '尝试过多，请稍后再试' : '密码错误'
      authenticated.value = false
      return false
    }
  }

  async function logout() {
    await postJson('/api/logout').catch(() => {})
    authenticated.value = false
  }

  return {
    authenticated,
    checking,
    loginError,
    publicHostname,
    checkSession,
    login,
    logout,
    directUrl,
    publicUrl,
    probeSavedDirect,
    switchToSavedDirect,
    switchToPublic,
    scheduleDirectFallback,
    clearDirectFallback,
    markDirectConfirmed,
    markDirectSuspect,
  }
}
