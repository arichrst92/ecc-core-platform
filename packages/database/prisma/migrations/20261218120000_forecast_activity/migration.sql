-- Forecast (2026-11): aktivitas Els App per jemaat per bulan per platform.
CREATE TABLE "jemaat_activity_monthly" (
    "month" DATE NOT NULL,
    "jemaat_id" UUID NOT NULL,
    "platform" VARCHAR(10) NOT NULL,
    "days" INTEGER NOT NULL DEFAULT 0,
    "first_seen" TIMESTAMP(3) NOT NULL,
    "last_seen" TIMESTAMP(3) NOT NULL,
    "source" VARCHAR(10) NOT NULL DEFAULT 'live',
    CONSTRAINT "jemaat_activity_monthly_pkey" PRIMARY KEY ("month","jemaat_id","platform")
);
CREATE INDEX "jemaat_activity_monthly_jemaat_id_idx" ON "jemaat_activity_monthly"("jemaat_id");
CREATE INDEX "jemaat_activity_monthly_month_idx" ON "jemaat_activity_monthly"("month");

ALTER TABLE "app_config" ADD COLUMN "forecast_settings" JSONB;

-- Riwayat (perkiraan) dari sesi login (refresh_token) & audit_log yang masih tersimpan.
-- Platform dari user agent: okhttp = Android, CFNetwork/Darwin = iOS, browser = Web.
INSERT INTO "jemaat_activity_monthly" ("month","jemaat_id","platform","days","first_seen","last_seen","source")
SELECT
  date_trunc('month', (x.ts AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date AS month,
  u.jemaat_id,
  CASE
    WHEN x.ua ILIKE '%okhttp%' THEN 'android'
    WHEN x.ua ILIKE '%cfnetwork%' OR x.ua ILIKE '%darwin%' THEN 'ios'
    WHEN x.ua ILIKE '%mozilla%' THEN 'web'
    ELSE 'lainnya'
  END AS platform,
  COUNT(DISTINCT ((x.ts AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date)::int AS days,
  MIN(x.ts), MAX(x.ts), 'riwayat'
FROM (
  SELECT user_id, created_at AS ts, user_agent AS ua FROM "refresh_token"
  UNION ALL
  SELECT user_id, created_at AS ts, user_agent AS ua FROM "audit_log" WHERE user_id IS NOT NULL
) x
JOIN "user" u ON u.id = x.user_id
JOIN "jemaat" j ON j.id = u.jemaat_id AND j.is_tamu = false
GROUP BY 1, 2, 3
ON CONFLICT DO NOTHING;
