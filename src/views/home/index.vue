<script setup lang="ts">
// 数据：今日选品 & 巡查数量
const todaySelectedCount = ref(598)
const todayInspectedCount = ref(10560)

// 推荐选品类目（按设计稿分组）
const recommendedCategories = [
  { name: '家用电器', index: 36, color: '#A7C6E7' },
  { name: '儿童用品', index: 36, color: '#AADFBF' },
  { name: '服装', index: 4.87, color: '#A7C6E7' },
  { name: '食用酒水', index: 20, color: '#fadb14' },
  { name: '电子产品', index: 20, color: '#fadb14' },
  { name: '鞋类', index: 2.59, color: '#fadb14' },
  { name: '建筑和装修', index: 12.25, color: '#D7BEE2' },
  { name: '美容和卫生', index: 20, color: '#D7BEE2' },
  { name: '汽车用品', index: 2.47, color: '#D7BEE2' },
  { name: '小百货和配饰', index: 7.92, color: '#F7C8C8' },
  { name: '宠物用品', index: 20, color: '#F7C8C8' },
  { name: '运动与休闲', index: 2.8, color: '#CCD1D1' },
]
</script>

<template>
  <div class="home-page">
    <!-- 顶部统计卡片 -->
    <div class="top-stats">
      <div class="stat-card">
        <div class="title">今日选品数量</div>
        <div class="value">{{ todaySelectedCount }}</div>
      </div>
      <div class="stat-card">
        <div class="title">今日巡查商品数量</div>
        <div class="value">{{ todayInspectedCount }}</div>
      </div>
    </div>

    <!-- 推荐选品类目 -->
    <div class="recommended-categories">
      <h3 class="block">推荐选品类目</h3>
      <div class="category-grid">
        <div v-for="(item, index) in recommendedCategories" :key="index" class="category-item">
          <div class="recommended-left">
            <span class="dot" :style="{ backgroundColor: item.color }"></span>
            <span>{{ item.name }}</span>
          </div>
          <div class="recommended-right">
            <span class="border"></span>
            <span style="flex: 1">推荐指数：{{ item.index }}%</span>
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
  h3 {
    height: 22px;
    line-height: 22px;
    font-weight: 600;
    font-size: 16px;
    color: #333333;
    margin-bottom: 40px;
  }

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
}
</style>
