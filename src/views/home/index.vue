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
  <div class="box-border h-full rounded-[10px] bg-white p-5 overflow-hidden">
    <!-- 顶部统计卡片 -->
    <div class="mb-5 flex justify-between gap-5">
      <div
        class="h-[148px] w-[49%] bg-[url('@/assets/view/home-bg.png')] bg-cover bg-center bg-no-repeat px-[50px] pt-7 font-bold"
      >
        <div class="text-xl text-[#1f5fff]">今日选品数量</div>
        <div class="h-[58px] text-[40px] leading-[58px] font-semibold text-[#333]">
          {{ dataInfo?.pickCount || 0 }}
        </div>
      </div>

      <div
        class="h-[148px] w-[49%] bg-[url('@/assets/view/home-bg2.png')] bg-cover bg-center bg-no-repeat px-[50px] pt-7 font-bold"
      >
        <div class="text-xl text-[#1f5fff]">今日巡查商品数量</div>
        <div class="h-[58px] text-[40px] leading-[58px] font-semibold text-[#333]">
          {{ dataInfo?.followSellCount || 0 }}
        </div>
      </div>
    </div>

    <!-- 推荐选品类目 -->
    <div
      class="relative mb-[30px] rounded-[10px] px-5 pt-5 pb-[10px] shadow-[0_2px_10px_rgba(0,0,0,0.1)]"
    >
      <!-- VIP 遮罩 -->
      <img
        v-if="userStore.user?.auto_vip_type === 0"
        src="@/assets/view/vip-mask.png"
        alt=""
        class="absolute left-[0] top-[0] z-[9] h-full w-full"
      />

      <!-- 标题 -->
      <a-tooltip>
        <template #title> 根据OZON中国跨境卖家销售数据推荐选品类目（二级类目） </template>

        <span
          class="mb-5 inline-block h-[22px] text-base leading-[22px] font-semibold text-[#333] before:mr-[5px] before:inline-block before:h-3 before:w-px before:border-2 before:border-[#1f5fff] before:content-['']"
        >
          推荐选品类目
          <QuestionCircleOutlined />
        </span>
      </a-tooltip>

      <!-- 类目列表 -->
      <div class="flex flex-wrap gap-3">
        <div
          v-for="(item, index) in recommendedCategories"
          :key="index"
          class="box-border w-[calc((100%-36px)/4)] cursor-pointer rounded-[5px] bg-[#f4f6f9] px-[10px] pt-5 pb-[10px] text-sm"
        >
          <!-- 类目头部 -->
          <div class="mb-[10px] flex h-[22px] items-center justify-between leading-[22px]">
            <div class="flex min-w-0 items-center text-base font-medium text-[#333]">
              <span
                class="mr-[10px] inline-block h-[14px] w-[14px] shrink-0 rounded-full"
                :style="{ backgroundColor: colors[index % colors.length] }"
              ></span>

              <span class="block w-[100px] truncate" :title="item.category_name">
                {{ item.category_name }}
              </span>
            </div>

            <span class="w-[150px] shrink-0 text-right"> 推荐指数：{{ item.rate || 0 }}% </span>
          </div>

          <!-- 类目销售数据 -->
          <div class="flex flex-col pl-[10px]">
            <a-tooltip color="#fff">
              <template #title>
                <h3 class="text-sm text-[#333]">类目月销售数据</h3>

                <div>
                  <span class="text-xs text-[#999]">销售量：</span>
                  <span class="text-xs text-[#333]">
                    {{ formatNumberByUnit(item.metric_items) || 0 }}
                  </span>
                </div>

                <div>
                  <span class="text-xs text-[#999]">销售额：</span>
                  <span class="text-xs text-[#333]">
                    {{ formatNumberByUnit(item.metric_gmv) || 0 }}(₽)
                  </span>
                </div>

                <div>
                  <span class="text-xs text-[#999]">销售动态：</span>
                  <span
                    class="text-xs"
                    :style="{
                      color: item.metric_gmv_growth < 0 ? '#fa1c1e' : '#4ecd4e',
                    }"
                  >
                    {{ item.metric_gmv_growth }}%
                  </span>
                </div>

                <div>
                  <span class="text-xs text-[#999]">成交率：</span>
                  <span class="text-xs text-[#333]"> {{ item.metric_buyout }}% </span>
                </div>

                <div>
                  <span class="text-xs text-[#999]">退货率：</span>
                  <span class="text-xs text-[#fa1c1e]"> {{ item.metric_refund }}% </span>
                </div>

                <div>
                  <span class="text-xs text-[#999]">平均价格：</span>
                  <span class="text-xs text-[#333]"> {{ item.metric_aiv }}(₽) </span>
                </div>

                <div>
                  <span class="text-xs text-[#999]">平均价格动态：</span>
                  <span class="text-xs text-[#fa1c1e]"> {{ item.metric_aiv_growth || 0 }}% </span>
                </div>

                <div>
                  <span class="text-xs text-[#999]">品牌数量：</span>
                  <span class="text-xs text-[#333]">
                    {{ item.metric_brands }}
                  </span>
                </div>

                <div>
                  <span class="text-xs text-[#999]">大卖家占比：</span>
                  <span class="text-xs text-[#333]"> {{ item.metric_leader_share }}% </span>
                </div>
              </template>

              <div>
                <span class="inline-block w-20 text-sm leading-5 font-normal text-[#999]">
                  月销量：
                </span>
                <span class="text-sm font-medium text-[#1f5fff]">
                  {{ formatNumberByUnit(item.metric_items) || 0 }}
                </span>
              </div>

              <div class="my-[5px]">
                <span class="inline-block w-20 text-sm leading-5 font-normal text-[#999]">
                  月销售额：
                </span>
                <span class="text-sm font-medium text-[#1f5fff]">
                  {{ formatNumberByUnit(item.metric_gmv) || 0 }}
                </span>
              </div>
            </a-tooltip>
          </div>

          <!-- 创建任务 -->
          <div
            class="text-right text-xs font-normal text-[#1f5fff]"
            @click="goSelectGoods(item.parentId, item.categoryId)"
          >
            创建选品任务
            <LoginOutlined class="ml-[5px]" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss"></style>
