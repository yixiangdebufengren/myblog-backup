/* ==========================================================
 *  歌唱合集 · Hexo 插件
 *  ------------------------------------------------------
 *  1) 注册标签 {% songlist %}，读取 source/_songs/songs.yml，
 *     在生成期渲染出完整静态 HTML（无首屏闪动，SEO 友好）
 *  2) 把 source/_songs/ 下的 css/js 发布到 public/songs/
 *     （下划线开头的目录 Hexo 默认不复制，这里补上）
 * ========================================================== */

const fs = require('fs');
const path = require('path');

const SONG_DIR = '_songs';
const YML_FILE = 'songs.yml';
const ASSETS = ['singing-card.css', 'singing-stack.js'];
const PUBLIC_DIR = 'songs';

/* ---------- 读取歌曲数据 ---------- */
function loadSongs(hexo) {
  const ymlPath = path.join(hexo.source_dir, SONG_DIR, YML_FILE);
  if (!fs.existsSync(ymlPath)) {
    hexo.log.warn('[SongList] 未找到 ' + ymlPath);
    return [];
  }
  try {
    // 复用 hexo 自带的 yaml 解析（hexo 依赖 js-yaml）
    const yaml = require('js-yaml');
    const raw = fs.readFileSync(ymlPath, 'utf8');
    const data = yaml.load(raw);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    hexo.log.error('[SongList] 解析 songs.yml 失败: ' + e.message);
    return [];
  }
}

/* ---------- HTML 转义 ---------- */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ---------- 渲染普通卡片视图 ---------- */
function renderCards(songs) {
  const cards = songs.map((s, i) => {
    const noteHtml = s.note
      ? `<span><i>录制</i> ${esc(s.note)}</span>`
      : '';
    return `
<div class="song-card">
<div class="song-head">
<span class="song-idx"></span>
<span class="song-title">${esc(s.title)}</span>
<span class="song-by">${esc(s.by)}</span>
</div>
<audio controls preload="none">
  <source src="${esc(s.file)}" type="${s.type === 'M4A' ? 'audio/mp4' : 'audio/mpeg'}">
  您的浏览器不支持 audio 标签。
</audio>
<div class="song-meta"><span><i>格式</i> ${esc(s.type || 'MP3')}</span><span><i>大小</i> ${esc(s.size || '')}</span>${noteHtml}</div>
</div>`;
  }).join('\n');

  return `
<div class="song-summary">
  <span>共 <b>${songs.length}</b> 首</span>
  <span class="dot"></span>
  <span>全部为手机直录</span>
  <span class="dot"></span>
  <span>点播放键即可收听 <img src="/images/heart.gif" alt="比心" role="img" style="width:22px;height:auto;vertical-align:middle;margin-left:2px;"></span>
</div>

<div class="song-toggle-bar">
  <button type="button" class="song-mode-btn" id="song-mode-btn">
    <span class="song-mode-ico">🎴</span><span class="song-mode-txt">牌堆模式</span>
  </button>
</div>

<div class="song-list" id="song-list">
${cards}
</div>

<div class="song-stack" id="song-stack" hidden>
  <div class="stack-toolbar">
    <span class="stack-count"><b id="stack-pos">1</b> / ${songs.length}</span>
    <button type="button" class="stack-shuffle" id="stack-shuffle" title="切换随机 / 顺序">
      <span id="stack-shuffle-txt">🔀 随机</span>
    </button>
  </div>
  <div class="stack-stage" id="stack-stage"></div>
  <div class="stack-hint">左右拖拽或滑动切换 · 点击卡片播放</div>
</div>

<link rel="stylesheet" href="/songs/singing-card.css">
<script>
window.SONG_DATA = ${JSON.stringify(songs.map(s => ({
    title: s.title,
    by: s.by,
    file: s.file,
    size: s.size || '',
    type: s.type || 'MP3',
    note: s.note || ''
  })))};
</script>
<script src="/songs/singing-stack.js" defer></script>
`;
}

/* ---------- 注册标签 ---------- */
hexo.extend.tag.register('songlist', function () {
  const songs = loadSongs(this.config ? hexo : hexo);
  if (!songs.length) {
    return '<p style="color:#c00">[SongList] 未读取到歌曲数据，请检查 source/_songs/songs.yml</p>';
  }
  return renderCards(songs);
});

/* ---------- 发布 _songs 里的静态资源 ---------- */
hexo.extend.generator.register('songlist-assets', function () {
  const baseDir = path.join(hexo.source_dir, SONG_DIR);
  const result = [];

  ASSETS.forEach(function (name) {
    const filePath = path.join(baseDir, name);
    if (!fs.existsSync(filePath)) {
      hexo.log.warn('[SongList] 缺少资源文件: ' + name);
      return;
    }
    result.push({
      path: PUBLIC_DIR + '/' + name,
      data: function () {
        return fs.createReadStream(filePath);
      }
    });
  });

  return result;
});