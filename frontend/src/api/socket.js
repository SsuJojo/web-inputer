export function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}/ws`
}

export function safeJsonParse(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}
