#!/usr/bin/env bash
# Mode maintenance Portal (portal.eccchurch.global).
#
#   portal-maintenance 30                 tutup Portal, hitung mundur 30 menit (tetap tertutup sampai "off")
#   portal-maintenance 30 --auto          sama, tapi Portal terbuka sendiri setelah 30 menit
#   portal-maintenance 30 "Pesan khusus"  pesan di halaman maintenance (boleh digabung dengan --auto)
#   portal-maintenance off                buka Portal kembali
#   portal-maintenance                    lihat status
#
# Butuh pemasangan sekali (nginx snippet) — lihat docs/portal-maintenance.md.
set -euo pipefail

DIR="${PORTAL_MAINT_DIR:-/var/www/portal-maintenance}"
SELF="$(readlink -f "$0")"
HTML="$(dirname "$SELF")/maintenance/portal.html"

die() { echo "✗ $*" >&2; exit 1; }
[ -d "$DIR" ] || die "Folder $DIR belum ada — jalankan pemasangan di docs/portal-maintenance.md dulu."
[ -w "$DIR" ] || die "Tidak bisa menulis ke $DIR (cek pemilik folder)."

json_escape() { python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$1"; }

write_status() {  # $1 = isi JSON
  printf '%s\n' "$1" > "$DIR/status.json.tmp"
  chmod 644 "$DIR/status.json.tmp"
  mv -f "$DIR/status.json.tmp" "$DIR/status.json"
}

stop_timer() {
  if [ -f "$DIR/auto.pid" ]; then
    kill "$(cat "$DIR/auto.pid")" 2>/dev/null || true
    rm -f "$DIR/auto.pid"
  fi
}

wib() { TZ=Asia/Jakarta date -d "$1" '+%H:%M WIB (%d %b)'; }

cmd="${1:-status}"
case "$cmd" in
  off)
    stop_timer
    rm -f "$DIR/on"
    write_status '{"active":false}'
    echo "✓ Portal dibuka kembali."
    ;;
  status)
    if [ -f "$DIR/on" ]; then
      u=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("until",""))' "$DIR/status.json" 2>/dev/null || true)
      echo "● Portal sedang MAINTENANCE${u:+ — perkiraan selesai $(wib "$u")}$([ -f "$DIR/auto.pid" ] && echo ' (terbuka otomatis)')"
    else
      echo "○ Portal terbuka (tidak maintenance)."
    fi
    ;;
  *)
    [[ "$cmd" =~ ^[0-9]+$ ]] && [ "$cmd" -ge 1 ] && [ "$cmd" -le 1440 ] || die "Pakai: portal-maintenance <menit 1–1440> [--auto] [\"pesan\"] | off | status"
    shift
    auto=0
    msg=""
    for a in "$@"; do
      if [ "$a" = "--auto" ]; then auto=1; else msg="${msg:+$msg }$a"; fi
    done
    [ -f "$HTML" ] || die "Halaman $HTML tidak ditemukan."
    until=$(date -u -d "+$cmd minutes" '+%Y-%m-%dT%H:%M:%SZ')
    cp -f "$HTML" "$DIR/index.html" && chmod 644 "$DIR/index.html"
    write_status "{\"active\":true,\"until\":\"$until\",\"minutes\":$cmd,\"auto\":$([ $auto = 1 ] && echo true || echo false)${msg:+,\"message\":$(json_escape "$msg")}}"
    touch "$DIR/on" && chmod 644 "$DIR/on"
    stop_timer
    if [ $auto = 1 ]; then
      setsid nohup bash -c "sleep $((cmd * 60)); grep -q '\"until\":\"$until\"' '$DIR/status.json' && '$SELF' off" >/dev/null 2>&1 &
      echo $! > "$DIR/auto.pid"
    fi
    echo "● Portal MAINTENANCE selama $cmd menit — perkiraan selesai $(wib "$until")."
    [ $auto = 1 ] && echo "  Portal terbuka sendiri pada waktu itu." || echo "  Buka kembali dengan: portal-maintenance off"
    ;;
esac
