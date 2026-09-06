import type { Ref } from 'vue'

/**
 * Mirrors `source`, but only turns TRUE after it has stayed true for `delayMs`; turns FALSE at once.
 *
 * It exists to stop a loading indicator from BLINKING on fast operations. A spinner or a "Loading..."
 * line that appears and vanishes within a couple of frames reads as a glitch, not as feedback, so a
 * quick load shows nothing at all while a genuinely slow one still gets its indicator once the wait
 * is real. Hiding is immediate, because the moment the work is done there is nothing left to wait for.
 *
 * A `watch` and a timer, because this is a SIDE EFFECT over time - not a value that can be derived
 * from `source` in the current tick.
 */
export function useDelayedFlag(source: Ref<boolean>, delayMs = 200): Ref<boolean> {
    const flag = ref(false)
    let timer: ReturnType<typeof setTimeout> | null = null

    const clear = () => {
        if (timer) {
            clearTimeout(timer)
            timer = null
        }
    }

    watch(source, (on) => {
        clear()
        if (on) {
            timer = setTimeout(() => {
                flag.value = true
                timer = null
            }, delayMs)
        } else {
            flag.value = false
        }
    })

    onScopeDispose(clear)

    return flag
}
