-- ============================================================
--  Planning Backlog (apps/planning @ planning.eccchurch.global)
--  Hirarki: Epic → Story → Task + Sprint grouping + Comments
--  Access control: IT Minister Team membership (gate di API middleware)
--
--  CATATAN: Migration ini sengaja HANYA berisi perubahan terkait
--  Planning Backlog. `prisma migrate dev` membuat extra drift SQL
--  (DROP DEFAULT UUID, RenameIndex, DropIndex) yg bukan bagian fitur
--  ini — di-strip manual. Workflow: pakai `prisma migrate deploy`.
-- ============================================================

-- CreateEnum
CREATE TYPE "backlog_status" AS ENUM ('BACKLOG', 'PLANNED', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "backlog_priority" AS ENUM ('P0', 'P1', 'P2', 'P3');

-- CreateEnum
CREATE TYPE "sprint_status" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED');

-- CreateTable
CREATE TABLE "backlog_sprint" (
    "id" UUID NOT NULL,
    "nama" VARCHAR(100) NOT NULL,
    "goal" TEXT,
    "status" "sprint_status" NOT NULL DEFAULT 'PLANNED',
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backlog_sprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backlog_epic" (
    "nomor" SERIAL NOT NULL,
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "status" "backlog_status" NOT NULL DEFAULT 'BACKLOG',
    "priority" "backlog_priority" NOT NULL DEFAULT 'P2',
    "module_tag" VARCHAR(50),
    "sprint_id" UUID,
    "owner_id" UUID,
    "created_by_id" UUID NOT NULL,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backlog_epic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backlog_story" (
    "nomor" SERIAL NOT NULL,
    "id" UUID NOT NULL,
    "epic_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "acceptance_criteria" TEXT,
    "status" "backlog_status" NOT NULL DEFAULT 'BACKLOG',
    "priority" "backlog_priority" NOT NULL DEFAULT 'P2',
    "sprint_id" UUID,
    "assignee_id" UUID,
    "created_by_id" UUID NOT NULL,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backlog_story_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backlog_task" (
    "nomor" SERIAL NOT NULL,
    "id" UUID NOT NULL,
    "story_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "status" "backlog_status" NOT NULL DEFAULT 'BACKLOG',
    "priority" "backlog_priority" NOT NULL DEFAULT 'P2',
    "sprint_id" UUID,
    "assignee_id" UUID,
    "estimate_hours" DECIMAL(5,1),
    "created_by_id" UUID NOT NULL,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backlog_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backlog_comment" (
    "id" UUID NOT NULL,
    "epic_id" UUID,
    "story_id" UUID,
    "task_id" UUID,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backlog_comment_pkey" PRIMARY KEY ("id")
);

-- CHECK constraint: comment harus terkait tepat satu dari epic/story/task
ALTER TABLE "backlog_comment"
ADD CONSTRAINT "backlog_comment_exactly_one_parent"
CHECK (
  (CASE WHEN "epic_id" IS NOT NULL THEN 1 ELSE 0 END)
  + (CASE WHEN "story_id" IS NOT NULL THEN 1 ELSE 0 END)
  + (CASE WHEN "task_id" IS NOT NULL THEN 1 ELSE 0 END)
  = 1
);

-- CreateIndex
CREATE INDEX "backlog_sprint_status_start_date_idx" ON "backlog_sprint"("status", "start_date");

-- CreateIndex
CREATE UNIQUE INDEX "backlog_epic_nomor_key" ON "backlog_epic"("nomor");
CREATE INDEX "backlog_epic_status_priority_idx" ON "backlog_epic"("status", "priority");
CREATE INDEX "backlog_epic_sprint_id_idx" ON "backlog_epic"("sprint_id");
CREATE INDEX "backlog_epic_owner_id_idx" ON "backlog_epic"("owner_id");
CREATE INDEX "backlog_epic_module_tag_idx" ON "backlog_epic"("module_tag");

-- CreateIndex
CREATE UNIQUE INDEX "backlog_story_nomor_key" ON "backlog_story"("nomor");
CREATE INDEX "backlog_story_epic_id_idx" ON "backlog_story"("epic_id");
CREATE INDEX "backlog_story_status_priority_idx" ON "backlog_story"("status", "priority");
CREATE INDEX "backlog_story_sprint_id_idx" ON "backlog_story"("sprint_id");
CREATE INDEX "backlog_story_assignee_id_idx" ON "backlog_story"("assignee_id");

-- CreateIndex
CREATE UNIQUE INDEX "backlog_task_nomor_key" ON "backlog_task"("nomor");
CREATE INDEX "backlog_task_story_id_idx" ON "backlog_task"("story_id");
CREATE INDEX "backlog_task_status_priority_idx" ON "backlog_task"("status", "priority");
CREATE INDEX "backlog_task_sprint_id_idx" ON "backlog_task"("sprint_id");
CREATE INDEX "backlog_task_assignee_id_idx" ON "backlog_task"("assignee_id");

-- CreateIndex
CREATE INDEX "backlog_comment_epic_id_created_at_idx" ON "backlog_comment"("epic_id", "created_at");
CREATE INDEX "backlog_comment_story_id_created_at_idx" ON "backlog_comment"("story_id", "created_at");
CREATE INDEX "backlog_comment_task_id_created_at_idx" ON "backlog_comment"("task_id", "created_at");
CREATE INDEX "backlog_comment_author_id_idx" ON "backlog_comment"("author_id");

-- AddForeignKey
ALTER TABLE "backlog_sprint" ADD CONSTRAINT "backlog_sprint_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "jemaat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backlog_epic" ADD CONSTRAINT "backlog_epic_sprint_id_fkey" FOREIGN KEY ("sprint_id") REFERENCES "backlog_sprint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "backlog_epic" ADD CONSTRAINT "backlog_epic_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "jemaat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "backlog_epic" ADD CONSTRAINT "backlog_epic_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "jemaat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backlog_story" ADD CONSTRAINT "backlog_story_epic_id_fkey" FOREIGN KEY ("epic_id") REFERENCES "backlog_epic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "backlog_story" ADD CONSTRAINT "backlog_story_sprint_id_fkey" FOREIGN KEY ("sprint_id") REFERENCES "backlog_sprint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "backlog_story" ADD CONSTRAINT "backlog_story_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "jemaat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "backlog_story" ADD CONSTRAINT "backlog_story_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "jemaat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backlog_task" ADD CONSTRAINT "backlog_task_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "backlog_story"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "backlog_task" ADD CONSTRAINT "backlog_task_sprint_id_fkey" FOREIGN KEY ("sprint_id") REFERENCES "backlog_sprint"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "backlog_task" ADD CONSTRAINT "backlog_task_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "jemaat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "backlog_task" ADD CONSTRAINT "backlog_task_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "jemaat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backlog_comment" ADD CONSTRAINT "backlog_comment_epic_id_fkey" FOREIGN KEY ("epic_id") REFERENCES "backlog_epic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "backlog_comment" ADD CONSTRAINT "backlog_comment_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "backlog_story"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "backlog_comment" ADD CONSTRAINT "backlog_comment_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "backlog_task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "backlog_comment" ADD CONSTRAINT "backlog_comment_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
