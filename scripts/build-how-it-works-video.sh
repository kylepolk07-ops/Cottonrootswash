#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${TMPDIR:-/tmp}/cotton-roots-commercial"
BOLD="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
mkdir -p "$WORK"
rm -f "$WORK"/scene-*.jpg

images=(
  "$ROOT/assets/commercial/01-arrive.jpg"
  "$ROOT/assets/commercial/01-arrive.jpg"
  "$ROOT/assets/commercial/02-scan.jpg"
  "$ROOT/assets/commercial/02-scan.jpg"
  "$ROOT/assets/commercial/03-fold.jpg"
  "$ROOT/assets/commercial/03-fold.jpg"
  "$ROOT/assets/commercial/04-home.jpg"
  "$ROOT/assets/commercial/04-home.jpg"
  "$ROOT/assets/commercial/01-arrive.jpg"
)
headlines=(
  "1. Create your customer account"
  "2. Visit the shop with your laundry"
  "3. Check out and register your first bag"
  "4. Book and drop off your laundry"
  "5. A Washing Specialist accepts the job"
  "6. Your laundry is washed and folded"
  "7. The same bag returns to the shop"
  "8. Get notified, review, and pay"
  "9. Scan, collect, and enjoy"
)
subheads=(
  "Add your contact details and securely verify payment."
  "Come to 307 Locust Street during normal shop hours."
  "Get the box code, take one bag, and scan its unique QR."
  "Place clothes inside, choose care instructions, and scan at drop-off."
  "They scan the bag, photograph the scale, and enter the exact weight."
  "Your items stay together and your care instructions stay with the order."
  "A return scan confirms the work is complete and safely checked in."
  "A text and in-app alert tell you it is ready; pay securely with Stripe."
  "Only your paid, matching registered bag can be picked up."
)

for i in "${!images[@]}"; do
  frame=$(printf '%02d' "$i")
  convert "${images[$i]}" -resize '1280x720^' -gravity center -extent 1280x720 \
    \( -size 1280x310 gradient:'#00000000-#10291ff2' \) -gravity south -composite \
    \( "$ROOT/web/brand-mark.png" -resize 90x90 \) -gravity northwest -geometry +40+32 -composite \
    -font "$BOLD" -fill white -pointsize 38 -gravity southwest -annotate +52+112 "${headlines[$i]}" \
    -font "$BOLD" -fill '#f2ce79' -pointsize 20 -gravity southwest -annotate +54+66 "${subheads[$i]}" \
    "$WORK/scene-$frame.jpg"
done

ffmpeg -loglevel error -y -framerate 1/12 -pattern_type glob -i "$WORK/scene-*.jpg" \
  -vf "fps=30,format=yuv420p,fade=t=in:st=0:d=0.5,fade=t=out:st=107:d=1" \
  -t 108 -c:v libx264 -crf 23 -preset medium -movflags +faststart \
  "$WORK/walkthrough-silent.mp4"

ffmpeg -loglevel error -y \
  -i "$WORK/walkthrough-silent.mp4" \
  -i "$ROOT/assets/commercial/how-it-works-narration.m4a" \
  -filter_complex '[0:v]tpad=stop_mode=clone:stop_duration=8[v]' \
  -map '[v]' -map 1:a:0 -c:v libx264 -crf 23 -preset medium \
  -c:a aac -b:a 112k -shortest -movflags +faststart \
  "$ROOT/web/how-cotton-roots-works.mp4"

convert "$WORK/scene-00.jpg" -quality 88 "$ROOT/web/how-cotton-roots-works-poster.jpg"
echo "Built complete customer walkthrough with embedded narration"
