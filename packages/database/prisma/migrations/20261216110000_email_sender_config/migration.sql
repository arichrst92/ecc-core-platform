-- Pengirim email (SendGrid) diatur dari Portal; NULL = ikuti .env.
ALTER TABLE "app_config" ADD COLUMN "email_from_address" VARCHAR(255);
ALTER TABLE "app_config" ADD COLUMN "email_from_name" VARCHAR(150);
ALTER TABLE "app_config" ADD COLUMN "email_reply_to" VARCHAR(255);
