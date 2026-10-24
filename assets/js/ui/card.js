/**
 * 单词卡组件
 * ---------------------------------------------------------------
 * 学习页与复习页共用。卡片为 3D 翻转结构：
 *   正面 → 日语单词 + 音调
 *   背面 → 读音假名 + 词性 + 中文释义（+ 词库中存在的例句）
 *
 * 翻转用 CSS 3D Transform 实现：Y 轴旋转 180°，350ms ease-in-out，
 * 透视距离 1000px，正反两面 backface-visibility: hidden 互斥显示。
 *
 * 关键约束：DOM 骨架只创建一次。
 * 若每次 render 都重建 innerHTML，.card__inner 就是全新元素，
 * 没有可供过渡的旧值，transform 变化会瞬间跳到终点，动画不会发生。
 * 因此这里把「建骨架」与「填内容」拆开，后续只改文本节点。
 */
(function (global) {
  'use strict';

  var ICON_SPEAK =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M11 5 6 9H3v6h3l5 4V5z"/>' +
    '<path d="M15.5 8.5a5 5 0 0 1 0 7"/>' +
    '<path d="M18.5 5.5a9 9 0 0 1 0 13"/>' +
    '</svg>';

  var ICON_PREV =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>';

  var ICON_NEXT =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>';

  var ICON_SHUFFLE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>';

  var ICON_COPY =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>';

  var ICON_DONE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

  // 从 hachiware 背景图池里按 seed 稳定取一张（同名 seed 永远返回同一张）。
  // 同一张卡片用相同 seed，背景就固定；不同卡片 seed 不同，自然分散到不同图。
  function pickGif(seed) {
    var pool = (global.LexiGo && global.LexiGo.HACHIWARE_GIFS) || [];
    if (!pool.length) return '';
    var h = 2166136261; // FNV-1a
    for (var i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return 'assets/gifs/hachiware/' + pool[(h >>> 0) % pool.length];
  }

  /** 字符里是否含有汉字（CJK 统一表意文字） */
  function hasKanji(s) {
    return /[一-鿿]/.test(s || '');
  }

  /** 是否为外来语：词库分篇标记为外来语，或写法以片假名构成且无汉字 */
  function isLoanword(word) {
    if (word.chapter === '外来语') return true;
    var w = word.word || '';
    return !hasKanji(w) && /[ァ-ヿ]/.test(w);
  }

  /**
   * 发音按钮。
   * 正反两面各有一个：按钮属于卡面，卡面翻转时按钮要跟着翻。
   * 只在翻转层里放一个的话，翻到背面它既不跟转又会露出镜像文字。
   * @param {string} side front / back
   */
  function speakButton(side) {
    return (
      '<button type="button" class="card__speak" data-act="speak" data-side="' + side + '"' +
      ' aria-label="播放日语发音">' +
      ICON_SPEAK +
      '<span data-f="speak-label-' + side + '">发音</span>' +
      '</button>'
    );
  }

  /**
   * 发音按钮要朗读的文本。
   * 正面读词头（词 + 读音，中间顿一下便于听清）；
   * 背面若卡面展示了日文例句，则读整句，没有例句时才退回读词。
   *
   * 例句读的是「ruby 展平后的假名串」，不是 jp 那条汉字原文：
   * 引擎得自己猜汉字读音，遇到 辛い(からい/つらい)、柄(がら/え)、
   * 分別(ぶんべつ/ふんべつ) 这类多音字就会念错义项。词库里每条例句的
   * 汉字都带 ruby 注解，展平出来就是一条完整的假名句，读音确定。
   * @param {boolean} isBack 是否为背面按钮
   * @param {object} word    词库条目
   */
  function speakTextFor(isBack, word) {
    var head = word.word + '、' + word.kana;
    if (!isBack) return head;
    var ex = word.example;
    if (!ex) return head;
    // 有 ruby 就展平它；只有 jp（无 ruby 标注）时退回 jp
    var text = ex.ruby ? rubyToKana(ex.ruby) : (ex.jp || '');
    return text || head;
  }

  /**
   * 复制按钮：与发音按钮同排，点一下把当前词条写进剪贴板。
   * @param {string} side front / back
   */
  function copyButton(side) {
    return (
      '<button type="button" class="card__copy" data-act="copy" data-side="' + side + '"' +
      ' aria-label="复制单词信息" title="复制单词信息">' +
      ICON_COPY +
      '</button>'
    );
  }

  /**
   * 词性文本：优先取 posAll（多词性用「｜」分隔，如 副词|形容词），
   * 没有则退回 pos；显示时把「｜」换成「·」。
   */
  function posText(word) {
    var raw = word.posAll || word.pos || '';
    if (!raw) return '';
    return String(raw).split('|').join('·');
  }

  /** 生成要复制的纯文本：词 读音 音调 【词性】释义 */
  function buildCopyText(word, bank) {
    var seg = [];
    if (word.word) seg.push(word.word);
    if (word.kana && word.kana !== word.word) seg.push(word.kana);
    var pitch = bank.hasPitch(word.pitch) ? bank.pitchMark(word.pitch) : '';
    if (pitch) seg.push(pitch);
    var s = seg.join(' ');
    var pos = posText(word);
    if (pos) s += ' 【' + pos + '】';
    if (word.meaning) s += (s ? ' ' : '') + word.meaning;
    return s;
  }

  /** 复制成功后的瞬时反馈：图标换成勾，1.3s 后还原 */
  function flashCopied(btn) {
    if (btn.__copyOrigHtml == null) btn.__copyOrigHtml = btn.innerHTML;
    btn.classList.add('is-copied');
    btn.innerHTML = ICON_DONE;
    btn.setAttribute('aria-label', '已复制');
    btn.title = '已复制';
    if (btn.__copyTimer) global.clearTimeout(btn.__copyTimer);
    btn.__copyTimer = global.setTimeout(function () {
      btn.classList.remove('is-copied');
      btn.innerHTML = btn.__copyOrigHtml;
      btn.setAttribute('aria-label', '复制单词信息');
      btn.title = '复制单词信息';
    }, 1300);
  }

  /** 写剪贴板，带 file:// / 旧浏览器兜底 */
  function copyText(text, btn) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '0';
      ta.style.left = '0';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { ta.setSelectionRange(0, ta.value.length); } catch (e) {}
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      if (ok) flashCopied(btn);
    }
    if (global.navigator.clipboard && global.navigator.clipboard.writeText) {
      global.navigator.clipboard.writeText(text).then(function () {
        flashCopied(btn);
      }, fallback);
    } else {
      fallback();
    }
  }

  /**
   * 建立卡片骨架，只执行一次。
   * @param {HTMLElement} root
   * @returns {object} 骨架内各节点的引用
   */
  function buildSkeleton(root) {
    root.innerHTML =
      '<div class="card__inner">' +
      // 正面：单词 + 音调
      '<div class="card__face card__face--front">' +
      '<div class="card__bg" data-f="bg-front" aria-hidden="true"></div>' +
      '<div class="card__body">' +
      '<h2 class="card__word" lang="ja" data-f="word"></h2>' +
      '<span class="card__pitch" data-f="pitch-front" aria-hidden="true"></span>' +
      '</div>' +
      '<div class="card__tools">' + speakButton('front') + copyButton('front') + '</div>' +
      '</div>' +
      // 背面：假名 + 词性 + 释义
      '<div class="card__face card__face--back">' +
      '<div class="card__bg" data-f="bg-back" aria-hidden="true"></div>' +
      '<div class="card__body">' +
      '<div class="card__kana-row">' +
      '<p class="card__kana" lang="ja" data-f="kana"></p>' +
      '<span class="card__pitch card__pitch--back" data-f="pitch-back" aria-hidden="true"></span>' +
      '</div>' +
      '<div class="card__divider"></div>' +
      '<p class="card__meaning" data-f="meaning"></p>' +
      '<span class="card__pos" data-f="pos" hidden></span>' +
      '<div class="card__example" data-f="example" hidden>' +
      '<p class="card__example-jp" lang="ja" data-f="example-jp" hidden></p>' +
      '<p class="card__example-cn" data-f="example-cn" hidden></p>' +
      '</div>' +
      '</div>' +
      '<div class="card__tools">' + speakButton('back') + copyButton('back') + '</div>' +
      '</div>' +
      '</div>';

    var speech = global.LexiGo.Speech;

    var refs = {
      root: root,
      inner: root.querySelector('.card__inner'),
      word: root.querySelector('[data-f="word"]'),
      pitchFront: root.querySelector('[data-f="pitch-front"]'),
      kana: root.querySelector('[data-f="kana"]'),
      pitchBack: root.querySelector('[data-f="pitch-back"]'),
      meaning: root.querySelector('[data-f="meaning"]'),
      pos: root.querySelector('[data-f="pos"]'),
      example: root.querySelector('[data-f="example"]'),
      exampleJp: root.querySelector('[data-f="example-jp"]'),
      exampleCn: root.querySelector('[data-f="example-cn"]'),
      // 正反两面的背景图层（默认透明，仅特定卡片挂图）
      bgFront: root.querySelector('[data-f="bg-front"]'),
      bgBack: root.querySelector('[data-f="bg-back"]'),
      // 正反两面各一个发音按钮
      speakFront: root.querySelector('[data-side="front"]'),
      speakBack: root.querySelector('[data-side="back"]'),
      speakLabelFront: root.querySelector('[data-f="speak-label-front"]'),
      speakLabelBack: root.querySelector('[data-f="speak-label-back"]'),
      // 正反两面各一个复制按钮
      copyFront: root.querySelector('.card__copy[data-side="front"]'),
      copyBack: root.querySelector('.card__copy[data-side="back"]'),
      // 上一次渲染的词条 id，用来区分「换词」与「仅翻转」
      lastWordId: null
    };

    if (!speech.supported) {
      refs.speakFront.disabled = true;
      refs.speakBack.disabled = true;
      refs.speakLabelFront.textContent = '发音不可用';
      refs.speakLabelBack.textContent = '发音不可用';
    }

    root.__lexigoCard = refs;
    return refs;
  }

  /**
   * 把紧凑标记 [漢字|よみ] 渲染成 <ruby> 元素。
   * 逐段 createElement 拼接，不用 innerHTML —— 文本里的字符不会被当成标签解析。
   * 文本里没有标记时退化为普通文本（N3 暂无例句数据即走这条）。
   * @param {HTMLElement} el   目标元素，会被清空后重写
   * @param {string}      text 含 [漢字|よみ] 标记的文本
   */
  function renderRuby(el, text) {
    el.textContent = '';
    if (!text) return;
    var doc = global.document;
    var re = /\[([^\[\]|]+)\|([^\[\]|]+)\]/g;
    if (!re.test(text)) {
      el.textContent = text;
      return;
    }
    re.lastIndex = 0;
    var last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) {
        el.appendChild(doc.createTextNode(text.slice(last, m.index)));
      }
      var ruby = doc.createElement('ruby');
      ruby.appendChild(doc.createTextNode(m[1]));
      var rt = doc.createElement('rt');
      rt.textContent = m[2];
      ruby.appendChild(rt);
      el.appendChild(ruby);
      last = re.lastIndex;
    }
    if (last < text.length) {
      el.appendChild(doc.createTextNode(text.slice(last)));
    }
  }

  /**
   * [漢字|よみ] 标记 → 纯假名串（给发音用）。
   * 只取标注里的读音，标记外的假名/片假名原样保留，与 renderRuby 的解析规则一致。
   * 没有标记时原样返回。
   * @param {string} text 含 [漢字|よみ] 标记的文本
   * @returns {string} 展平后的假名串
   */
  function rubyToKana(text) {
    if (!text) return '';
    return text.replace(/\[([^\[\]|]+)\|([^\[\]|]+)\]/g, function (m, kanji, kana) {
      return kana;
    });
  }

  /**
   * 把词条内容写进已建好的骨架
   */
  function fillContent(refs, word, bank) {
    var S = global.LexiGo.Settings;
    var kanaMode = S ? S.get('kanaMode') : false;

    // 外来语的源语言写法（ガイド → guide）。有 src 时：
    //   普通模式：正面仍是片假名，背面改显源语言；
    //   假名模式：正面直接显源语言，背面显片假名。
    var src = word.src || '';

    // 正面主词 / 背面主词
    var frontText = kanaMode ? (src || word.kana || '') : (word.word || '');
    var backText = kanaMode ? (word.word || '') : (src || word.kana || '');

    // 复制文本：正面只复制正面展示的词本身；背面复制完整信息
    refs.copyTextFront = frontText;
    refs.copyTextBack = buildCopyText(word, bank);

    // 词性：多词性条目取 posAll，显示为「副词·形容词」
    var posLabel = posText(word);

    // 源语言是拉丁字母，标注 lang="en"，朗读与朗读引擎也能正确处理
    var frontLang = (src && frontText === src) ? 'en' : 'ja';
    var backLang = (src && backText === src) ? 'en' : 'ja';

    if (!kanaMode) {
      // 默认：正面汉字 + 音调；背面读音（或源语言）+ 释义 + 词性 + 例句
      refs.word.textContent = word.word;
      refs.word.setAttribute('lang', 'ja');
      refs.kana.textContent = backText;
      refs.kana.setAttribute('lang', backLang);
    } else {
      // 假名模式：正面假名（外来语为源语言）；背面汉字 + 释义 + 词性 + 例句
      refs.word.textContent = frontText;
      refs.word.setAttribute('lang', frontLang);
      refs.kana.textContent = backText;
      refs.kana.setAttribute('lang', backLang);
    }

    // 释义 + 词性：两种模式都显示
    refs.meaning.textContent = word.meaning;
    refs.meaning.hidden = false;
    refs.pos.textContent = posLabel;
    refs.pos.hidden = !posLabel;

    // 例句：两种模式都显示（日文例句 + 中文翻译）
    var ex = word.example;
    if (ex && (ex.jp || ex.cn)) {
      refs.example.hidden = false;
      // 优先用带振假名标记的 ruby 字段；没有该字段时退回纯文本 jp
      renderRuby(refs.exampleJp, ex.ruby || ex.jp || '');
      refs.exampleJp.hidden = !ex.jp;
      refs.exampleCn.textContent = ex.cn || '';
      refs.exampleCn.hidden = !ex.cn;
    } else {
      refs.example.hidden = true;
    }

    // 背面发音按钮的文案跟随朗读内容：读整句时提示「读例句」。
    // 发音不可用时标签已被置为「发音不可用」，这里不再覆盖。
    var sp = global.LexiGo.Speech;
    if (refs.speakBack && refs.speakLabelBack && sp && sp.supported) {
      var hasExJp = !!(ex && ex.jp);
      refs.speakLabelBack.textContent = hasExJp ? '读例句' : '发音';
      refs.speakBack.setAttribute('aria-label', hasExJp ? '播放例句发音' : '播放日语发音');
    }

    // 音调：词库中没有音调时不渲染。假名模式下背面不再重复读音。
    var pitch = bank.hasPitch(word.pitch) ? bank.pitchMark(word.pitch) : '';
    refs.pitchFront.textContent = pitch;
    refs.pitchFront.hidden = !pitch;
    refs.pitchBack.textContent = pitch;
    refs.pitchBack.hidden = !pitch || kanaMode;

    // 背景：从 hachiware 图池随机取图，正反面各一张，无需为每张卡准备副本。
    // 按词条 id 做稳定哈希，同一张卡片始终同一张背景（翻面不闪），
    // 不同卡片自然分散到不同图。图池清单见 assets/gifs/hachiware/gifs.js。
    // 透明度走 --bg-opacity 变量（设置项 bgOpacity 控制），关闭时清空背景图。
    var showBg = S ? S.get('showBackground') : true;
    var opacity = S ? S.get('bgOpacity') : 0.05;
    refs.root.style.setProperty('--bg-opacity', String(opacity));
    if (showBg) {
      var gf = pickGif(word.id + '|f');
      var gb = pickGif(word.id + '|b');
      refs.bgFront.style.backgroundImage = gf ? "url('" + gf + "')" : '';
      refs.bgBack.style.backgroundImage = gb ? "url('" + gb + "')" : '';
    } else {
      refs.bgFront.style.backgroundImage = '';
      refs.bgBack.style.backgroundImage = '';
    }
  }

  /**
   * 换词时的回正与入场动画。
   *
   * 回正必须瞬时完成，不能走 350ms 过渡：
   * 卡片从背面转回正面的途中，背面会短暂正对用户，
   * 此时若已换成新词的内容，就会提前露出新词的释义。
   * 因此先关掉过渡把卡片摆回正面，再换内容。
   */
  function resetToFront(refs) {
    var root = refs.root;
    root.classList.add('is-resetting');
    root.classList.remove('is-flipped');
    // 强制回流，让「无过渡」的状态先落地
    void root.offsetWidth;
    root.classList.remove('is-resetting');
  }

  /**
   * 重放正反两面的淡入动画。
   * 手动移除再加回 class 来触发，不依赖 DOM 重建。
   */
  function replayEnter(refs) {
    var bodies = refs.root.querySelectorAll('.card__body');
    for (var i = 0; i < bodies.length; i++) {
      var el = bodies[i];
      el.classList.remove('is-entering');
      // 强制回流，让浏览器认为样式已重置，动画才能重新播放
      void el.offsetWidth;
      el.classList.add('is-entering');
    }
  }

  /**
   * 渲染一张单词卡
   * @param {HTMLElement} root  容器
   * @param {object} word       词库条目
   * @param {object} opts       { flipped, onFlip, onSpeak }
   */
  function render(root, word, opts) {
    opts = opts || {};
    var bank = global.LexiGo.Banks;
    var speech = global.LexiGo.Speech;
    var flipped = !!opts.flipped;

    var refs = root.__lexigoCard || buildSkeleton(root);

    // 换词：先瞬时回正，再换内容，避免露出新词释义
    var wordChanged = refs.lastWordId !== word.id;
    if (wordChanged) {
      resetToFront(refs);
    }

    fillContent(refs, word, bank);
    refs.lastWordId = word.id;

    /*
     * 翻转状态同步。
     * is-flipped 加在 root 上，CSS 用它驱动 .card__inner 的 rotateY(180deg)。
     * 元素始终是同一个，transform 从旧值过渡到新值，动画才会真正发生。
     */
    if (root.classList.contains('is-flipped') !== flipped) {
      root.classList.toggle('is-flipped', flipped);
    }

    // 换词时重放入场动画；仅翻面时不重放，免得翻到一半文字还在位移
    if (wordChanged) {
      replayEnter(refs);
    }

    // 卡片根节点只绑定一次点击，避免每次 render 叠加监听器
    if (!root.__lexigoBound) {
      root.__lexigoBound = true;
      root.addEventListener('click', function (e) {
        // 底部工具条（发音/复制）区域内的点击不触发翻面
        if (e.target.closest('.card__tools')) return;
        // 从 root 上读取当前回调，始终拿到最新闭包
        var cb = root.__lexigoOnFlip;
        if (cb) cb();
      });
    }
    root.__lexigoOnFlip = opts.onFlip || null;

    // 发音按钮：读当前展示的词，而不是绑定时的那一个。
    // 背面在卡面有例句时读整句，因此两面的朗读文本分开取。
    var speakBtns = [refs.speakFront, refs.speakBack];
    for (var i = 0; i < speakBtns.length; i++) {
      (function (btn) {
        btn.onclick = function (e) {
          e.stopPropagation();
          if (!speech.supported) return;
          var text = speakTextFor(btn === refs.speakBack, word);
          var ok = speech.speak(text);
          if (ok) {
            btn.classList.add('is-speaking');
            // 整句比单词长得多，动画时长按字数粗估，避免还没读完就停了
            var ms = Math.min(6000, Math.max(1600, text.length * 130));
            global.setTimeout(function () {
              btn.classList.remove('is-speaking');
            }, ms);
          }
          if (opts.onSpeak) opts.onSpeak();
        };
      })(speakBtns[i]);
    }

    // 复制按钮：正面只复制词本身，背面复制完整信息
    if (refs.copyFront) {
      refs.copyFront.onclick = function (e) {
        e.stopPropagation();
        if (refs.copyTextFront) copyText(refs.copyTextFront, refs.copyFront);
      };
    }
    if (refs.copyBack) {
      refs.copyBack.onclick = function (e) {
        e.stopPropagation();
        if (refs.copyTextBack) copyText(refs.copyTextBack, refs.copyBack);
      };
    }
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  global.LexiGo = global.LexiGo || {};
  global.LexiGo.WordCard = {
    render: render,
    escapeHtml: escapeHtml,
    ICON_PREV: ICON_PREV,
    ICON_NEXT: ICON_NEXT,
    ICON_SHUFFLE: ICON_SHUFFLE
  };
})(window);
