/**
 * Creates a new proxy-state
 *
 * @template {object} T
 * @param {T} target
 * @param {object} [opts]
 * @param {(target: T, prop: unknown, value: unknown) => {}} [opts.onReadOnly]
 * @param {(state: T) => {}} [opts.onAction]
 * @returns {T}
 */
export function staty<T extends unknown>(target: T, opts?: {
    onReadOnly?: (target: T, prop: unknown, value: unknown) => {};
    onAction?: (state: T) => {};
}): T;
/**
 * Get subscription listeners count
 *
 * @template {object} T
 * @param {T} state
 * @returns {{ count: number, props: Array<{ count: number; prop: string; }> }}
 */
export function listeners<T extends unknown>(state: T): {
    count: number;
    props: {
        count: number;
        prop: string;
    }[];
};
/**
 * Subscribe for changes in the state
 *
 * @template {object} T
 * @param {T} state
 * @param {() => void} handler
 * @param {Object} [opts]
 * @param {string|string[]} [opts.props] props to subscribe
 * @param {(actionName: string) => boolean} [opts.filter] subscribe only for specific action names
 * @param {boolean} [opts.batch=false] execute in batch turning the subscription into async
 * @param {boolean} [opts.autorun=false] run immediately
 * @param {boolean} [opts.before=false] run before finish the action. A good place to validate changes
 * @returns {UnsubscribeFunction}
 */
export function subscribe<T extends unknown>(state: T, handler: () => void, opts?: {
    props?: string | string[];
    filter?: (actionName: string) => boolean;
    batch?: boolean;
    autorun?: boolean;
    before?: boolean;
}): UnsubscribeFunction;
/**
 * Add a ref to another object
 *
 * @template {object} T
 * @template {object | T} M
 * @param {T} value
 * @param {(ref: T) => M} [mapSnapshot]
 * @param {boolean} [cache] enable cache
 * @returns {T & RefStaty}
 */
export function ref<T extends unknown, M extends unknown>(value: T, mapSnapshot?: (ref: T) => M, cache?: boolean): T & RefStaty;
export { snapshot } from "./snapshot.js";
export { action } from "./action.js";
export type UnsubscribeFunction = () => any;
import { RefStaty } from './types/ref.js';
