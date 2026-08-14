import { type Remote } from '../src/abslink.ts';
import type { Messageable, W3CLike } from '../src/types.ts';
export declare function wrap<T>(channel: W3CLike, messageable?: Messageable): Remote<T>;
export declare function expose<T extends object>(obj: T, channel?: W3CLike, messageable?: Messageable): T;
