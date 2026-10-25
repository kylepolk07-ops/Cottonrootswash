#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${TMPDIR:-/tmp}/cotton-roots-commercial"
BOLD="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
mkdir -p "$WORK"

images=(
  "$ROOT/assets/commercial/01-arrive.jpg"
  "$ROOT/assets/commercial/02-scan.jpg"
  "$ROOT/assets/commercial/03-fold.jpg"
  "$ROOT/assets/commercial/04-home.jpg"
)
headlines=(
  "Laundry that fits your life."
  "Scan. Drop off. Keep moving."
  "Personal care, folded into every order."
  "Fresh clothes. More time for you."
)
subheads=(
  "Book online and add your care preferences."
  "Follow your bag from your phone."
  "Your Washing Specialist sees the details that matter."
  "Cotton Roots & Company  •  One little step. Fresh beginnings."
)

for i in "${!images[@]}"; do
  frame=$(printf '%02d' "$i")
  convert "${images[$i]}" -resize '1280x720^' -gravity center -extent 1280x720 \
    \( -size 1280x280 gradient:'#00000000-#10291fe8' \) -gravity south -composite \
    \( "$ROOT/web/brand-mark.png" -resize 90x90 \) -gravity northwest -geometry +40+32 -composite \
    -font "$BOLD" -fill white -pointsize 42 -gravity southwest -annotate +52+104 "${headlines[$i]}" \
    -font "$BOLD" -fill '#f2ce79' -pointsize 22 -gravity southwest -annotate +54+62 "${subheads[$i]}" \
    "$WORK/$frame.jpg"
done

ffmpeg -loglevel error -y \
  -loop 1 -t 6 -i "$WORK/00.jpg" -loop 1 -t 6 -i "$WORK/01.jpg" \
  -loop 1 -t 6 -i "$WORK/02.jpg" -loop 1 -t 6 -i "$WORK/03.jpg" \
  -filter_complex "
    [0:v]scale=1408:792,zoompan=z='min(zoom+0.00035,1.07)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=180:s=1280x720:fps=30,format=yuv420p[v0];
    [1:v]scale=1408:792,zoompan=z='if(eq(on,1),1.07,max(zoom-0.00035,1.0))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=180:s=1280x720:fps=30,format=yuv420p[v1];
    [2:v]scale=1408:792,zoompan=z='min(zoom+0.00035,1.07)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=180:s=1280x720:fps=30,format=yuv420p[v2];
    [3:v]scale=1408:792,zoompan=z='if(eq(on,1),1.07,max(zoom-0.00035,1.0))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=180:s=1280x720:fps=30,format=yuv420p[v3];
    [v0][v1]xfade=transition=fade:duration=1:offset=5[x1];
    [x1][v2]xfade=transition=fade:duration=1:offset=10[x2];
    [x2][v3]xfade=transition=fade:duration=1:offset=15,fade=t=out:st=20:d=1[outv]
  " -map '[outv]' -t 21 -c:v libx264 -crf 21 -preset medium -movflags +faststart \
  "$ROOT/web/how-cotton-roots-works.mp4"

convert "$WORK/00.jpg" -quality 88 "$ROOT/web/how-cotton-roots-works-poster.jpg"
echo "Built cinematic web/how-cotton-roots-works.mp4"
