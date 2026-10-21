/**
 * 词表选择框
 * ---------------------------------------------------------------
 * 点击按钮展开本组全部单词，点条目直接跳转。
 * 支持点击外部或按 Esc 收起。内容由各视图自行渲染。
 */
(function (global) {
  'use strict';

  var openPicker = null;

  function close() {
    if (!openPicker) return;
    openPicker.classList.remove('is-open');
    var btn = openPicker.querySelector('.picker__toggle');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    openPicker = null;
  }

  function toggle(picker) {
    var willOpen = picker !== openPicker;
    close();
    if (!willOpen) return;
    picker.classList.add('is-open');
    var btn = picker.querySelector('.picker__toggle');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    openPicker = picker;
  }

  /** 给每个 .picker 绑定展开交互；列表内容与跳转由视图负责 */
  function bindAll() {
    var pickers = document.querySelectorAll('.picker');
    Array.prototype.forEach.call(pickers, function (picker) {
      var btn = picker.querySelector('.picker__toggle');
      if (!btn || btn.getAttribute('data-bound') === '1') return;
      btn.setAttribute('data-bound', '1');
      btn.setAttribute('aria-expanded', 'false');

      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        toggle(picker);
      });
    });
  }

  // 点击页面任意处收起
  document.addEventListener('click', function (e) {
    if (openPicker && !openPicker.contains(e.target)) close();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });

  global.LexiGo = global.LexiGo || {};
  global.LexiGo.Picker = {
    bindAll: bindAll,
    close: close
  };
})(window);