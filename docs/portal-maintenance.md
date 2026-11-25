# Mode maintenance Portal

Menutup **portal.eccchurch.global** sementara dengan halaman "Portal sedang dalam pemeliharaan"
plus hitung mundur. Dijalankan di VPS sebagai user `deploy`. API & Els App **tidak** terpengaruh.

```bash
portal-maintenance 30                       # tutup 30 menit (tetap tertutup sampai "off")
portal-maintenance 30 --auto                # tutup 30 menit, terbuka sendiri setelahnya
portal-maintenance 45 "Pembaruan sistem"    # pesan khusus di halaman
portal-maintenance off                      # buka kembali
portal-maintenance                          # status
```

- Hitung mundur hanya **perkiraan**. Tanpa `--auto`, bila waktunya lewat halaman menulis
  "sedikit lebih lama dari perkiraan" dan Portal tetap tertutup sampai `off`.
- Halaman memeriksa status tiap 15 detik dan memuat ulang Portal sendiri setelah `off`.
- Halaman disajikan langsung oleh nginx (HTTP 503 + Retry-After), jadi tetap tampil walau
  Portal sedang di-build / restart.

## Cara kerja
| File | Isi |
|---|---|
| `scripts/portal-maintenance.sh` | perintahnya |
| `scripts/maintenance/portal.html` | halaman maintenance (mandiri, logo tersisip) |
| `scripts/maintenance/nginx-portal-maintenance.conf` | snippet nginx |
| `/var/www/portal-maintenance/on` | bendera maintenance aktif |
| `/var/www/portal-maintenance/status.json` | `{active, until, message}` dibaca halaman (`/__maintenance/status.json`) |

## Pemasangan (sekali)
Lihat langkah di bawah; butuh sudo untuk nginx.

```bash
# 1) folder bendera (milik deploy, dibaca nginx)
sudo mkdir -p /var/www/portal-maintenance && sudo chown deploy:www-data /var/www/portal-maintenance && sudo chmod 755 /var/www/portal-maintenance
echo '{"active":false}' > /var/www/portal-maintenance/status.json

# 2) snippet nginx + sisipkan ke server block Portal (sebelum "location / {")
sudo cp /var/www/ecc-core-platform/scripts/maintenance/nginx-portal-maintenance.conf /etc/nginx/snippets/portal-maintenance.conf
F=/etc/nginx/sites-available/portal.eccchurch.global
sudo cp "$F" "$F.bak-$(date +%Y%m%d-%H%M%S)"
sudo grep -q 'snippets/portal-maintenance.conf' "$F" || sudo perl -0pi -e 's{(\n([ \t]*)location / \{)}{\n$2include snippets/portal-maintenance.conf;\n$1}' "$F"
sudo nginx -t && sudo systemctl reload nginx

# 3) perintah di PATH user deploy
mkdir -p ~/.local/bin && ln -sf /var/www/ecc-core-platform/scripts/portal-maintenance.sh ~/.local/bin/portal-maintenance
```
