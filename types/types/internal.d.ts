export function rawValue(value: any): any;
export class InternalStaty {
    constructor(source: any, target: any, { onReadOnly }: {
        onReadOnly: any;
    });
    source: any;
    target: any;
    onReadOnly: any;
    subscriptions: {
        default: any;
        props: any;
    };
    propsBinded: any;
    isRef: boolean;
    onGetSnapshot(target: any, prop: any, value: any): any;
    _snapshot: any;
    /** @type {Proxy<typeof target>} */
    proxy: Proxy<any>;
    forEach(callback: any): void;
    setProxy(proxy: any): void;
    setOnAction(onAction: any): void;
    onAction: {
        run: (actionName: any) => any;
        before: boolean;
    };
    getValueByProp(prop: any): any;
    getSnapshot(): any;
    clone(): any;
    clearSnapshot(): void;
    handler(value: any, prop: any): any;
    checkCircularReference(prop: any, value: any): void;
    addParent(prop: any, parent: any, checkCircularReference: any): void;
    delParent(prop: any, parent: any): void;
    run(prop: any, rollback: any): void;
    get(target: any, prop: any): any;
    set(target: any, prop: any, value: any): boolean;
    deleteProperty(target: any, prop: any): boolean;
    reflectSet(target: any, prop: any, value: any, useBaseReflect: any): any;
    reflectHas(target: any, prop: any, useBaseReflect: any): any;
    reflectGet(target: any, prop: any, useBaseReflect: any): any;
    reflectDeleteProperty(target: any, prop: any, useBaseReflect: any): any;
    _get(target: any, prop: any, useBaseReflect: any): any;
    _set(target: any, prop: any, value: any, useBaseReflect: any): boolean;
    _deleteProperty(target: any, prop: any, useBaseReflect: any): boolean;
}
