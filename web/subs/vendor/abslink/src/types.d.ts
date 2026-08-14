export interface W3CEvent {
    type: string;
}
export interface W3CMessageEvent<T = any> extends W3CEvent {
    data: T;
}
export interface Terminateable {
    close?: () => void;
    start?: () => void;
}
export interface Messageable extends Terminateable {
    postMessage: (message: any, ...args: any[]) => void;
}
export type W3CLike<T = any> = Messageable & ({
    addEventListener: (type: string, listener: (event: W3CMessageEvent<T>) => void) => void;
    removeEventListener: (type: string, listener: (event: W3CMessageEvent<T>) => void) => void;
} | {
    addListener: (type: string, listener: (event: W3CMessageEvent<T>) => void) => void;
    removeListener: (type: string, listener: (event: W3CMessageEvent<T>) => void) => void;
} | {
    on: (type: string, listener: (event: W3CMessageEvent<T>) => void) => void;
    off: (type: string, listener: (event: W3CMessageEvent<T>) => void) => void;
});
export interface NodeLike<T = any> extends Messageable {
    on: (type: string, listener: (data: T) => void) => void;
    off: (type: string, listener: (data: T) => void) => void;
}
export interface ElectronLike<T = any> extends Terminateable {
    on: (type: string, listener: (e: any, data: T) => void) => void;
    off: (type: string, listener: (e: any, data: T) => void) => void;
    postMessage?: (channel: string, message: any, ...args: any[]) => void;
}
export interface Endpoint<T = any> extends Messageable {
    on: (type: string, listener: (data: T) => void) => void;
    off: (type: string, listener: (data: T) => void) => void;
}
export declare const WireValueType: {
    readonly RAW: "RAW";
    readonly PROXY: "PROXY";
    readonly THROW: "THROW";
    readonly HANDLER: "HANDLER";
};
export interface RawWireValue {
    id?: string;
    type: typeof WireValueType.RAW;
    value: {};
}
export interface HandlerWireValue {
    id?: string;
    type: typeof WireValueType.HANDLER;
    name: string;
    value: unknown;
}
export type WireValue = RawWireValue | HandlerWireValue;
export type MessageID = string;
export declare const MessageType: {
    GET: string;
    SET: string;
    APPLY: string;
    CONSTRUCT: string;
    RELEASE: string;
};
interface BaseMessage {
    id?: MessageID;
    markerID?: number;
}
export interface GetMessage extends BaseMessage {
    type: typeof MessageType.GET;
    path: string[];
}
export interface SetMessage extends BaseMessage {
    type: typeof MessageType.SET;
    path: string[];
    value: WireValue;
}
export interface ApplyMessage extends BaseMessage {
    type: typeof MessageType.APPLY;
    path: string[];
    argumentList: WireValue[];
}
export interface ConstructMessage extends BaseMessage {
    type: typeof MessageType.CONSTRUCT;
    path: string[];
    argumentList: WireValue[];
}
export interface ReleaseMessage extends BaseMessage {
    type: typeof MessageType.RELEASE;
}
export type Message = GetMessage | SetMessage | ApplyMessage | ConstructMessage | ReleaseMessage;
export {};
