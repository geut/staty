export const kStaty = Symbol('staty')
export const kEmpty = Symbol('empty')
export const kInternalAction = Symbol('internalAction')
export const isArray = '[object Array]'
export const isObject = '[object Object]'
export const isNumber = '[object Number]'
export const isString = '[object String]'
export const isBoolean = '[object Boolean]'
export const isSet = '[object Set]'
export const isMap = '[object Map]'
export const isDate = '[object Date]'
export const isRegexp = '[object RegExp]'
export const isDataView = '[object DataView]'
export const isBuffer = '[object ArrayBuffer]'
export const isValidForStaty = type => type === isObject || type === isArray || type === isMap || type === isSet
