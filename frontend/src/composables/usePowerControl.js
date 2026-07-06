import { computed, reactive, ref } from 'vue'
import { getJson, postJson } from '@/api/http'

const ACTION_LABELS = {
  shutdown: '关机',
  restart: '重启',
  sleep: '睡眠',
  hibernate: '休眠',
  lock: '锁屏',
  cancel: '取消计划',
}

export function usePowerControl(message) {
  const expanded = ref(false)
  const loading = ref(false)
  const status = ref(null)
  const modalOpen = ref(false)
  const selectedAction = ref('shutdown')
  const schedule = reactive({ mode: 'now', minutes: 10, time: '23:30' })

  const actionLabel = computed(() => ACTION_LABELS[selectedAction.value] || selectedAction.value)

  async function refreshPowerStatus() {
    loading.value = true
    try {
      status.value = await getJson('/api/power/status')
    } catch (error) {
      status.value = { available: false, message: '当前后端未提供电源控制接口' }
    } finally {
      loading.value = false
    }
  }

  async function postPower(path, body = null) {
    return postJson(`/api/power/${path}`, body)
  }

  function openPowerModal(action) {
    selectedAction.value = action
    schedule.mode = 'now'
    modalOpen.value = true
  }

  function closePowerModal() {
    modalOpen.value = false
  }

  function secondsUntilTime(value) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''))
    if (!match) return null
    const hours = Number(match[1])
    const minutes = Number(match[2])
    if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
    const now = new Date()
    const target = new Date(now)
    target.setHours(hours, minutes, 0, 0)
    if (target <= now) target.setDate(target.getDate() + 1)
    const delaySeconds = Math.round((target.getTime() - now.getTime()) / 1000)
    return delaySeconds > 0 ? delaySeconds : null
  }

  async function confirmPowerAction() {
    loading.value = true
    try {
      const body = { action: selectedAction.value, confirm: true }
      if (schedule.mode === 'countdown') body.delaySeconds = Math.max(0, Number(schedule.minutes || 0) * 60)
      if (schedule.mode === 'time') {
        const delaySeconds = secondsUntilTime(schedule.time)
        if (!delaySeconds) {
          message?.error?.('请选择有效的执行时间')
          return null
        }
        body.delaySeconds = delaySeconds
      }
      const result = await postPower(selectedAction.value, body)
      message?.success?.(`${actionLabel.value}指令已发送`)
      modalOpen.value = false
      await refreshPowerStatus()
      return result
    } catch (error) {
      message?.error?.(error.message || '电源操作失败')
      throw error
    } finally {
      loading.value = false
    }
  }

  async function cancelPowerSchedule() {
    loading.value = true
    try {
      await postPower('cancel')
      message?.success?.('已取消计划')
      await refreshPowerStatus()
    } catch (error) {
      message?.error?.(error.message || '取消失败')
    } finally {
      loading.value = false
    }
  }

  function formatPowerRemaining(seconds) {
    const value = Number(seconds)
    if (!Number.isFinite(value) || value <= 0) return '即将执行'
    const minutes = Math.floor(value / 60)
    const rest = Math.floor(value % 60)
    if (minutes <= 0) return `${rest} 秒后`
    return `${minutes} 分 ${rest} 秒后`
  }

  return { expanded, loading, status, modalOpen, selectedAction, schedule, actionLabel, refreshPowerStatus, postPower, openPowerModal, closePowerModal, confirmPowerAction, cancelPowerSchedule, formatPowerRemaining }
}
