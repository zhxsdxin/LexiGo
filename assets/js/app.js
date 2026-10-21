/**
 * LexiGo · 应用入口
 * ---------------------------------------------------------------
 * 负责：状态加载与持久化、标签切换、全局键盘、顶栏进度同步。
 */
(function (global) {
  'use strict';

  var LG = global.LexiGo;
  var state = null;
  var currentTab = 'study';
  var views = {};

  var TABS = [
    { id: 'study', label: '学习' },
    { id: 'review', label: '复习' },
    { id: 'progress', label: '进度' }
  ];

  function load() {
    state = LG.Store.read();
  }

  function persist() {
    LG.Store.write(state);
  }

  function switchTab(id) {
    if (!TABS.some(function (t) { return t.id === id; })) return;

    // 离开标签页时复位卡片的揭示状态，避免答案残留到下次进入
    if (currentTab !== id) {
      if (currentTab === 'study' && views.study) views.study.reset();
      if (currentTab === 'review' && views.review) views.review.reset();
      closePickers();
    }
    currentTab = id;

    TABS.forEach(function (t) {
      var btn = document.querySelector('[data-tab="' + t.id + '"]');
      var view = document.getElementById('view-' + t.id);
      var active = t.id === id;
      if (btn) btn.setAttribute('aria-selected', active ? 'true' : 'false');
      if (view) view.classList.toggle('is-active', active);
    });

    render();
  }

  /** 重绘所有视图与顶栏 */
  function render() {
    if (!views.study) return;
    views.study.render();
    views.review.render();
    views.progress.render();
    renderTopbar();
    renderBadges();
  }

  /** 统一的重绘入口：所有会改动状态的操作都走这里 */
  function onStateChange(directive) {
    if (directive === 'reset') {
      load();
      // 视图的 init 会重复绑定事件，这里只换数据源 + 重绘，避免重复监听
      views.study.setState(state);
      views.review.setState(state);
      views.progress.setState(state);
      views.review.rebuild();
      persist();
      render();
      switchTab('study');
      return;
    }

    if (directive === 'goto:study') {
      switchTab('study');
      return;
    }

    persist();
    render();
  }

  function ctx() {
    return { state: state, onStateChange: onStateChange };
  }

  function renderTopbar() {
    var S = LG.Stats;
    var deck = S.deckProgress(state);
    var fill = document.querySelector('[data-el="top-fill"]');
    var text = document.querySelector('[data-el="top-text"]');
    var due = document.querySelector('[data-el="top-due"]');

    if (fill) fill.style.width = deck.percent + '%';
    if (text) text.textContent = deck.done + ' / ' + deck.total;

    // 进度统计不抢占学习区域，顶栏只保留一个极简的待复习计数
    var dueCount = S.dueCount(state);
    if (due) {
      due.textContent = dueCount > 0 ? dueCount + ' 待复习' : '';
      due.hidden = dueCount === 0;
    }
  }

  function renderBadges() {
    var due = LG.Stats.dueCount(state);
    ['study', 'review'].forEach(function (id) {
      var badge = document.querySelector('[data-badge="' + id + '"]');
      if (!badge) return;
      if (id === 'review') {
        badge.textContent = due > 0 ? String(due) : '';
        badge.hidden = due === 0;
      } else {
        var deck = LG.Stats.deckProgress(state);
        badge.textContent = deck.done > 0 ? deck.done + '/' + deck.total : '';
        badge.hidden = deck.done === 0;
      }
    });
  }

  function bindTabs() {
    TABS.forEach(function (t) {
      var btn = document.querySelector('[data-tab="' + t.id + '"]');
      if (btn) btn.addEventListener('click', function () { switchTab(t.id); });
    });
  }

  /** 顶栏右侧挂操作说明入口 */
  function mountHelp() {
    var slot = document.querySelector('.topbar__tools');
    if (slot && LG.HelpMenu) LG.HelpMenu.mount(slot);
  }

  /** 学习 / 复习页的卡片支持左右滑动切词、上下滑动翻面 */
  function bindGestures() {
    ['study', 'review'].forEach(function (id) {
      var view = document.getElementById('view-' + id);
      if (!view) return;
      LG.Gesture.attach(view, {
        onLeft: function () {
          if (currentTab !== id) return;
          if (id === 'study') views.study.step(1);
          else views.review.next();
        },
        onRight: function () {
          if (currentTab !== id) return;
          if (id === 'study') views.study.step(-1);
          else views.review.prev();
        },
        onUp: function () {
          if (currentTab !== id) return;
          if (id === 'study') views.study.flip();
          else views.review.flip();
        }
      });
    });
  }

  /** 切标签时收起展开中的浮层 */
  function closePickers() {
    if (LG.Picker) LG.Picker.close();
  }

  function bindKeys() {
    document.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName) || '';
      // 不拦截输入框内的按键
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;

      var handled = false;
      if (currentTab === 'study') handled = views.study.onKey(e);
      else if (currentTab === 'review') handled = views.review.onKey(e);

      if (!handled && (e.metaKey || e.ctrlKey || e.altKey)) return;

      if (!handled && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === '1') { switchTab('study'); handled = true; }
        else if (e.key === '2') { switchTab('review'); handled = true; }
        else if (e.key === '3') { switchTab('progress'); handled = true; }
        else if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
          if (LG.HelpMenu) { LG.HelpMenu.toggle(); handled = true; }
        }
      }

      if (handled) e.preventDefault();
    });
  }

  function init() {
    load();

    bindTabs();
    LG.Picker.bindAll();
    mountHelp();

    views.study = LG.StudyView;
    views.review = LG.ReviewView;
    views.progress = LG.ProgressView;

    views.study.init(document.getElementById('view-study'), ctx());
    views.review.init(document.getElementById('view-review'), ctx());
    views.progress.init(document.getElementById('view-progress'), ctx());

    bindKeys();
    bindGestures();

    // 跨天时刷新一次统计口径
    var lastDay = LG.Store.todayKey();
    global.setInterval(function () {
      var now = LG.Store.todayKey();
      if (now !== lastDay) {
        lastDay = now;
        LG.Store.ensureDay(state);
        onStateChange();
      }
    }, 60000);

    switchTab('study');
    persist();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.LexiGo.App = { switchTab: switchTab, getState: function () { return state; } };
})(window);