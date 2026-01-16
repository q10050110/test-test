/**
 * 菜单项类型定义
 */
export interface MenuItem {
  // 菜单标题
  title: string
  // 菜单路径
  path: string
  // 菜单图标(可选)
  icon?: string
  // 子菜单(可选)
  children: MenuItem[]
  // 是否隐藏(可选)
  hidden?: boolean
}
