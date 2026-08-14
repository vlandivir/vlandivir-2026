/* eslint-disable @typescript-eslint/no-unsafe-function-type */
import {
  type Endpoint,
  type Message,
  MessageType,
  type WireValue,
  WireValueType
} from './types.ts'

export * from './types.ts'

export const proxyMarker = Symbol('Abslink.proxy')
export const releaseProxy = Symbol('Abslink.releaseProxy')
export const finalizer = Symbol('Abslink.finalizer')

export const throwMarker = Symbol('Abslink.thrown')

/**
 * Interface of values that were marked to be proxied with `abslink.proxy()`.
 * Can also be implemented by classes.
 */
export interface ProxyMarked {
  [proxyMarker]: number
}

/**
 * Takes a type and wraps it in a Promise, if it not already is one.
 * This is to avoid `Promise<Promise<T>>`.
 *
 * This is the inverse of `Unpromisify<T>`.
 */
type Promisify<T> = T extends Promise<unknown> ? T : Promise<T>
/**
 * Takes a type that may be Promise and unwraps the Promise type.
 * If `P` is not a Promise, it returns `P`.
 *
 * This is the inverse of `Promisify<T>`.
 */
type Unpromisify<P> = P extends Promise<infer T> ? T : P

/**
 * Takes the raw type of a remote property and returns the type that is visible to the local thread on the proxy.
 *
 * Note: This needs to be its own type alias, otherwise it will not distribute over unions.
 * See https://www.typescriptlang.org/docs/handbook/advanced-types.html#distributive-conditional-types
 */
type RemoteProperty<T> =
  // If the value is a method, abslink will proxy it automatically.
  // Objects are only proxied if they are marked to be proxied.
  // Otherwise, the property is converted to a Promise that resolves the cloned value.
  T extends Function | ProxyMarked ? Remote<T> : T extends object ? Promisify<T> & { [K in keyof T]: RemoteProperty<T[K]>; } : Promisify<T>

/**
 * Takes the raw type of a property as a remote thread would see it through a proxy (e.g. when passed in as a function
 * argument) and returns the type that the local thread has to supply.
 *
 * This is the inverse of `RemoteProperty<T>`.
 *
 * Note: This needs to be its own type alias, otherwise it will not distribute over unions. See
 * https://www.typescriptlang.org/docs/handbook/advanced-types.html#distributive-conditional-types
 */
type LocalProperty<T> = T extends Function | ProxyMarked
  ? Local<T>
  : Unpromisify<T>

/**
 * Proxies `T` if it is a `ProxyMarked`, clones it otherwise (as handled by structured cloning and transfer handlers).
 */
export type ProxyOrClone<T> = T extends ProxyMarked ? Remote<T> : T
/**
 * Inverse of `ProxyOrClone<T>`.
 */
export type UnproxyOrClone<T> = T extends RemoteObject<ProxyMarked>
  ? Local<T>
  : T

/**
 * Takes the raw type of a remote object in the other thread and returns the type as it is visible to the local thread
 * when proxied with `Abslink.proxy()`.
 *
 * This does not handle call signatures, which is handled by the more general `Remote<T>` type.
 *
 * @template T The raw type of a remote object as seen in the other thread.
 */
export type RemoteObject<T> = { [P in keyof T]: RemoteProperty<T[P]> }
/**
 * Takes the type of an object as a remote thread would see it through a proxy (e.g. when passed in as a function
 * argument) and returns the type that the local thread has to supply.
 *
 * This does not handle call signatures, which is handled by the more general `Local<T>` type.
 *
 * This is the inverse of `RemoteObject<T>`.
 *
 * @template T The type of a proxied object.
 */
export type LocalObject<T> = { [P in keyof T]: LocalProperty<T[P]> }

/**
 * Additional special abslink methods available on each proxy returned by `Abslink.wrap()`.
 */
export interface ProxyMethods {
  [releaseProxy]: () => Promise<void>
}

/**
 * Takes the raw type of a remote object, function or class in the other thread and returns the type as it is visible to
 * the local thread from the proxy return value of `Abslink.wrap()` or `Abslink.proxy()`.
 */
export type Remote<T> =
  // Handle properties
  RemoteObject<T> &
  // Handle call signature (if present)
  (T extends (...args: infer TArguments) => infer TReturn
    ? (
      ...args: { [I in keyof TArguments]: UnproxyOrClone<TArguments[I]> }
    ) => Promisify<ProxyOrClone<Unpromisify<TReturn>>>
    : unknown) &
  // Handle construct signature (if present)
  // The return of construct signatures is always proxied (whether marked or not)
  (T extends new(...args: infer TArguments) => infer TInstance
    ? new(
        ...args: {
          [I in keyof TArguments]: UnproxyOrClone<TArguments[I]>
        }
      ) => Remote<TInstance> & Promisify<Remote<TInstance>>
    : unknown) &
  // Include additional special abslink methods available on the proxy.
  ProxyMethods

/**
 * Expresses that a type can be either a sync or async.
 */
type MaybePromise<T> = Promise<T> | T

/**
 * Takes the raw type of a remote object, function or class as a remote thread would see it through a proxy (e.g. when
 * passed in as a function argument) and returns the type the local thread has to supply.
 *
 * This is the inverse of `Remote<T>`. It takes a `Remote<T>` and returns its original input `T`.
 */
export type Local<T> =
  // Omit the special proxy methods (they don"t need to be supplied, abslink adds them)
  Omit<LocalObject<T>, keyof ProxyMethods> &
  // Handle call signatures (if present)
  (T extends (...args: infer TArguments) => infer TReturn
    ? (
      ...args: { [I in keyof TArguments]: ProxyOrClone<TArguments[I]> }
    ) => // The raw function could either be sync or async, but is always proxied automatically
      MaybePromise<UnproxyOrClone<Unpromisify<TReturn>>>
    : unknown) &
  // Handle construct signature (if present)
  // The return of construct signatures is always proxied (whether marked or not)
  (T extends new(...args: infer TArguments) => infer TInstance
    ? new(
        ...args: {
          [I in keyof TArguments]: ProxyOrClone<TArguments[I]>
        }
      ) => // The raw constructor could either be sync or async, but is always proxied automatically
        MaybePromise<Local<Unpromisify<TInstance>>>
    : unknown)

export const isObject = (val: unknown): val is object =>
  (typeof val === 'object' && val !== null) || typeof val === 'function'

/**
 * Customizes the serialization of certain values as determined by `canHandle()`.
 *
 * @template T The input type being handled by this transfer handler.
 * @template S The serialized type sent over the wire.
 */
export interface TransferHandler<T, S = void> {
  /**
   * Gets called for every value to determine whether this transfer handler
   * should serialize the value, which includes checking that it is of the right
   * type (but can perform checks beyond that as well).
   */
  canHandle: (value: unknown) => value is T

  /**
   * Gets called with the value if `canHandle()` returned `true` to produce a
   * value that can be sent in a message, consisting of structured-cloneable
   * values and/or transferrable objects.
   */
  serialize: (value: T, ep: Endpoint) => [S, Transferable[]]

  /**
   * Gets called to deserialize an incoming value that was serialized in the
   * other thread with this transfer handler (known through the name it was
   * registered under).
   */
  deserialize: (value: S, ep: Endpoint) => T
}
/**
 * Internal transfer handle to handle objects marked to proxy.
 */
const proxyTransferHandler: TransferHandler<any, any> = {
  canHandle: (val): val is ProxyMarked =>
    isObject(val) && proxyMarker in val,
  serialize (obj: ProxyMarked, ep) {
    const markerID = obj[proxyMarker]
    expose(obj, ep, markerID)
    return [markerID, []]
  },
  deserialize (markerID, ep) {
    return wrap(ep, markerID)
  }
}

interface ThrownValue {
  [throwMarker]: unknown // just needs to be present
  value: unknown
}
type SerializedThrownValue =
  | { isError: true, value: Error }
  | { isError: false, value: unknown }
type PendingListenersMap = Map<
  string,
  (value: WireValue | PromiseLike<WireValue>) => void
>
interface EndpointWithPendingListeners {
  endpoint: Endpoint
  pendingListeners: PendingListenersMap
  rootMarkerID?: number
}

/**
 * Internal transfer handler to handle thrown exceptions.
 */
const throwTransferHandler: TransferHandler<
  ThrownValue,
  SerializedThrownValue
> = {
  canHandle: (value): value is ThrownValue =>
    isObject(value) && throwMarker in value,
  serialize ({ value }) {
    let serialized: SerializedThrownValue
    if (value instanceof Error) {
      serialized = {
        isError: true,
        value: {
          message: value.message,
          name: value.name,
          stack: value.stack
        }
      }
    } else {
      serialized = { isError: false, value }
    }
    return [serialized, []]
  },
  deserialize (serialized) {
    if (serialized.isError) {
      throw Object.assign(
        new Error(serialized.value.message),
        serialized.value
      )
    }
    // eslint-disable-next-line no-throw-literal
    throw serialized.value as Error
  }
}

/**
 * Allows customizing the serialization of certain values.
 */
export const transferHandlers = new Map<
  string,
  TransferHandler<any, any>
>([
  ['proxy', proxyTransferHandler],
  ['throw', throwTransferHandler]
])

function filterPath <T extends object> (path: string[], obj: T) {
  let parent: any = obj
  const parentPath = path.slice(0, -1)
  for (const segment of parentPath) {
    // Object.hasOwn() would work, but backwards compatibility...
    if (Object.prototype.hasOwnProperty.call(parent, segment)) {
      parent = parent[segment]
    }
  }
  const lastSegment = path[path.length - 1]
  const RawValue = lastSegment ? parent[lastSegment] : parent
  return { parent, RawValue, lastSegment }
}

export function expose <T extends object> (
  obj: T,
  ep: Endpoint,
  rootMarkerID?: number
): T {
  ep.on('message', function callback (data: any) {
    if (!data) return

    const { id, type, path, markerID } = {
      path: [] as string[],
      ...(data as Message)
    }
    if (markerID !== rootMarkerID) return
    const argumentList = (data.argumentList ?? []).map((v: WireValue) => fromWireValue(v, ep))
    let returnValue
    try {
      const { parent, RawValue, lastSegment } = filterPath(path, obj)
      switch (type) {
        case MessageType.GET:
          returnValue = RawValue
          break
        case MessageType.SET:
          parent[lastSegment!] = fromWireValue(data.value, ep)
          returnValue = true
          break
        case MessageType.APPLY:
          returnValue = RawValue.apply(parent, argumentList)
          break
        case MessageType.CONSTRUCT:
          returnValue = new RawValue(...argumentList)
          break
        case MessageType.RELEASE:
          returnValue = undefined
          break
        default:
          return
      }
    } catch (value) {
      returnValue = { value, [throwMarker]: 0 }
    }
    Promise.resolve(returnValue)
      .catch((value) => {
        return { value, [throwMarker]: 0 }
      })
      .then((returnValue) => {
        // support async constructors
        if (type === MessageType.CONSTRUCT) returnValue = proxy(returnValue)
        const [wireValue, transfer] = toWireValue(returnValue, ep)
        ep.postMessage({ ...wireValue, id, markerID: rootMarkerID }, transfer)
        if (type === MessageType.RELEASE) {
          // detach and deactive after sending release response above.
          ep.off('message', callback)
          ;(obj as any)[finalizer]?.()
          ep.close?.()
        }
      })
      .catch(_ => {
        // Send Serialization Error To Caller
        const [wireValue, transfer] = toWireValue({
          value: new TypeError('Unserializable return value'),
          [throwMarker]: 0
        }, ep)
        ep.postMessage({ ...wireValue, id, markerID: rootMarkerID }, transfer)
      })
  })

  return obj
}

export function wrap<T> (endpoint: Endpoint, rootMarkerID?: number): Remote<T> {
  const pendingListeners: PendingListenersMap = new Map()

  endpoint.on('message', (data) => {
    if (!data?.id) {
      return
    }
    const resolver = pendingListeners.get(data.id)
    if (!resolver) {
      return
    }

    try {
      resolver(data)
    } finally {
      pendingListeners.delete(data.id)
    }
  })

  return createProxy<T>({ endpoint, pendingListeners, rootMarkerID })
}

function throwIfProxyReleased (isReleased: boolean) {
  if (isReleased) {
    throw new Error('Proxy has been released and is not useable')
  }
}

async function releaseEndpoint (epWithPendingListeners: EndpointWithPendingListeners) {
  await requestResponseMessage(epWithPendingListeners, { type: MessageType.RELEASE })
  epWithPendingListeners.endpoint.close?.()
}

const proxyCounter = new WeakMap<EndpointWithPendingListeners, number>()
const proxyFinalizers =
  'FinalizationRegistry' in globalThis &&
  new FinalizationRegistry(
    (epWithPendingListeners: EndpointWithPendingListeners) => {
      const newCount = (proxyCounter.get(epWithPendingListeners) ?? 0) - 1
      proxyCounter.set(epWithPendingListeners, newCount)
      if (newCount === 0) {
        releaseEndpoint(epWithPendingListeners).finally(() => {
          epWithPendingListeners.pendingListeners.clear()
        })
      }
    }
  )

function registerProxy (
  proxy: object,
  epWithPendingListeners: EndpointWithPendingListeners
) {
  const newCount = (proxyCounter.get(epWithPendingListeners) ?? 0) + 1
  proxyCounter.set(epWithPendingListeners, newCount)
  if (proxyFinalizers) {
    proxyFinalizers.register(proxy, epWithPendingListeners, proxy)
  }
}

function unregisterProxy (proxy: object) {
  if (proxyFinalizers) {
    proxyFinalizers.unregister(proxy)
  }
}

function createProxy<T> (
  epWithPendingListeners: EndpointWithPendingListeners,
  path: Array<string | number | symbol> = []
): Remote<T> {
  let isProxyReleased = false
  const propProxyCache = new Map<(string | symbol), Remote<unknown>>()
  const proxy = new Proxy(function () {}, {
    get (_target, prop) {
      throwIfProxyReleased(isProxyReleased)
      if (prop === releaseProxy) {
        return async () => {
          for (const subProxy of propProxyCache.values()) {
            subProxy[releaseProxy]()
          }
          propProxyCache.clear()
          unregisterProxy(proxy)
          releaseEndpoint(epWithPendingListeners).finally(() => {
            epWithPendingListeners.pendingListeners.clear()
          })
          isProxyReleased = true
        }
      }
      if (prop === 'then') {
        if (path.length === 0) {
          return { then: () => proxy }
        }
        const r = requestResponseMessage(epWithPendingListeners, {
          type: MessageType.GET,
          path: path.map((p) => p.toString())
        }).then(v => fromWireValue(v, epWithPendingListeners.endpoint))
        return r.then.bind(r)
      }
      const cachedProxy = propProxyCache.get(prop)
      if (cachedProxy) {
        return cachedProxy
      }

      const propProxy = createProxy(epWithPendingListeners, [...path, prop])
      propProxyCache.set(prop, propProxy)
      return propProxy
    },
    set (_target, prop, rawValue) {
      throwIfProxyReleased(isProxyReleased)
      // FIXME: ES6 Proxy Handler `set` methods are supposed to return a
      // boolean. To show good will, we return true asynchronously ¯\_(ツ)_/¯
      const [value, transfer] = toWireValue(rawValue, epWithPendingListeners.endpoint)
      return requestResponseMessage(
        epWithPendingListeners,
        {
          type: MessageType.SET,
          path: [...path, prop].map((p) => p.toString()),
          value
        },
        transfer
      ).then(v => fromWireValue(v, epWithPendingListeners.endpoint)) as any
    },
    apply (_target, _thisArg, rawArgumentList) {
      throwIfProxyReleased(isProxyReleased)
      const last = path[path.length - 1]
      // We just pretend that `bind()` didn’t happen.
      if (last === 'bind') {
        return createProxy(epWithPendingListeners, path.slice(0, -1))
      }
      const [argumentList, transfer] = processArguments(rawArgumentList, epWithPendingListeners)
      return requestResponseMessage(
        epWithPendingListeners,
        {
          type: MessageType.APPLY,
          path: path.map((p) => p.toString()),
          argumentList
        },
        transfer
      ).then(v => fromWireValue(v, epWithPendingListeners.endpoint))
    },
    construct (_target, rawArgumentList) {
      throwIfProxyReleased(isProxyReleased)
      const [argumentList, transfer] = processArguments(rawArgumentList, epWithPendingListeners)
      return requestResponseMessage(
        epWithPendingListeners,
        {
          type: MessageType.CONSTRUCT,
          path: path.map((p) => p.toString()),
          argumentList
        },
        transfer
      ).then(v => fromWireValue(v, epWithPendingListeners.endpoint))
    }
  })
  registerProxy(proxy, epWithPendingListeners)
  return proxy as any
}

const transferCache = new WeakMap<any, Transferable[]>()
export function transfer<T> (obj: T, transfers: Transferable[]): T {
  transferCache.set(obj, transfers)
  return obj
}

function processArguments (argumentList: any[], epWithPendingListeners: EndpointWithPendingListeners): [WireValue[], Transferable[]] {
  const wireValues: WireValue[] = []
  const transferables: Transferable[] = []
  for (const argument of argumentList) {
    const [wireValue, transfer] = toWireValue(argument, epWithPendingListeners.endpoint)
    wireValues.push(wireValue)
    transferables.push(...transfer)
  }
  return [wireValues, transferables]
}

export function proxy<T extends object> (obj: T): T & ProxyMarked {
  return Object.assign(obj, { [proxyMarker]: randomId() }) as any
}

function toWireValue (value: any, ep: Endpoint): [WireValue, Transferable[]] {
  for (const [name, handler] of transferHandlers) {
    if (handler.canHandle(value)) {
      const [serializedValue, transfer] = handler.serialize(value, ep)
      return [{
        type: WireValueType.HANDLER,
        name,
        value: serializedValue
      }, transfer]
    }
  }
  return [{
    type: WireValueType.RAW,
    value
  }, transferCache.get(value) ?? []]
}

function fromWireValue (value: WireValue, ep: Endpoint): any {
  switch (value.type) {
    case WireValueType.HANDLER:
      return transferHandlers.get(value.name)!.deserialize(value.value, ep)
    case WireValueType.RAW:
      return value.value
  }
}

function requestResponseMessage (
  ep: EndpointWithPendingListeners,
  msg: Message,
  transfer?: Transferable[]
): Promise<WireValue> {
  return new Promise((resolve) => {
    const id = randomId()
    ep.pendingListeners.set(id, resolve)
    ep.endpoint.postMessage({ id, ...msg, markerID: ep.rootMarkerID }, transfer)
  })
}

const hex: string[] = []
const alphabet = '0123456789abcdef'

for (let i = 0; i < 256; i++) {
  hex[i] = alphabet[i >> 4 & 0xf]! + alphabet[i & 0xf]!
}
let step = 0
let buffer = ''

function randomId () {
  let i = 0
  if (!buffer || ((step + 16) > 256 * 2)) {
    for (buffer = '', step = 0; i < 256; ++i) {
      buffer += hex[Math.random() * 256 | 0]
    }
  }

  return buffer.substring(step, ++step + 16)
}
