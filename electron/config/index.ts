import axios from 'axios'
export const getConfig = async () => {
  try {
    const res = await axios.get('https://shopbang.cn/version/config.json')
    return res.data
  } catch (error) {
    console.error('获取配置失败', error)
    return { feature: [], optimize: [], repair: [] }
  }
}
