import { shell } from 'electron'
export const accountHandle = (type: 'register' | 'resetPassword') => {
  const env = process.env.NODE_ENV === 'development'
  const testUrl = type === 'register' ? "https://test-plus.shopbang.cn/erp/#/register" : 'https://test-plus.shopbang.cn/erp/#/forgetPassword'
  const prodUrl = type === 'register' ? 'https://shopbang.cn/erp/#/register' : 'https://shopbang.cn/erp/#/forgetPassword'
  shell.openExternal(env ? testUrl : prodUrl)
}