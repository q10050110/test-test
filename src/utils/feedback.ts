import { message as AntMessage, Modal, notification } from 'ant-design-vue'
import type { ModalFuncProps } from 'ant-design-vue'

class Feedback {
  /* ================= message ================= */

  success(content: string) {
    AntMessage.success(content)
  }

  error(content: string) {
    AntMessage.error(content)
  }

  warning(content: string) {
    AntMessage.warning(content)
  }

  info(content: string) {
    AntMessage.info(content)
  }

  loading(content: string, duration = 0) {
    return AntMessage.loading(content, duration)
  }

  /* ================= confirm ================= */

  confirm(
    content: string,
    options?: Partial<ModalFuncProps>
  ): Promise<boolean> {
    return new Promise(resolve => {
      Modal.confirm({
        title: options?.title ?? '提示',
        content,
        okText: options?.okText ?? '确定',
        cancelText: options?.cancelText ?? '取消',
        centered: true,
        onOk() {
          resolve(true)
        },
        onCancel() {
          resolve(false)
        },
        ...options
      })
    })
  }

  /* ================= notification ================= */

  notify(
    description: string,
    type: 'success' | 'info' | 'warning' | 'error' = 'info',
    title = '提示'
  ) {
    notification[type]({
      message: title,
      description,
      duration: 3
    })
  }

  notifySuccess(desc: string, title = '成功') {
    this.notify(desc, 'success', title)
  }

  notifyError(desc: string, title = '错误') {
    this.notify(desc, 'error', title)
  }

  notifyWarning(desc: string, title = '警告') {
    this.notify(desc, 'warning', title)
  }
}

const feedback = new Feedback()
export default feedback