export class RefStaty {
    constructor(value: any, mapSnapshot: any, cache?: boolean);
    isRef: boolean;
    cache: boolean;
    setValue(value: any): void;
    value: any;
    getSnapshot(): any;
    updateSnapshot(): void;
}
