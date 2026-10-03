#!/data/data/com.termux/files/usr/bin/bash
# QQ空间视频批量视觉无损压缩脚本（v2）
# 用法：把本脚本放到视频目录里，执行 bash zip.sh
# 输出到同目录 _compressed/ 子目录，不覆盖原文件
# 已压缩成功过的文件会自动跳过，可重复执行

FFMPEG="/data/data/com.termux/files/usr/bin/ffmpeg"
CRF="26"
OUT_DIR="_compressed"

mkdir -p "$OUT_DIR"

total=0
ok=0
skip=0
fail=0

for f in *.mp4; do
    [ -e "$f" ] || continue
    base="${f%.mp4}"
    out="$OUT_DIR/$f"

    if [ -f "$out" ]; then
        echo "跳过（已存在）: $f"
        skip=$((skip+1))
        continue
    fi

    total=$((total+1))

    in_size=$(stat -c %s "$f" 2>/dev/null || echo 0)

    echo "压缩中 ($total)... $f ($((in_size/1024/1024)) MB)"

    tmp="$OUT_DIR/.${base}.tmp.mp4"

    "$FFMPEG" -y -i "$f" \
        -vf "scale=trunc(iw/8)*8:trunc(ih/8)*8" \
        -c:v libx265 -preset medium -crf "$CRF" -tag:v hvc1 \
        -c:a aac -b:a 96k -movflags +faststart \
        "$tmp" </dev/null >/dev/null 2>&1

    if [ $? -eq 0 ] && [ -s "$tmp" ]; then
        mv "$tmp" "$out"
        out_size=$(stat -c %s "$out" 2>/dev/null || echo 0)

        if [ "$out_size" -ge "$in_size" ] && [ "$in_size" -gt 0 ]; then
            rm -f "$out"
            echo "未变小，已删除: $f"
            fail=$((fail+1))
        else
            echo "完成: $f  $((in_size/1024/1024))→$((out_size/1024/1024)) MB"
            ok=$((ok+1))
        fi
    else
        rm -f "$tmp"
        echo "失败: $f"
        fail=$((fail+1))
    fi
done

echo ""
echo "=========================="
echo "完成。成功 $ok 个，跳过 $skip 个，失败 $fail 个（共扫描 $total 个待压）。"
echo "产物在: $OUT_DIR/"