import { wrap as _wrap, expose as _expose, type Endpoint, type Remote } from '../src/abslink.ts'

import type { Messageable, W3CMessageEvent, W3CLike } from '../src/types.ts'

function createWrapper (channel: W3CLike, messageable: Messageable): Endpoint {
  const listeners = new WeakMap<(...args: any[]) => void, (...args: any[]) => void>()
  channel.start?.()
  messageable.start?.()

  return {
    on (event: string, listener: (data: any) => void) {
      const unwrapped = (event: W3CMessageEvent) => listener(event.data)
      if ('addEventListener' in channel) {
        channel.addEventListener(event, unwrapped)
      } else if ('addListener' in channel) {
        channel.addListener(event, unwrapped)
      } else {
        channel.on(event, unwrapped)
      }

      listeners.set(listener, unwrapped)
    },
    off (event: string, listener: (...args: any[]) => void) {
      const unwrapped = listeners.get(listener)!
      if ('removeEventListener' in channel) {
        channel.removeEventListener(event, unwrapped)
      } else if ('removeListener' in channel) {
        channel.removeListener(event, unwrapped)
      } else {
        channel.off(event, unwrapped)
      }
      listeners.delete(listener)
    },
    postMessage (message: any, transfer?: Transferable[]) {
      messageable.postMessage(message, transfer)
    },
    close () {
      if (channel !== globalThis) channel.close?.()
      if (messageable !== globalThis) messageable.close?.()
    }
  }
}

export function wrap<T> (channel: W3CLike, messageable: Messageable = channel as unknown as Messageable): Remote<T> {
  return _wrap(createWrapper(channel, messageable))
}

export function expose <T extends object> (obj: T, channel = globalThis as W3CLike, messageable: Messageable = channel as Messageable): T {
  return _expose(obj, createWrapper(channel, messageable))
}
