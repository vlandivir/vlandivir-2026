import { type Remote } from '../src/abslink.ts';
import type { ElectronLike, Terminateable } from '../src/types.ts';
interface Messageable extends Terminateable {
    postMessage: (channel: string, message: any, transfer?: Transferable[]) => void;
}
export declare function wrap<T>(channel: ElectronLike, messageable?: Messageable): Remote<T>;
export declare function expose<T extends object>(obj: T, channel?: ElectronLike, messageable?: Messageable): T;
export {};
