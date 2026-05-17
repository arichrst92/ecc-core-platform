-- CreateEnum
CREATE TYPE "jenis_kelamin" AS ENUM ('L', 'P');

-- CreateEnum
CREATE TYPE "tipe_jadwal" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "hari_minggu" AS ENUM ('MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU');

-- CreateEnum
CREATE TYPE "otp_purpose" AS ENUM ('LOGIN', 'ENROLLMENT', 'RESET_FACE');

-- CreateEnum
CREATE TYPE "audit_action" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'ENROLL_FACE', 'RESET_FACE', 'UPLOAD_PHOTO');

-- CreateTable
CREATE TABLE "sinode" (
    "id" UUID NOT NULL,
    "nama" VARCHAR(255) NOT NULL,
    "kode" VARCHAR(20) NOT NULL,
    "alamat" TEXT,
    "kontak" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sinode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cabang_gereja" (
    "id" UUID NOT NULL,
    "sinode_id" UUID NOT NULL,
    "nama" VARCHAR(255) NOT NULL,
    "kode" VARCHAR(20) NOT NULL,
    "alamat" TEXT,
    "kontak" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cabang_gereja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jemaat" (
    "id" UUID NOT NULL,
    "cabang_id" UUID NOT NULL,
    "nama_lengkap" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255),
    "no_hp" VARCHAR(20),
    "tanggal_lahir" DATE,
    "jenis_kelamin" "jenis_kelamin",
    "alamat" TEXT,
    "tanggal_bergabung" DATE,
    "foto_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jemaat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" UUID NOT NULL,
    "nama" VARCHAR(100) NOT NULL,
    "deskripsi" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_role" (
    "id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "nama" VARCHAR(100) NOT NULL,
    "deskripsi" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sub_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_role_status" (
    "id" UUID NOT NULL,
    "sub_role_id" UUID NOT NULL,
    "nama" VARCHAR(100) NOT NULL,
    "deskripsi" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sub_role_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jemaat_role" (
    "id" UUID NOT NULL,
    "jemaat_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "sub_role_id" UUID NOT NULL,
    "sub_role_status_id" UUID,
    "tanggal_mulai" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tanggal_selesai" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "catatan" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jemaat_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kategori_ibadah" (
    "id" UUID NOT NULL,
    "nama" VARCHAR(100) NOT NULL,
    "deskripsi" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kategori_ibadah_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ibadah" (
    "id" UUID NOT NULL,
    "cabang_id" UUID NOT NULL,
    "kategori_ibadah_id" UUID NOT NULL,
    "nama" VARCHAR(255) NOT NULL,
    "tipe_jadwal" "tipe_jadwal" NOT NULL,
    "tanggal_mulai" DATE NOT NULL,
    "hari" "hari_minggu",
    "jam_mulai" VARCHAR(5) NOT NULL,
    "jam_selesai" VARCHAR(5) NOT NULL,
    "lokasi" TEXT,
    "is_online" BOOLEAN NOT NULL DEFAULT false,
    "link_stream" TEXT,
    "deskripsi" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ibadah_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipe_relasi_keluarga" (
    "id" UUID NOT NULL,
    "nama" VARCHAR(50) NOT NULL,
    "deskripsi" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tipe_relasi_keluarga_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jemaat_relasi" (
    "id" UUID NOT NULL,
    "jemaat_id" UUID NOT NULL,
    "jemaat_terkait_id" UUID NOT NULL,
    "tipe_relasi_id" UUID NOT NULL,
    "keterangan" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jemaat_relasi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "jemaat_id" UUID NOT NULL,
    "foto_url" TEXT,
    "face_descriptor" JSONB,
    "face_enrolled_at" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_verification" (
    "id" UUID NOT NULL,
    "no_hp" VARCHAR(20) NOT NULL,
    "kode_hash" VARCHAR(255) NOT NULL,
    "purpose" "otp_purpose" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_token" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "user_agent" TEXT,
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sinode_api_key" (
    "id" UUID NOT NULL,
    "sinode_id" UUID NOT NULL,
    "nama" VARCHAR(255) NOT NULL,
    "key_hash" VARCHAR(255) NOT NULL,
    "key_prefix" VARCHAR(20) NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sinode_api_key_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "user_name" VARCHAR(255),
    "action" "audit_action" NOT NULL,
    "resource" VARCHAR(100) NOT NULL,
    "resource_id" UUID,
    "resource_label" VARCHAR(500),
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sinode_kode_key" ON "sinode"("kode");

-- CreateIndex
CREATE INDEX "cabang_gereja_sinode_id_idx" ON "cabang_gereja"("sinode_id");

-- CreateIndex
CREATE UNIQUE INDEX "cabang_gereja_sinode_id_kode_key" ON "cabang_gereja"("sinode_id", "kode");

-- CreateIndex
CREATE UNIQUE INDEX "jemaat_email_key" ON "jemaat"("email");

-- CreateIndex
CREATE UNIQUE INDEX "jemaat_no_hp_key" ON "jemaat"("no_hp");

-- CreateIndex
CREATE INDEX "jemaat_cabang_id_idx" ON "jemaat"("cabang_id");

-- CreateIndex
CREATE INDEX "jemaat_no_hp_idx" ON "jemaat"("no_hp");

-- CreateIndex
CREATE INDEX "jemaat_nama_lengkap_idx" ON "jemaat"("nama_lengkap");

-- CreateIndex
CREATE UNIQUE INDEX "role_nama_key" ON "role"("nama");

-- CreateIndex
CREATE INDEX "sub_role_role_id_idx" ON "sub_role"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "sub_role_role_id_nama_key" ON "sub_role"("role_id", "nama");

-- CreateIndex
CREATE INDEX "sub_role_status_sub_role_id_idx" ON "sub_role_status"("sub_role_id");

-- CreateIndex
CREATE UNIQUE INDEX "sub_role_status_sub_role_id_nama_key" ON "sub_role_status"("sub_role_id", "nama");

-- CreateIndex
CREATE INDEX "jemaat_role_jemaat_id_idx" ON "jemaat_role"("jemaat_id");

-- CreateIndex
CREATE INDEX "jemaat_role_role_id_idx" ON "jemaat_role"("role_id");

-- CreateIndex
CREATE INDEX "jemaat_role_is_active_idx" ON "jemaat_role"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "kategori_ibadah_nama_key" ON "kategori_ibadah"("nama");

-- CreateIndex
CREATE INDEX "ibadah_cabang_id_idx" ON "ibadah"("cabang_id");

-- CreateIndex
CREATE INDEX "ibadah_kategori_ibadah_id_idx" ON "ibadah"("kategori_ibadah_id");

-- CreateIndex
CREATE UNIQUE INDEX "tipe_relasi_keluarga_nama_key" ON "tipe_relasi_keluarga"("nama");

-- CreateIndex
CREATE INDEX "jemaat_relasi_jemaat_id_idx" ON "jemaat_relasi"("jemaat_id");

-- CreateIndex
CREATE INDEX "jemaat_relasi_jemaat_terkait_id_idx" ON "jemaat_relasi"("jemaat_terkait_id");

-- CreateIndex
CREATE UNIQUE INDEX "jemaat_relasi_jemaat_id_jemaat_terkait_id_tipe_relasi_id_key" ON "jemaat_relasi"("jemaat_id", "jemaat_terkait_id", "tipe_relasi_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_jemaat_id_key" ON "user"("jemaat_id");

-- CreateIndex
CREATE INDEX "otp_verification_no_hp_purpose_idx" ON "otp_verification"("no_hp", "purpose");

-- CreateIndex
CREATE INDEX "otp_verification_expires_at_idx" ON "otp_verification"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_token_hash_key" ON "refresh_token"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_token_user_id_idx" ON "refresh_token"("user_id");

-- CreateIndex
CREATE INDEX "refresh_token_expires_at_idx" ON "refresh_token"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "sinode_api_key_key_hash_key" ON "sinode_api_key"("key_hash");

-- CreateIndex
CREATE INDEX "sinode_api_key_sinode_id_idx" ON "sinode_api_key"("sinode_id");

-- CreateIndex
CREATE INDEX "sinode_api_key_key_prefix_idx" ON "sinode_api_key"("key_prefix");

-- CreateIndex
CREATE INDEX "audit_log_resource_resource_id_idx" ON "audit_log"("resource", "resource_id");

-- CreateIndex
CREATE INDEX "audit_log_user_id_idx" ON "audit_log"("user_id");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- CreateIndex
CREATE INDEX "audit_log_action_idx" ON "audit_log"("action");

-- AddForeignKey
ALTER TABLE "cabang_gereja" ADD CONSTRAINT "cabang_gereja_sinode_id_fkey" FOREIGN KEY ("sinode_id") REFERENCES "sinode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jemaat" ADD CONSTRAINT "jemaat_cabang_id_fkey" FOREIGN KEY ("cabang_id") REFERENCES "cabang_gereja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_role" ADD CONSTRAINT "sub_role_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_role_status" ADD CONSTRAINT "sub_role_status_sub_role_id_fkey" FOREIGN KEY ("sub_role_id") REFERENCES "sub_role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jemaat_role" ADD CONSTRAINT "jemaat_role_jemaat_id_fkey" FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jemaat_role" ADD CONSTRAINT "jemaat_role_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jemaat_role" ADD CONSTRAINT "jemaat_role_sub_role_id_fkey" FOREIGN KEY ("sub_role_id") REFERENCES "sub_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jemaat_role" ADD CONSTRAINT "jemaat_role_sub_role_status_id_fkey" FOREIGN KEY ("sub_role_status_id") REFERENCES "sub_role_status"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ibadah" ADD CONSTRAINT "ibadah_cabang_id_fkey" FOREIGN KEY ("cabang_id") REFERENCES "cabang_gereja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ibadah" ADD CONSTRAINT "ibadah_kategori_ibadah_id_fkey" FOREIGN KEY ("kategori_ibadah_id") REFERENCES "kategori_ibadah"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jemaat_relasi" ADD CONSTRAINT "jemaat_relasi_jemaat_id_fkey" FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jemaat_relasi" ADD CONSTRAINT "jemaat_relasi_jemaat_terkait_id_fkey" FOREIGN KEY ("jemaat_terkait_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jemaat_relasi" ADD CONSTRAINT "jemaat_relasi_tipe_relasi_id_fkey" FOREIGN KEY ("tipe_relasi_id") REFERENCES "tipe_relasi_keluarga"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_jemaat_id_fkey" FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sinode_api_key" ADD CONSTRAINT "sinode_api_key_sinode_id_fkey" FOREIGN KEY ("sinode_id") REFERENCES "sinode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
