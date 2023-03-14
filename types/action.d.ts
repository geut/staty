/**
 * Create a action
 * @param {function} handler
 * @param {string} [actionName]
 */
export function action(handler: Function, actionName?: string): void;
export class ActionManager {
    _stack: any[];
    _onRelease: () => void;
    get current(): any;
    /**
     *
     * @param {string | symbol | number} name
     * @returns
     */
    create(name?: string | symbol | number): Action;
}
export const actions: ActionManager;
declare class Action {
    constructor(name: any, onRelease: any);
    _name: any;
    _onRelease: any;
    _beforeHandlers: any;
    _handlers: any;
    _done: boolean;
    _history: any[];
    get name(): any;
    valid(handler: any): any;
    add(handler: any): void;
    done(): void;
    cancel(): void;
    pushHistory(rollback: any): void;
}
export {};
