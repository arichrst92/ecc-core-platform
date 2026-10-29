# Dokumen Legal Els App — Versi 3.0 (draf)

Draf pembaruan Kebijakan Privasi dan Syarat & Ketentuan agar sesuai dengan hukum di **Indonesia** (UU PDP 27/2022, PP 33/2026, PP Tunas 17/2025), **Malaysia** (PDPA 2010 dan amandemen 2024), dan **Australia** (Privacy Act 1988/APPs, NDB, Australian Consumer Law).

> Draf ini bukan nasihat hukum. **Minta review dari konsultan hukum** (ID, dan idealnya MY/AU) sebelum dipublikasikan.

## File

| File | Isi | Bahasa di Portal |
|---|---|---|
| `privacy-policy.id.md` | Kebijakan Privasi lengkap | PRIVACY / id |
| `privacy-policy.en.md` | Privacy Policy lengkap | PRIVACY / en |
| `privacy-policy.ms.md` | Notis Privasi (wajib BM untuk PDPA) | PRIVACY / ms |
| `terms.id.md` | Syarat & Ketentuan | TERMS / id |
| `terms.en.md` | Terms & Conditions | TERMS / en |

TERMS / ms tidak wajib. Jika kosong, aplikasi akan memakai versi English.

## Perubahan utama dari v2.0

**Kebijakan Privasi**
- Pernyataan yang tidak sesuai sistem diperbaiki:
  - lokasi **dipakai** (check-in mandiri, homecell terdekat) tetapi tidak disimpan;
  - login wajah dihentikan, dan data wajah sedang dihapus;
  - tidak lagi mengklaim backup terenkripsi atau password bcrypt;
  - Fonnte menggantikan WhatsApp Business API;
  - Anthropic (Elsa) ditambahkan.
- Data keagamaan, anak, keuangan, dan prayer request dikategorikan sebagai data spesifik/sensitif yang memerlukan persetujuan eksplisit.
- Usia: di bawah 13 tahun hanya melalui orang tua; 13–<18 tahun dengan persetujuan orang tua.
- Tabel pihak ketiga dan transfer data ke luar negeri.
- Tenggat respons hak: ID 3×24 jam, MY 21 hari, AU 30 hari.
- Notifikasi kebocoran: ID 3×24 jam, MY 72 jam, AU sesegera mungkin.
- Tabel retensi, DPO, dan regulator per negara.
- Analitik anonim dengan opt-out.
- Referensi COPPA/GDPR dihapus.

**Syarat & Ketentuan**
- Cakupan: Els App, web, Portal, CKids, dan monitor.
- Kewajiban saat memasukkan data tamu/keluarga (Bagian 5).
- Aturan prayer request.
- Ketentuan khusus admin/petugas/kode monitor (Bagian 10).
- Klausul bahwa hak konsumen yang tidak dapat dikesampingkan tetap berlaku (ID/MY/Australian Consumer Law); batas tanggung jawab berlaku "sejauh diizinkan hukum".
- Hukum Indonesia berlaku tanpa mengurangi perlindungan wajib di negara pengguna.
- Bagian persembahan dan pembayaran disesuaikan dengan alur saat ini.

## Isi placeholder sebelum publish

- `[NAMA BADAN HUKUM & ALAMAT TERDAFTAR]` — semua file.
- `[NAMA PETUGAS]` / `[NAMA]` — Petugas Pelindungan Data (DPO).
- `[LOKASI SERVER]` — negara lokasi VPS/hosting.
- Pastikan `privacy@eccchurch.global` aktif dan dipantau.

## Komitmen yang butuh tindak lanjut sistem

Isi dokumen harus sesuai dengan kenyataan. Agar akurat, pastikan hal berikut berjalan:

1. **Hapus data wajah:** kosongkan kolom `faceDescriptor` dan nonaktifkan `/auth/face/*`.
2. **Catat persetujuan:** simpan versi T&C/Privasi yang disetujui saat registrasi, lalu minta persetujuan ulang untuk v3.0.
3. **Proses manual** untuk permintaan akses/portabilitas/hapus permanen dan opt-out WhatsApp. Siapkan SOP, karena tenggatnya 3×24 jam untuk Indonesia.
4. **Retensi:** hapus atau anonimkan akun nonaktif setelah 3 tahun; bukti transfer 1 tahun setelah event; audit log 1 tahun.
5. **SOP insiden kebocoran:** 3×24 jam (ID) dan 72 jam (MY).
6. **Perjanjian pemroses data** dengan IDEA, Fonnte, dan hosting.

## Cara publish

1. Deploy kode yang mendukung bahasa `ms`. Di Portal → Legal kini ada tab **Bahasa Melayu**, dan API publik melakukan fallback ms → en → id.
2. Buka Portal → Legal, lalu untuk setiap kombinasi (dokumen, bahasa):
   - tempel isi markdown;
   - isi Title;
   - isi Version dengan tanggal publish, mis. `2026-11-15`;
   - centang Published, lalu Simpan.
3. Umumkan perubahan **minimal 14 hari** sebelum tanggal berlaku (banner/WA/email).
