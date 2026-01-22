<script setup lang="ts">
import { h } from 'vue';
import { LoadingOutlined } from '@ant-design/icons-vue';

withDefaults(defineProps<{
  text?: string
}>(), {
  text: '退出应用中...'
})
</script>

<template>
  <a-layout style="min-height: 100vh">
    <a-layout-content :style="{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      background: '#f5f5f5',
      padding: '50px'
    }">
      <a-space direction="vertical" align="center">
        <a-spin :size="'large'" :spinning="true"
          :indicator="h(LoadingOutlined, { style: { fontSize: '48px' }, spin: true })" />
        <div style="margin-top: 24px; font-size: 16px; color: #595959;">
          {{ text }}
        </div>
      </a-space>
    </a-layout-content>
  </a-layout>
</template>