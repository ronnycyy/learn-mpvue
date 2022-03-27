import Vue from 'core/index'

// mpvue 运行时接入

// for platforms
// import config from 'core/config'
import { mountComponent } from 'core/instance/lifecycle'

import {
  mustUseProp,
  isReservedTag,
  isReservedAttr,
  getTagNamespace,
  isUnknownElement
} from 'mp/util/index'
import { patch } from './patch'

// install platform specific utils
Vue.config.mustUseProp = mustUseProp
Vue.config.isReservedTag = isReservedTag
Vue.config.isReservedAttr = isReservedAttr
Vue.config.getTagNamespace = getTagNamespace
Vue.config.isUnknownElement = isUnknownElement



// install platform patch function
// 重写 vue 的 Path 方法 
Vue.prototype.__patch__ = patch

// public mount method
// 重写 Vue 的 mount 方法
// 初始化 vue 的时候，也会初始化 page
Vue.prototype.$mount = function (el, hydrating) {
  // 1.生成Page

  // el = el && inBrowser ? query(el) : undefined
  // return mountComponent(this, el, hydrating)

  // 初始化小程序生命周期相关
  const options = this.$options

  if (options && (options.render || options.mpType)) {
    const { mpType = 'page' } = options
    return this._initMP(mpType, () => {
      return mountComponent(this, undefined, undefined)
    })
  } else {
    // 这个 mountComponent 是 vue 的 mount 生命周期
    return mountComponent(this, undefined, undefined)
  }
}

// for mp
// 自己定义了一些方法
import { initMP } from './lifecycle'
// 构建 微信小程序的 Page 生命周期
Vue.prototype._initMP = initMP

import { updateDataToMP, initDataToMP } from './render'
Vue.prototype.$updateDataToMP = updateDataToMP
Vue.prototype._initDataToMP = initDataToMP

import { handleProxyWithVue } from './events'
Vue.prototype.$handleProxyWithVue = handleProxyWithVue

export default Vue
