export function snapshot<T extends unknown>(state: T): T;
export function snapshot<T extends unknown>(state: T, props: Array<string>): Array<unknown>;
export function snapshot<T extends unknown>(state: T, props: string): unknown;
