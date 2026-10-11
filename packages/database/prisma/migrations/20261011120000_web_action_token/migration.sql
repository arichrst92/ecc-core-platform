-- Web Action Token (event NOMINAL_BEBAS daftar + upload bukti di web)
-- Manual SQL — hanya tabel baru, tanpa drift noise. Apply via migrate deploy.

CREATE TABLE "web_action_token" (
    "id" UUID NOT NULL,
    "jemaat_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "purpose" VARCHAR(32) NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "session_hash" VARCHAR(64),
    "session_expires_at" TIMESTAMP(3),
    "requested_ip" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_action_token_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "web_action_token_token_hash_key" ON "web_action_token"("token_hash");
CREATE UNIQUE INDEX "web_action_token_session_hash_key" ON "web_action_token"("session_hash");
CREATE INDEX "web_action_token_jemaat_id_created_at_idx" ON "web_action_token"("jemaat_id", "created_at");
CREATE INDEX "web_action_token_expires_at_idx" ON "web_action_token"("expires_at");

ALTER TABLE "web_action_token" ADD CONSTRAINT "web_action_token_jemaat_id_fkey" FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "web_action_token" ADD CONSTRAINT "web_action_token_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
