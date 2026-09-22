<script lang="ts" setup>
import { useUserStore } from '@/stores'
import { QuestionCircleOutlined, LoadingOutlined } from '@ant-design/icons-vue'
import type { Response } from '@/types'
import type { VipInfo, VipPayInfo, VipResult, VipPayResult } from '@/types/user'
import { Modal } from 'ant-design-vue'
import dayjs from 'dayjs'
import feedback from '@/utils/feedback'
import VueQrcode from 'vue-qrcode'
const userStore = useUserStore()
const loading = ref(false)
// 当前选中的卡片索引
const selectedCard = ref(1)
const tableList = ref<VipInfo[]>([])

const goAgreement = () => {
  window.electronAPI.sendMessage('open-url', 'https://ozon.shopbang.cn/#/vipAgreement')
}

// 选择会员
const selectHandle = (type: number) => {
  hasPay.value = false
  payInfo.value = undefined
  clearInterval(timer.value)
  timer.value = undefined
  clearInterval(resultTimer.value)
  resultTimer.value = undefined
  selectedCard.value = type
}

// 获取配置
const getVipOption = async () => {
  const { data, code } = await window.electronAPI.invoke<Response<VipInfo[]>>('get-vip-info', {})
  if (!code)
    tableList.value = [
      {
        vip_name: '会员权益对比',
        day_pick_count: '每日选品额度',
        device_limit: '同时登录设备数',
        auto_vip_type: 99,
        days: 0,
        price: 0,
        original_price: 0,
      },
      ...data,
    ]
  loading.value = false
}

// 获取支付信息
const hasPay = ref(false)
const payInfo = ref<VipResult>()
const getPayLoading = ref(false)
const currentSelectVipInfo = computed(() =>
  tableList.value.find((item) => item.auto_vip_type === selectedCard.value),
)

const paySuccess = () => {
  userStore.setShowVipModal(false)
  userStore.getUser()
  feedback.success('开通会员成功！')
}

const resultTimer = ref<number | undefined>(undefined)
const queryPayResult = async () => {
  if (resultTimer.value) return
  resultTimer.value = setInterval(async () => {
    const { code, data } = await window.electronAPI.invoke<Response<VipPayResult>>(
      'get-vip-pay-result',
      {
        mchOrderNo: payInfo.value?.mchOrderNo,
      },
    )
    if (!code && data?.state === 3) {
      clearInterval(resultTimer.value)
      resultTimer.value = undefined
      paySuccess()
    }
  }, 1000)
}
const payHandle = async () => {
  const { data, code, message } = await window.electronAPI.invoke<Response<VipResult>>('pay-vip', {
    auto_vip_type: selectedCard.value,
  })
  if (!code) {
    if (selectedCard.value === 1) return paySuccess()
    hasPay.value = true
    payInfo.value = data
    queryPayResult()
  } else {
    feedback.error(message)
  }
}
const getPayInfo = async () => {
  if (userStore.user?.auto_vip_type && selectedCard.value === 1)
    return feedback.warning('您已经是会员，不能开通体验卡会员')
  getPayLoading.value = true
  const { data: VipInfo } = await window.electronAPI.invoke<Response<VipPayInfo>>(
    'get-vip-pay-info',
    {
      auto_vip_type: selectedCard.value,
    },
  )
  const contentVNode = h('div', {}, [
    h(
      'div',
      { style: 'margin-bottom: 8px;' },
      `即将开通自动化会员-${currentSelectVipInfo.value?.vip_name}${currentSelectVipInfo.value?.auto_vip_type === 0 ? '（每个账号只允许开通一次' : ''}`,
    ),
    VipInfo.exchangeDay > 0 ? h('div', {}, `原月卡剩余时长兑换天数：${VipInfo.exchangeDay}天`) : '',

    h(
      'div',
      { style: 'margin-bottom: 8px;' },
      `此次充值会员时长：${currentSelectVipInfo.value?.days}天`,
    ),
    h('div', {}, `到期时间：${dayjs().add(1, 'day').format('YYYY-MM-DD HH:mm:ss')}`),
  ])
  getPayLoading.value = false
  Modal.confirm({
    title: '开通/续费确认',
    content: contentVNode,
    onOk: async () => {
      await payHandle()
    },
  })
}

// 刷新二维码
const timer = ref<number | undefined>(undefined)
const countDown = ref(0)
const refreshQrcode = async () => {
  if (timer.value) return
  countDown.value = 60
  timer.value = setInterval(() => {
    countDown.value--
    if (countDown.value <= 0) {
      clearInterval(timer.value)
      timer.value = undefined
      countDown.value = 0
    }
  }, 1000)
  await payHandle()
}

watch(
  () => userStore.hasShowVipModal,
  (val) => {
    if (val) {
      userStore.getUser()
      loading.value = true
      hasPay.value = false
      payInfo.value = undefined
      getVipOption()
    } else {
      clearInterval(timer.value)
      timer.value = undefined
      clearInterval(resultTimer.value)
      resultTimer.value = undefined
    }
  },
)

// 会员格式化
const vipMap = [
  {
    name: '体验会员',
    value: 1,
  },
  {
    name: '月卡会员',
    value: 2,
  },
  {
    name: '季卡会员',
    value: 3,
  },
  {
    name: '年卡会员',
    value: 4,
  },
]
const formatVip = (type: number | undefined) => {
  return vipMap.find((item) => item.value === type)?.name || '免费会员'
}

const formatData = (date: number | string) => {
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss')
}
</script>
<template>
  <div>
    <div class="vip-modal">
      <div v-if="loading" class="vip-loading">
        <LoadingOutlined />
        会员加载中...
      </div>
      <div v-else>
        <!-- 模态框头部 -->
        <div class="modal-header">
          <div class="user-info">
            <img src="@/assets/layout/avatar.png" alt="用户头像" class="avatar" />
            <div class="info-text">
              <div class="nickname">{{ userStore.user?.name }}</div>
              <div class="version">
                <img
                  src="@/assets/view/vip.png"
                  alt=""
                  style="width: 16px; height: 16px; margin-right: 5px"
                />
                {{ formatVip(userStore.user?.auto_vip_type) }} | 到期时间:
                {{ userStore.user?.expire_time ? formatData(userStore.user?.expire_time) : '无' }}
              </div>
            </div>
          </div>
          <span class="close-btn" @click="userStore.setShowVipModal(false)">×</span>
        </div>

        <div class="vip-main">
          <div class="left">
            <!-- 会员卡选项 -->
            <div class="card-options">
              <template v-for="(card, index) in tableList" :key="index">
                <div
                  class="card-item"
                  @click="selectHandle(card.auto_vip_type)"
                  :class="[index === selectedCard ? 'vip-active' : '']"
                  v-if="index !== 0"
                >
                  <div class="discount-tag">
                    {{ card.auto_vip_type === 1 ? '新人福利' : '75折特惠' }}
                  </div>
                  <div class="card-title">{{ card.vip_name }}</div>
                  <div class="current-price">¥{{ card.price }}</div>
                  <div class="original-price" v-if="index !== 0">
                    原价 ¥{{ card.original_price }}
                  </div>
                  <div class="original-price" style="text-decoration: none" v-else>免费开通</div>
                </div>
              </template>
            </div>

            <!-- 会员权益对比表 -->
            <div class="benefits-comparison">
              <div
                class="benefits-comparison-item"
                v-for="(item, i) in tableList"
                :key="i"
                :class="[selectedCard === item.auto_vip_type ? 'vip-active2' : '']"
              >
                <div class="header">
                  {{ item.vip_name }}
                  <a-tooltip v-if="item.auto_vip_type === 1">
                    <template #title>每个账号只可开通一次体验卡会员</template>
                    <QuestionCircleOutlined />
                  </a-tooltip>
                </div>
                <div class="body">
                  <div class="body-item">
                    {{ item.day_pick_count === -1 ? '不限' : item.day_pick_count }}
                  </div>
                  <div class="body-item">
                    {{ item.auto_vip_type == 99 ? '每日巡查店铺数' : '不限' }}
                  </div>
                  <div class="body-item">{{ item.device_limit }}</div>
                </div>
              </div>
            </div>
          </div>
          <!-- 支付区域 -->
          <div class="payment-section">
            <div class="total-price">
              ¥<span class="price">{{ currentSelectVipInfo?.price }}</span>
            </div>
            <div class="qr-code-container" v-if="!hasPay">
              <a-button
                type="primary"
                @click="getPayInfo"
                style="margin-bottom: 20px"
                :loading="getPayLoading"
              >
                {{ currentSelectVipInfo?.auto_vip_type !== 1 ? '立即支付' : '立即开通' }}</a-button
              >
              <div class="payment-instructions">
                支付即视为你同意
                <a href="javascript:;" class="agreement-link" @click="goAgreement">会员协议</a>
                条例
              </div>
            </div>
            <div class="qr-code-container" v-else>
              <VueQrcode
                v-if="payInfo?.payInfo"
                :value="payInfo?.payInfo"
                alt="支付二维码"
                class="qr-code"
                :color="{ dark: '#000000', light: '#ffffff' }"
                type="image/png"
              />
              <div class="refresh-btn" @click="refreshQrcode">
                <img
                  src="@/assets/view/vip-refresh.png"
                  alt=""
                  style="width: 16px; height: 16px"
                  :class="[countDown > 0 ? 'rotate' : '']"
                />
                刷新二维码 &nbsp;
                {{ countDown ? `${countDown}后重新获取` : '' }}
              </div>

              <div class="payment-instructions">
                使用
                <span style="color: #333; font-size: 14px; font-weight: 500">微信/支付宝</span>
                扫码支付<br />
                支付即视为你同意
                <a href="javascript:;" class="agreement-link" @click="goAgreement">会员协议</a>
                条例
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="mask"></div>
  </div>
</template>

<style lang="scss" scoped>
.vip-modal {
  -webkit-app-region: no-drag;
  width: 100%;
  padding: 20px;
  max-width: 1100px;
  margin: 0 auto;
  background: url('@/assets/view/vip-bg.png');
  background-size: cover;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  height: 652px;
  z-index: 100;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 20px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  object-fit: cover;
}

.nickname {
  font-size: 16px;
  font-weight: 500;
  color: #333;
  margin-bottom: 10px;
}

.version {
  display: flex;
  align-items: center;
  font-size: 12px;
  color: #1f5fff;
  font-weight: 500;
}

.close-btn {
  background: none;
  border: none;
  font-size: 32px;
  cursor: pointer;
  color: #666;
  line-height: 0;
}

.card-options {
  display: flex;
  gap: 26px;
  padding: 30px 20px;
  background: #ffffff;
  border-radius: 5px;
  box-shadow: 0px 2px 10px 0px rgba(0, 0, 0, 0.1);
}

.card-item {
  padding-top: 30px;
  width: 161px;
  height: 191px;
  background: url('@/assets/view/vip-item.png');
  background-size: cover;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
  border-radius: 5px;
  .discount-tag {
    position: absolute;
    left: -4px;
    top: 16px;
    font-weight: 500;
    font-size: 0.875rem;
    color: #ffffff;
    transform: rotate(-46deg);
  }
}

.card-item.active {
  border-color: #007bff;
  background: #e6f7ff;
}

.card-title {
  font-weight: 600;
  font-size: 25px;
  color: #333333;
}

.current-price {
  font-weight: 600;
  font-size: 30px;
  color: #333333;
  line-height: 56px;
  height: 56px;
  margin-bottom: 5px;
}

.original-price {
  font-weight: 400;
  font-size: 16px;
  color: #999999;
  line-height: 22px;
  height: 22px;
  margin-bottom: 10px;
  text-decoration: line-through;
}

.monthly-price {
  width: 100%;
  position: absolute;
  left: 0;
  bottom: 0;
  height: 30px;
  background: #e8efff;
  font-weight: 400;
  font-size: 14px;
  color: #1f5fff;
  line-height: 30px;
  border-bottom-left-radius: 5px;
  border-bottom-right-radius: 5px;
}

.benefits-comparison {
  width: 760px;
  height: 268px;
  background: url('@/assets/view/vip-table-bg.png');
  margin-top: 20px;
  background-size: contain;
  border-radius: 5px;
  box-shadow: 0px 2px 10px 0px rgba(0, 0, 0, 0.1);
  display: flex;
  text-align: center;
  &-item {
    flex: 1;
    .header {
      height: 85px;
      line-height: 85px;
      font-weight: 600;
      font-size: 18px;
      color: #333333;
    }

    .body {
      height: 180px;
      display: flex;
      flex-direction: column;
      justify-content: space-evenly;
      align-items: center;
      .body-item {
        font-weight: 500;
        font-size: 14px;
        color: #666666;
      }
    }
  }
}

.payment-section {
  width: 280px;
  padding: 60px 0 80px 0;
  background: #fff;
  text-align: center;
  box-shadow: 0px 2px 10px 0px rgba(0, 0, 0, 0.1);
  border-radius: 5px;
}

.total-price {
  height: 58px;
  line-height: 58px;
  font-weight: bold;
  color: #fa1c1e;
  font-size: 16px;
  margin-bottom: 32px;
  .price {
    font-weight: 600;
    font-size: 25px;
  }
}

.qr-code-container {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.qr-code {
  width: 212px;
  height: 212px;
  margin-bottom: 20px;
  border: 1px solid #ccc;
}

.refresh-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  font-weight: 600;
  font-size: 12px;
  color: #1f5fff;
  margin-bottom: 15px;
}

.payment-instructions {
  font-size: 14px;
  color: #666;
  line-height: 1.5;
}

.agreement-link {
  color: #1f5fff;
}

.vip-main {
  display: flex;
  .left {
    flex: 1;
    margin-right: 20px;
  }
}

.mask {
  position: fixed;
  inset: 0;
  background-color: rgba(51, 51, 51, 0.3);
  z-index: 99;
}

.vip-active {
  background: url('@/assets/view/vip-active.png');
  background-size: cover;
}

.vip-active2 {
  background: url('@/assets/view/vip-active2.png');
  background-size: cover;
}

.vip-loading {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  font-size: 20px;
}

.rotate {
  transform: rotate(360deg);
  transition: all 1s ease;
}
</style>
