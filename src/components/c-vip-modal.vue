<script lang="ts" setup>
import { useUserStore } from '@/stores'
import { QuestionCircleOutlined } from '@ant-design/icons-vue'
const userStore = useUserStore()
const userNickname = ref('用户昵称')
const expirationDate = ref('2027-05-08 08:30')

// 会员卡配置
const cards = reactive([
  {
    title: '体验卡',
    price: 0,
  },
  {
    title: '月卡',
    price: 368,
    originalPrice: 499,
  },
  {
    title: '季卡',
    price: 998,
    originalPrice: 1330,
    monthlyPrice: '332',
  },
  {
    title: '年卡',
    price: 3280,
    originalPrice: 4373,
    monthlyPrice: '273',
  },
])

// 当前选中的卡片索引
const selectedCard = ref(0)

const tableList = [
  {
    title: '会员权益对比',
    row1: '每日选品额度',
    row2: '每日巡查店铺数',
    row3: '同时登录设备数',
  },
  {
    title: '体验卡',
    row1: '不限',
    row2: '不限',
    row3: '1',
    vipType: 0,
  },
  {
    title: '月卡',
    row1: '2000',
    row2: '3',
    row3: '1',
    vipType: 1,
  },
  {
    title: '季卡',
    row1: '5000',
    row2: '5',
    row3: '1',
    vipType: 2,
  },
  {
    title: '年卡',
    row1: '不限',
    row2: '不限',
    row3: '1',
    vipType: 3,
  },
]
// 关闭模态框
const closeModal = () => {
  // 这里可以触发关闭事件或执行其他逻辑
  console.log('关闭模态框')
}

const goAgreement = () => {
  window.electronAPI.sendMessage('open-url', 'https://ozon.shopbang.cn/#/vipAgreement')
}
</script>
<template>
  <div class="vip-modal">
    <!-- 模态框头部 -->
    <div class="modal-header">
      <div class="user-info">
        <img src="@/assets/layout/avatar.png" alt="用户头像" class="avatar" />
        <div class="info-text">
          <div class="nickname">{{ userNickname }}</div>
          <div class="version">
            <img
              src="@/assets/view/vip.png"
              alt=""
              style="width: 16px; height: 16px; margin-right: 5px"
            />
            免费版 | 到期时间: {{ expirationDate }}
          </div>
        </div>
      </div>
      <span class="close-btn" @click="userStore.setShowVipModal(false)">×</span>
    </div>

    <div class="vip-main">
      <div class="left">
        <!-- 会员卡选项 -->
        <div class="card-options">
          <div
            v-for="(card, index) in cards"
            :key="index"
            class="card-item"
            @click="selectedCard = index"
            :class="[index === selectedCard ? 'vip-active' : '']"
          >
            <div class="discount-tag">{{ index === 0 ? '新人福利' : '75折特惠' }}</div>
            <div class="card-title">{{ card.title }}</div>
            <div class="current-price">¥{{ card.price }}</div>
            <div class="original-price" v-if="index !== 0">原价 ¥{{ card.originalPrice }}</div>
            <div class="original-price" style="text-decoration: none" v-else>免费开通</div>
          </div>
        </div>

        <!-- 会员权益对比表 -->
        <div class="benefits-comparison">
          <div
            class="benefits-comparison-item"
            v-for="(item, i) in tableList"
            :key="i"
            :class="[selectedCard === item.vipType ? 'vip-active2' : '']"
          >
            <div class="header">
              {{ item.title }}
              <a-tooltip v-if="item.title === '体验卡'">
                <template #title>每个账号只可开通一次体验卡会员</template>
                <QuestionCircleOutlined />
              </a-tooltip>
            </div>
            <div class="body">
              <div class="body-item">{{ item.row1 }}</div>
              <div class="body-item">{{ item.row2 }}</div>
              <div class="body-item">{{ item.row3 }}</div>
            </div>
          </div>
        </div>
      </div>
      <!-- 支付区域 -->
      <div class="payment-section">
        <div class="total-price">¥<span class="price">368</span></div>
        <div class="qr-code-container">
          <img alt="支付二维码" class="qr-code" />
          <div class="refresh-btn">
            <img
              src="@/assets/view/vip-refresh.png"
              alt=""
              style="width: 16px; height: 16px"
            />刷新二维码
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
  <div class="mask"></div>
</template>

<style lang="scss" scoped>
.vip-modal {
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
</style>
