/**
 * A throwaway client-side id.
 *
 * *** NOT `crypto.randomUUID()`, and that is the whole point of this file. *** `randomUUID` is
 * defined only in a SECURE CONTEXT, so it exists on localhost and over HTTPS and is `undefined` on
 * `http://<lan-ip>` - which is exactly how a tablet or phone reaches `pnpm dev`. Calling it there
 * throws a TypeError, and a throw inside a file-picker handler shows nothing at all: the picture
 * simply never appears, with no failed request to find and nothing in the UI to explain it.
 *
 * The repo already carries the same lesson for `getUserMedia`, which is why `pnpm dev:https`
 * exists. This is the non-camera half of it, and it does not need TLS to be solved.
 *
 * These ids never leave the browser. `PUT /images/:id/annotations` is replace-all, so the server
 * assigns the real ids and the client never sends these - which is what makes a non-cryptographic
 * fallback fine here, and is NOT a licence to use this where an unguessable value is wanted.
 */
export function localId(prefix = 'id'): string {
    const uuid = globalThis.crypto?.randomUUID?.()
    if (uuid) return `${prefix}-${uuid}`

    // Enough to be unique within one editing session, which is all these have to survive: a
    // monotonic counter for collisions inside the same millisecond, plus the clock so two
    // sessions in one tab cannot line up.
    counter += 1
    return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`
}

let counter = 0
