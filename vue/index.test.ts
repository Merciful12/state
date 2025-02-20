import '@testing-library/jest-dom/extend-expect'
import Vue, { Component } from 'vue'
import VueTesting from '@testing-library/vue'
import { delay } from 'nanodelay'

import { createStore, defineMap } from '../index.js'
import { useStore } from './index.js'

let { defineComponent, computed, nextTick, ref, h } = Vue
let { render, screen } = VueTesting

function getCatcher(cb: () => void): [string[], Component] {
  let errors: string[] = []
  let Catcher = defineComponent(() => {
    try {
      cb()
    } catch (e) {
      errors.push(e.message)
    }
    return () => null
  })
  return [errors, Catcher]
}

it('throws on builder instead of store', () => {
  let Test = (): void => {}
  let [errors, Catcher] = getCatcher(() => {
    // @ts-expect-error
    useStore(Test, 'ID')
  })
  render(h(Catcher))
  expect(errors).toEqual([
    'Use useStore(Builder(id)) or useSync() ' +
      'from @logux/state/sync/vue for builders'
  ])
})

it('renders simple store', async () => {
  let events: string[] = []
  let renders = 0

  let letterStore = createStore<string>(() => {
    events.push('constructor')
    letterStore.set('a')
    return () => {
      events.push('destroy')
    }
  })

  let Test1 = defineComponent(() => {
    let store = useStore(letterStore)
    return () => {
      renders += 1
      return h('div', { 'data-testid': 'test1' }, store.value)
    }
  })

  let Test2 = defineComponent(() => {
    let store = useStore(letterStore)
    return () => h('div', { 'data-testid': 'test2' }, store.value)
  })

  let Wrapper = defineComponent(() => {
    let show = ref(true)
    return () =>
      h('div', [
        h('button', {
          onClick: () => {
            show.value = false
          }
        }),
        show.value && h(Test1),
        show.value && h(Test2)
      ])
  })

  render(Wrapper)
  expect(events).toEqual(['constructor'])
  expect(screen.getByTestId('test1')).toHaveTextContent('a')
  expect(screen.getByTestId('test2')).toHaveTextContent('a')
  expect(renders).toEqual(1)

  letterStore.set('b')
  letterStore.set('c')
  await nextTick()

  expect(screen.getByTestId('test1')).toHaveTextContent('c')
  expect(screen.getByTestId('test2')).toHaveTextContent('c')
  expect(renders).toEqual(2)

  screen.getByRole('button').click()
  await nextTick()
  expect(screen.queryByTestId('test')).not.toBeInTheDocument()
  expect(renders).toEqual(2)
  await delay(1020)

  expect(events).toEqual(['constructor', 'destroy'])
})

it('does not reload store on component changes', async () => {
  let destroyed = ''
  let simpleStore = createStore<string>(() => {
    simpleStore.set('S')
    return () => {
      destroyed += 'S'
    }
  })
  let MapStore = defineMap<{ id: string }>((store, id) => {
    return () => {
      destroyed += id
    }
  })

  let TestA = defineComponent(() => {
    let simple = useStore(simpleStore)
    let map = useStore(MapStore('M'))
    let text = computed(() => `1 ${simple.value} ${map.value.id}`)
    return () => h('div', { 'data-testid': 'test' }, text.value)
  })

  let TestB = defineComponent(() => {
    let simple = useStore(simpleStore)
    let map = useStore(MapStore('M'))
    let text = computed(() => `2 ${simple.value} ${map.value.id}`)
    return () => h('div', { 'data-testid': 'test' }, text.value)
  })

  let Switcher = defineComponent(() => {
    let state = ref('a')
    return () => {
      if (state.value === 'a') {
        return h('div', {}, [
          h('button', {
            onClick: () => {
              state.value = 'b'
            }
          }),
          h(TestA)
        ])
      } else if (state.value === 'b') {
        return h('div', {}, [
          h('button', {
            onClick: () => {
              state.value = 'none'
            }
          }),
          h(TestB)
        ])
      } else {
        return null
      }
    }
  })

  render(Switcher)
  expect(screen.getByTestId('test')).toHaveTextContent('1 S M')

  screen.getByRole('button').click()
  await nextTick()
  expect(screen.getByTestId('test')).toHaveTextContent('2 S M')
  expect(destroyed).toEqual('')

  screen.getByRole('button').click()
  await nextTick()
  expect(screen.queryByTestId('test')).not.toBeInTheDocument()
  expect(destroyed).toEqual('')

  await delay(1020)
  expect(destroyed).toEqual('SM')
})
