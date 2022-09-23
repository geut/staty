# staty

Build a proxy-state from plain objects. With automatic rollback to previous state in case of errors.

![Test Status](https://github.com/geut/staty/actions/workflows/test.yml/badge.svg)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)
[![standard-readme compliant](https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)

[![Made by GEUT][geut-badge]][geut-url]

## Install

```bash
$ npm install @geut/staty
```

## Usage

```javascript
import { staty, subscribe, snapshot, action } from '@geut/staty'

const state = staty({
  count: 0
})

console.log(snapshot(state)) // => { count: 0 }

subscribe(state, () => {
  console.log(state) // => { count: 1 }
})

subscribe(state, () => {
  console.log(state.count) // => 1
}, { props: 'count' })

// filter multiple values
subscribe(state, () => {
  console.log(state.count) // => 1
}, { props: ['count'] })

state.count++

try {
  action(() => {
    state.count = 100
    throw new Error('ups')
  })
} catch (err) {
  console.log(err) // => ups
}

state.count // => 1 (rollback to last good state)
```

## API

<!-- apiness/api -->

#### `staty(target, opts?) => any`

Creates a new proxy-state

- `target: any`
- `opts?: Object = {}`
  - `disableCache?: boolean = false` disable cache for snapshots

#### `listeners(state) => ListenersReport`

Get subscription listeners count

- `state: any`

#### `subscribe(state, handler, opts?) => UnsubscribeFunction`

Subscribe for changes in the state

- `state: any`
- `handler: () => void`
- `opts?: Object = {}`
  - `props?: string | string[]` props to subscribe
  - `batch?: boolean = false` execute in batch turning the subscription into async
  - `filter?: (actionName: string) => boolean` subscribe only for specific action names
  - `autorun?: boolean` run immediately
  - `before?: boolean` run before the other subscriptions and after the action finish. Good place to validate your state.

#### `ref(value, mapSnapshot?, disableCache?) => any`

Add a ref to another object

- `value: any`
- `mapSnapshot?: (ref: any) => any`
- `disableCache?: boolean = false` disable cache for snapshots

#### `action(handler, actionName) => void`

Create a action

- `handler: Function`
- `actionName: string`

#### `snapshot(state, prop?, disableCache?) => any`

Creates a snapshot of the state

- `state: any`
- `prop?: (string | Array<string>)`
- `disableCache?: boolean` disable cache for snapshots

## Issues

:bug: If you found an issue we encourage you to report it on [github](https://github.com/geut/staty/issues). Please specify your OS and the actions to reproduce it.

## Contributing

:busts_in_silhouette: Ideas and contributions to the project are welcome. You must follow this [guideline](https://github.com/geut/staty/blob/main/CONTRIBUTING.md).

## License

MIT © A [**GEUT**](http://geutstudio.com/) project

[geut-url]: https://geutstudio.com

[geut-badge]: https://img.shields.io/badge/Made%20By-GEUT-4f5186?style=for-the-badge&link=https://geutstudio.com&labelColor=white&logo=data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCABAAEADASIAAhEBAxEB/8QAGwAAAgIDAQAAAAAAAAAAAAAABAYDBQACBwH/xAA0EAACAQMBBAcGBgMAAAAAAAABAgMABBEFBhIhQRMiMVFhgcEUIzJxkbFCUmKh0fAkcuH/xAAYAQADAQEAAAAAAAAAAAAAAAABAwQCAP/EACARAAMAAwACAgMAAAAAAAAAAAABAgMRIRIxBEEiM1H/2gAMAwEAAhEDEQA/AOgVlau6xoXdgqqMkk8AKV9U2oYs0WngBRw6VhxPyFamXXoDeiz1PUbmzuujQIUKgjIqGLXnz72FSO9TikfVbi6uXWSSaWRuzixNBx3VzCepNIvgTw+hpjwv+iGr3tM6xa30F2PdP1uangRRNc70fUbi4JLIVaPskXgM/wA076Ze+2W+WwJF4MPWlNaemajI2/GvYbWVlZQHCptZqLNKLGJsKoDSY5nkKorKzlvrlYIRlm5nsA7zWX8pnv55SfikJ/emPZGDcs7m6CguTuL5DPrVf64Me2F2mzNhAg6ZTO/MsSB9BW15s1pt1GVEPRHvQ+hqbTNT9sZ0kCpIOIA5ij5ZEijaSRgqqMkmpVkb7sMuWtoV73S49L3I4B7kjq57c881BZ6vFpuoKjq7dIvYBw8PtUOqX1xcSxoJXw8mQuewVW3vX1eFR+Fcn96OLVvpFzz8kM020kp4QwIvixzVpot5Je2bSTEFw5HAY7qUKadnIymm7x/G5I+3pTskzM8G4rqq6JGpI8E1wi8HR2H0NT7P6rcRKUEzYR9/czgEf0VabV2JgvhdKPdzdvg399aVG37K4Esfw/3hTU1S2NpNrSHqax9q/wAzTm3lY5KA4ZTQl2mo9CWljncL+cnA+tVVhqeSGt5mik5qDg/9o+XVb6aFonuDusMHqjP2qavjbfGTPX3xgTstrm4uGDSEYVV+woWPMKy3dzwd+JHcOQrdkgtyZpXJb87nJ8qqr68a7cKgIjB4DmadGNQjohs9i1C66Xqtvbx+EjIp10jaOMLBaPasDwRTGc5PyNJ1rb9EN5/jP7U17KaaZJvbpV6icI88z3+VG0vH8ipJJ8Ga8tIr22eCYZVh5g94pC1TTJtPmMU67yH4XxwYV0So54IriIxzRrIh7QwzSIyOTbWzlElkCcxtjwNedHeKMCVseDmnq72UgkJa1maL9LDeH81XvspfA9WSBh/sR6U9XD+zDQp+yTSNmR/MnJomG3SLiBlu80zQ7JXTH31xEg/Tlj6Vb2OzljaEO6meQc5OweVc8koOmUGjaFLfuss4MdsOOewv8v5p0ijSGNY41CoowAOQrbsr2p7t0zSWj//Z
