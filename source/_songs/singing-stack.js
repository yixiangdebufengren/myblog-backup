/* ==========================================================
 *  歌唱合集 · 牌堆模式
 *  ------------------------------------------------------
 *  数据来自 window.SONG_DATA（由 scripts/songlist.js 注入）
 *  功能：卡片列表 ⇄ 牌堆模式；牌堆内 🔀随机 ⇄ 🔢顺序 切换
 *  交互：触摸滑动 / 鼠标拖拽，超过阈值甩出，卡片循环回底部
 * ========================================================== */
(function () {
  'use strict';

  var SWIPE_RATIO = 0.24;     // 相对卡片宽度的甩出阈值
  var SWIPE_VELOCITY = 0.4;   // 速度阈值 px/ms
  var ANIM_MS = 420;          // 与 CSS 过渡时长对齐
  var VISIBLE = 3;            // 同时渲染的牌数

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    var data = window.SONG_DATA;
    var listEl = document.getElementById('song-list');
    var stackEl = document.getElementById('song-stack');
    var stageEl = document.getElementById('stack-stage');
    var modeBtn = document.getElementById('song-mode-btn');
    var shuffleBtn = document.getElementById('stack-shuffle');
    var shuffleTxt = document.getElementById('stack-shuffle-txt');
    var posEl = document.getElementById('stack-pos');

    if (!data || !data.length || !listEl || !stackEl || !stageEl || !modeBtn) return;

    var order = [];       // 当前牌堆顺序（索引数组）
    var cursor = 0;       // 当前牌堆顶部在第几个
    var shuffled = false; // 是否随机模式
    var inStack = false;  // 是否牌堆模式
    var locked = false;   // 动画中锁定
    var nodes = [];       // 渲染中的 DOM 节点

    /* ---------- 工具 ---------- */
    function shuffleArr(arr) {
      var a = arr.slice();
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    }

    function esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function buildOrder() {
      var idx = data.map(function (_, i) { return i; });
      order = shuffled ? shuffleArr(idx) : idx;
      cursor = 0;
    }

    /* ---------- 生成一张牌的 DOM ---------- */
    function makeCard(songIndex, position) {
      var s = data[songIndex];
      var el = document.createElement('div');
      el.className = 'stack-card';
      el.dataset.songIndex = String(songIndex);

      var noteHtml = s.note ? '<span><i>录制</i> ' + esc(s.note) + '</span>' : '';
      el.innerHTML =
        '<span class="stack-idx">' + String(songIndex + 1).padStart(2, '0') + '</span>' +
        '<div class="stack-title">' + esc(s.title) + '</div>' +
        '<span class="stack-by">' + esc(s.by) + '</span>' +
        '<audio controls preload="none">' +
        '<source src="' + esc(s.file) + '" type="' + (s.type === 'M4A' ? 'audio/mp4' : 'audio/mpeg') + '">' +
        '</audio>' +
        '<div class="stack-meta"><span><i>格式</i> ' + esc(s.type) + '</span>' +
        '<span><i>大小</i> ' + esc(s.size) + '</span>' + noteHtml + '</div>';

      return el;
    }

    /* ---------- 布局：按 position(0=顶) 计算变换 ---------- */
    function applyLayout(el, position, offsetX, rotation, instant) {
      if (instant) el.style.transition = 'none';

      if (position === 0) {
        el.style.transform =
          'translate3d(' + offsetX + 'px, 0, 0) rotate(' + rotation + 'deg) scale(1)';
        el.style.opacity = '1';
        el.style.zIndex = '10';
        el.style.pointerEvents = 'auto';
      } else {
        var scale = 1 - position * 0.045;
        var shiftY = position * 14;
        el.style.transform =
          'translate3d(0, ' + shiftY + 'px, 0) rotate(0deg) scale(' + scale + ')';
        el.style.opacity = String(Math.max(0, 1 - position * 0.28));
        el.style.zIndex = String(10 - position);
        el.style.pointerEvents = 'none';
      }

      el.classList.toggle('is-top', position === 0);

      if (instant) {
        void el.offsetWidth; // 强制重排，避免动画起始帧丢失
        el.style.transition = '';
      }
    }

    /* ---------- 重建牌堆 ---------- */
    function renderStack() {
      stageEl.innerHTML = '';
      nodes = [];

      for (var p = VISIBLE - 1; p >= 0; p--) {
        var realIdx = (cursor + p) % order.length;
        var songIndex = order[realIdx];
        var el = makeCard(songIndex, p);
        stageEl.appendChild(el);
        nodes.push({ el: el, position: p, songIndex: songIndex });
        applyLayout(el, p, 0, 0, true);
      }

      bindGesture(nodes[0].el);
      updateCounter();
    }

    function updateCounter() {
      if (posEl) posEl.textContent = String(cursor + 1);
    }

    /* ---------- 切换到下一张 ---------- */
    function nextCard(direction) {
      if (locked) return;
      locked = true;

      var top = nodes[0];
      if (!top) { locked = false; return; }

      // 先暂停顶部卡片的音频
      var audio = top.el.querySelector('audio');
      if (audio && !audio.paused) audio.pause();

      var dist = direction === 'left' ? -window.innerWidth : window.innerWidth;
      top.el.classList.add('fly-out');
      top.el.style.transform =
        'translate3d(' + dist + 'px, -30px, 0) rotate(' + (direction === 'left' ? -22 : 22) + 'deg) scale(0.94)';

      // 其余牌上移一位
      for (var i = 1; i < nodes.length; i++) {
        applyLayout(nodes[i].el, i - 1, 0, 0, false);
      }

      setTimeout(function () {
        cursor = (cursor + 1) % order.length;
        renderStack();
        locked = false;
      }, ANIM_MS);
    }

    /* ---------- 手势 ---------- */
    function bindGesture(el) {
      var startX = 0, startY = 0, startTime = 0;
      var dragging = false, decided = false, horizontal = false;

      function onDown(e) {
        if (locked) return;
        var p = e.touches ? e.touches[0] : e;
        // 点在播放器上不拦截
        if (e.target.closest && e.target.closest('audio')) return;

        startX = p.clientX;
        startY = p.clientY;
        startTime = Date.now();
        dragging = true;
        decided = false;
        horizontal = false;
      }

      function onMove(e) {
        if (!dragging) return;
        var p = e.touches ? e.touches[0] : e;
        var dx = p.clientX - startX;
        var dy = p.clientY - startY;

        if (!decided) {
          if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
          decided = true;
          horizontal = Math.abs(dx) > Math.abs(dy);
          if (horizontal) {
            el.classList.add('dragging');
          } else {
            dragging = false; // 垂直滚动，交还给页面
            return;
          }
        }

        if (!horizontal) return;
        if (e.cancelable) e.preventDefault();

        var rot = dx / 18;
        applyLayout(el, 0, dx, rot, false);

        // 后面的牌跟随轻微上浮
        var prog = Math.min(Math.abs(dx) / (el.offsetWidth * 0.9), 1);
        for (var i = 1; i < nodes.length; i++) {
          var baseScale = 1 - i * 0.045;
          var nextScale = 1 - (i - 1) * 0.045;
          var sc = baseScale + (nextScale - baseScale) * prog;
          var y = i * 14 * (1 - prog);
          nodes[i].el.style.transform =
            'translate3d(0,' + y + 'px,0) scale(' + sc + ')';
          nodes[i].el.style.opacity = String(Math.min(1, (1 - i * 0.28) + 0.28 * prog));
        }
      }

      function onUp(e) {
        if (!dragging) return;
        dragging = false;
        el.classList.remove('dragging');

        var p = e.changedTouches ? e.changedTouches[0] : e;
        var dx = p.clientX - startX;
        var dt = Math.max(Date.now() - startTime, 1);
        var velocity = Math.abs(dx) / dt;
        var threshold = el.offsetWidth * SWIPE_RATIO;

        if (Math.abs(dx) > threshold || velocity > SWIPE_VELOCITY) {
          nextCard(dx < 0 ? 'left' : 'right');
        } else {
          // 回弹
          applyLayout(el, 0, 0, 0, false);
          for (var i = 1; i < nodes.length; i++) {
            applyLayout(nodes[i].el, i, 0, 0, false);
          }
        }
      }

      el.addEventListener('mousedown', onDown);
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      el.addEventListener('touchstart', onDown, { passive: true });
      el.addEventListener('touchmove', onMove, { passive: false });
      el.addEventListener('touchend', onUp);
      el.addEventListener('touchcancel', onUp);
    }

    /* ---------- 键盘左右切换 ---------- */
    document.addEventListener('keydown', function (e) {
      if (!inStack) return;
      if (e.key === 'ArrowLeft') nextCard('left');
      if (e.key === 'ArrowRight') nextCard('right');
    });

    /* ---------- 模式切换 ---------- */
    modeBtn.addEventListener('click', function () {
      inStack = !inStack;

      var txt = modeBtn.querySelector('.song-mode-txt');
      var ico = modeBtn.querySelector('.song-mode-ico');

      if (inStack) {
        listEl.style.display = 'none';
        stackEl.hidden = false;
        if (txt) txt.textContent = '列表模式';
        if (ico) ico.textContent = '📋';
        buildOrder();
        renderStack();
      } else {
        // 退出时暂停牌堆内音频
        var playing = stageEl.querySelector('audio');
        if (playing && !playing.paused) playing.pause();
        stackEl.hidden = true;
        listEl.style.display = '';
        if (txt) txt.textContent = '牌堆模式';
        if (ico) ico.textContent = '🎴';
      }
    });

    /* ---------- 随机 / 顺序 ---------- */
    if (shuffleBtn) {
      shuffleBtn.addEventListener('click', function () {
        shuffled = !shuffled;
        shuffleBtn.classList.toggle('seq', !shuffled);
        if (shuffleTxt) shuffleTxt.textContent = shuffled ? '🔀 随机' : '🔢 顺序';

        var playing = stageEl.querySelector('audio');
        if (playing && !playing.paused) playing.pause();

        buildOrder();
        renderStack();
      });
    }
  });
})();