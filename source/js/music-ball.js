(function () {
  // 强力清理旧版残留
  const oldBall = document.getElementById("music-ball");
  if (oldBall) oldBall.remove();
  const oldPanel = document.getElementById("music-panel");
  if (oldPanel) oldPanel.remove();
  document.querySelectorAll('audio[data-music-ball]').forEach(a => a.remove());

  const STORAGE_INDEX = "musicIndex";
  const STORAGE_POSITION = "musicPosition";
  const CLICK_DELAY = 240;
  const DRAG_LIMIT = 5;
  const EDGE_SNAP_DIST = 50; 
  const HIDE_DELAY = 1500;   

  let songs = [];
  let index = 0;
  let dragging = false;
  let moved = false;
  let suppressClick = false;
  let clickTimer = null;
  let faviconTimer = null;
  let faviconAngle = 0;
  
  let sx = 0, sy = 0;
  let startLeft = 0, startTop = 0;

  let hideTimer = null;
  let isHalfHidden = false;
  let awakeX = 20, awakeY = 120; 

  let currentLyrics = [];
  let currentLyricIndex = -1;

  const audio = document.createElement("audio");
  audio.setAttribute("data-music-ball", "true");
  audio.preload = "metadata";
  document.body.appendChild(audio);

  const ball = document.createElement("button");
  ball.id = "music-ball";
  ball.type = "button";
  ball.setAttribute("aria-label", "打开音乐菜单");
  ball.innerHTML = `
    <svg class="music-icon" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
    </svg>
  `;
  document.body.appendChild(ball);

  const panel = document.createElement("div");
  panel.id = "music-panel";
  panel.setAttribute("aria-hidden", "true");
  // 面板内新增了一个 .music-header 头部，包含了标题和关闭按钮
  panel.innerHTML = `
    <div class="music-header">
      <div class="music-title">我的歌单</div>
      <button class="music-close" type="button" aria-label="关闭面板">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
      </button>
    </div>
    <div class="music-now">
      <div class="music-now-title">正在加载...</div>
      <div class="music-controls">
        <button class="music-prev" type="button" aria-label="上一曲">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
        </button>
        <button class="music-toggle" type="button" aria-label="播放或暂停">
          <svg class="play-svg" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </button>
        <button class="music-next" type="button" aria-label="下一曲">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6zm9-12v12h2V6z"/></svg>
        </button>
      </div>
    </div>
    <input class="music-progress" type="range" min="0" max="1000" value="0" step="1" aria-label="音乐进度">
    <div class="music-time"><span class="music-current">0:00</span><span class="music-duration">0:00</span></div>
    <div id="music-list"></div>
  `;
  document.body.appendChild(panel);

  const icon = ball.querySelector(".music-icon");
  const closeBtn = panel.querySelector(".music-close");
  const title = panel.querySelector(".music-now-title");
  const toggle = panel.querySelector(".music-toggle");
  const prevBtn = panel.querySelector(".music-prev");
  const nextBtn = panel.querySelector(".music-next");
  const progress = panel.querySelector(".music-progress");
  const currentTime = panel.querySelector(".music-current");
  const durationTime = panel.querySelector(".music-duration");
  const list = panel.querySelector("#music-list");

  setFaviconFrame(0);
  restorePosition();
  loadSongs();

  function loadSongs() {
    fetch("/music/music.json")
      .then(res => {
        if (!res.ok) throw new Error("加载失败");
        return res.json();
      })
      .then(data => {
        songs = Array.isArray(data) ? data.filter(s => s && s.title && s.url) : [];
        if (!songs.length) {
          title.textContent = "暂无歌曲";
          return;
        }
        const savedIndex = Number(localStorage.getItem(STORAGE_INDEX));
        index = Number.isInteger(savedIndex) && songs[savedIndex] ? savedIndex : 0;
        renderList();
        loadSong(index, false);
      })
      .catch(() => { title.textContent = "歌单加载失败"; });
  }

  function renderList() {
    list.innerHTML = "";
    songs.forEach((song, songIndex) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "music-item";
      item.textContent = song.title;
      item.addEventListener("click", () => {
        loadSong(songIndex, true);
      });
      list.appendChild(item);
    });
    updateActive();
  }

  function loadSong(nextIndex, autoplay) {
    if (!songs[nextIndex]) return;
    index = nextIndex;
    audio.src = songs[index].url;
    audio.load();
    localStorage.setItem(STORAGE_INDEX, String(index));

    currentLyrics = parseLrc(songs[index].lrc);
    currentLyricIndex = -1;
    title.textContent = songs[index].title;

    progress.value = "0";
    currentTime.textContent = "0:00";
    durationTime.textContent = "0:00";
    updateActive();

    if (autoplay) playAudio();
  }

  function playAudio() {
    if (!songs.length) return;
    audio.play().catch(() => syncPlayingState());
    syncPlayingState();
  }

  function togglePlayback() {
    if (!songs.length) return;
    if (audio.paused) playAudio();
    else audio.pause();
  }

  function parseLrc(lrcStr) {
    if (!lrcStr) return [];
    const lines = lrcStr.split('\n');
    const result = [];
    const timeExp = /\[(\d{2}):(\d{2}(?:\.\d+)?)\]/g;
    
    lines.forEach(line => {
      let match;
      const text = line.replace(timeExp, '').trim();
      while ((match = timeExp.exec(line)) !== null) {
        const m = parseInt(match[1], 10);
        const s = parseFloat(match[2]);
        result.push({ time: m * 60 + s, text: text });
      }
    });
    return result.sort((a, b) => a.time - b.time);
  }

  function syncLyrics() {
    if (!currentLyrics.length) {
      if (title.textContent !== songs[index].title) {
        title.textContent = songs[index].title;
      }
      return;
    }
    
    const time = audio.currentTime;
    let newIndex = -1;
    
    for (let i = 0; i < currentLyrics.length; i++) {
      if (time >= currentLyrics[i].time - 0.15) {
        newIndex = i;
      } else {
        break;
      }
    }

    if (newIndex !== currentLyricIndex) {
      currentLyricIndex = newIndex;
      let textToShow = songs[index].title; 
      if (newIndex !== -1 && currentLyrics[newIndex].text) {
        textToShow = currentLyrics[newIndex].text;
      }
      title.textContent = textToShow;
    }
  }

  function resetHideTimer() {
    window.clearTimeout(hideTimer);
    if (panel.classList.contains("show") || dragging) return;

    hideTimer = window.setTimeout(() => {
      const w = ball.offsetWidth || 58;
      const ww = window.innerWidth;
      
      let targetX = awakeX;
      let shouldHide = false;

      if (awakeX < EDGE_SNAP_DIST) {
        targetX = -w / 2; 
        shouldHide = true;
      } else if (awakeX + w > ww - EDGE_SNAP_DIST) {
        targetX = ww - w / 2; 
        shouldHide = true;
      }

      if (shouldHide) {
        isHalfHidden = true;
        ball.style.left = targetX + "px";
        ball.style.top = awakeY + "px";
        ball.classList.add("half-hidden");
      }
    }, HIDE_DELAY);
  }

  function wakeUp() {
    window.clearTimeout(hideTimer);
    if (!isHalfHidden) return;
    isHalfHidden = false;
    ball.classList.remove("half-hidden");

    const w = ball.offsetWidth || 58;
    const ww = window.innerWidth;

    if (awakeX <= 0) awakeX = 8;
    if (awakeX + w >= ww) awakeX = ww - w - 8;

    ball.style.left = awakeX + "px";
    ball.style.top = awakeY + "px";
  }

  function restorePosition() {
    const pos = localStorage.getItem(STORAGE_POSITION);
    if (pos) {
      try {
        const p = JSON.parse(pos);
        awakeX = Math.max(0, Math.min(window.innerWidth - 58, p.x));
        awakeY = Math.max(0, Math.min(window.innerHeight - 58, p.y));
        ball.style.left = awakeX + "px";
        ball.style.top = awakeY + "px";
      } catch(e) {}
    } else {
      awakeX = window.innerWidth - 58 - 15;
      awakeY = window.innerHeight - 150;
      ball.style.left = awakeX + "px";
      ball.style.top = awakeY + "px";
    }
    resetHideTimer();
  }

  function togglePanel() {
    if (panel.classList.contains("show")) {
      panel.classList.remove("show");
      panel.setAttribute("aria-hidden", "true");
      resetHideTimer(); 
    } else {
      wakeUp(); 
      panel.classList.add("show");
      panel.setAttribute("aria-hidden", "false");
      alignPanelToBall();
    }
  }

  function alignPanelToBall() {
    const rect = ball.getBoundingClientRect();
    const panelWidth = panel.offsetWidth || 300;
    const panelHeight = panel.offsetHeight || 400;
    const gap = 14; 
    const padding = 12;

    let targetLeft = 0;
    let targetTop = 0;

    if (rect.left < window.innerWidth / 2) {
      targetLeft = rect.right + gap;
      if (targetLeft + panelWidth > window.innerWidth - padding) {
        targetLeft = window.innerWidth - panelWidth - padding;
      }
    } else {
      targetLeft = rect.left - panelWidth - gap;
      if (targetLeft < padding) targetLeft = padding;
    }

    targetTop = rect.top + (rect.height / 2) - (panelHeight / 2);
    if (targetTop < padding) targetTop = padding;
    if (targetTop + panelHeight > window.innerHeight - padding) {
      targetTop = window.innerHeight - panelHeight - padding;
    }

    panel.style.left = targetLeft + "px";
    panel.style.top = targetTop + "px";
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  }

  // 关闭按钮点击事件
  closeBtn.addEventListener("click", () => {
    if (panel.classList.contains("show")) {
      togglePanel();
    }
  });

  ball.addEventListener("click", function () {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (moved) return;

    if (isHalfHidden) {
      wakeUp();
      resetHideTimer();
      return; 
    }

    window.clearTimeout(clickTimer);
    clickTimer = window.setTimeout(() => togglePanel(), CLICK_DELAY);
  });

  ball.addEventListener("dblclick", function () {
    window.clearTimeout(clickTimer);
    togglePlayback();
  });

  toggle.addEventListener("click", togglePlayback);
  prevBtn.addEventListener("click", () => {
    if (!songs.length) return;
    loadSong((index - 1 + songs.length) % songs.length, true);
  });
  nextBtn.addEventListener("click", () => {
    if (!songs.length) return;
    loadSong((index + 1) % songs.length, true);
  });

  ball.addEventListener("pointerdown", function (event) {
    dragging = true;
    moved = false;
    sx = event.clientX;
    sy = event.clientY;

    const rect = ball.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;

    ball.setPointerCapture(event.pointerId);
    ball.classList.add("dragging"); 
    
    wakeUp(); 
  });

  ball.addEventListener("pointermove", function (event) {
    if (!dragging) return;
    const dx = event.clientX - sx;
    const dy = event.clientY - sy;

    if (!moved && Math.abs(dx) <= DRAG_LIMIT && Math.abs(dy) <= DRAG_LIMIT) return;
    moved = true;

    const w = ball.offsetWidth;
    const h = ball.offsetHeight;
    let x = startLeft + dx;
    let y = startTop + dy;

    x = Math.max(0, Math.min(window.innerWidth - w, x));
    y = Math.max(0, Math.min(window.innerHeight - h, y));

    ball.style.left = x + "px";
    ball.style.top = y + "px";

    if (panel.classList.contains("show")) alignPanelToBall();
  });

  ball.addEventListener("pointerup", function (event) {
    dragging = false;
    ball.classList.remove("dragging");

    if (ball.hasPointerCapture(event.pointerId)) {
      ball.releasePointerCapture(event.pointerId);
    }

    if (moved) {
      const rect = ball.getBoundingClientRect();
      awakeX = rect.left;
      awakeY = rect.top;
      
      localStorage.setItem(STORAGE_POSITION, JSON.stringify({ x: awakeX, y: awakeY }));
      suppressClick = true;
    }

    if (!panel.classList.contains("show")) {
      resetHideTimer(); 
    }
  });

  ball.addEventListener("pointercancel", function () {
    dragging = false;
    ball.classList.remove("dragging");
    resetHideTimer();
  });

  window.addEventListener("resize", function () {
    if (panel.classList.contains("show")) alignPanelToBall();
    resetHideTimer();
  });

  function syncPlayingState() {
    const isPlaying = !audio.paused && !audio.ended;
    icon.classList.toggle("playing", isPlaying);
    ball.classList.toggle("playing", isPlaying);
    
    if (isPlaying) {
      toggle.innerHTML = '<svg class="pause-svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
      toggle.setAttribute("aria-label", "暂停");
      startFaviconSpin();
    } else {
      toggle.innerHTML = '<svg class="play-svg" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
      toggle.setAttribute("aria-label", "播放");
      stopFaviconSpin();
    }
  }

  function updateActive() {
    list.querySelectorAll(".music-item").forEach((item, itemIndex) => {
      item.classList.toggle("active", itemIndex === index);
    });
  }

  progress.addEventListener("input", function () {
    if (!Number.isFinite(audio.duration) || !audio.duration) return;
    audio.currentTime = (Number(progress.value) / 1000) * audio.duration;
    updateProgress();
    syncLyrics(); 
  });

  audio.addEventListener("loadedmetadata", updateProgress);
  audio.addEventListener("timeupdate", function() {
    updateProgress();
    syncLyrics();
  });
  
  audio.addEventListener("play", syncPlayingState);
  audio.addEventListener("pause", syncPlayingState);
  audio.addEventListener("ended", function () {
    if (!songs.length) return;
    loadSong((index + 1) % songs.length, true);
  });

  function startFaviconSpin() {
    if (faviconTimer) return;
    faviconTimer = window.setInterval(() => {
      faviconAngle = (faviconAngle + 18) % 360;
      setFaviconFrame(faviconAngle);
    }, 120);
  }

  function stopFaviconSpin() {
    if (!faviconTimer) return;
    window.clearInterval(faviconTimer);
    faviconTimer = null;
    setFaviconFrame(faviconAngle);
  }

  function setFaviconFrame(angle) {
    const link = ensureFaviconLink();
    const canvas = drawFaviconFrame(angle);
    link.href = canvas.toDataURL("image/png");
    link.type = "image/png";
  }

  function ensureFaviconLink() {
    let link = document.querySelector('link[rel~="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    return link;
  }

  function drawFaviconFrame(angle) {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const center = size / 2;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate((angle * Math.PI) / 180);
    ctx.beginPath();
    ctx.arc(0, 0, 29, 0, Math.PI * 2);
    ctx.fillStyle = "#0c1018";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.32)";
    ctx.lineWidth = 1;
    [11, 16, 21, 26].forEach(r => { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke(); });
    ctx.beginPath();
    ctx.ellipse(-13, -15, 11, 4, -0.35, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,.28)";
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(center, center, 12, 0, Math.PI * 2);
    ctx.fillStyle = "#2563eb";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(30, 24); ctx.lineTo(30, 40); ctx.lineTo(43, 32); ctx.closePath();
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    return canvas;
  }

  function updateProgress() {
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    progress.value = duration ? String(Math.round((current / duration) * 1000)) : "0";
    currentTime.textContent = formatTime(current);
    durationTime.textContent = formatTime(duration);
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
    const minutes = Math.floor(seconds / 60);
    const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
    return minutes + ":" + rest;
  }
})();