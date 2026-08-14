// @ts-expect-error yeah no types for electron
import { ipcMain, ipcRenderer } from 'electron';
import { wrap as _wrap, expose as _expose } from "../src/abslink.js";
function createWrapper(channel, messageable) {
    const listeners = new WeakMap();
    channel.start?.();
    messageable.start?.();
    return {
        on(event, listener) {
            const unwrapped = (event, data) => listener(data);
            channel.on(event, unwrapped);
            listeners.set(listener, unwrapped);
        },
        off(event, listener) {
            const unwrapped = listeners.get(listener);
            channel.off(event, unwrapped);
            listeners.delete(listener);
        },
        postMessage(message, transfer) {
            messageable.postMessage('message', message, transfer);
        },
        close() {
            // @ts-expect-error w/e
            if (channel !== globalThis)
                channel.close?.();
            if (messageable !== globalThis)
                messageable.close?.();
        }
    };
}
export function wrap(channel, messageable = channel) {
    return _wrap(createWrapper(channel, messageable));
}
export function expose(obj, channel = ipcMain ?? ipcRenderer, messageable = channel) {
    return _expose(obj, createWrapper(channel, messageable));
}
//# sourceMappingURL=electron.js.map