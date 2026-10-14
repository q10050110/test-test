<script setup lang="ts">
import type { Response } from '@/types/index'
import type { HomeData, RecommendedCategories } from '@/types/user'
import { QuestionCircleOutlined, LoginOutlined } from '@ant-design/icons-vue'
import { formatNumberByUnit } from '@/utils/index'
import { useUserStore } from '@/stores'
const userStore = useUserStore()
// 获取选品数据
const dataInfo = ref<HomeData>()
const getDataInfo = async () => {
  const { code, data } = await window.electronAPI.invoke<Response<HomeData>>(
    'get-today-data-count',
    {},
  )
  if (!code) dataInfo.value = data
}
getDataInfo()

// 获取跟卖推荐
const recommendedCategories = ref<RecommendedCategories[]>([])
const getRecommendedCategoriesList = async () => {
  const { code, data } = await window.electronAPI.invoke<any>('get-recommend-category', {})
  if (!code) recommendedCategories.value = data
}
getRecommendedCategoriesList()

const colors = [
  '#FF6B6B', // 活力珊瑚红
  '#4ECDC4', // 清新蒂芙尼蓝
  '#FFE66D', // 明亮柠檬黄
  '#FF9F43', // 温暖橙色
  '#A29BFE', // 柔和薰衣草紫
  '#FD79A8', // 甜美粉红
  '#00CEC9', // 亮青色
  '#FAB1A0', // 杏色
  '#55EFC4', // 薄荷绿
  '#74B9FF', // 天空蓝
  '#FF7675', // 西瓜红
  '#A8E6CF', // 淡薄荷
  '#FF0055', // 霓虹粉
  '#00FF99', // 荧光绿
  '#00CCFF', // 电光蓝
  '#FFCC00', // 亮黄
  '#CC33FF', // 紫罗兰
  '#FF3333', // 鲜红
]

// 跳转选品
const router = useRouter()
const goSelectGoods = (parentCategoryId: string, categoryId: string) => {
  router.push(`/selectGoods?parentCategoryId=${parentCategoryId}&categoryId=${categoryId}`)
}
</script>

<template>
  <div class="home-page">
    <!-- 顶部统计卡片 -->
    <div class="top-stats">
      <div class="stat-card">
        <div class="title">今日选品数量</div>
        <div class="value">{{ dataInfo?.pickCount || 0 }}</div>
      </div>
      <div class="stat-card">
        <div class="title">今日巡查商品数量</div>
        <div class="value">{{ dataInfo?.followSellCount || 0 }}</div>
      </div>
    </div>

    <!-- 推荐选品类目 -->
    <div class="recommended-categories">
      <img
        src="@/assets/view/vip-mask.png"
        alt=""
        class="vip-mask"
        v-if="userStore.user?.auto_vip_type === 0"
      />
      <a-tooltip>
        <template #title> 根据OZON中国跨境卖家销售数据推荐选品类目（二级类目） </template>
        <span class="block">推荐选品类目 <QuestionCircleOutlined /></span>
      </a-tooltip>
      <div class="category-grid">
        <div v-for="(item, index) in recommendedCategories" :key="index" class="category-item">
          <div class="category-header">
            <div class="recommended-left">
              <span class="dot" :style="{ backgroundColor: colors[index] }"></span>
              <span class="ellipsis-1" style="width: 100px" :title="item.category_name">{{
                item.category_name
              }}</span>
            </div>
            <span style="width: 150px; text-align: right"> 推荐指数：{{ item.rate || 0 }}% </span>
          </div>
          <div class="recommended-body">
            <a-tooltip color="#fff">
              <template #title>
                <h3 style="color: #333; font-size: 14px">类目月销售数据</h3>
                <div>
                  <span class="home-label">销售量：</span
                  ><span class="home-value">{{ formatNumberByUnit(item.metric_items) || 0 }}</span>
                </div>
                <div>
                  <span class="home-label">销售额：</span
                  ><span class="home-value">
                    {{ formatNumberByUnit(item.metric_gmv) || 0 }}(₽)
                  </span>
                </div>
                <div>
                  <span class="home-label">销售动态：</span
                  ><span
                    class="home-value"
                    :style="{
                      color: item.metric_gmv_growth < 0 ? '#fa1c1e' : '#4ecd4e',
                    }"
                    >{{ item.metric_gmv_growth }}%</span
                  >
                </div>
                <div>
                  <span class="home-label">成交率：</span
                  ><span class="home-value">{{ item.metric_buyout }}%</span>
                </div>
                <div>
                  <span class="home-label">退货率：</span
                  ><span class="home-value" style="color: #fa1c1e">{{ item.metric_refund }}%</span>
                </div>
                <div>
                  <span class="home-label">平均价格：</span
                  ><span class="home-value">{{ item.metric_aiv }}(₽)</span>
                </div>
                <div>
                  <span class="home-label">平均价格动态：</span
                  ><span class="home-value" style="color: #fa1c1e"
                    >{{ item.metric_aiv_growth || 0 }}%</span
                  >
                </div>
                <div>
                  <span class="home-label">品牌数量：</span
                  ><span class="home-value">{{ item.metric_brands }}</span>
                </div>
                <div>
                  <span class="home-label">大卖家占比：</span
                  ><span class="home-value">{{ item.metric_leader_share }}%</span>
                </div>
              </template>
              <div>
                <span class="recommended-body-title">月销量：</span>
                <span class="recommended-data">{{
                  formatNumberByUnit(item.metric_items) || 0
                }}</span>
              </div>
              <div style="margin: 5px 0">
                <span class="recommended-body-title"> 月销售额： </span>
                <span class="recommended-data">{{ formatNumberByUnit(item.metric_gmv) || 0 }}</span>
              </div>
            </a-tooltip>
          </div>
          <div @click="goSelectGoods(item.parentId, item.categoryId)" class="recommended-link">
            创建选品任务<LoginOutlined style="margin-left: 5px" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.home-page {
  padding: 20px;
  height: 100%;
  background-color: #fff;
  border-radius: 10px;
  box-sizing: border-box;
}

.top-stats {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 20px;

  .stat-card {
    padding: 28px 50px 0px 50px;
    width: 49%;
    height: 148px;
    background: url('@/assets/view/home-bg.png') no-repeat center center;
    background-size: cover;
    font-weight: bold;
    &:last-child {
      background: url('@/assets/view/home-bg2.png') no-repeat center center;
      background-size: cover;
    }
    .title {
      font-size: 20px;
      color: #1f5fff;
    }

    .value {
      height: 58px;
      line-height: 58px;
      font-size: 40px;
      color: #333333;
      font-weight: 600;
    }
  }
}

.recommended-categories {
  padding: 20px 20px 10px;
  box-shadow: 0px 2px 10px 0px rgba(0, 0, 0, 0.1);
  border-radius: 10px;
  margin-bottom: 30px;
  position: relative;
  .vip-mask {
    width: 100%;
    height: 100%;
    position: absolute;
    inset: 0;
    z-index: 9;
  }
  .category-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;

    .category-item {
      cursor: pointer;
      width: 24%;
      padding: 20px 10px 10px;
      border-radius: 5px;
      font-size: 14px;
      background: #f4f6f9;

      .category-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        height: 22px;
        line-height: 22px;
        margin-bottom: 10px;
        .recommended-left {
          display: flex;
          align-items: center;
          font-weight: 500;
          font-size: 16px;
          color: #333333;

          .dot {
            display: inline-block;
            width: 14px;
            height: 14px;
            border-radius: 50%;
            margin-right: 10px;
          }
        }
      }
      .recommended-body {
        display: flex;
        flex-direction: column;
        padding-left: 10px;
        .recommended-body-title {
          display: inline-block;
          width: 80px;
          font-weight: 400;
          font-size: 14px;
          color: #999999;
          line-height: 20px;
        }
        .recommended-data {
          font-weight: 500;
          font-size: 14px;
          color: #1f5fff;
        }
      }
      .recommended-link {
        text-align: right;
        font-weight: 400;
        font-size: 12px;
        color: #1f5fff;
      }
    }
  }
}

.block {
  &::before {
    content: '';
    display: inline-block;
    width: 1px;
    height: 12px;
    border: 2px solid #1f5fff;
    margin-right: 5px;
  }
  display: inline-block;
  height: 22px;
  line-height: 22px;
  font-weight: 600;
  font-size: 16px;
  color: #333333;
  margin-bottom: 20px;
}

.home-label {
  font-size: 12px;
  color: #999999;
}

.home-value {
  font-size: 12px;
  color: #333333;
}
</style>
