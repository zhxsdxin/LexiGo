/**
 * 触摸手势
 * ---------------------------------------------------------------
 * 移动端左右滑动切换单词，轻微上下滑动翻面。
 * 用 Pointer Events 统一处理触摸与鼠标拖拽，阈值以下不触发，
 * 避免和点击翻面、发音按钮、词表选择框互相干扰。
 */
(function (global) {
  'use strict';

  // 触发阈值：位移超过 48px 且方向明确才认定��滑动
  var THRESHOLD = 48;
  // 判定为纵向翻面的位移阈值，低于水平阈值
  var V_THRESHOLD = 36;
  // 滑动开始前允许的容差，超过说明用户在滚动或点按
  var SLOP = 10;

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

    el.addEventListener('pointerdown', function (e) {
      // 只处理主键 / 单指；发��按钮与选择框内部不拦截
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.target.closest('.card__speak, .picker, button:not(.card)')) return;

      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      tracking = true;
    });

    el.addEventListener('pointerup', function (e) {
      if (!tracking || e.pointerId !== pointerId) return;
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      tracking = false;

      var absX = Math.abs(dx);
      var absY = Math.abs(dy);

      // 水平为主且超过阈值 → 切词
      if (absX >= THRESHOLD && absX > absY) {
        if (dx < 0) {
          if (handlers.onLeft) handlers.onLeft();
        } else {
          if (handlers.onRight) handlers.onRight();
        }
        return;
      }

      // 纵向为主且超过阈值 → 翻面
      if (absY >= V_THRESHOLD && absY > absX) {
        if (dy < 0) {
          if (handlers.onUp) handlers.onUp();
        } else {
          if (handlers.onDown) handlers.onDown();
        }
      }
    });

    el.addEventListener('pointercancel', reset);
    el.addEventListener('lostpointercapture', reset);

    // 拖拽结束后浏览器可能补一个 click，这里拦掉避免误翻面
    el.addEventListener('click', function (e) {
      if (el.__suppressClick) {
        e.stopPropagation();
        e.preventDefault();
        el.__suppressClick = false;
      }
    }, true);
  }

  global.LexiGo = global.LexiGo || {};
  global.LexiGo.Gesture = {
    attach: attach,
    THRESHOLD: THRESHOLD,
    V_THRESHOLD: V_THRESHOLD,
    SLOP: SLOP
  };
})(window);