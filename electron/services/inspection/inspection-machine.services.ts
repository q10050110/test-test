import { assign, createActor, setup } from 'xstate'

const machine = setup({
  types: { context: {} as { outcome: 'completed' | 'failed' | 'cancelled' }, events: {} as { type: 'START' | 'READY' | 'SAVE' | 'SAVED' | 'FINISH' | 'FAIL' | 'CANCEL' | 'CLEANED' } },
  actions: { fail: assign({ outcome: 'failed' as const }), cancel: assign({ outcome: 'cancelled' as const }) },
}).createMachine({
  id: 'inspection', initial: 'idle', context: { outcome: 'completed' },
  states: {
    idle: { on: { START: 'running', CANCEL: { target: 'cleaning', actions: 'cancel' } } },
    running: {
      initial: 'opening',
      states: { opening: { on: { READY: 'scanning' } }, scanning: { on: { SAVE: 'saving' } }, saving: { on: { SAVED: 'scanning' } } },
      on: { FINISH: 'cleaning', FAIL: { target: 'cleaning', actions: 'fail' }, CANCEL: { target: 'cleaning', actions: 'cancel' } },
    },
    cleaning: { on: { FAIL: { actions: 'fail' }, CLEANED: [
      { guard: ({ context }) => context.outcome === 'failed', target: 'failed' },
      { guard: ({ context }) => context.outcome === 'cancelled', target: 'cancelled' }, { target: 'completed' },
    ] } },
    completed: { type: 'final' }, failed: { type: 'final' }, cancelled: { type: 'final' },
  },
})
export const createInspectionActor = () => createActor(machine).start()
