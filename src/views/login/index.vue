<script setup lang="ts">
import { loginAPI } from '@/api/login';
import type { Login } from '@/types/login';
import type { FormInstance } from 'ant-design-vue'
import type { Rule } from 'ant-design-vue/es/form';
import feedback from '@/utils/feedback';
import { useUserStore } from '@/stores';
// 表单数据
const formData = ref<Login>({
  phone: '',
  pwd: ''
})
const formRef = ref<FormInstance>()
const rules: Record<string, Rule[]> = {
  phone: [
    { required: true, message: '请输入手机号', trigger: ['blur', 'change'] },
    { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号', trigger: ['blur', 'change'] }
  ],
  pwd: [
    { required: true, message: '请输入密码', trigger: ['blur', 'change'] },
    { min: 6, message: '密码长度不能小于6位', trigger: ['blur', 'change'] }
  ]
}

// 记住密码
const rememberPassword = ref(false)
const changeHandle = async () => {
  if (rememberPassword.value) {
    await window.electronStore.set('loginInfo', {
      phone: formData.value.phone,
      pwd: formData.value.pwd,
      rememberPassword: rememberPassword.value
    })
  } else {
    await window.electronStore.delete('loginInfo')
  }
}
const initHandle = async () => {
  const loginInfo = await window.electronStore.get('loginInfo')
  if (loginInfo) {
    formData.value.phone = loginInfo.phone
    formData.value.pwd = loginInfo.pwd
    rememberPassword.value = loginInfo.rememberPassword
  }
}

initHandle()
// 登录
const router = useRouter()
const store = useUserStore()
const loginHandle = async () => {
  await formRef.value?.validate()
  const { data, code, message } = await loginAPI(formData.value)
  if (code === 0) {
    store.setToken(data.token)
    feedback.success('登录成功！')
    router.push('/')
  }
}
// 跳转上品帮注册&忘记密码外链
const accountHandle = (type: 'register' | 'resetPassword') => {
  window.electronAPI.sendMessage('account', type)
}

// 隐藏&关闭
const operationHandle = (type: 'hide' | 'close') => {
  window.electronAPI.sendMessage('window', type)
}
</script>

<template>
  <div class="login-page">
    <div class="login-container">
      <!-- 左侧背景图 -->
      <div class="login-left">
        <img src="@/assets/login/background.png" alt="Background" class="background-img" />
        <div class="left-content">
          <p>文字还没想好，文字还没想好，文字还没想好</p>
          <p>文字还没想好文字还没想好文字还没想好文字还没想好文字还没</p>
        </div>
      </div>

      <!-- 右侧登录表单 -->
      <div class="login-right">
        <div class="logo-container">
          <img src="@/assets/login/logo.png" alt="Logo" class="logo" />
        </div>

        <div class="welcome-text">
          欢迎使用<span class="link">上品帮自动化助手</span>
        </div>

        <a-form :model="formData" ref="formRef" :rules="rules">
          <a-form-item name="phone">
            <a-input v-model:value="formData.phone" @pressEnter="loginHandle" placeholder="请输入手机号"></a-input>
          </a-form-item>
          <a-form-item name="pwd">
            <a-input v-model:value="formData.pwd" @pressEnter="loginHandle" placeholder="请输入密码"
              type="password"></a-input>
          </a-form-item>
          <a-form-item>
            <a-checkbox v-model:checked="rememberPassword" @change="changeHandle">记住密码</a-checkbox>
          </a-form-item>
          <a-form-item>
            <a-button type="primary" block style="height:40px" @click="loginHandle">立即登录</a-button>
          </a-form-item>
        </a-form>

        <div class="other-actions">
          <div @click.prevent="accountHandle('register')">没有帐号？去<span class="link">注册</span></div>
          <div @click.prevent="accountHandle('resetPassword')" class="link">忘记密码？</div>
        </div>
      </div>
    </div>
    <div class="operation">
      <img src="@/assets/window/suoxiao.png" alt="" @click="operationHandle('hide')">
      <img src="@/assets/window/guanbi.png" alt="" @click="operationHandle('close')">
    </div>
  </div>
</template>

<style lang="scss" scoped>
.login-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  position: relative;

  .operation {
    position: absolute;
    top: 0;
    right: 0;
    padding: 20px;

    img:last-child {
      margin-left: 15px;
    }

    img {
      width: 25px;
      height: 25px;
    }
  }
}

.login-container {
  display: flex;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  box-shadow: 0 6px 16px -8px rgba(0, 0, 0, 0.08),
    0 9px 28px 0 rgba(0, 0, 0, 0.05),
    0 12px 48px 16px rgba(0, 0, 0, 0.03);
}

.login-left {
  flex: 1.2;
  background-color: #1f5fff;
  position: relative;
  overflow: hidden;
  padding: 50px 40px;

  .background-img {
    width: 50%;
    height: 50%;
    min-width: 460px;
    min-height: 460px;
    object-fit: contain;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }

  .left-content {
    position: absolute;
    bottom: 40px;
    left: 50%;
    transform: translateX(-50%);
    color: white;
    text-align: center;
    padding: 0 20px;

    p {
      margin: 8px 0;
      font-size: 14px;
      opacity: 0.8;
    }
  }
}

.login-right {
  flex: 1;
  background-color: white;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 80px;

  .logo-container {
    margin-bottom: 32px;

    .logo {
      width: 160px;
      height: auto;
    }
  }

  .welcome-text {
    font-size: 26px;
    margin-bottom: 40px;
  }

  .remember-password {
    display: flex;
    align-items: center;
    margin-bottom: 24px;

    .ant-checkbox {
      margin-right: 8px;
    }
  }

  .login-button {
    background-color: #1f5fff;
    border-color: #1f5fff;
    color: white;
    font-weight: 500;

    &:hover {
      background-color: #0052cc;
      border-color: #0052cc;
    }
  }

  .other-actions {
    margin-top: 24px;
    width: 100%;
    display: flex;
    justify-content: space-between;

    a {
      color: #1890ff;
      font-size: 14px;

      &:hover {
        color: #40a9ff;
      }
    }
  }

  .link {
    color: #1f71ff;

  }

}
</style>