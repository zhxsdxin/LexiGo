/**
 * 帮助菜单
 * ---------------------------------------------------------------
 * 把快捷键与操作说明收进顶栏的一个图标按钮，
 * 不占用单词卡片的可视区域。点按钮或按 ? 打开。
 */
(function (global) {
  'use strict';

  var ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="9"/>' +
    '<path d="M9.2 9.2a2.8 2.8 0 1 1 3.9 2.6c-.7.3-1.1 1-1.1 1.7v.4"/>' +
    '<path d="M12 17.2h.01"/>' +
    '</svg>';

  var GROUPS = [
    {
      title: '键盘',
      rows: [
        { keys: ['空格'], desc: '翻转卡片' },
        { keys: ['←', '→'], desc: '上一个 / 下一个单词' },
        { keys: ['R'], desc: '播放日语发音' },
        { keys: ['1', '2', '3'], desc: '切换学习 / 复习 / 进度' },
        { keys: ['Esc'], desc: '关闭菜单' }
      ]
    },
    {
      title: '触屏',
      rows: [
        { keys: ['轻扫'], desc: '左右滑动切换单词' },
        { keys: ['上下滑'], desc: '翻转卡片' },
        { keys: ['轻点'], desc: '翻转卡片' }
      ]
    },
    {
      title: '作答',
      rows: [
        { keys: ['认识'], desc: '进入下一个词，复习间隔拉长' },
        { keys: ['不认识'], desc: '翻面看答案，并加入错词队列' }
      ]
    }
  ];

  var root = null;
  var panel = null;
  var button = null;
  var onClose = null;

  function build() {
    root = document.createElement('div');
    root.className = 'helpmenu';
    root.hidden = true;

    var rows = GROUPS.map(function (g) {
      return (
        '<div class="helpmenu__group">' +
        '<p class="helpmenu__title">' + g.title + '</p>' +
        '<dl class="helpmenu__rows">' +
        g.rows
          .map(function (r) {
            return (
              '<div class="helpmenu__row">' +
              '<dt class="helpmenu__keys">' +
              r.keys
                .map(function (k) {
                  return '<kbd>' + k + '</kbd>';
                })
                .join('') +
              '</dt>' +
              '<dd class="helpmenu__desc">' + r.desc + '</dd>' +
              '</div>'
            );
          })
          .join('') +
        '</dl>' +
        '</div>'
      );
    }).join('');

    root.innerHTML =
      '<div class="helpmenu__panel" role="dialog" aria-label="操作说明">' +
      '<div class="helpmenu__head">' +
      '<h2 class="helpmenu__heading">操作说明</h2>' +
      '<button type="button" class="helpmenu__close" aria-label="关闭">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>' +
      '</button>' +
      '</div>' +
      rows +
      '<p class="helpmenu__foot">学习记录保存在此浏览器本地</p>' +
      '</div>';

    document.body.appendChild(root);
    panel = root.querySelector('.helpmenu__panel');
    root.querySelector('.helpmenu__close').addEventListener('click', close);

    // 点击遮罩关闭
    root.addEventListener('click', function (e) {
      if (e.target === root) close();
    });
  }

  function open(cb) {
    if (!root) build();
    onClose = cb || null;
    root.hidden = false;
    // 触发入场动画
    void root.offsetWidth;
    root.classList.add('is-open');
    if (button) button.setAttribute('aria-expanded', 'true');
  }

  function close() {
    if (!root || root.hidden) return;
    root.classList.remove('is-open');
    if (button) button.setAttribute('aria-expanded', 'false');
    var el = root;
    // 等淡出结束再隐藏
    global.setTimeout(function () {
      el.hidden = true;
    }, 150);
    if (onClose) {
      var cb = onClose;
      onClose = null;
      cb();
    }
  }

  function toggle() {
    if (root && !root.hidden) close();
    else open();
  }

  /** 在顶栏插入入口按钮 */
  function mount(container) {
    if (!container) return;
    if (document.querySelector('.helpmenu-btn')) return;

    button = document.createElement('button');
    button.type = 'button';
    button.className = 'helpmenu-btn';
    button.setAttribute('aria-label', '操作说明');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('title', '操作说明');
    button.innerHTML = ICON;
    button.addEventListener('click', function (e) {
      e.stopPropagation();
      toggle();
    });

    container.appendChild(button);
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });

  global.LexiGo = global.LexiGo || {};
  global.LexiGo.HelpMenu = {
    mount: mount,
    open: open,
    close: close,
    toggle: toggle
  };
})(window);