import log from './index.js'

/** 与系统日志使用相同的级别和调用方式，只改变落盘分类。 */
export default log.scope('business')
