/**
 * Planning Backlog schemas — Sprint / Epic / Story / Task / Comment.
 * Backs apps/planning @ planning.eccchurch.global.
 */
import { z } from 'zod';
import { uuidSchema } from './common.js';

// ---- Enums (mirror Prisma enums) ----

export const backlogStatusSchema = z.enum([
  'BACKLOG',
  'PLANNED',
  'IN_PROGRESS',
  'IN_REVIEW',
  'DONE',
  'ARCHIVED',
]);
export type BacklogStatus = z.infer<typeof backlogStatusSchema>;

export const backlogPrioritySchema = z.enum(['P0', 'P1', 'P2', 'P3']);
export type BacklogPriority = z.infer<typeof backlogPrioritySchema>;

export const sprintStatusSchema = z.enum(['PLANNED', 'ACTIVE', 'COMPLETED']);
export type SprintStatus = z.infer<typeof sprintStatusSchema>;

// ---- Sprint ----

export const createSprintSchema = z.object({
  nama: z.string().trim().min(1, 'Nama wajib').max(100),
  goal: z.string().trim().max(2000).optional().transform((v) => (v === '' ? undefined : v)),
  startDate: z.string().date(),
  endDate: z.string().date(),
}).refine((d) => new Date(d.endDate) >= new Date(d.startDate), {
  message: 'endDate harus >= startDate',
  path: ['endDate'],
});
export type CreateSprintInput = z.infer<typeof createSprintSchema>;

export const updateSprintSchema = z.object({
  nama: z.string().trim().min(1).max(100).optional(),
  goal: z.string().trim().max(2000).nullable().optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  status: sprintStatusSchema.optional(),
});
export type UpdateSprintInput = z.infer<typeof updateSprintSchema>;

// ---- Epic ----

export const createEpicSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(10000).optional().transform((v) => (v === '' ? undefined : v)),
  status: backlogStatusSchema.default('BACKLOG'),
  priority: backlogPrioritySchema.default('P2'),
  moduleTag: z.string().trim().max(50).optional().transform((v) => (v === '' ? undefined : v)),
  sprintId: uuidSchema.nullable().optional(),
  ownerId: uuidSchema.nullable().optional(),
});
export type CreateEpicInput = z.infer<typeof createEpicSchema>;

export const updateEpicSchema = createEpicSchema.partial();
export type UpdateEpicInput = z.infer<typeof updateEpicSchema>;

// ---- Story ----

export const createStorySchema = z.object({
  epicId: uuidSchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(10000).optional().transform((v) => (v === '' ? undefined : v)),
  acceptanceCriteria: z
    .string()
    .trim()
    .max(10000)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  status: backlogStatusSchema.default('BACKLOG'),
  priority: backlogPrioritySchema.default('P2'),
  sprintId: uuidSchema.nullable().optional(),
  assigneeId: uuidSchema.nullable().optional(),
});
export type CreateStoryInput = z.infer<typeof createStorySchema>;

export const updateStorySchema = createStorySchema.partial().omit({ epicId: true });
export type UpdateStoryInput = z.infer<typeof updateStorySchema>;

// ---- Task ----

export const createTaskSchema = z.object({
  storyId: uuidSchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(10000).optional().transform((v) => (v === '' ? undefined : v)),
  status: backlogStatusSchema.default('BACKLOG'),
  priority: backlogPrioritySchema.default('P2'),
  sprintId: uuidSchema.nullable().optional(),
  assigneeId: uuidSchema.nullable().optional(),
  estimateHours: z.coerce.number().min(0).max(9999.9).nullable().optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = createTaskSchema.partial().omit({ storyId: true });
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

// ---- Comment ----

export const createCommentSchema = z.object({
  body: z.string().trim().min(1, 'Body wajib').max(10000),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

// ---- List query ----

export const listBacklogQuerySchema = z.object({
  sprintId: uuidSchema.optional(),
  assigneeId: uuidSchema.optional(),
  ownerId: uuidSchema.optional(),
  status: backlogStatusSchema.optional(),
  priority: backlogPrioritySchema.optional(),
  moduleTag: z.string().trim().optional(),
  epicId: uuidSchema.optional(),
  storyId: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type ListBacklogQuery = z.infer<typeof listBacklogQuerySchema>;
