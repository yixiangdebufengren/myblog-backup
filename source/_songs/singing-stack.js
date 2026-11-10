/* ==========================================================
 *  歌唱合集 · 牌堆模式 v4
 *  ------------------------------------------------------
 *  动画：Tinder 式——顶牌拖走飞出，下一张弹起成为新顶牌
 *  要点：
 *   1. 顶牌拖动时 scale 恒为 1，不缩放（消除"按压感"）
 *   2. 后牌只做 translateY 上浮，不做缩放插值
 *   3. 飞出走抛物线，带旋转与淡出
 *   4. 新顶牌"弹起"用弹性曲线，轻微过冲
 * ========================================================== */
(function () {
  'use strict';

  var SWIPE_RATIO = 0.22;    // 相对卡片宽度甩出阈值
  var SWIPE_VELOCITY = 0.35; // 速度阈值 px/ms
  var ANIM_MS = 380;         // 与 CSS 飞出动效对齐
  var VISIBLE = 3;
  var OFFSET_X = 16;         // 后牌横向错开
  var OFFSET_Y = 12;         // 后牌纵向错开
  var SIDE_GAP = 42;

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

    var order = [];
    var cursor = 0;
    var shuffled = false;
    var inStack = false;
    var nodes = [];

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
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '\u0026quot;');
    }

    function buildOrder() {
      var idx = data.map(function (_, i) { return i; });
      order = shuffled ? shuffleArr(idx) : idx;
      cursor = 0;
    }

    /* 同步按钮文案与状态 */
    function syncShuffleUI() {
      if (!shuffleBtn) return;
      shuffleBtn.classList.toggle('seq', !shuffled);
      if (shuffleTxt) {
        shuffleTxt.textContent = shuffled ? '🔀 随机' : '🔢 顺序';
      }
      shuffleBtn.setAttribute('title',
        shuffled ? '当前：随机排列（点击切换为顺序）' : '当前：按顺序（点击切换为随机）');
    }

    /* ---------- 卡片尺寸 ---------- */
    function cardWidth() {
      var w = stageEl.clientWidth || 300;
      var gap = window.innerWidth <= 768 ? 30 : SIDE_GAP;
      return Math.max(w - gap, 200);
    }

    function applySizes() {
      var w = cardWidth();
      for (var i = 0; i < nodes.length; i++) {
        nodes[i].el.style.width = w + 'px';
      }
      var h = 0;
      for (var j = 0; j < nodes.length; j++) {
        var hh = nodes[j].el.offsetHeight;
        if (hh > h) h = hh;
      }
      if (h > 0) {
        stageEl.style.height = (h + VISIBLE * OFFSET_Y + 16) + 'px';
      }
    }

    /* ---------- 卡片 ---------- */
    function makeCard(songIndex) {
      var s = data[songIndex];
      var el = document.createElement('div');
      el.className = 'stack-card';
      el.dataset.songIndex = String(songIndex);

      var noteHtml = s.note ? '<span><i>录制</i> ' + esc(s.note) + '</span>' : '';
      var mime = s.type === 'M4A' ? 'audio/mp4' : 'audio/mpeg';

      el.innerHTML =
        '<div class="stack-top-row">' +
        '<span class="stack-idx">' + String(songIndex + 1).padStart(2, '0') + '</span>' +
        '<span class="stack-by">' + esc(s.by) + '</span>' +
        '</div>' +
        '<div class="stack-title">' + esc(s.title) + '</div>' +
        '<audio controls preload="none">' +
        '<source src="' + esc(s.file) + '" type="' + mime + '">' +
        '</audio>' +
        '<div class="stack-meta">' +
        '<span><i>格式</i> ' + esc(s.type) + '</span>' +
        '<span><i>大小</i> ' + esc(s.size) + '</span>' +
        noteHtml +
        '</div>';

      return el;
    }

    /* ---------- 布局：只做位移，不做缩放 ---------- */
    function placeCard(el, position, dragX, dragRot) {
      if (position === 0) {
        el.style.transform =
          'translate3d(' + (dragX || 0) + 'px, 0, 0) rotate(' + (dragRot || 0) + 'deg)';
        el.style.zIndex = '10';
        el.style.opacity = '1';
        el.style.pointerEvents = 'auto';
      } else {
        // 后牌纯位移，不缩放 —— 消除"被按压"观感
        el.style.transform =
          'translate3d(' + (position * OFFSET_X) + 'px, ' +
          (position * OFFSET_Y) + 'px, 0)';
        el.style.zIndex = String(10 - position);
        el.style.opacity = String(1 - position * 0.12);
        el.style.pointerEvents = 'none';
      }
      el.classList.toggle('is-top', position === 0);
    }

    /* 拖动时后牌上浮：只动 Y，不缩放 */
    function placeBehind(progress) {
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        if (n.position === 0) continue;  // 顶牌不参与
        var from = n.position, to = n.position - 1;
        var ox = (from + (to - from) * progress) * OFFSET_X;
        var oy = (from + (to - from) * progress) * OFFSET_Y;
        n.el.style.transform = 'translate3d(' + ox + 'px, ' + oy + 'px, 0)';
        n.el.style.opacity = String(1 - (from + (to - from) * progress) * 0.12);
      }
    }

    /* ---------- 渲染 ---------- */
    function renderStack(bounce) {
      stageEl.innerHTML = '';
      nodes = [];

      for (var p = VISIBLE - 1; p >= 0; p--) {
        var realIdx = (cursor + p) % order.length;
        var el = makeCard(order[realIdx]);
        stageEl.appendChild(el);
        nodes.push({ el: el, position: p });
      }

      applySizes();

      for (var k = 0; k < nodes.length; k++) {
        var n = nodes[k];
        if (bounce && n.position === 0) {
          // 新顶牌：从下方弹起
          n.el.style.transition = 'none';
          n.el.style.transform = 'translate3d(0, 26px, 0)';
          n.el.style.opacity = '0.4';
          void n.el.offsetWidth;
          n.el.style.transition = '';
          n.el.style.transform = 'translate3d(0, 0, 0)';
          n.el.style.opacity = '1';
        } else {
          placeCard(n.el, n.position, 0, 0);
        }
      }

      if (posEl) posEl.textContent = String(cursor + 1);
      bindTopGesture();
    }

    /* ---------- 飞出并切换 ---------- */
    function flyAway(direction) {
      var top = topNode();
      if (!top) return;
      // 用顶牌自身状态判断，而不是靠外部锁变量
      if (top.el.classList.contains('fly-out')) return;

      var audio = top.el.querySelector('audio');
      if (audio && !audio.paused) audio.pause();

      var dist = (stageEl.offsetWidth + 200) * (direction === 'left' ? -1 : 1);

      // 抛物线：横向飞出 + 下沉 + 大角度旋转 + 淡出
      top.el.classList.add('fly-out');
      top.el.style.transform =
        'translate3d(' + dist + 'px, 40px, 0) rotate(' +
        (direction === 'left' ? -26 : 26) + 'deg)';
      top.el.style.opacity = '0';

      // 后面的牌同时上浮到新位置
      placeBehind(1);

      cursor = (cursor + 1) % order.length;

      // 用 requestAnimationFrame 兜底：即使定时器被节流，帧回调也会推进
      var done = false;
      function advance() {
        if (done) return;
        done = true;
        renderStack(true);
      }
      setTimeout(advance, ANIM_MS);
      // 兜底：动画结束后短时间内强制推进，避免卡死
      setTimeout(advance, ANIM_MS + 260);
    }

    /* ---------- 手势 ---------- */
    function topNode() {
      // 顶牌 = position 为 0 的那张（DOM 中位于最后）
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].position === 0) return nodes[i];
      }
      return null;
    }

    function bindTopGesture() {
      var top = topNode();
      var el = top && top.el;
      if (!el) return;

      var startX = 0, startY = 0, startTime = 0;
      var pid = null;
      var active = false;
      var decided = false;

      function down(e) {
        if (el.classList.contains('fly-out')) return;
        if (e.target.closest && e.target.closest('audio')) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;

        pid = e.pointerId;
        startX = e.clientX;
        startY = e.clientY;
        startTime = Date.now();
        active = true;
        decided = false;

        try { el.setPointerCapture(pid); } catch (err) {}
      }

      function move(e) {
        if (!active || e.pointerId !== pid) return;

        var dx = e.clientX - startX;
        var dy = e.clientY - startY;

        if (!decided) {
          if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
          // 垂直意图明显才放弃，否则一律按水平处理
          if (Math.abs(dy) > Math.abs(dx) * 1.6) {
            active = false;
            try { el.releasePointerCapture(pid); } catch (err) {}
            return;
          }
          decided = true;
          el.classList.add('dragging');
        }

        if (e.cancelable) e.preventDefault();

        // 轻微阻尼，手感更接近真实纸牌
        var tx = dx * 0.94;
        el.style.transform =
          'translate3d(' + tx + 'px, 0, 0) rotate(' + (dx / 22) + 'deg)';

        var w = el.offsetWidth || 300;
        placeBehind(Math.min(Math.abs(dx) / (w * 0.85), 1));
      }

      function up(e) {
        if (!active || e.pointerId !== pid) return;
        active = false;
        pid = null;
        el.classList.remove('dragging');
        try { el.releasePointerCapture(e.pointerId); } catch (err) {}

        var dx = e.clientX - startX;
        var dt = Math.max(Date.now() - startTime, 1);
        var w = el.offsetWidth || 300;

        if (Math.abs(dx) > w * SWIPE_RATIO ||
            (Math.abs(dx) > 20 && Math.abs(dx) / dt > SWIPE_VELOCITY)) {
          flyAway(dx < 0 ? 'left' : 'right');
        } else {
          // 回弹：弹性曲线
          el.classList.add('rebound');
          placeCard(el, 0, 0, 0);
          placeBehind(0);
          setTimeout(function () {
            el.classList.remove('rebound');
          }, 420);
        }
      }

      el.addEventListener('pointerdown', down, { passive: false });
      el.addEventListener('pointermove', move, { passive: false });
      el.addEventListener('pointerup', up, { passive: true });
      el.addEventListener('pointercancel', up, { passive: true });
      el.addEventListener('dragstart', function (e) { e.preventDefault(); });
    }

    /* ---------- 键盘 ---------- */
    document.addEventListener('keydown', function (e) {
      if (!inStack) return;
      if (e.key === 'ArrowLeft') flyAway('left');
      if (e.key === 'ArrowRight') flyAway('right');
    });

    /* ---------- 模式切换 ---------- */
    modeBtn.addEventListener('click', function () {
      inStack = !inStack;
      var txt = modeBtn.querySelector('.song-mode-txt');
      var ico = modeBtn.querySelector('.song-mode-ico');

      if (inStack) {
        var a1 = listEl.querySelector('audio');
        if (a1 && !a1.paused) a1.pause();

        listEl.style.display = 'none';
        stackEl.hidden = false;
        if (txt) txt.textContent = '列表模式';
        if (ico) ico.textContent = '📋';

        buildOrder();
        renderStack(false);
        syncShuffleUI();
      } else {
        var a2 = stageEl.querySelector('audio');
        if (a2 && !a2.paused) a2.pause();

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
        syncShuffleUI();

        var a = stageEl.querySelector('audio');
        if (a && !a.paused) a.pause();

        buildOrder();
        renderStack(false);
      });
    }

    /* ---------- 尺寸变化 ---------- */
    var rt = null;
    window.addEventListener('resize', function () {
      if (!inStack) return;
      clearTimeout(rt);
      rt = setTimeout(function () {
        applySizes();
        for (var k = 0; k < nodes.length; k++) {
          var n = nodes[k];
          placeCard(n.el, n.position, 0, 0);
        }
      }, 180);
    });

    // 初始按钮文案与状态对齐
    syncShuffleUI();
  });
})();