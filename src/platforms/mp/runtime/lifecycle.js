import { handleError } from 'core/util/index'
import { observe } from 'core/observer/index'
import { proxy } from 'core/instance/state'
import { mountComponent } from 'core/instance/lifecycle'

function _next(rootVueVM) {
  return mountComponent(rootVueVM, undefined, undefined)
}

import {
  camelize,
  isPlainObject
} from 'shared/util'
import { warn } from 'core/util/debug'

export function callHook(vm, hook, params) {
  let handlers = vm.$options[hook]
  if (hook === 'onError' && handlers) {
    handlers = [handlers]
  } else if (hook === 'onPageNotFound' && handlers) {
    handlers = [handlers]
  }

  let ret
  if (handlers) {
    for (let i = 0, j = handlers.length; i < j; i++) {
      try {
        ret = handlers[i].call(vm, params)
      } catch (e) {
        handleError(e, vm, `${hook} hook`)
      }
    }
  }
  if (vm._hasHookEvent) {
    vm.$emit('hook:' + hook)
  }

  // for child
  if (vm.$children.length) {
    vm.$children.forEach(v => callHook(v, hook, params))
  }

  return ret
}

// mpType 小程序实例的类型，可能的值是 'app', 'page'
// rootVueVM 是 vue 的根组件实例，子组件中访问 this.$root 可得
function getGlobalData(app, rootVueVM) {
  const mp = rootVueVM.$mp
  if (app && app.globalData) {
    mp.appOptions = app.globalData.appOptions
  }
}

// 格式化 properties 属性，并给每个属性加上 observer 方法

// properties 的 一些类型 https://developers.weixin.qq.com/miniprogram/dev/framework/custom-component/component.html
// properties: {
//   paramA: Number,
//   myProperty: { // 属性名
//     type: String, // 类型（必填），目前接受的类型包括：String, Number, Boolean, Object, Array, null（表示任意类型）
//     value: '', // 属性初始值（可选），如果未指定则会根据类型选择一个
//     observer: function(newVal, oldVal, changedPath) {
//        // 属性被改变时执行的函数（可选），也可以写成在methods段中定义的方法名字符串, 如：'_propertyChange'
//        // 通常 newVal 就是新设置的数据， oldVal 是旧数据
//     }
//   },
// }

// props 的一些类型 https://cn.vuejs.org/v2/guide/components-props.html#ad
// props: {
//   // 基础的类型检查 (`null` 匹配任何类型)
//   propA: Number,
//   // 多个可能的类型
//   propB: [String, Number],
//   // 必填的字符串
//   propC: {
//     type: String,
//     required: true
//   },
//   // 带有默认值的数字
//   propD: {
//     type: Number,
//     default: 100
//   },
//   // 带有默认值的对象
//   propE: {
//     type: Object,
//     // 对象或数组且一定会从一个工厂函数返回默认值
//     default: function () {
//       return { message: 'hello' }
//     }
//   },
//   // 自定义验证函数
//   propF: {
//     validator: function (value) {
//       // 这个值必须匹配下列字符串中的一个
//       return ['success', 'warning', 'danger'].indexOf(value) !== -1
//     }
//   }
// }

// core/util/options
function normalizeProps(props, res, vm) {
  if (!props) return
  let i, val, name
  if (Array.isArray(props)) {
    i = props.length
    while (i--) {
      val = props[i]
      if (typeof val === 'string') {
        name = camelize(val)
        res[name] = { type: null }
      } else if (process.env.NODE_ENV !== 'production') {
        warn('props must be strings when using array syntax.')
      }
    }
  } else if (isPlainObject(props)) {
    for (const key in props) {
      val = props[key]
      name = camelize(key)
      res[name] = isPlainObject(val)
        ? val
        : { type: val }
    }
  }

  // fix vueProps to properties
  for (const key in res) {
    if (res.hasOwnProperty(key)) {
      const item = res[key]
      if (item.default) {
        item.value = item.default
      }
      const oldObserver = item.observer
      item.observer = function (newVal, oldVal) {
        vm[name] = newVal
        // 先修改值再触发原始的 observer，跟 watch 行为保持一致
        if (typeof oldObserver === 'function') {
          oldObserver.call(vm, newVal, oldVal)
        }
      }
    }
  }

  return res
}

function normalizeProperties(vm) {
  const properties = vm.$options.properties
  const vueProps = vm.$options.props
  const res = {}

  normalizeProps(properties, res, vm)
  normalizeProps(vueProps, res, vm)

  return res
}

/**
 * 把 properties 中的属性 proxy 到 vm 上
 */
function initMpProps(vm) {
  const mpProps = vm._mpProps = {}
  const keys = Object.keys(vm.$options.properties || {})
  keys.forEach(key => {
    if (!(key in vm)) {
      proxy(vm, '_mpProps', key)
      mpProps[key] = undefined // for observe
    }
  })
  observe(mpProps, true)
}

// 链接 vue 与 小程序 初始化过程的生命周期调用
export function initMP(mpType, next) {
  const rootVueVM = this.$root
  if (!rootVueVM.$mp) {
    rootVueVM.$mp = {}
  }

  const mp = rootVueVM.$mp

  // Please do not register multiple Pages
  // if (mp.registered) {
  if (mp.status) {
    if (mpType === 'app') {
      // 调用 app 的 launch 生命周期
      callHook(this, 'onLaunch', mp.appOptions)
    } else {
      callHook(this, 'onLoad', mp.query)
      callHook(this, 'onReady')
    }
    return next()
  }
  // mp.registered = true

  mp.mpType = mpType
  mp.status = 'register'
}


// 对齐 Vue 与 wx 的生命周期
export function createMP({ mpType, init }) {
  if (!mpType) mpType = 'page'
  if (mpType === 'app') {
    global.App({
      // 页面的初始数据
      globalData: {
        appOptions: {}
      },

      handleProxy(e) {
        return this.rootVueVM.$handleProxyWithVue(e)
      },

      // Do something initial when launch.
      onLaunch(options = {}) {
        if (!this.rootVueVM) {
          // rootVueVM 是 vue 实例
          this.rootVueVM = init()
          this.rootVueVM.$mp = {}
        }
        const mp = this.rootVueVM.$mp
        mp.mpType = 'app'
        mp.app = this
        mp.status = 'launch'
        this.globalData.appOptions = mp.appOptions = options
        this.rootVueVM.$mount()
      },

      // Do something when app show.
      onShow(options = {}) {
        // 百度小程序onLaunch与onShow存在bug
        // 如果this.rootVueVM不存在则初始化
        if (!this.rootVueVM) {
          this.rootVueVM = init()
          this.rootVueVM.$mp = {}
        }
        const mp = this.rootVueVM.$mp
        mp.status = 'show'
        this.globalData.appOptions = mp.appOptions = options
        callHook(this.rootVueVM, 'onShow', options)
      },

      // Do something when app hide.
      onHide() {
        const mp = this.rootVueVM.$mp
        mp.status = 'hide'
        callHook(this.rootVueVM, 'onHide')
      },

      onError(err) {
        callHook(this.rootVueVM, 'onError', err)
      },

      onPageNotFound(err) {
        callHook(this.rootVueVM, 'onPageNotFound', err)
      }
    })
  }
  if (mpType === 'page') {
    const app = global.getApp()
    global.Page({
      // 页面的初始数据
      data: {
        $root: {}
      },

      // 事件处理
      // 事件从页面来
      // 处理所有打包出来的方法 
      // 最终打包的结果 bindTap="handleProxy" 事件绑定的全部是 handleProxy
      handleProxy(e) {
        return this.rootVueVM.$handleProxyWithVue(e)
      },

      // mp lifecycle for vue
      // 生命周期函数--监听页面加载
      onLoad(query) {
        this.rootVueVM = init()
        const mp = this.rootVueVM.$mp = {}
        mp.mpType = 'page'
        mp.page = this
        mp.query = query
        mp.status = 'load'
        getGlobalData(app, this.rootVueVM)
        this.rootVueVM.$mount()
      },

      // 生命周期函数--监听页面显示
      onShow() {
        const mp = this.rootVueVM.$mp
        mp.page = this
        mp.status = 'show'
        callHook(this.rootVueVM, 'onShow')
        // 只有页面需要 setData
        // nextTick 异步 批处理
        this.rootVueVM.$nextTick(() => {
          // 第一次把 vue数据 给 wx的Page
          this.rootVueVM._initDataToMP()
        })
      },

      // 生命周期函数--监听页面初次渲染完成
      onReady() {
        const mp = this.rootVueVM.$mp
        mp.status = 'ready'
        return _next(this.rootVueVM)
      },

      // 生命周期函数--监听页面隐藏
      onHide() {
        const mp = this.rootVueVM.$mp
        mp.status = 'hide'
        callHook(this.rootVueVM, 'onHide')
        mp.page = null
      },

      // 生命周期函数--监听页面卸载
      onUnload() {
        const mp = this.rootVueVM.$mp
        mp.status = 'unload'
        callHook(this.rootVueVM, 'onUnload')
        mp.page = null
      },

      // 页面相关事件处理函数--监听用户下拉动作
      onPullDownRefresh() {
        callHook(this.rootVueVM, 'onPullDownRefresh')
      },

      // 页面上拉触底事件的处理函数
      onReachBottom() {
        callHook(this.rootVueVM, 'onReachBottom')
      },

      // 用户点击右上角分享
      onShareAppMessage(options) {
        if (this.rootVueVM.$options.onShareAppMessage) {
          callHook(this.rootVueVM, 'onShareAppMessage', options)
        }
      },

      // Do something when page scroll
      onPageScroll(options) {
        callHook(this.rootVueVM, 'onPageScroll', options)
      },

      // 当前是 tab 页时，点击 tab 时触发
      onTabItemTap(options) {
        callHook(this.rootVueVM, 'onTabItemTap', options)
      }
    })
  }
  if (mpType === 'component') {
    global.Component({
      // 小程序原生的组件属性
      properties: {},
      // 页面的初始数据
      data: {
        $root: {}
      },
      methods: {
        handleProxy(e) {
          return this.rootVueVM.$handleProxyWithVue(e)
        }
      },
      // mp lifecycle for vue
      // 组件生命周期函数，在组件实例进入页面节点树时执行，注意此时不能调用 setData
      created() {
        this.rootVueVM = init()
        initMpProps(this.rootVueVM)
        this.properties = normalizeProperties(this.rootVueVM)
        const mp = this.rootVueVM.$mp = {}
        mp.mpType = 'component'
        mp.status = 'created'
        mp.page = this
        this.rootVueVM.$mount()
        callHook(this.rootVueVM, 'created')
      },
      // 组件生命周期函数，在组件实例进入页面节点树时执行
      attached() {
        const mp = this.rootVueVM.$mp
        mp.status = 'attached'
        callHook(this.rootVueVM, 'attached')
      },
      // 组件生命周期函数，在组件布局完成后执行，此时可以获取节点信息（使用 SelectorQuery ）
      ready() {
        const mp = this.rootVueVM.$mp
        mp.status = 'ready'
        callHook(this.rootVueVM, 'ready')
        _next(this.rootVueVM)

        // 只有页面需要 setData
        this.rootVueVM.$nextTick(() => {
          this.rootVueVM._initDataToMP()
        })
      },
      // 组件生命周期函数，在组件实例被移动到节点树另一个位置时执行
      moved() {
        callHook(this.rootVueVM, 'moved')
      },
      // 组件生命周期函数，在组件实例被从页面节点树移除时执行
      detached() {
        const mp = this.rootVueVM.$mp
        mp.status = 'detached'
        callHook(this.rootVueVM, 'detached')
      }
    })
  }
}
