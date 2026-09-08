/**
 * MoonTV / suntv — 糖葫芦浏览器（Tanghulu / HSBTVBrowser）遥控脚本
 *
 * 糖葫芦默认「点击模式」会把遥控器上/下当成移动鼠标，网页收不到方向键。
 * 这份脚本做三件事：
 * 1. 隐藏网页光标（App 自带的原生光标消不掉，请同时打开糖葫芦「光标自动隐藏」）
 * 2. 把方向键移动鼠标的跳动，转成 ArrowUp / ArrowDown / ArrowLeft / ArrowRight
 * 3. 滚动模式的滚轮也转成上下键
 *
 * 和简洁播放页配合后的效果：
 * - 未打开选集：上/下 = 显示集数；左/右 = 快退/快进 10 秒（播放中由糖葫芦原生进退，暂停后由网页进退）
 * - 已打开选集：左/右 = 选集；下 = 关闭；确定 = 播放
 *
 * ---------- 糖葫芦里怎么用 ----------
 * 1. 把本文件存到手机（也可先打开 https://你的域名/tanghulu-share.js 另存）
 * 2. 糖葫芦 → 设置 → 浏览器操作设置 → 脚本管理器 → 扫码上传本 JS
 * 3. 打开分享链接后，双击播放键 → 高级菜单 → 网站设置
 *    域名填你的站点（例如 suntv.example.com）
 *    「加载完成后」选这个脚本
 * 4. 建议同时：设置 → 浏览器页面设置 → 开启「光标自动隐藏」
 *    若光标仍碍事，双击触摸板切到「滚动模式」
 */
(function () {
  if (window.__suntvTanghuluShare) return;
  window.__suntvTanghuluShare = true;

  var SEEK_WHEN_IDLE = true;
  var JUMP_PX = 18;
  var AXIS_RATIO = 1.6;
  var COOLDOWN_MS = 170;
  var TOUCHPAD_BURST = 4;
  var lastLock = 0;
  var lastX = 0;
  var lastY = 0;
  var hasPoint = false;
  var burst = 0;
  var burstAt = 0;

  function hideCursor() {
    if (document.getElementById('suntv-hide-cursor')) return;
    var style = document.createElement('style');
    style.id = 'suntv-hide-cursor';
    style.textContent =
      'html,body,*{cursor:none!important;}html,body{overflow:hidden!important;}';
    (document.head || document.documentElement).appendChild(style);
  }

  function overlayOpen() {
    return !!(window.__suntvShareRemote && window.__suntvShareRemote.overlayOpen);
  }

  function claim(now) {
    if (now - lastLock < COOLDOWN_MS) return false;
    lastLock = now;
    window.__suntvDpadLock = now;
    return true;
  }

  function fireKey(name) {
    var codeMap = {
      ArrowLeft: 37,
      ArrowUp: 38,
      ArrowRight: 39,
      ArrowDown: 40,
    };
    var code = codeMap[name] || 0;
    var opts = {
      key: name,
      code: name,
      keyCode: code,
      which: code,
      bubbles: true,
      cancelable: true,
      composed: true,
    };
    window.dispatchEvent(new KeyboardEvent('keydown', opts));
  }

  function onDpad(name) {
    var now = Date.now();
    if (window.__suntvDpadLock && now - window.__suntvDpadLock < COOLDOWN_MS) {
      return;
    }
    if (!claim(now)) return;

    var open = overlayOpen();
    if (!open && (name === 'ArrowLeft' || name === 'ArrowRight')) {
      if (!SEEK_WHEN_IDLE) return;
      var video = document.querySelector('video');
      if (video && !video.paused && !video.ended) {
        return;
      }
    }
    fireKey(name);
  }

  function onMouseMove(event) {
    var now = Date.now();
    if (now - burstAt < 80) burst += 1;
    else burst = 1;
    burstAt = now;
    if (burst >= TOUCHPAD_BURST) {
      lastX = event.clientX;
      lastY = event.clientY;
      hasPoint = true;
      return;
    }

    if (!hasPoint) {
      lastX = event.clientX;
      lastY = event.clientY;
      hasPoint = true;
      return;
    }

    var dx = event.clientX - lastX;
    var dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;

    var ax = Math.abs(dx);
    var ay = Math.abs(dy);
    if (ay >= JUMP_PX && ay > ax * AXIS_RATIO) {
      onDpad(dy < 0 ? 'ArrowUp' : 'ArrowDown');
      return;
    }
    if (ax >= JUMP_PX && ax > ay * AXIS_RATIO) {
      onDpad(dx < 0 ? 'ArrowLeft' : 'ArrowRight');
    }
  }

  function onWheel(event) {
    var ax = Math.abs(event.deltaX);
    var ay = Math.abs(event.deltaY);
    if (ay < 8 && ax < 8) return;
    event.preventDefault();
    event.stopPropagation();
    if (ay >= ax) onDpad(event.deltaY < 0 ? 'ArrowUp' : 'ArrowDown');
    else onDpad(event.deltaX < 0 ? 'ArrowLeft' : 'ArrowRight');
  }

  function bind() {
    hideCursor();
    window.addEventListener('mousemove', onMouseMove, true);
    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    window.addEventListener('mousewheel', onWheel, { capture: true, passive: false });
  }

  hideCursor();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
