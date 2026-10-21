/**
 * 触摸手势
 * ---------------------------------------------------------------
 * 移动端左右滑动切换单词，轻微上下滑动翻面。
 * 用 Pointer Events 统一处理触摸与鼠标拖拽，阈值以下不触发，
 * 避免和点击翻面、发音按钮、词表选择框互相干扰。
 */
(function (global) {
  'use strict';

  // 触发阈值：位移超过 48px 且方向明确才认定为滑动
  var THRESHOLD = 48;
  // 纵向翻面阈值比水平略低：卡片较高，纵向起手更自然
  var V_THRESHOLD = 40;

  /**
   * 在元素上绑定滑动手势
   * @param {HTMLElement} el
   * @param {object} handlers { onLeft, onRight, onUp, onDown }
   */
  function attach(el, handlers) {
    if (!el || el.__gestureBound) return;
    el.__gestureBound = true;

    var startX = 0;
    var startY = 0;
    var pointerId = null;
    var tracking = false;

    function reset() {
      tracking = false;
      pointerId = null;
      startX = startY = 0;
    }

    /*
     * 标记「这次抬手算滑动，浏览器补发的 click 不要响应」。
     * 必须在 pointerdown 时清掉，否则上一次滑动留下的标记
     * 会把下一次正常点击也吞掉。
     */
    function armSuppress() {
      el.__suppressClick = true;
      global.clearTimeout(el.__suppressTimer);
      // 兜底：滑动后浏览器不一定补发 click，标记不能一直挂着
      el.__suppressTimer = global.setTimeout(function () {
        el.__suppressClick = false;
      }, 400);
    }

    el.addEventListener('pointerdown', function (e) {
      // 只处理主键 / 单指；发音按钮与选择框内部不拦截
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.target.closest('.card__speak, .picker, button:not(.card)')) return;

      el.__suppressClick = false;
      global.clearTimeout(el.__suppressTimer);

      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      tracking = true;
    });

    /*
     * 抬手监听挂在 window 上，而不是用 setPointerCapture。
     *
     * 指针捕获会把后续的 click 重定向到捕获元素（这里是外层容器），
     * 卡片自身的 click 监听器就收不到事件，点击翻面会完全失效。
     * 改用 window 级监听，同样能在手指滑出容器后收到抬手，
     * 且不影响 click 的原始目标。
     */
    global.addEventListener('pointerup', function (e) {
      if (!tracking || e.pointerId !== pointerId) return;
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      reset();

      var absX = Math.abs(dx);
      var absY = Math.abs(dy);

      // 水平为主且超过阈值 → 切词
      if (absX >= THRESHOLD && absX > absY) {
        // 抬手后浏览器通常还会补一个 click，必须挡掉，
        // 否则切词的同时又把卡片翻了一面
        armSuppress();
        if (dx < 0) {
          if (handlers.onLeft) handlers.onLeft();
        } else {
          if (handlers.onRight) handlers.onRight();
        }
        return;
      }

      // 纵向为主且超过阈值 → 翻面
      if (absY >= V_THRESHOLD && absY > absX) {
        // 同理：纵向滑动已经翻过一次面，补发的 click 不能再来一次
        armSuppress();
        if (dy < 0) {
          if (handlers.onUp) handlers.onUp();
        } else {
          if (handlers.onDown) handlers.onDown();
        }
      }
    });

    global.addEventListener('pointercancel', reset);

    // 拖拽结束后浏览器可能补一个 click，这里拦掉避免误翻面
    el.addEventListener('click', function (e) {
      if (el.__suppressClick) {
        e.stopPropagation();
        e.preventDefault();
        el.__suppressClick = false;
        global.clearTimeout(el.__suppressTimer);
      }
    }, true);
  }

  global.LexiGo = global.LexiGo || {};
  global.LexiGo.Gesture = {
    attach: attach,
    THRESHOLD: THRESHOLD,
    V_THRESHOLD: V_THRESHOLD
  };
})(window);
