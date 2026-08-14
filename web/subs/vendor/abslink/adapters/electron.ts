// @ts-expect-error yeah no types for electron
import { ipcMain, ipcRenderer } from 'electron'

import { wrap as _wrap, expose as _expose, type Endpoint, type Remote } from '../src/abslink.ts'

import type { ElectronLike, Terminateable, W3CEvent } from '../src/types.ts'

interface Messageable extends Terminateable {
  postMessage: (channel: string, message: any, transfer?: Transferable[]) => void
}

function createWrapper (channel: ElectronLike, messageable: Messageable): Endpoint {
  const listeners = new WeakMap<(...args: any[]) => void, (...args: any[]) => void>()
  channel.start?.()
  messageable.start?.()

  return {
    on (event: string, listener: (data: any) => void) {
      const unwrapped = (event: W3CEvent, data: any) => listener(data)
      channel.on(event, unwrapped)
      listeners.set(listener, unwrapped)
    },
    off (event: string, listener: (...args: any[]) => void) {
      const unwrapped = listeners.get(listener)!
      channel.off(event, unwrapped)
      listeners.delete(listener)
    },
    postMessage (message: any, transfer?: Transferable[]) {
      messageable.postMessage('message', message, transfer)
    },
    close () {
      // @ts-expect-error w/e
      if (channel !== globalThis) channel.close?.()
      if (messageable !== globalThis) messageable.close?.()
    }
  }
}

export function wrap<T> (channel: ElectronLike, messageable: Messageable = channel as unknown as Messageable): Remote<T> {
  return _wrap(createWrapper(channel, messageable))
}

export function expose <T extends object> (obj: T, channel: ElectronLike = ipcMain ?? ipcRenderer, messageable: Messageable = channel as unknown as Messageable): T {
  return _expose(obj, createWrapper(channel, messageable))
}
