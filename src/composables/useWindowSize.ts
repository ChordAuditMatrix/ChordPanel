import { ref, computed, onMounted, onBeforeUnmount, readonly, type ComputedRef, type DeepReadonly, type Ref } from 'vue'

// Global singleton: all components share the same window size
const winW = ref(typeof window !== 'undefined' ? window.innerWidth : 1280)
const winH = ref(typeof window !== 'undefined' ? window.innerHeight : 800)
let listeners = 0
let resizeHandler: (() => void) | null = null

function ensureListener() {
  if (resizeHandler) return
  resizeHandler = () => {
    winW.value = window.innerWidth
    winH.value = window.innerHeight
  }
  window.addEventListener('resize', resizeHandler)
}

/**
 * Global window size (reactive, singleton shared).
 * Used for adaptive width of drawer/modal overlays.
 */
export function useWindowSize() {
  onMounted(() => {
    listeners++
    ensureListener()
  })
  onBeforeUnmount(() => {
    listeners--
    if (listeners <= 0 && resizeHandler) {
      window.removeEventListener('resize', resizeHandler)
      resizeHandler = null
      listeners = 0
    }
  })
  return { winW: readonly(winW), winH: readonly(winH) }
}

/**
 * Compute adaptive width for overlays (drawer/modal) as ComputedRef<number>:
 * - Target ideal width idealPx
 * - Not larger than maxPx (defaults to idealPx)
 * - Not smaller than minPx (defaults to 320)
 * - Always within (winW - margin)
 */
export function useAdaptiveWidth(idealPx: number, maxPx = idealPx, minPx = 320, margin = 80): { winW: DeepReadonly<Ref<number>>, drawerWidth: ComputedRef<number> } {
  const { winW } = useWindowSize()
  const drawerWidth = computed(() => Math.min(maxPx, Math.max(minPx, Math.min(idealPx, winW.value - margin))))
  return { winW, drawerWidth }
}

