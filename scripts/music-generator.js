const fs = require('fs');
const path = require('path');

// 尝试加载 node-id3 解析库
let NodeID3;
try {
  NodeID3 = require('node-id3');
} catch (e) {
  console.warn('\n[Music Generator] 提示：未安装 node-id3，无法自动提取 MP3 歌词。');
  console.warn('如果您需要提取内嵌歌词，请在博客根目录运行: npm install node-id3\n');
}

hexo.extend.generator.register('music-json', function () {
  const musicPath = path.join(hexo.source_dir, 'music/gequ');

  if (!fs.existsSync(musicPath)) {
    return;
  }

  let files = fs.readdirSync(musicPath);

  let songs = files
    .filter(f => /\.(mp3|flac|ogg|wav)$/i.test(f))
    .map(f => {
      const parsed = path.parse(f);
      const originalName = parsed.name;
      const filePath = path.join(musicPath, f);
      
      let sortNum = 999999; // 默认给一个极大的数字，代表没有特殊排序
      let displayTitle = originalName;

      // 核心魔法：正则匹配文件名前缀，例如 "01-七里香"、"1 晴天"、"003_夜曲"
      // 只要是数字开头，后面跟着连接符或空格，就能被识别
      const match = originalName.match(/^(\d+)[-_\.\s]+(.*)/);
      if (match) {
        sortNum = parseInt(match[1], 10); // 提取出来的数字用于排序
        displayTitle = match[2];          // 提取出来的纯名字用于前端显示
      }

      let songData = {
        filename: originalName,
        title: displayTitle,
        sortNum: sortNum,
        url: '/music/gequ/' + f
      };

      // 提取内嵌歌词逻辑
      if (NodeID3 && /\.mp3$/i.test(f)) {
        try {
          const tags = NodeID3.read(filePath);
          if (tags && tags.unsynchronisedLyrics && tags.unsynchronisedLyrics.text) {
            songData.lrc = tags.unsynchronisedLyrics.text;
          }
        } catch (err) {
          console.error('[Music Generator] 解析歌曲标签失败: ' + f);
        }
      }

      return songData;
    })
    // 智能排序规则
    .sort((a, b) => {
      // 1. 如果有自定义数字前缀，按数字从小到大排 (01 优先于 02)
      if (a.sortNum !== b.sortNum) {
        return a.sortNum - b.sortNum;
      }
      // 2. 如果都没有前缀（或者数字一样大），自动按中文拼音/英文字母 A-Z 顺序排列
      return a.filename.localeCompare(b.filename, 'zh-CN');
    })
    // 格式化输出给前端的最终数据，去掉不需要的字段
    .map(item => {
      let finalSong = {
        title: item.title,
        url: item.url
      };
      if (item.lrc) {
        finalSong.lrc = item.lrc;
      }
      return finalSong;
    });

  return {
    path: 'music/music.json',
    data: JSON.stringify(songs, null, 2)
  };
});