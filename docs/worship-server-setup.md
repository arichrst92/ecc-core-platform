# ECC Worship — setup server (VPS 187.77.118.85)

Sekali saja, sebelum/bersamaan deploy fitur ECC Worship.

## 1. Folder audio privat
```bash
sudo mkdir -p /var/lib/ecc/worship
sudo chown deploy:deploy /var/lib/ecc/worship
sudo chmod 755 /var/lib/ecc /var/lib/ecc/worship   # Nginx (www-data) perlu bisa membaca
```

## 2. Env core-api (`/var/www/ecc-core-platform/apps/core-api/.env`)
```
WORSHIP_DIR=/var/lib/ecc/worship
WORSHIP_X_ACCEL=1
WORSHIP_MEDIA_SECRET=<openssl rand -hex 32>
WHISPER_BIN=/usr/local/bin/whisper-cli
WHISPER_MODEL_DIR=/opt/whisper/models
```

## 3. Nginx (server block core-api)
```nginx
# Streaming audio ECC Worship — dikirim Nginx setelah core-api memvalidasi tanda tangan URL.
location /_worship_files/ {
    internal;
    alias /var/lib/ecc/worship/;
    add_header Cache-Control "private, max-age=21600";
    add_header Access-Control-Allow-Origin "*";
}
```
Upload audio maks **30 MB** — batas global `client_max_body_size 20M` tidak cukup. Tambahkan location khusus
(salin `proxy_pass` + header dari `location /` core-api yang sudah ada):
```nginx
location ~ ^/admin/worship/songs/[^/]+/audio/ {
    client_max_body_size 32M;
    proxy_read_timeout 300s;
    proxy_pass http://127.0.0.1:4100;   # samakan dengan upstream core-api
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```
```bash
sudo nginx -t && sudo systemctl reload nginx
```

## 4. ffmpeg + whisper.cpp ("Elsa") + model
```bash
sudo apt-get update && sudo apt-get install -y ffmpeg build-essential cmake git
sudo git clone --depth 1 https://github.com/ggml-org/whisper.cpp /opt/whisper.cpp
cd /opt/whisper.cpp
sudo cmake -B build -DCMAKE_BUILD_TYPE=Release
sudo cmake --build build -j 2 --config Release
sudo ln -sf /opt/whisper.cpp/build/bin/whisper-cli /usr/local/bin/whisper-cli
sudo mkdir -p /opt/whisper/models
sudo sh ./models/download-ggml-model.sh small
sudo sh ./models/download-ggml-model.sh medium
sudo cp models/ggml-small.bin models/ggml-medium.bin /opt/whisper/models/
whisper-cli --help | head -3   # cek terpasang
```

## 5. Swap 2 GB (pengaman memori)
```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

## 6. Backup
Backup database tidak mencakup file audio & cover. Sertakan folder berikut di backup rutin:
- `/var/lib/ecc/worship/` (audio)
- `<UPLOADS_DIR>/content/worship/cover/` (cover)

## Catatan
- Worker Elsa berjalan di dalam proses core-api: 1 lagu per kali, `nice -n 19`, siang 1 thread, malam (00:00–05:00 WIB) 2 thread; kualitas "Teliti" (medium) hanya diproses malam.
- Matikan sementara: `WORSHIP_ELSA_DISABLED=1` lalu restart core-api.
