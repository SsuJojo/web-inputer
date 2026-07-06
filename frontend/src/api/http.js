export async function getJson(path) {
  const response = await fetch(path, { credentials: 'include' })
  if (!response.ok) throw new Error(await errorMessage(response))
  return response.json()
}

export async function postJson(path, body = null) {
  const options = { method: 'POST', credentials: 'include' }
  if (body !== null) {
    options.headers = { 'Content-Type': 'application/json' }
    options.body = JSON.stringify(body)
  }
  const response = await fetch(path, options)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.detail || `请求失败：${response.status}`)
  return data
}

async function errorMessage(response) {
  const data = await response.json().catch(() => ({}))
  return data.detail || `请求失败：${response.status}`
}
