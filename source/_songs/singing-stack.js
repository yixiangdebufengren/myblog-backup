/* ==========================================================
 *  歌唱合集 · 牌堆模式
 *  ------------------------------------------------------
 *  视觉：卡片左对齐，后面的牌向右/下各偏移一点，只露出右边缘
 *  交互：Pointer Events 统一处理鼠标与触摸，不依赖 passive 设置
 *  数据：window.SONG_DATA（scripts/songlist.js 注入）
 * ========================================================== */
(function () {
  'use strict';

  var SWIPE_RATIO = 0.22;     // 相对卡片宽度的甩出阈值
  var SWIPE_VELOCITY = 0.35;  // 速度阈值 px/ms
  var ANIM_MS = 420;          // 与 CSS transition 对齐
  var VISIBLE = 3;            // 同屏渲染牌数
  var OFFSET_X = 14;          // 后面每张牌向右偏移
  var OFFSET_Y = 10;          // 后面每张牌向下偏移
  var SCALE_STEP = 0.05;      // 后面每张牌缩小比例

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
    var locked = false;
    var nodes = [];
    var gestureBound = false;

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
        .replace(/"/g, '&quot;');
    }

    function buildOrder() {
      var idx = data.map(function (_, i) { return i; });
      order = shuffled ? shuffleArr(idx) : idx;
      cursor = 0;
    }

    /* ---------- 生成一张牌 ---------- */
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

    /* ---------- 布局：位置 0 = 顶牌 ---------- */
    function layoutCard(el, position, dragX, dragRot) {
      if (position === 0) {
        var tx = dragX || 0;
        var rot = dragRot || 0;
        el.style.transform =
          'translate3d(' + tx + 'px, 0, 0) rotate(' + rot + 'deg) scale(1)';
        el.style.opacity = '1';
        el.style.zIndex = '10';
        el.style.pointerEvents = 'auto';
      } else {
        var scale = 1 - position * SCALE_STEP;
        el.style.transform =
          'translate3d(' + (position * OFFSET_X) + 'px, ' +
          (position * OFFSET_Y) + 'px, 0) scale(' + scale + ')';
        el.style.opacity = '1';
        el.style.zIndex = String(10 - position);
        el.style.pointerEvents = 'none';
      }
      el.classList.toggle('is-top', position === 0);
    }

    /* 拖动过程中，后面的牌按进度上浮 */
    function layoutBehind(progress) {
      for (var i = 1; i < nodes.length; i++) {
        var from = i, to = i - 1;
        var scale = (1 - from * SCALE_STEP) +
          ((1 - to * SCALE_STEP) - (1 - from * SCALE_STEP)) * progress;
        var ox = (from * OFFSET_X) + ((to * OFFSET_X) - (from * OFFSET_X)) * progress;
        var oy = (from * OFFSET_Y) + ((to * OFFSET_Y) - (from * OFFSET_Y)) * progress;
        nodes[i].el.style.transform =
          'translate3d(' + ox + 'px, ' + oy + 'px, 0) scale(' + scale + ')';
      }
    }

    /* ---------- 渲染 ---------- */
    function renderStack() {
      stageEl.innerHTML = '';
      nodes = [];

      for (var p = VISIBLE - 1; p >= 0; p--) {
        var realIdx = (cursor + p) % order.length;
        var songIndex = order[realIdx];
        var el = makeCard(songIndex);
        stageEl.appendChild(el);
        nodes.push({ el: el, position: p });
        layoutCard(el, p, 0, 0);
      }

      if (posEl) posEl.textContent = String(cursor + 1);
    }

    /* ---------- 下一张 ---------- */
    function nextCard(direction) {
      if (locked) return;
      locked = true;

      var top = nodes[0];
      if (!top) { locked = false; return; }

      var audio = top.el.querySelector('audio');
      if (audio && !audio.paused) audio.pause();

      var dist = direction === 'left' ? -(stageEl.offsetWidth + 120) : (stageEl.offsetWidth + 120);
      top.el.classList.add('fly-out');
      top.el.style.transform =
        'translate3d(' + dist + 'px, -24px, 0) rotate(' +
        (direction === 'left' ? -20 : 20) + 'deg) scale(0.92)';

      layoutBehind(1);

      setTimeout(function () {
        cursor = (cursor + 1) % order.length;
        renderStack();
        locked = false;
      }, ANIM_MS);
    }

    /* ---------- 手势：统一用 Pointer Events ---------- */
    function bindGesture() {
      if (gestureBound) return;
      gestureBound = true;

      var startX = 0, startY = 0, startTime = 0;
      var pointerId = null;
      var dragging = false;
      var decided = false;
      var horizontal = false;

      stageEl.style.touchAction = 'none';

      function getTop() {
        var t = stageEl.querySelector('.stack-card.is-top');
        return t;
      }

      function onDown(e) {
        if (locked) return;
        if (e.target.closest && e.target.closest('audio')) return;

        var top = getTop();
        if (!top) return;

        pointerId = e.pointerId;
        startX = e.clientX;
        startY = e.clientY;
        startTime = Date.now();
        dragging = true;
        decided = false;
        horizontal = false;

        if (stageEl.setPointerCapture) {
          try { stageEl.setPointerCapture(pointerId); } catch (err) {}
        }
      }

      function onMove(e) {
        if (!dragging || e.pointerId !== pointerId) return;

        var top = getTop();
        if (!top) return;

        var dx = e.clientX - startX;
        var dy = e.clientY - startY;

        if (!decided) {
          if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
          decided = true;
          horizontal = Math.abs(dx) > Math.abs(dy);

          if (horizontal) {
            top.classList.add('dragging');
          } else {
            dragging = false;
            return;
          }
        }

        if (!horizontal) return;
        e.preventDefault();

        var rot = dx / 20;
        var tx = dx;
        top.style.transform =
          'translate3d(' + tx + 'px, 0, 0) rotate(' + rot + 'deg) scale(1)';

        var w = top.offsetWidth || 300;
        var progress = Math.min(Math.abs(dx) / (w * 0.85), 1);
        layoutBehind(progress);
      }

      function onUp(e) {
        if (!dragging || e.pointerId !== pointerId) return;
        dragging = false;
        pointerId = null;

        var top = getTop();
        if (!top) return;
        top.classList.remove('dragging');

        var dx = e.clientX - startX;
        var dt = Math.max(Date.now() - startTime, 1);
        var velocity = Math.abs(dx) / dt;
        var w = top.offsetWidth || 300;
        var threshold = w * SWIPE_RATIO;

        if (Math.abs(dx) > threshold || velocity > SWIPE_VELOCITY) {
          nextCard(dx < 0 ? 'left' : 'right');
        } else {
          layoutCard(top, 0, 0, 0);
          layoutBehind(0);
        }
      }

      stageEl.addEventListener('pointerdown', onDown, { passive: true });
      stageEl.addEventListener('pointermove', onMove, { passive: false });
      stageEl.addEventListener('pointerup', onUp);
      stageEl.addEventListener('pointercancel', onUp);
    }

    /* ---------- 键盘 ---------- */
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
        var playing = listEl.querySelector('audio');
        if (playing && !playing.paused) playing.pause();

        listEl.style.display = 'none';
        stackEl.hidden = false;
        if (txt) txt.textContent = '列表模式';
        if (ico) ico.textContent = '📋';

        buildOrder();
        renderStack();
        bindGesture();
      } else {
        var p2 = stageEl.querySelector('audio');
        if (p2 && !p2.paused) p2.pause();

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