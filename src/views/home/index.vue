<script setup lang="ts">
import type { Response } from '@/types/index'
import type { HomeData, RecommendedCategories } from '@/types/user'
import { QuestionCircleOutlined, LoginOutlined } from '@ant-design/icons-vue'
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
      <a-tooltip>
        <template #title> 根据OZON中国跨境卖家销售数据推荐选品类目（二级类目） </template>
        <span class="block">推荐选品类目 <QuestionCircleOutlined /></span>
      </a-tooltip>
      <div class="category-grid">
        <div v-for="(item, index) in recommendedCategories" :key="index" class="category-item">
          <div class="recommended-left">
            <span class="dot" :style="{ backgroundColor: colors[index] }"></span>
            <span class="ellipsis-1" style="width: 100px" :title="item.category_name">{{
              item.category_name
            }}</span>
          </div>
          <div class="recommended-right" @click="goSelectGoods(item.parentId, item.categoryId)">
            <span class="border"></span>
            <span style="width: 150px"> 推荐指数：{{ item.rate || 0 }}% </span>
            <LoginOutlined />
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
    width: 585px;
    height: 148px;
    background: url('@/assets/view/home-bg.png') no-repeat center center;
    background-size: cover;
    font-weight: bold;

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
  padding: 20px;
  box-shadow: 0px 2px 10px 0px rgba(0, 0, 0, 0.1);
  border-radius: 10px;
  margin-bottom: 30px;

  .category-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;

    .category-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      border-radius: 6px;
      font-size: 14px;
      color: #333;
      .recommended-left {
        display: flex;
        align-items: center;
        flex: 1.5;
        .dot {
          display: inline-block;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          margin-right: 20px;
        }
      }
      .recommended-right {
        display: flex;
        align-items: center;
        flex: 2;
        cursor: pointer;
        .border {
          display: inline-block;
          width: 1px;
          height: 20px;
          border: 1px solid #d9d9d9;
          margin-right: 30px;
        }
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
</style>
