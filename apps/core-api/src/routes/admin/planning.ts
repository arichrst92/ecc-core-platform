/**
 * Planning Backlog router — /admin/planning/*
 *
 * Hirarki: Epic → Story → Task + Sprint grouping + Comments.
 * Gate: IT Minister Team membership (lihat lib/rbac-planning.ts).
 *
 * Endpoints:
 *   GET  /sprints                    list sprints (optional filter status)
 *   GET  /sprints/active             shortcut: current ACTIVE sprint (or null)
 *   POST /sprints                    create
 *   GET  /sprints/:id                detail + aggregated counts
 *   PATCH /sprints/:id               update (nama/goal/dates/status)
 *   POST /sprints/:id/activate       transition PLANNED → ACTIVE (deactivate others)
 *   POST /sprints/:id/complete       transition ACTIVE → COMPLETED
 *   DELETE /sprints/:id              hard delete (restrict kalau punya item)
 *
 *   GET  /epics                      list (filter: sprintId, status, priority, moduleTag, ownerId)
 *   POST /epics                      create
 *   GET  /epics/:id                  detail + nested stories + tasks
 *   PATCH /epics/:id                 update
 *   DELETE /epics/:id                cascade delete children
 *
 *   GET  /stories?epicId=            list
 *   POST /stories                    create (requires epicId)
 *   GET  /stories/:id                detail + tasks
 *   PATCH /stories/:id               update
 *   DELETE /stories/:id              cascade delete tasks
 *
 *   GET  /tasks?storyId=             list
 *   POST /tasks                      create (requires storyId)
 *   GET  /tasks/:id                  detail
 *   PATCH /tasks/:id                 update (status transition, assignee, estimate)
 *   DELETE /tasks/:id
 *
 *   GET  /{epics|stories|tasks}/:id/comments     list
 *   POST /{epics|stories|tasks}/:id/comments     add
 *   DELETE /comments/:id                         delete own comment (atau admin)
 *
 *   GET  /my-items                   stories + tasks assigned ke current user
 *   GET  /dashboard                  summary: active sprint, my-items, counts
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import {
  createSprintSchema,
  updateSprintSchema,
  createEpicSchema,
  updateEpicSchema,
  createStorySchema,
  updateStorySchema,
  createTaskSchema,
  updateTaskSchema,
  createCommentSchema,
  listBacklogQuerySchema,
} from '@ecc/shared-types';
import { BadRequest, Forbidden, NotFound, Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { requireItTeam } from '../../lib/rbac-planning.js';

export const planningRouter = Router();

// Gate seluruh sub-router — hanya IT Minister Team yang bisa akses.
planningRouter.use(requireItTeam);

// ============================================================
//  Sprint
// ============================================================

planningRouter.get('/sprints', async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const where: Record<string, unknown> = {};
  if (status && ['PLANNED', 'ACTIVE', 'COMPLETED'].includes(status)) where.status = status;

  const rows = await prisma.backlogSprint.findMany({
    where,
    orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
    include: {
      createdBy: { select: { id: true, namaLengkap: true } },
      _count: { select: { epics: true, stories: true, tasks: true } },
    },
  });
  res.json({ success: true, data: rows });
});

planningRouter.get('/sprints/active', async (_req, res) => {
  const row = await prisma.backlogSprint.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { startDate: 'desc' },
    include: {
      _count: { select: { epics: true, stories: true, tasks: true } },
    },
  });
  res.json({ success: true, data: row });
});

planningRouter.post('/sprints', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const input = createSprintSchema.parse(req.body);
  const created = await prisma.backlogSprint.create({
    data: {
      nama: input.nama,
      goal: input.goal,
      startDate: new Date(input.startDate),
      endDate: new Date(input.endDate),
      createdById: req.user.jemaatId,
    },
  });
  audit(req, {
    action: 'CREATE',
    resource: 'backlog_sprint',
    resourceId: created.id,
    resourceLabel: created.nama,
    after: created,
  });
  res.status(201).json({ success: true, data: created });
});

planningRouter.get('/sprints/:id', async (req, res) => {
  const row = await prisma.backlogSprint.findUnique({
    where: { id: req.params.id },
    include: {
      createdBy: { select: { id: true, namaLengkap: true } },
      _count: { select: { epics: true, stories: true, tasks: true } },
    },
  });
  if (!row) throw NotFound('Sprint tidak ditemukan');
  res.json({ success: true, data: row });
});

planningRouter.patch('/sprints/:id', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const before = await prisma.backlogSprint.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Sprint tidak ditemukan');
  const input = updateSprintSchema.parse(req.body);
  const data: Record<string, unknown> = {};
  if (input.nama !== undefined) data.nama = input.nama;
  if (input.goal !== undefined) data.goal = input.goal;
  if (input.startDate) data.startDate = new Date(input.startDate);
  if (input.endDate) data.endDate = new Date(input.endDate);
  if (input.status) data.status = input.status;

  const updated = await prisma.backlogSprint.update({
    where: { id: before.id },
    data,
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'backlog_sprint',
    resourceId: updated.id,
    resourceLabel: updated.nama,
    before,
    after: updated,
  });
  res.json({ success: true, data: updated });
});

planningRouter.post('/sprints/:id/activate', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const sprint = await prisma.backlogSprint.findUnique({ where: { id: req.params.id } });
  if (!sprint) throw NotFound('Sprint tidak ditemukan');
  if (sprint.status === 'COMPLETED') throw BadRequest('Sprint sudah COMPLETED, tidak bisa diaktifkan.');

  // Rule: hanya 1 sprint boleh ACTIVE. Set yang lain ke PLANNED kalau masih ACTIVE.
  const updated = await prisma.$transaction(async (tx) => {
    await tx.backlogSprint.updateMany({
      where: { status: 'ACTIVE', NOT: { id: sprint.id } },
      data: { status: 'PLANNED' },
    });
    return tx.backlogSprint.update({
      where: { id: sprint.id },
      data: { status: 'ACTIVE' },
    });
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'backlog_sprint',
    resourceId: updated.id,
    resourceLabel: `ACTIVATE: ${updated.nama}`,
    before: sprint,
    after: updated,
  });
  res.json({ success: true, data: updated });
});

planningRouter.post('/sprints/:id/complete', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const sprint = await prisma.backlogSprint.findUnique({ where: { id: req.params.id } });
  if (!sprint) throw NotFound('Sprint tidak ditemukan');
  if (sprint.status !== 'ACTIVE') throw BadRequest('Hanya sprint ACTIVE yang bisa di-complete.');

  const updated = await prisma.backlogSprint.update({
    where: { id: sprint.id },
    data: { status: 'COMPLETED' },
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'backlog_sprint',
    resourceId: updated.id,
    resourceLabel: `COMPLETE: ${updated.nama}`,
    before: sprint,
    after: updated,
  });
  res.json({ success: true, data: updated });
});

planningRouter.delete('/sprints/:id', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const sprint = await prisma.backlogSprint.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { epics: true, stories: true, tasks: true } } },
  });
  if (!sprint) throw NotFound('Sprint tidak ditemukan');
  const totalItems = sprint._count.epics + sprint._count.stories + sprint._count.tasks;
  if (totalItems > 0) {
    throw BadRequest(
      `Sprint masih punya ${totalItems} item (epic/story/task). Lepas item dari sprint ini dulu, atau pindah ke sprint lain.`,
    );
  }
  await prisma.backlogSprint.delete({ where: { id: sprint.id } });
  audit(req, {
    action: 'DELETE',
    resource: 'backlog_sprint',
    resourceId: sprint.id,
    resourceLabel: sprint.nama,
    before: sprint,
  });
  res.json({ success: true, data: { id: sprint.id } });
});

// ============================================================
//  Epic
// ============================================================

planningRouter.get('/epics', async (req, res) => {
  const q = listBacklogQuerySchema.parse(req.query);
  const where: Record<string, unknown> = {};
  if (q.sprintId) where.sprintId = q.sprintId;
  if (q.status) where.status = q.status;
  if (q.priority) where.priority = q.priority;
  if (q.moduleTag) where.moduleTag = q.moduleTag;
  if (q.ownerId) where.ownerId = q.ownerId;

  const rows = await prisma.backlogEpic.findMany({
    where,
    take: q.limit,
    orderBy: [{ priority: 'asc' }, { nomor: 'desc' }],
    include: {
      owner: { select: { id: true, namaLengkap: true, fotoUrl: true } },
      createdBy: { select: { id: true, namaLengkap: true } },
      sprint: { select: { id: true, nama: true, status: true } },
      _count: { select: { stories: true, comments: true } },
    },
  });
  res.json({ success: true, data: rows });
});

planningRouter.post('/epics', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const input = createEpicSchema.parse(req.body);
  const created = await prisma.backlogEpic.create({
    data: {
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      moduleTag: input.moduleTag,
      sprintId: input.sprintId ?? undefined,
      ownerId: input.ownerId ?? undefined,
      createdById: req.user.jemaatId,
    },
    include: {
      owner: { select: { id: true, namaLengkap: true, fotoUrl: true } },
      createdBy: { select: { id: true, namaLengkap: true } },
    },
  });
  audit(req, {
    action: 'CREATE',
    resource: 'backlog_epic',
    resourceId: created.id,
    resourceLabel: `EPIC-${created.nomor}: ${created.title}`,
    after: created,
  });
  res.status(201).json({ success: true, data: created });
});

planningRouter.get('/epics/:id', async (req, res) => {
  const row = await prisma.backlogEpic.findUnique({
    where: { id: req.params.id },
    include: {
      owner: { select: { id: true, namaLengkap: true, fotoUrl: true } },
      createdBy: { select: { id: true, namaLengkap: true } },
      sprint: { select: { id: true, nama: true, status: true } },
      stories: {
        orderBy: [{ priority: 'asc' }, { nomor: 'asc' }],
        include: {
          assignee: { select: { id: true, namaLengkap: true, fotoUrl: true } },
          _count: { select: { tasks: true } },
          tasks: {
            orderBy: [{ priority: 'asc' }, { nomor: 'asc' }],
            include: {
              assignee: { select: { id: true, namaLengkap: true, fotoUrl: true } },
            },
          },
        },
      },
      _count: { select: { comments: true } },
    },
  });
  if (!row) throw NotFound('Epic tidak ditemukan');
  res.json({ success: true, data: row });
});

planningRouter.patch('/epics/:id', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const before = await prisma.backlogEpic.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Epic tidak ditemukan');
  const input = updateEpicSchema.parse(req.body);

  const data: Record<string, unknown> = { ...input };
  // Transition DONE/ARCHIVED → set closedAt
  if (input.status && (input.status === 'DONE' || input.status === 'ARCHIVED') && !before.closedAt) {
    data.closedAt = new Date();
  } else if (input.status && input.status !== 'DONE' && input.status !== 'ARCHIVED' && before.closedAt) {
    data.closedAt = null;
  }

  const updated = await prisma.backlogEpic.update({
    where: { id: before.id },
    data,
    include: {
      owner: { select: { id: true, namaLengkap: true, fotoUrl: true } },
    },
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'backlog_epic',
    resourceId: updated.id,
    resourceLabel: `EPIC-${updated.nomor}: ${updated.title}`,
    before,
    after: updated,
  });
  res.json({ success: true, data: updated });
});

planningRouter.delete('/epics/:id', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const epic = await prisma.backlogEpic.findUnique({ where: { id: req.params.id } });
  if (!epic) throw NotFound('Epic tidak ditemukan');
  await prisma.backlogEpic.delete({ where: { id: epic.id } });
  audit(req, {
    action: 'DELETE',
    resource: 'backlog_epic',
    resourceId: epic.id,
    resourceLabel: `EPIC-${epic.nomor}: ${epic.title}`,
    before: epic,
  });
  res.json({ success: true, data: { id: epic.id } });
});

// ============================================================
//  Story
// ============================================================

planningRouter.get('/stories', async (req, res) => {
  const q = listBacklogQuerySchema.parse(req.query);
  const where: Record<string, unknown> = {};
  if (q.epicId) where.epicId = q.epicId;
  if (q.sprintId) where.sprintId = q.sprintId;
  if (q.assigneeId) where.assigneeId = q.assigneeId;
  if (q.status) where.status = q.status;
  if (q.priority) where.priority = q.priority;

  const rows = await prisma.backlogStory.findMany({
    where,
    take: q.limit,
    orderBy: [{ priority: 'asc' }, { nomor: 'desc' }],
    include: {
      epic: { select: { id: true, nomor: true, title: true } },
      assignee: { select: { id: true, namaLengkap: true, fotoUrl: true } },
      sprint: { select: { id: true, nama: true, status: true } },
      _count: { select: { tasks: true, comments: true } },
    },
  });
  res.json({ success: true, data: rows });
});

planningRouter.post('/stories', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const input = createStorySchema.parse(req.body);
  const epic = await prisma.backlogEpic.findUnique({
    where: { id: input.epicId },
    select: { id: true },
  });
  if (!epic) throw BadRequest('Epic tidak ditemukan');

  const created = await prisma.backlogStory.create({
    data: {
      epicId: input.epicId,
      title: input.title,
      description: input.description,
      acceptanceCriteria: input.acceptanceCriteria,
      status: input.status,
      priority: input.priority,
      sprintId: input.sprintId ?? undefined,
      assigneeId: input.assigneeId ?? undefined,
      createdById: req.user.jemaatId,
    },
    include: {
      epic: { select: { id: true, nomor: true, title: true } },
      assignee: { select: { id: true, namaLengkap: true, fotoUrl: true } },
    },
  });
  audit(req, {
    action: 'CREATE',
    resource: 'backlog_story',
    resourceId: created.id,
    resourceLabel: `STORY-${created.nomor}: ${created.title}`,
    after: created,
  });
  res.status(201).json({ success: true, data: created });
});

planningRouter.get('/stories/:id', async (req, res) => {
  const row = await prisma.backlogStory.findUnique({
    where: { id: req.params.id },
    include: {
      epic: { select: { id: true, nomor: true, title: true } },
      assignee: { select: { id: true, namaLengkap: true, fotoUrl: true } },
      createdBy: { select: { id: true, namaLengkap: true } },
      sprint: { select: { id: true, nama: true, status: true } },
      tasks: {
        orderBy: [{ priority: 'asc' }, { nomor: 'asc' }],
        include: {
          assignee: { select: { id: true, namaLengkap: true, fotoUrl: true } },
        },
      },
      _count: { select: { comments: true } },
    },
  });
  if (!row) throw NotFound('Story tidak ditemukan');
  res.json({ success: true, data: row });
});

planningRouter.patch('/stories/:id', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const before = await prisma.backlogStory.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Story tidak ditemukan');
  const input = updateStorySchema.parse(req.body);

  const data: Record<string, unknown> = { ...input };
  if (input.status && (input.status === 'DONE' || input.status === 'ARCHIVED') && !before.closedAt) {
    data.closedAt = new Date();
  } else if (input.status && input.status !== 'DONE' && input.status !== 'ARCHIVED' && before.closedAt) {
    data.closedAt = null;
  }

  const updated = await prisma.backlogStory.update({
    where: { id: before.id },
    data,
    include: {
      epic: { select: { id: true, nomor: true, title: true } },
      assignee: { select: { id: true, namaLengkap: true, fotoUrl: true } },
    },
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'backlog_story',
    resourceId: updated.id,
    resourceLabel: `STORY-${updated.nomor}: ${updated.title}`,
    before,
    after: updated,
  });
  res.json({ success: true, data: updated });
});

planningRouter.delete('/stories/:id', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const story = await prisma.backlogStory.findUnique({ where: { id: req.params.id } });
  if (!story) throw NotFound('Story tidak ditemukan');
  await prisma.backlogStory.delete({ where: { id: story.id } });
  audit(req, {
    action: 'DELETE',
    resource: 'backlog_story',
    resourceId: story.id,
    resourceLabel: `STORY-${story.nomor}: ${story.title}`,
    before: story,
  });
  res.json({ success: true, data: { id: story.id } });
});

// ============================================================
//  Task
// ============================================================

planningRouter.get('/tasks', async (req, res) => {
  const q = listBacklogQuerySchema.parse(req.query);
  const where: Record<string, unknown> = {};
  if (q.storyId) where.storyId = q.storyId;
  if (q.sprintId) where.sprintId = q.sprintId;
  if (q.assigneeId) where.assigneeId = q.assigneeId;
  if (q.status) where.status = q.status;
  if (q.priority) where.priority = q.priority;

  const rows = await prisma.backlogTask.findMany({
    where,
    take: q.limit,
    orderBy: [{ priority: 'asc' }, { nomor: 'desc' }],
    include: {
      story: {
        select: {
          id: true,
          nomor: true,
          title: true,
          epic: { select: { id: true, nomor: true, title: true } },
        },
      },
      assignee: { select: { id: true, namaLengkap: true, fotoUrl: true } },
      sprint: { select: { id: true, nama: true, status: true } },
      _count: { select: { comments: true } },
    },
  });
  res.json({ success: true, data: rows });
});

planningRouter.post('/tasks', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const input = createTaskSchema.parse(req.body);
  const story = await prisma.backlogStory.findUnique({
    where: { id: input.storyId },
    select: { id: true },
  });
  if (!story) throw BadRequest('Story tidak ditemukan');

  const created = await prisma.backlogTask.create({
    data: {
      storyId: input.storyId,
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      sprintId: input.sprintId ?? undefined,
      assigneeId: input.assigneeId ?? undefined,
      estimateHours: input.estimateHours ?? undefined,
      createdById: req.user.jemaatId,
    },
    include: {
      story: { select: { id: true, nomor: true, title: true } },
      assignee: { select: { id: true, namaLengkap: true, fotoUrl: true } },
    },
  });
  audit(req, {
    action: 'CREATE',
    resource: 'backlog_task',
    resourceId: created.id,
    resourceLabel: `TASK-${created.nomor}: ${created.title}`,
    after: created,
  });
  res.status(201).json({ success: true, data: created });
});

planningRouter.get('/tasks/:id', async (req, res) => {
  const row = await prisma.backlogTask.findUnique({
    where: { id: req.params.id },
    include: {
      story: {
        select: {
          id: true,
          nomor: true,
          title: true,
          epic: { select: { id: true, nomor: true, title: true } },
        },
      },
      assignee: { select: { id: true, namaLengkap: true, fotoUrl: true } },
      createdBy: { select: { id: true, namaLengkap: true } },
      sprint: { select: { id: true, nama: true, status: true } },
      _count: { select: { comments: true } },
    },
  });
  if (!row) throw NotFound('Task tidak ditemukan');
  res.json({ success: true, data: row });
});

planningRouter.patch('/tasks/:id', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const before = await prisma.backlogTask.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Task tidak ditemukan');
  const input = updateTaskSchema.parse(req.body);

  const data: Record<string, unknown> = { ...input };
  if (input.status && (input.status === 'DONE' || input.status === 'ARCHIVED') && !before.closedAt) {
    data.closedAt = new Date();
  } else if (input.status && input.status !== 'DONE' && input.status !== 'ARCHIVED' && before.closedAt) {
    data.closedAt = null;
  }

  const updated = await prisma.backlogTask.update({
    where: { id: before.id },
    data,
    include: {
      story: { select: { id: true, nomor: true, title: true } },
      assignee: { select: { id: true, namaLengkap: true, fotoUrl: true } },
    },
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'backlog_task',
    resourceId: updated.id,
    resourceLabel: `TASK-${updated.nomor}: ${updated.title}`,
    before,
    after: updated,
  });
  res.json({ success: true, data: updated });
});

planningRouter.delete('/tasks/:id', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const task = await prisma.backlogTask.findUnique({ where: { id: req.params.id } });
  if (!task) throw NotFound('Task tidak ditemukan');
  await prisma.backlogTask.delete({ where: { id: task.id } });
  audit(req, {
    action: 'DELETE',
    resource: 'backlog_task',
    resourceId: task.id,
    resourceLabel: `TASK-${task.nomor}: ${task.title}`,
    before: task,
  });
  res.json({ success: true, data: { id: task.id } });
});

// ============================================================
//  Comments (polymorphic — epic/story/task)
// ============================================================

type CommentParent = 'epic' | 'story' | 'task';

const PARENT_CONFIG: Record<
  CommentParent,
  { fkField: string; existenceCheck: (id: string) => Promise<boolean> }
> = {
  epic: {
    fkField: 'epicId',
    existenceCheck: async (id) => (await prisma.backlogEpic.findUnique({ where: { id }, select: { id: true } })) !== null,
  },
  story: {
    fkField: 'storyId',
    existenceCheck: async (id) => (await prisma.backlogStory.findUnique({ where: { id }, select: { id: true } })) !== null,
  },
  task: {
    fkField: 'taskId',
    existenceCheck: async (id) => (await prisma.backlogTask.findUnique({ where: { id }, select: { id: true } })) !== null,
  },
};

function parentFromPath(path: string): CommentParent {
  if (path.startsWith('/epics/')) return 'epic';
  if (path.startsWith('/stories/')) return 'story';
  if (path.startsWith('/tasks/')) return 'task';
  throw BadRequest('Parent type tidak diketahui');
}

for (const parent of ['epics', 'stories', 'tasks'] as const) {
  planningRouter.get(`/${parent}/:id/comments`, async (req, res) => {
    const kind = parentFromPath(`/${parent}/`);
    const rows = await prisma.backlogComment.findMany({
      where: { [PARENT_CONFIG[kind].fkField]: req.params.id },
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: { id: true, namaLengkap: true, fotoUrl: true } },
      },
    });
    res.json({ success: true, data: rows });
  });

  planningRouter.post(`/${parent}/:id/comments`, async (req, res) => {
    if (!req.user) throw Unauthorized();
    const kind = parentFromPath(`/${parent}/`);
    const cfg = PARENT_CONFIG[kind];
    const exists = await cfg.existenceCheck(req.params.id);
    if (!exists) throw NotFound('Parent item tidak ditemukan');

    const input = createCommentSchema.parse(req.body);
    const created = await prisma.backlogComment.create({
      data: {
        [cfg.fkField]: req.params.id,
        authorId: req.user.jemaatId,
        body: input.body,
      },
      include: {
        author: { select: { id: true, namaLengkap: true, fotoUrl: true } },
      },
    });
    audit(req, {
      action: 'CREATE',
      resource: 'backlog_comment',
      resourceId: created.id,
      resourceLabel: `${kind} ${req.params.id}: ${input.body.slice(0, 50)}`,
      after: created,
    });
    res.status(201).json({ success: true, data: created });
  });
}

planningRouter.delete('/comments/:id', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const comment = await prisma.backlogComment.findUnique({ where: { id: req.params.id } });
  if (!comment) throw NotFound('Komentar tidak ditemukan');
  // Hanya author yang bisa delete comment-nya sendiri (atau admin bisa relax ini kedepannya).
  if (comment.authorId !== req.user.jemaatId) {
    throw Forbidden('Hanya author yang bisa menghapus komentar.');
  }
  await prisma.backlogComment.delete({ where: { id: comment.id } });
  audit(req, {
    action: 'DELETE',
    resource: 'backlog_comment',
    resourceId: comment.id,
    resourceLabel: `comment ${comment.body.slice(0, 40)}`,
    before: comment,
  });
  res.json({ success: true, data: { id: comment.id } });
});

// ============================================================
//  My Items + Dashboard
// ============================================================

planningRouter.get('/my-items', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const uid = req.user.jemaatId;

  const [epics, stories, tasks] = await Promise.all([
    prisma.backlogEpic.findMany({
      where: { ownerId: uid, status: { notIn: ['DONE', 'ARCHIVED'] } },
      orderBy: [{ priority: 'asc' }, { nomor: 'desc' }],
      include: {
        sprint: { select: { id: true, nama: true, status: true } },
        _count: { select: { stories: true } },
      },
    }),
    prisma.backlogStory.findMany({
      where: { assigneeId: uid, status: { notIn: ['DONE', 'ARCHIVED'] } },
      orderBy: [{ priority: 'asc' }, { nomor: 'desc' }],
      include: {
        epic: { select: { id: true, nomor: true, title: true } },
        sprint: { select: { id: true, nama: true, status: true } },
        _count: { select: { tasks: true } },
      },
    }),
    prisma.backlogTask.findMany({
      where: { assigneeId: uid, status: { notIn: ['DONE', 'ARCHIVED'] } },
      orderBy: [{ priority: 'asc' }, { nomor: 'desc' }],
      include: {
        story: {
          select: {
            id: true,
            nomor: true,
            title: true,
            epic: { select: { id: true, nomor: true, title: true } },
          },
        },
        sprint: { select: { id: true, nama: true, status: true } },
      },
    }),
  ]);

  res.json({ success: true, data: { epics, stories, tasks } });
});

planningRouter.get('/dashboard', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const uid = req.user.jemaatId;

  const [activeSprint, myEpicsCount, myStoriesCount, myTasksCount, backlogCount] = await Promise.all([
    prisma.backlogSprint.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { startDate: 'desc' },
      include: {
        _count: { select: { epics: true, stories: true, tasks: true } },
      },
    }),
    prisma.backlogEpic.count({ where: { ownerId: uid, status: { notIn: ['DONE', 'ARCHIVED'] } } }),
    prisma.backlogStory.count({ where: { assigneeId: uid, status: { notIn: ['DONE', 'ARCHIVED'] } } }),
    prisma.backlogTask.count({ where: { assigneeId: uid, status: { notIn: ['DONE', 'ARCHIVED'] } } }),
    prisma.backlogEpic.count({ where: { status: 'BACKLOG' } }),
  ]);

  // Breakdown by status (semua epic/story/task) di active sprint
  let activeSprintStatusBreakdown: Record<string, number> = {};
  if (activeSprint) {
    const grouped = await prisma.backlogTask.groupBy({
      by: ['status'],
      where: { sprintId: activeSprint.id },
      _count: { _all: true },
    });
    activeSprintStatusBreakdown = Object.fromEntries(
      grouped.map((g) => [g.status, g._count._all]),
    );
  }

  res.json({
    success: true,
    data: {
      activeSprint,
      activeSprintStatusBreakdown,
      me: {
        epicsOpen: myEpicsCount,
        storiesOpen: myStoriesCount,
        tasksOpen: myTasksCount,
      },
      backlogCount,
    },
  });
});
