import feedback from './feedback'
export default {
  account: {
    callback: (message: string) => feedback.notifyError(message),
  },
}
