#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${TMPDIR:-/tmp}/cotton-roots-video"
FONT="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BOLD="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
mkdir -p "$WORK"

titles=(
  "Laundry that fits your day"
  "1. Create your Customer account"
  "2. Book your service"
  "3. Bring and scan your bag"
  "4. Follow every update"
  "5. Your laundry is washed and folded"
  "6. Pay securely online"
  "7. Pick up or receive delivery"
  "Cotton Roots & Company"
)
bodies=(
  "Regular hours are 9 AM to 5 PM, with extended access from 5 PM to 9 PM by calling 903-426-1543."
  "Register in the app and keep your contact and service address up to date."
  "Choose drop-off or pickup and return. Add detergent choices and special care notes."
  "At 307 Locust Street, scan the bag and confirm that you are dropping off dirty laundry."
  "See when your bag is checked in, picked up for washing, completed, returned, and ready."
  "An approved independent Washing Specialist follows your preferences and the app's custody steps."
  "Review the final weight, service, delivery charge, and Texas sales tax before checkout."
  "Scan and confirm pickup at the shop, or view the delivery photo when your order is left at home."
  "Simple. Secure. Fresh and folded. Start at cotton-roots-private-trial.onrender.com"
)

for i in "${!titles[@]}"; do
  frame=$(printf '%02d' "$i")
  convert -size 1280x720 gradient:'#173f30-#315f48' \
    \( "$ROOT/web/brand-mark.png" -resize 165x165 \) -gravity northwest -geometry +72+55 -composite \
    -font "$BOLD" -fill '#f2ce79' -pointsize 23 -gravity northwest -annotate +270+75 'COTTON ROOTS & COMPANY' \
    -font "$BOLD" -fill white -pointsize 50 -gravity northwest -annotate +270+122 "${titles[$i]}" \
    \( -background none -fill '#f8f0dc' -font "$FONT" -pointsize 29 -size 820x250 caption:"${bodies[$i]}" \) -gravity northwest -geometry +270+235 -composite \
    -font "$BOLD" -fill '#f2ce79' -pointsize 22 -gravity southwest -annotate +72+48 'WASH & FOLD  •  9 AM–5 PM  •  AFTER-HOURS ACCESS 5–9 PM BY PHONE' \
    "$WORK/$frame.png"
done

rm -f "$WORK/frames.txt"
for i in "${!titles[@]}"; do
  frame=$(printf '%02d' "$i")
  printf "file '%s.png'\nduration 4\n" "$frame" >> "$WORK/frames.txt"
done
printf "file '08.png'\n" >> "$WORK/frames.txt"

ffmpeg -loglevel error -y -f concat -safe 0 -i "$WORK/frames.txt" \
  -vf 'fps=30,format=yuv420p' -c:v libx264 -movflags +faststart \
  "$ROOT/web/how-cotton-roots-works.mp4"
cp "$WORK/00.png" "$ROOT/web/how-cotton-roots-works-poster.png"
echo "Built web/how-cotton-roots-works.mp4"
