-- Analitik: metrik API per 5 menit & kunjungan halaman harian (anonim)
CREATE TABLE "api_metric" (
    "id" UUID NOT NULL,
    "bucket" TIMESTAMP(3) NOT NULL,
    "source" VARCHAR(10) NOT NULL,
    "platform" VARCHAR(10) NOT NULL,
    "method" VARCHAR(8) NOT NULL,
    "route" VARCHAR(160) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "sum_ms" BIGINT NOT NULL DEFAULT 0,
    "c_2xx" INTEGER NOT NULL DEFAULT 0,
    "c_4xx" INTEGER NOT NULL DEFAULT 0,
    "c_5xx" INTEGER NOT NULL DEFAULT 0,
    "c_net" INTEGER NOT NULL DEFAULT 0,
    "hist" INTEGER[],
    CONSTRAINT "api_metric_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "api_metric_bucket_source_platform_method_route_key" ON "api_metric"("bucket", "source", "platform", "method", "route");
CREATE INDEX "api_metric_bucket_idx" ON "api_metric"("bucket");

CREATE TABLE "page_view_daily" (
    "date" DATE NOT NULL,
    "install_id" VARCHAR(64) NOT NULL,
    "route" VARCHAR(160) NOT NULL,
    "platform" VARCHAR(10) NOT NULL,
    "mode" VARCHAR(10) NOT NULL,
    "app_version" VARCHAR(20),
    "views" INTEGER NOT NULL DEFAULT 0,
    "duration_sec" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "page_view_daily_pkey" PRIMARY KEY ("date", "install_id", "route")
);
CREATE INDEX "page_view_daily_route_install_id_date_idx" ON "page_view_daily"("route", "install_id", "date");
CREATE INDEX "page_view_daily_install_id_date_idx" ON "page_view_daily"("install_id", "date");
CREATE INDEX "page_view_daily_date_idx" ON "page_view_daily"("date");
