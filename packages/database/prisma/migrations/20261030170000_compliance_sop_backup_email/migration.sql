-- Menu Compliance: SOP kebocoran & permintaan data per negara + kirim backup bulanan
CREATE TABLE "compliance_document" (
    "id" UUID NOT NULL,
    "key" VARCHAR(30) NOT NULL,
    "country" VARCHAR(2) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "content" TEXT NOT NULL,
    "version" VARCHAR(20) NOT NULL,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "compliance_document_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "compliance_document_key_country_key" ON "compliance_document"("key", "country");

CREATE TABLE "backup_email_config" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "recipients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "day_of_month" INTEGER NOT NULL DEFAULT 1,
    "hour" INTEGER NOT NULL DEFAULT 2,
    "link_valid_days" INTEGER NOT NULL DEFAULT 7,
    "last_sent_at" TIMESTAMP(3),
    "last_status" VARCHAR(20),
    "last_error" TEXT,
    "last_file" VARCHAR(255),
    "last_scheduled_month" VARCHAR(7),
    "updated_by_user_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "backup_email_config_pkey" PRIMARY KEY ("id")
);
INSERT INTO "backup_email_config" ("id", "updated_at") VALUES ('global', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

-- Seed SOP (6 dokumen). ON CONFLICT DO NOTHING → aman dijalankan ulang, tidak menimpa hasil edit.
INSERT INTO "compliance_document" ("id", "key", "country", "title", "content", "version", "updated_at")
VALUES (gen_random_uuid(), 'SOP_BREACH', 'ID', 'SOP Penanganan Kebocoran Data — Indonesia', $sop$# SOP Penanganan Kebocoran Data Pribadi — Indonesia

**Dasar hukum:** UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP), terutama Pasal 46; PP 33/2026 (berlaku ±Januari 2027).
**Berlaku untuk:** Els App, Portal ECC, CKids, website, dan semua data jemaat cabang di Indonesia.
**Pemilik SOP:** Petugas Pelindungan Data (DPO) — Caroline Gugun Hartanti, privacy@eccchurch.global

> **Batas waktu kunci: pemberitahuan tertulis kepada jemaat yang terdampak DAN lembaga pengawas paling lambat 3 × 24 jam sejak kebocoran diketahui.**

## 1. Apa yang termasuk kebocoran data
Setiap kejadian yang membuat data pribadi jemaat **terungkap, hilang, berubah, atau diakses** oleh pihak yang tidak berhak, sengaja maupun tidak. Contoh:
- Akun admin/portal dipakai orang lain atau kata sandi/kode akses bocor.
- File ekspor/laporan berisi data jemaat terkirim ke grup WhatsApp atau email yang salah.
- Laptop/HP petugas berisi data jemaat hilang.
- Server diretas, database atau file backup bocor.
- Data jemaat terlihat oleh jemaat lain karena kesalahan aplikasi.

## 2. Tim respons
| Peran | Nama | Kontak |
|---|---|---|
| Ketua tim / DPO | Caroline Gugun Hartanti | privacy@eccchurch.global |
| Teknis (IT) | Tim IDEA — [nama] | [no HP] |
| Pengurus / Gembala | [nama] | [no HP] |
| Komunikasi ke jemaat | [nama] | [no HP] |

## 3. Langkah penanganan
| Waktu (sejak diketahui) | Langkah | Penanggung jawab |
|---|---|---|
| **Segera** | Siapa pun yang mengetahui melapor ke DPO & tim IT (WA + email privacy@eccchurch.global). Jangan menghapus bukti. | Pelapor |
| **≤ 2 jam** | **Hentikan kebocoran:** cabut akses akun terkait (Role Access), keluarkan semua sesi, ganti kata sandi/kode akses/master password, nonaktifkan fitur bermasalah, minta penerima menghapus file yang salah kirim. | IT + DPO |
| **≤ 12 jam** | **Nilai dampak:** data apa yang terungkap, berapa orang, apakah ada data sensitif (agama, anak, keuangan, doa), sejak kapan, dan risikonya bagi jemaat. Cek Audit Log & log server. | IT + DPO |
| **≤ 24 jam** | Putuskan pemberitahuan bersama pengurus; siapkan surat pemberitahuan (template di bawah). | DPO + Pengurus |
| **≤ 3 × 24 jam** | **Kirim pemberitahuan tertulis** kepada (1) setiap jemaat yang terdampak dan (2) Lembaga Pelindungan Data Pribadi — selama lembaga belum terbentuk, ke Kementerian Komunikasi dan Digital (Komdigi). Dalam kondisi tertentu, beri tahu juga masyarakat. | DPO |
| **≤ 14 hari** | Perbaikan permanen, evaluasi penyebab, catat di register insiden, latih ulang petugas. | IT + DPO |

## 4. Isi pemberitahuan (wajib menurut UU PDP)
1. Data pribadi apa yang terungkap.
2. Kapan dan bagaimana data terungkap.
3. Upaya penanganan dan pemulihan yang sudah dilakukan gereja.
4. Langkah yang dapat dilakukan jemaat (mis. waspada pesan penipuan).
5. Kontak yang bisa dihubungi (privacy@eccchurch.global).

### Template singkat untuk jemaat
> Bapak/Ibu [nama] yang terkasih, pada [tanggal] kami menemukan bahwa [data apa] milik Bapak/Ibu [terungkap/diakses tanpa izin] karena [penyebab singkat]. Kami telah [langkah penanganan]. Mohon waspadai [risiko, mis. pesan/telepon yang mengatasnamakan gereja]. Bila ada pertanyaan, hubungi privacy@eccchurch.global. Kami mohon maaf atas kejadian ini. — Elshaddai Creative Community

## 5. Pencatatan
Setiap insiden — termasuk yang tidak perlu dilaporkan — dicatat di **register insiden**: tanggal diketahui, uraian, data & jumlah orang terdampak, langkah, tanggal pemberitahuan, pelajaran. Simpan minimal 3 tahun.

## 6. Kontak otoritas
- Lembaga Pelindungan Data Pribadi (setelah terbentuk) / Komdigi — https://www.komdigi.go.id
- Bila ada dugaan tindak pidana (peretasan, pemerasan): laporkan ke kepolisian (Patroli Siber).

*Draf SOP — mohon ditinjau ahli hukum dan diperbarui saat PP 33/2026 berlaku dan Lembaga PDP terbentuk.*
$sop$, '2026-10-30', CURRENT_TIMESTAMP)
ON CONFLICT ("key", "country") DO NOTHING;

INSERT INTO "compliance_document" ("id", "key", "country", "title", "content", "version", "updated_at")
VALUES (gen_random_uuid(), 'SOP_BREACH', 'MY', 'SOP Penanganan Kebocoran Data — Malaysia', $sop$# SOP Penanganan Kebocoran Data Pribadi — Malaysia

**Dasar hukum:** Personal Data Protection Act 2010 (PDPA) sebagaimana diubah 2024 (kewajiban notifikasi berlaku sejak 1 Juni 2025) dan *Guideline on Data Breach Notification* Pesuruhjaya Perlindungan Data Peribadi.
**Berlaku untuk:** data jemaat cabang ECC di Malaysia.
**Pemilik SOP:** DPO — Caroline Gugun Hartanti, privacy@eccchurch.global (+ DPO Malaysia bila ditunjuk)

> **Batas waktu kunci: lapor ke Pesuruhjaya Perlindungan Data Peribadi paling lambat 72 jam sejak kebocoran diketahui (bila menimbulkan atau berpotensi menimbulkan kerugian signifikan), lalu beri tahu jemaat terdampak tanpa penundaan — paling lambat 7 hari setelah melapor ke Pesuruhjaya.**

## 1. Apa yang termasuk kebocoran data
Kehilangan, penyalahgunaan, atau akses/pengungkapan/pengubahan data pribadi tanpa izin. Contoh sama dengan SOP Indonesia: akun admin bocor, file data jemaat salah kirim, perangkat hilang, server diretas.

**Kerugian signifikan** antara lain bila data yang bocor berisi: data sensitif (termasuk **keyakinan agama**), data anak, data keuangan, dokumen identitas, data yang bisa dipakai untuk penipuan, atau melibatkan banyak orang.

## 2. Tim respons
| Peran | Nama | Kontak |
|---|---|---|
| Ketua tim / DPO | Caroline Gugun Hartanti | privacy@eccchurch.global |
| DPO Malaysia (bila wajib) | [nama] | [kontak] |
| Teknis (IT) | Tim IDEA — [nama] | [no HP] |
| Pengurus cabang Malaysia | [nama] | [no HP] |

## 3. Langkah penanganan
| Waktu (sejak diketahui) | Langkah | Penanggung jawab |
|---|---|---|
| **Segera** | Laporkan ke DPO & IT; simpan bukti. | Pelapor |
| **≤ 2 jam** | Hentikan kebocoran (cabut akses, keluarkan sesi, ganti sandi/kode, nonaktifkan fitur, minta penerima menghapus file). | IT + DPO |
| **≤ 24 jam** | Nilai dampak & apakah ada **kerugian signifikan**. | IT + DPO |
| **≤ 72 jam** | Bila signifikan: kirim notifikasi ke **Pesuruhjaya** melalui formulir resmi di portal JPDP (www.pdp.gov.my). Informasi yang belum lengkap boleh menyusul. | DPO |
| **≤ 7 hari setelah lapor Pesuruhjaya** | Beri tahu setiap jemaat terdampak (template di bawah). | DPO + Pengurus |
| **≤ 30 hari** | Perbaikan permanen, evaluasi, latih ulang petugas. | IT + DPO |

## 4. Isi notifikasi
Kepada Pesuruhjaya: uraian kebocoran, kapan terjadi & diketahui, jenis data & perkiraan jumlah orang, penyebab, langkah penanganan, risiko, langkah untuk jemaat, kontak DPO.
Kepada jemaat (Bahasa Melayu dan/atau Inggris): apa yang terjadi, data apa yang terdampak, langkah gereja, langkah yang bisa diambil jemaat, kontak DPO.

### Template singkat untuk jemaat (BM)
> Saudara/Saudari [nama], pada [tarikh] kami mendapati bahawa [data] anda telah [didedahkan/diakses tanpa kebenaran] akibat [punca ringkas]. Kami telah [langkah]. Sila berwaspada terhadap [risiko]. Sebarang pertanyaan, hubungi privacy@eccchurch.global. Kami memohon maaf atas kejadian ini. — Elshaddai Creative Community

## 5. Pencatatan
Semua kebocoran dicatat di **register insiden** dan disimpan **minimal 2 tahun** (sesuai guideline), siap diperiksa Pesuruhjaya.

## 6. Kontak otoritas
- Jabatan Perlindungan Data Peribadi / Pesuruhjaya Perlindungan Data Peribadi — https://www.pdp.gov.my
- Polis Diraja Malaysia (bila ada unsur jenayah siber).

*Draf SOP — mohon ditinjau ahli hukum Malaysia.*
$sop$, '2026-10-30', CURRENT_TIMESTAMP)
ON CONFLICT ("key", "country") DO NOTHING;

INSERT INTO "compliance_document" ("id", "key", "country", "title", "content", "version", "updated_at")
VALUES (gen_random_uuid(), 'SOP_BREACH', 'AU', 'SOP Penanganan Kebocoran Data — Australia', $sop$# SOP Penanganan Kebocoran Data Pribadi — Australia

**Dasar hukum:** Privacy Act 1988 — Notifiable Data Breaches (NDB) scheme (Part IIIC) dan Australian Privacy Principles; pedoman OAIC.
**Berlaku untuk:** data jemaat cabang ECC di Australia.
**Pemilik SOP:** DPO — Caroline Gugun Hartanti, privacy@eccchurch.global

> **Batas waktu kunci: bila ada dugaan kebocoran, selesaikan penilaian secepatnya (maksimal 30 hari). Bila termasuk "eligible data breach", beri tahu OAIC dan individu terdampak sesegera mungkin (as soon as practicable).**
>
> Catatan: cek dulu status pengecualian usaha kecil (omzet < AUD 3 juta) bersama pengurus/ahli hukum. SOP ini tetap dianjurkan dijalankan.

## 1. Kapan sebuah kebocoran "eligible"
Kebocoran wajib dilaporkan bila **ketiganya** terpenuhi:
1. Terjadi akses atau pengungkapan tanpa izin, atau data hilang dalam kondisi yang memungkinkan akses tanpa izin;
2. Seseorang yang wajar akan menilai hal itu **kemungkinan besar menimbulkan kerugian serius** (fisik, psikologis, emosional, finansial, reputasi) bagi individu; dan
3. Gereja **tidak berhasil** mencegah risiko itu melalui tindakan perbaikan segera.

Data **keyakinan agama** dan data anak adalah *sensitive information* — risikonya dinilai lebih tinggi.

## 2. Tim respons
| Peran | Nama | Kontak |
|---|---|---|
| Ketua tim / DPO | Caroline Gugun Hartanti | privacy@eccchurch.global |
| Teknis (IT) | Tim IDEA — [nama] | [no HP] |
| Pengurus cabang Australia | [nama] | [no HP] |

## 3. Langkah penanganan (Contain → Assess → Notify → Review)
| Waktu | Langkah | Penanggung jawab |
|---|---|---|
| **Segera** | Laporkan ke DPO & IT; simpan bukti. | Pelapor |
| **≤ 2 jam** | **Contain:** cabut akses, keluarkan sesi, ganti sandi/kode, nonaktifkan fitur, minta penerima menghapus data. Tindakan cepat bisa membuat kebocoran tidak lagi "eligible". | IT + DPO |
| **≤ 30 hari (secepatnya)** | **Assess:** data apa, siapa terdampak, seberapa besar risiko kerugian serius. Dokumentasikan penilaian. | IT + DPO |
| **Sesegera mungkin** | **Notify:** kirim *statement* ke OAIC (formulir NDB online) dan beri tahu individu terdampak — langsung, atau lewat pengumuman bila tidak praktis menghubungi satu per satu. | DPO |
| **Setelahnya** | **Review:** perbaikan permanen, evaluasi, latih ulang petugas. | IT + DPO |

## 4. Isi statement (wajib)
1. Identitas dan kontak gereja.
2. Uraian kebocoran.
3. Jenis informasi yang terdampak.
4. Rekomendasi langkah yang perlu diambil individu.

### Template singkat untuk jemaat
> Dear [name], on [date] we became aware that [information] about you was [accessed/disclosed without authorisation] because [brief cause]. We have [steps taken]. We recommend you [steps, e.g. be alert to scam messages claiming to be from the church]. Questions: privacy@eccchurch.global. You can also contact the OAIC (www.oaic.gov.au, 1300 363 992). We sincerely apologise. — Elshaddai Creative Community

## 5. Pencatatan
Semua dugaan kebocoran dicatat di register insiden beserta hasil penilaian (termasuk alasan bila diputuskan tidak dilaporkan).

## 6. Kontak otoritas
- Office of the Australian Information Commissioner (OAIC) — www.oaic.gov.au, 1300 363 992
- ReportCyber (ACSC) — www.cyber.gov.au bila ada serangan siber.

*Draf SOP — mohon ditinjau ahli hukum Australia.*
$sop$, '2026-10-30', CURRENT_TIMESTAMP)
ON CONFLICT ("key", "country") DO NOTHING;

INSERT INTO "compliance_document" ("id", "key", "country", "title", "content", "version", "updated_at")
VALUES (gen_random_uuid(), 'SOP_DSR', 'ID', 'SOP Permintaan Hak atas Data — Indonesia', $sop$# SOP Permintaan Hak Jemaat atas Data Pribadi — Indonesia

**Dasar hukum:** UU No. 27 Tahun 2022 (UU PDP) — hak subjek data dan kewajiban pengendali menanggapi; PP 33/2026.
**Pemilik SOP:** DPO — Caroline Gugun Hartanti, privacy@eccchurch.global

> **Batas waktu kunci: tanggapi dan selesaikan permintaan paling lambat 3 × 24 jam sejak diterima.** Bila tidak bisa dipenuhi, kirim penolakan tertulis beserta alasannya dalam waktu yang sama.

## 1. Jenis permintaan & cara memenuhinya
| Permintaan jemaat | Cara memenuhi di sistem |
|---|---|
| Informasi tentang pemrosesan data | Kirim tautan Kebijakan Privasi; jawab pertanyaan spesifik. |
| **Akses / salinan data (portabilitas)** | Minta jemaat memakai **Pengaturan → Privasi → Unduh data saya**; atau admin: Portal → Jemaat → detail → **Export PDF**. |
| Koreksi data | Jemaat: Profil → Ubah Profil. Admin: Portal → Jemaat → Edit. |
| **Hapus data / tarik persetujuan** | Portal → Jemaat → detail → **Hapus data permanen** (isi alasan + rujukan email). |
| Berhenti menerima WhatsApp non-wajib | Jemaat: **Pengaturan → Privasi → Pesan WhatsApp**. |
| Membatasi siapa yang melihat data | Jemaat: Pengaturan → Privasi. |
| Keberatan / keluhan | Tinjau bersama pengurus; jawab tertulis; informasikan hak mengadu ke otoritas. |

## 2. Langkah
| Waktu | Langkah | PJ |
|---|---|---|
| Hari ke-0 | Permintaan masuk (privacy@, admin cabang, atau langsung). Teruskan ke DPO; catat di **register permintaan**. | Penerima |
| ≤ 12 jam | **Verifikasi identitas** — permintaan dari email/nomor HP yang terdaftar, atau konfirmasi lewat OTP/telepon ke nomor terdaftar. Untuk anak: dari orang tua/wali yang tercatat. | DPO |
| ≤ 3 × 24 jam | Penuhi permintaan (tabel di atas) dan kirim jawaban tertulis ke jemaat. | DPO + admin |
| Selesai | Lengkapi register: tanggal selesai, tindakan, bukti. | DPO |

## 3. Kapan boleh menolak / menunda
Hanya bila diatur UU PDP (mis. membahayakan keamanan/kepentingan pihak lain, kewajiban hukum menyimpan data, atau identitas tidak bisa diverifikasi). Penolakan wajib tertulis dengan alasan.

## 4. Template jawaban
> Bapak/Ibu [nama], permintaan Anda tanggal [tgl] untuk [jenis permintaan] telah kami [penuhi/tindak lanjuti] dengan [uraian]. Bila ada pertanyaan, balas email ini. — DPO Elshaddai Creative Community

*Draf SOP — mohon ditinjau ahli hukum.*
$sop$, '2026-10-30', CURRENT_TIMESTAMP)
ON CONFLICT ("key", "country") DO NOTHING;

INSERT INTO "compliance_document" ("id", "key", "country", "title", "content", "version", "updated_at")
VALUES (gen_random_uuid(), 'SOP_DSR', 'MY', 'SOP Permintaan Hak atas Data — Malaysia', $sop$# SOP Permintaan Hak Jemaat atas Data Pribadi — Malaysia

**Dasar hukum:** PDPA 2010 sebagaimana diubah 2024 — hak akses (s.30–32), koreksi (s.34–35), penarikan persetujuan (s.38), pencegahan pemasaran langsung (s.43), dan hak portabilitas data (berlaku 1 Juni 2025).
**Pemilik SOP:** DPO — Caroline Gugun Hartanti, privacy@eccchurch.global

> **Batas waktu kunci: permintaan akses dan koreksi dijawab paling lambat 21 hari sejak diterima.** Bila tidak bisa, beri tahu jemaat secara tertulis sebelum 21 hari berakhir beserta alasannya, lalu selesaikan dalam tambahan maksimal 14 hari. Gereja tidak memungut biaya.

## 1. Jenis permintaan & cara memenuhinya
| Permintaan | Batas waktu | Cara memenuhi |
|---|---|---|
| **Akses data (data access request)** | 21 hari | Unduh data saya (app) atau Export PDF detail jemaat di Portal. |
| **Portabilitas data** | Secepatnya (≤ 21 hari) | Unduh data saya — PDF salinan data. |
| Koreksi data | 21 hari | Ubah Profil (jemaat) / Edit jemaat (admin); beri tahu jemaat setelah selesai. |
| Tarik persetujuan / hapus data | Secepatnya | Hapus data permanen di Portal. |
| Hentikan pemasaran langsung (pengingat, ucapan, pengumuman) | Secepatnya | Jemaat: Pengaturan → Privasi → Pesan WhatsApp; atau admin mencatat permintaan. |

## 2. Langkah
| Waktu | Langkah | PJ |
|---|---|---|
| Hari ke-0 | Catat permintaan di register; konfirmasi penerimaan ke jemaat. | Penerima |
| ≤ 3 hari | Verifikasi identitas (email/no HP terdaftar, atau konfirmasi via telepon). | DPO |
| ≤ 21 hari | Penuhi permintaan & kirim jawaban tertulis (BM dan/atau Inggris). | DPO + admin |
| Selesai | Lengkapi register. | DPO |

## 3. Kapan boleh menolak
Sesuai s.32 / s.36 PDPA — mis. identitas tidak dapat diverifikasi, permintaan akan mengungkap data orang lain, atau dilarang undang-undang. Penolakan wajib tertulis dengan alasan, paling lambat 21 hari.

## 4. Template jawaban (BM)
> Saudara/Saudari [nama], permintaan anda bertarikh [tarikh] berkenaan [jenis permintaan] telah [dipenuhi/diambil tindakan] seperti berikut: [uraian]. Sebarang pertanyaan, sila balas e-mel ini. — Pegawai Perlindungan Data, Elshaddai Creative Community

*Draf SOP — mohon ditinjau ahli hukum Malaysia.*
$sop$, '2026-10-30', CURRENT_TIMESTAMP)
ON CONFLICT ("key", "country") DO NOTHING;

INSERT INTO "compliance_document" ("id", "key", "country", "title", "content", "version", "updated_at")
VALUES (gen_random_uuid(), 'SOP_DSR', 'AU', 'SOP Permintaan Hak atas Data — Australia', $sop$# SOP Permintaan Hak Jemaat atas Data Pribadi — Australia

**Dasar hukum:** Privacy Act 1988 — APP 12 (akses) dan APP 13 (koreksi); pedoman OAIC.
**Pemilik SOP:** DPO — Caroline Gugun Hartanti, privacy@eccchurch.global

> **Batas waktu kunci: jawab permintaan akses dan koreksi dalam jangka waktu wajar — paling lambat 30 hari kalender.** Tidak ada biaya untuk mengajukan permintaan; gereja juga tidak memungut biaya untuk memberi akses.

## 1. Jenis permintaan & cara memenuhinya
| Permintaan | Batas waktu | Cara memenuhi |
|---|---|---|
| **Akses data (APP 12)** | ≤ 30 hari | Unduh data saya (app) atau Export PDF detail jemaat di Portal, dalam format yang diminta bila wajar. |
| **Koreksi data (APP 13)** | ≤ 30 hari | Ubah Profil / Edit jemaat; bila ditolak, simpan *statement* jemaat bersama datanya bila diminta. |
| Hapus data | Secepatnya | Hapus data permanen di Portal (data yang tidak lagi diperlukan wajib dihapus/disamarkan — APP 11.2). |
| Berhenti menerima pesan (Spam Act) | ≤ 5 hari kerja | Pengaturan → Privasi → Pesan WhatsApp, atau dicatat admin. |

## 2. Langkah
| Waktu | Langkah | PJ |
|---|---|---|
| Hari ke-0 | Catat di register; konfirmasi penerimaan. | Penerima |
| ≤ 5 hari | Verifikasi identitas. | DPO |
| ≤ 30 hari | Penuhi permintaan & kirim jawaban tertulis. | DPO + admin |
| Selesai | Lengkapi register. | DPO |

## 3. Kapan boleh menolak
Hanya dengan alasan yang diizinkan APP 12.3 / APP 13 (mis. membahayakan nyawa/keselamatan orang lain, berdampak tidak wajar pada privasi orang lain, permintaan sembrono). Penolakan wajib tertulis berisi alasan dan cara mengadu (ke gereja lalu ke OAIC).

## 4. Template jawaban
> Dear [name], regarding your request dated [date] to [access/correct/delete] your personal information, we have [action taken]. If you are not satisfied, you may contact us at privacy@eccchurch.global or lodge a complaint with the OAIC (www.oaic.gov.au, 1300 363 992). — Data Protection Officer, Elshaddai Creative Community

*Draf SOP — mohon ditinjau ahli hukum Australia.*
$sop$, '2026-10-30', CURRENT_TIMESTAMP)
ON CONFLICT ("key", "country") DO NOTHING;

-- RBAC: Fulltimer full access ke menu Compliance
INSERT INTO "role_menu_access" ("id", "role_id", "menu_key", "can_read", "can_write", "can_delete", "updated_at")
SELECT gen_random_uuid(), r."id", m.key, true, true, true, CURRENT_TIMESTAMP
FROM "role" r CROSS JOIN (VALUES ('compliance-sop'), ('compliance-backup')) AS m(key)
WHERE LOWER(r."nama") = 'fulltimer'
  AND NOT EXISTS (SELECT 1 FROM "role_menu_access" rma WHERE rma."role_id" = r."id" AND rma."menu_key" = m.key);
