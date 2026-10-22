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
    // 清空搜索，下次打开是干净状态
    var input = openPicker.querySelector('.picker__input');
    if (input) input.value = '';
    openPicker.__query = '';
    applyFilter(openPicker);
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
    // 打开即聚焦搜索框，直接可输入
    var input = picker.querySelector('.picker__input');
    if (input) {
      input.value = '';
      picker.__query = '';
      applyFilter(picker);
      global.setTimeout(function () { input.focus(); }, 30);
    }
  }

  /**
   * 按当前查询过滤词条。
   * 匹配范围：词目 / 假名 / 源语言 / 罗马字 / 中文释义，
   * 均可命中（渲染时写入 data-search）。
   * 另做一次「紧凑匹配」：忽略空格、连字符与撇号，
   * 让 shi-bun、shi bun、kan'i 这类写法也能命中。
   */
  function applyFilter(picker) {
    if (!picker) return;
    var q = (picker.__query || '').trim().toLowerCase();
    var qc = q.replace(/[\s\-'.]/g, '');
    var items = picker.querySelectorAll('.picker__item');
    var visible = 0;
    Array.prototype.forEach.call(items, function (it) {
      var hay = (it.getAttribute('data-search') || it.textContent || '').toLowerCase();
      var show = !q || hay.indexOf(q) >= 0;
      if (!show && qc) {
        show = hay.replace(/[\s\-'.]/g, '').indexOf(qc) >= 0;
      }
      it.style.display = show ? '' : 'none';
      if (show) visible += 1;
    });
    var empty = picker.querySelector('.picker__empty');
    if (empty) empty.style.display = q && visible === 0 ? 'block' : 'none';
  }

  /** 给每个 .picker 绑定展开交互与搜索过滤；列表内容与跳转由视图负责 */
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

      // 搜索框：输入即过滤；回车不触发跳转，按键不冒泡到全局快捷键
      var input = picker.querySelector('.picker__input');
      if (input) {
        input.addEventListener('input', function () {
          picker.__query = input.value;
          applyFilter(picker);
        });
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') e.preventDefault();
          e.stopPropagation();
        });
      }
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
    close: close,
    toggle: toggle,
    applyFilter: applyFilter
  };
})(window);