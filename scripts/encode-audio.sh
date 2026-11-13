#!/usr/bin/env bash
# Encodes audio-src/<name>.{wav,mp3,flac,aif,aiff} to public/audio/<name>.{webm,m4a}.
#
# Loudness-normalizes (never peak-normalizes): trims silence, measures RMS, applies gain to
# TARGET_RMS, then a -3 dBTP limiter. Cue-to-cue balance lives in src/audio/cues.ts, not here.
#
# Usage: npm run audio [-- --report] [-- --only <name>] [-- --force] [-- --selftest]
set -euo pipefail

cd "$(dirname "$0")/.."

SRC=audio-src
OUT=public/audio
TARGET_RMS=-20          # dBFS, overall RMS after trimming
LIMIT=0.708             # linear, -3 dBTP
STEREO_CUES=" level-up game-over prism-supernova new-best music-loop "
# Leading silence, then trailing silence (reverse, trim the new head, reverse back). Never stop_periods=-1:
# that deletes every gap in the file and collapses the timing of multi-hit cues.
TRIM="silenceremove=start_periods=1:start_threshold=-60dB,areverse,silenceremove=start_periods=1:start_threshold=-60dB,areverse"

REPORT=0
FORCE=0
ONLY=""
SELFTEST=0
while [ $# -gt 0 ]; do
  case "$1" in
    --report) REPORT=1 ;;
    --force) FORCE=1 ;;
    --selftest) SELFTEST=1 ;;
    --only) shift; ONLY="${1:?--only needs a cue name}" ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  echo "ffmpeg is required: brew install ffmpeg" >&2
  exit 1
fi

is_stereo() {
  case "$STEREO_CUES" in *" $1 "*) return 0 ;; esac
  case "$1" in music-*) return 0 ;; esac
  return 1
}

# Prints "<rms_db> <peak_db>" of the trimmed source.
measure() {
  ffmpeg -hide_banner -nostats -i "$1" -af "$TRIM,astats=measure_perchannel=none:measure_overall=RMS_level+Peak_level" -f null - 2>&1 |
    awk '/Overall/ {o=1} o && /RMS level dB/ {r=$NF} o && /Peak level dB/ {p=$NF} END {print r, p}'
}

size_kb() { if [ -f "$1" ]; then echo $(( ($(stat -f%z "$1" 2>/dev/null || stat -c%s "$1") + 512) / 1024 )); else echo "-"; fi; }

if [ "$SELFTEST" -eq 1 ]; then
  # 0.3 s tone + 0.5 s digital silence + 0.3 s tone: trimming must keep the internal gap.
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT
  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i "sine=f=880:d=0.3" -f lavfi -i "anullsrc=r=44100:cl=mono" -f lavfi -i "sine=f=880:d=0.3" \
    -filter_complex "[1:a]atrim=duration=0.5[g];[0:a][g][2:a]concat=n=3:v=0:a=1" "$tmp/gap.wav"
  ffmpeg -hide_banner -loglevel error -y -i "$tmp/gap.wav" -af "$TRIM" "$tmp/trimmed.wav"
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$tmp/trimmed.wav")
  awk -v d="$d" 'BEGIN { if (d < 1.08 || d > 1.12) { printf "selftest FAILED: duration %.3f s, expected 1.1 s +-20 ms\n", d; exit 1 } printf "selftest ok: %.3f s\n", d }'
  exit $?
fi

mkdir -p "$OUT"
printf '%-18s %6s %8s %8s %8s %8s %8s\n' name dur_s rms_db peak_db gain_db webm_kb m4a_kb
shopt -s nullglob nocaseglob
count=0
for f in "$SRC"/*.wav "$SRC"/*.mp3 "$SRC"/*.flac "$SRC"/*.aif "$SRC"/*.aiff; do
  [ -f "$f" ] || continue
  base=$(basename "$f")
  name="${base%.*}"
  if [ -n "$ONLY" ] && [ "$name" != "$ONLY" ]; then continue; fi
  webm="$OUT/$name.webm"
  m4a="$OUT/$name.m4a"

  if [ "$REPORT" -eq 0 ] && [ "$FORCE" -eq 0 ] && [ "$webm" -nt "$f" ] && [ "$m4a" -nt "$f" ]; then
    printf '%-18s %s\n' "$name" "up to date"
    count=$((count + 1))
    continue
  fi

  read -r rms peak < <(measure "$f")
  if [ -z "${rms:-}" ] || [ "$rms" = "-inf" ]; then
    printf '%-18s %s\n' "$name" "silent after trim, skipped" >&2
    continue
  fi
  gain=$(awk -v t="$TARGET_RMS" -v r="$rms" 'BEGIN {printf "%.2f", t - r}')
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f" | awk '{printf "%.2f", $1}')

  if [ "$REPORT" -eq 0 ]; then
    if is_stereo "$name"; then ch=2; abr=160k; obr=128k; else ch=1; abr=96k; obr=64k; fi
    chain="$TRIM,volume=${gain}dB,alimiter=limit=$LIMIT:level=disabled"
    ffmpeg -hide_banner -loglevel error -y -i "$f" -af "$chain" -ac "$ch" -c:a libopus -b:a "$obr" "$webm"
    ffmpeg -hide_banner -loglevel error -y -i "$f" -af "$chain" -ac "$ch" -c:a aac -b:a "$abr" -movflags +faststart "$m4a"
  fi
  printf '%-18s %6s %8s %8s %8s %8s %8s\n' "$name" "$dur" "$rms" "$peak" "$gain" "$(size_kb "$webm")" "$(size_kb "$m4a")"
  count=$((count + 1))
done

if [ "$count" -eq 0 ]; then
  echo "no matching audio files in $SRC" >&2
  exit 1
fi
