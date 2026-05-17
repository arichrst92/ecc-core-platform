# Face-API.js Models

Folder ini menyimpan weights pre-trained dari [face-api.js](https://github.com/justadudewhohacks/face-api.js).

## Cara dapat file model

Dari root project, jalankan sekali:

```bash
./scripts/download-face-models.sh
```

Script akan download 8 file (~12 MB total) ke folder ini.

## File yang dibutuhkan

| File | Ukuran | Fungsi |
|------|--------|--------|
| `ssd_mobilenetv1_model-weights_manifest.json` + 2 shard | ~5.4 MB | Face detection |
| `face_landmark_68_model-weights_manifest.json` + 1 shard | ~350 KB | 68-point landmarks |
| `face_recognition_model-weights_manifest.json` + 2 shard | ~6.2 MB | 128-dim descriptor |

## Catatan deployment

Folder `apps/portal/public/face-models/` di-serve langsung sebagai static asset oleh Next.js di path `/face-models/*`. Untuk production:

- **Option 1**: Commit semua weights ke git (tambah pengecualian di `.gitignore` untuk folder ini)
- **Option 2**: Skip git, jalankan script saat build / di Dockerfile

Pilihan default kita: **Option 2** (di `.gitignore` repo level), supaya repo lebih ringan.
