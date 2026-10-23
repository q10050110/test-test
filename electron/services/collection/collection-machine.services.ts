import { assign, createActor, setup } from 'xstate'

export type CollectionOutcome = 'completed' | 'failed' | 'cancelled'
type Event = {
  type:
    | 'START'
    | 'READY'
    | 'COLLECTED'
    | 'EXPAND'
    | 'EXPANDED'
    | 'UPLOAD'
    | 'FINISH'
    | 'CLEANED'
    | 'CANCEL'
    | 'FAIL'
}
export const collectionMachine = setup({
  types: { events: {} as Event, context: {} as { outcome: CollectionOutcome } },
  actions: {
    cancel: assign({ outcome: 'cancelled' as const }),
    fail: assign({ outcome: 'failed' as const }),
  },
  guards: {
    cancelled: ({ context }) => context.outcome === 'cancelled',
    failed: ({ context }) => context.outcome === 'failed',
  },
}).createMachine({
  id: 'collection',
  context: { outcome: 'completed' },
  initial: 'idle',
  states: {
    idle: { on: { START: 'running', CANCEL: { target: 'cleaning', actions: 'cancel' } } },
    running: {
      initial: 'initializing',
      on: {
        CANCEL: { target: 'cleaning', actions: 'cancel' },
        FAIL: { target: 'cleaning', actions: 'fail' },
      },
      states: {
        initializing: { on: { READY: 'collecting' } },
        collecting: { on: { COLLECTED: 'draining' } },
        draining: {
          on: { EXPAND: 'expanding', UPLOAD: 'uploading', FINISH: '#collection.cleaning' },
        },
        expanding: { on: { EXPANDED: 'drainingExpansion' } },
        drainingExpansion: { on: { UPLOAD: 'uploading', FINISH: '#collection.cleaning' } },
        uploading: { on: { FINISH: '#collection.cleaning' } },
      },
    },
    cleaning: {
      on: {
        FAIL: { actions: 'fail' },
        CLEANED: [
          { guard: 'cancelled', target: 'cancelled' },
          { guard: 'failed', target: 'failed' },
          { target: 'completed' },
        ],
      },
    },
    completed: { type: 'final' },
    cancelled: { type: 'final' },
    failed: { type: 'final' },
  },
})
export function createCollectionActor() {
  return createActor(collectionMachine).start()
}
