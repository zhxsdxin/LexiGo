/**
 * 日语发音
 * ---------------------------------------------------------------
 * 基于浏览器内置的 Speech Synthesis API，无任何第三方依赖。
 * 当环境不支持、或没有安装日语语音时，静默降级：
 * 页面功能不受影响，发音按钮显示为不可用状态。
 */
(function (global) {
  'use strict';

  var synth = global.speechSynthesis || null;
  var voices = [];
  var jaVoice = null;
  var supported = !!synth && typeof global.SpeechSynthesisUtterance === 'function';

  function loadVoices() {
    if (!supported) return;
    try {
      voices = synth.getVoices() || [];
    } catch (e) {
      voices = [];
    }
    jaVoice = null;
    for (var i = 0; i < voices.length; i++) {
      var lang = (voices[i].lang || '').toLowerCase().replace('_', '-');
      if (lang === 'ja' || lang.indexOf('ja-') === 0) {
        jaVoice = voices[i];
        break;
      }
    }
  }

  if (supported) {
    loadVoices();
    // 部分浏览器语音列表异步加载
    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', loadVoices);
    } else {
      synth.onvoiceschanged = loadVoices;
    }
  }

  function cancel() {
    if (!supported) return;
    try {
      synth.cancel();
    } catch (e) { /* 忽略 */ }
  }

  /**
   * 朗读文本
   * @returns {boolean} 是否成功发起朗读
   */
  function speak(text, opts) {
    if (!supported || !text) return false;
    opts = opts || {};
    try {
      cancel();
      var utter = new global.SpeechSynthesisUtterance(text);
      utter.lang = 'ja-JP';
      if (jaVoice) utter.voice = jaVoice;
      utter.rate = opts.rate || 0.95;
      utter.pitch = opts.pitch || 1;
      utter.volume = 1;
      synth.speak(utter);
      return true;
    } catch (e) {
      return false;
    }
  }

  global.LexiGo = global.LexiGo || {};
  global.LexiGo.Speech = {
    supported: supported,
    /** 有日语语音时为 true；系统支持但缺日语语音包时为 false */
    hasJapanese: function () {
      loadVoices();
      return !!jaVoice;
    },
    speak: speak,
    cancel: cancel
  };
})(window);