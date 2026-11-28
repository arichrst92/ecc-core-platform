-- Analitik: kunjungan halaman per jam (jam ramai / "sering dibuka pada").
CREATE TABLE "page_view_hourly" (
    "hour" TIMESTAMPTZ(6) NOT NULL,
    "route" VARCHAR(160) NOT NULL,
    "platform" VARCHAR(10) NOT NULL,
    "mode" VARCHAR(10) NOT NULL,
    "opens" INTEGER NOT NULL DEFAULT 0,
    "users" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "page_view_hourly_pkey" PRIMARY KEY ("hour","route","platform","mode")
);
CREATE INDEX "page_view_hourly_hour_idx" ON "page_view_hourly"("hour");
