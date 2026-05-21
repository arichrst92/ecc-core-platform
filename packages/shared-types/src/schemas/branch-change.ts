/**
 * Branch change request schemas — mobile app submit pindah cabang,
 * admin approve di portal.
 */
import { z } from 'zod';
import { uuidSchema, emptyToUndefined } from './common.js';

export const branchChangeStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED']);
export type BranchChangeStatus = z.infer<typeof branchChangeStatusSchema>;

export const createBranchChangeRequestSchema = z
  .object({
    targetCabangId: uuidSchema,
    reason: emptyToUndefined(z.string().trim().max(500)),
  })
  .openapi('CreateBranchChangeRequestInput');
export type CreateBranchChangeRequestInput = z.infer<typeof createBranchChangeRequestSchema>;

/** Admin di portal review request — approve atau reject + note. */
export const reviewBranchChangeRequestSchema = z
  .object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    reviewNote: emptyToUndefined(z.string().trim().max(500)),
  })
  .openapi('ReviewBranchChangeRequestInput');
export type ReviewBranchChangeRequestInput = z.infer<typeof reviewBranchChangeRequestSchema>;
