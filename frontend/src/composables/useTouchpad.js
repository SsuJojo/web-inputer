import { ref } from 'vue'

export function useTouchpad({ sendInput, queueMouseMove, settings, vibrate }) {
  const collapsed = ref(true)
  let pointer = null
  let lastTouchTap = 0
  let touchClickTimer = 0
  let edgeScrollFrame = 0
  let edgeScrollLast = 0
  let wheelPointer = null
  let wheelInertiaTimer = 0
  let buttonDrag = null
  let touchPadRect = null

  function toggleTouchPanel() {
    collapsed.value = !collapsed.value
  }

  function stopWheelInertia() {
    clearTimeout(wheelInertiaTimer)
    wheelInertiaTimer = 0
  }

  function runWheelInertia(dx, dy, speed) {
    stopWheelInertia()
    const interval = Math.max(32, Math.round(115 - speed * 18))
    const repeat = Math.max(1, Math.min(4, Math.round(speed)))
    function tick() {
      if (!wheelPointer) return
      for (let i = 0; i < repeat; i += 1) sendInput({ action: 'mouse_wheel', dx, dy })
      wheelInertiaTimer = window.setTimeout(tick, interval)
    }
    wheelInertiaTimer = window.setTimeout(tick, 180)
  }

  function wheelPointerDown(event) {
    stopWheelInertia()
    wheelPointer = { x: event.clientX, y: event.clientY, moved: false, travel: 0, speed: 1 }
    event.currentTarget.classList.add('wheeling')
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function wheelPointerMove(event) {
    if (!wheelPointer) return
    const dx = event.clientX - wheelPointer.x
    const dy = event.clientY - wheelPointer.y
    const threshold = settings.wheelSensitivity
    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return
    const horizontal = Math.abs(dx) > Math.abs(dy)
    const wheelDx = horizontal ? (dx > 0 ? 1 : -1) : 0
    const wheelDy = horizontal ? 0 : (dy > 0 ? -1 : 1)
    sendInput({ action: 'mouse_wheel', dx: wheelDx, dy: wheelDy })
    vibrate()
    const now = Date.now()
    const travel = wheelPointer.travel + Math.abs(dx) + Math.abs(dy)
    const elapsed = wheelPointer.lastMoveAt ? Math.max(16, now - wheelPointer.lastMoveAt) : 80
    const instantSpeed = Math.min(4, Math.max(1, (Math.abs(dx) + Math.abs(dy)) / elapsed / 0.22))
    const speed = wheelPointer.speed * 0.45 + instantSpeed * 0.55
    wheelPointer = { x: event.clientX, y: event.clientY, moved: true, lastMoveAt: now, travel, speed }
    if (travel >= settings.wheelSensitivity * 3) runWheelInertia(wheelDx, wheelDy, speed)
  }

  function wheelPointerEnd(event, tapAction) {
    const wasTap = wheelPointer && !wheelPointer.moved
    stopWheelInertia()
    wheelPointer = null
    event.currentTarget.classList.remove('wheeling')
    if (wasTap) tapAction()
  }

  function edgeVelocity(distance, axis = 'x') {
    if (!distance) return 0
    const sign = Math.sign(distance)
    const limit = axis === 'y' ? 260 : 180
    const speed = axis === 'y' ? 8 : 18
    const eased = Math.sqrt(Math.min(Math.abs(distance), limit) / limit)
    return sign * Math.round(eased * speed * settings.touchSensitivity)
  }

  function updateEdgeScroll(x, y) {
    if (!pointer || !touchPadRect) return
    const rawEdgeX = x < touchPadRect.left ? x - touchPadRect.left : x > touchPadRect.right ? x - touchPadRect.right : 0
    const rawEdgeY = y < touchPadRect.top ? y - touchPadRect.top : y > touchPadRect.bottom ? y - touchPadRect.bottom : 0
    pointer.edgeX = Math.abs(rawEdgeX) > 18 ? rawEdgeX : 0
    pointer.edgeY = Math.abs(rawEdgeY) > 28 ? rawEdgeY : 0
    if (pointer.edgeX || pointer.edgeY) {
      pointer.edgeSince ||= performance.now()
      startEdgeScroll()
    } else {
      pointer.edgeSince = 0
    }
  }

  function startEdgeScroll() {
    if (edgeScrollFrame) return
    edgeScrollLast = 0
    edgeScrollFrame = window.requestAnimationFrame(runEdgeScroll)
  }

  function stopEdgeScroll() {
    if (edgeScrollFrame) window.cancelAnimationFrame(edgeScrollFrame)
    edgeScrollFrame = 0
    edgeScrollLast = 0
  }

  function runEdgeScroll(time) {
    if (!pointer || (!pointer.edgeX && !pointer.edgeY)) {
      stopEdgeScroll()
      return
    }
    const armed = pointer.edgeSince && time - pointer.edgeSince > 180
    const elapsed = edgeScrollLast ? time - edgeScrollLast : 16
    edgeScrollLast = time
    if (armed) {
      const dx = Math.round(edgeVelocity(pointer.edgeX, 'x') * elapsed / 16)
      const dy = Math.round(edgeVelocity(pointer.edgeY, 'y') * elapsed / 16)
      if (dx || dy) {
        pointer.moved = true
        queueMouseMove(dx, dy)
      }
    }
    edgeScrollFrame = window.requestAnimationFrame(runEdgeScroll)
  }

  function touchPointerDown(event) {
    const dragMode = Date.now() - lastTouchTap < 450
    stopEdgeScroll()
    touchPadRect = event.currentTarget.getBoundingClientRect()
    pointer = { x: event.clientX, y: event.clientY, moved: false, dragging: dragMode, edgeX: 0, edgeY: 0, edgeSince: 0 }
    if (dragMode) {
      clearTimeout(touchClickTimer)
      lastTouchTap = 0
      vibrate()
      sendInput({ action: 'mouse_down', button: 'left' })
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function touchPointerMove(event) {
    if (!pointer) return
    const dx = Math.round((event.clientX - pointer.x) * settings.touchSensitivity)
    const dy = Math.round((event.clientY - pointer.y) * settings.touchSensitivity)
    if (Math.abs(dx) + Math.abs(dy) < 2) return
    pointer.moved = true
    pointer.x = event.clientX
    pointer.y = event.clientY
    updateEdgeScroll(event.clientX, event.clientY)
    queueMouseMove(dx, dy)
  }

  function touchPointerEnd(event) {
    stopEdgeScroll()
    if (!pointer) return
    if (pointer.dragging) sendInput({ action: 'mouse_up', button: 'left' })
    else if (!pointer.moved) {
      lastTouchTap = Date.now()
      clearTimeout(touchClickTimer)
      touchClickTimer = window.setTimeout(() => {
        if (Date.now() - lastTouchTap >= 220) {
          lastTouchTap = 0
          sendInput({ action: 'mouse_click', button: 'left' })
        }
      }, 220)
    }
    pointer = null
    if (event?.type !== 'pointerup') {
      clearTimeout(touchClickTimer)
      lastTouchTap = 0
    }
  }

  function mouseButtonDown(event, button) {
    event.preventDefault()
    buttonDrag = { button, x: event.clientX, y: event.clientY }
    sendInput({ action: 'mouse_down', button })
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function mouseButtonMove(event) {
    if (!buttonDrag) return
    const dx = Math.round((event.clientX - buttonDrag.x) * 2)
    const dy = Math.round((event.clientY - buttonDrag.y) * 2)
    if (Math.abs(dx) + Math.abs(dy) < 2) return
    buttonDrag.x = event.clientX
    buttonDrag.y = event.clientY
    queueMouseMove(dx, dy)
  }

  function mouseButtonEnd() {
    if (!buttonDrag) return
    sendInput({ action: 'mouse_up', button: buttonDrag.button })
    buttonDrag = null
  }

  return { collapsed, toggleTouchPanel, wheelPointerDown, wheelPointerMove, wheelPointerEnd, touchPointerDown, touchPointerMove, touchPointerEnd, mouseButtonDown, mouseButtonMove, mouseButtonEnd }
}
