import { bench, run } from 'mitata'
import { staty, snapshot } from './src/index.js'
import { proxy, snapshot as valtioSnapshot } from 'valtio/vanilla'

const tinyObject = () => ({
  name: 'batman',
  count: 0
})

const bigObject = () => ({
  name: 'batman',
  count: 0,
  deep: {
    deep: {
      deep: {
        random: 1
      }
    },
    map: new Map([[0, 'k0'], [1, 'k1']]),
    set: new Set(['k0', 'k1'])
  }
})

function suite (name, create, snapshot) {
  bench(`${name} - create: tiny object`, () => create(tinyObject()))
  bench(`${name} - create: complex object`, () => create(bigObject()))

  {
    const state = create(tinyObject())
    bench(`${name} - update: tiny object`, () => {
      state.count++
    })
  }

  {
    const state = create(bigObject())
    bench(`${name} - update: big object`, () => {
      state.count++
    })
  }

  {
    const state = create(tinyObject())
    bench(`${name} - update + snapshot: tiny object`, () => {
      state.count++
      snapshot(state)
    })
  }

  {
    const state = create(bigObject())
    bench(`${name} - update + snapshot: big object`, () => {
      state.count++
      snapshot(state)
    })
  }
}

suite('staty', staty, snapshot)
suite('valtio', proxy, valtioSnapshot)

run()
