/**
 * OpenAPI 3.0 spec — di-generate otomatis dari Zod schemas via @asteasolutions/zod-to-openapi.
 *
 * Untuk menambah endpoint baru:
 *   1. Pastikan request/response schemas di @ecc/shared-types sudah punya `.openapi('Name')`
 *   2. Tambah `registry.registerPath({...})` di file ini
 *   3. Spec auto-update saat dev/build
 */
import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  createSinodeSchema,
  updateSinodeSchema,
  createCabangSchema,
  updateCabangSchema,
  createJemaatSchema,
  updateJemaatSchema,
  createIbadahSchema,
  updateIbadahSchema,
  createKategoriIbadahSchema,
  updateKategoriIbadahSchema,
  createTipeRelasiSchema,
  updateTipeRelasiSchema,
  createPelayananSchema,
  updatePelayananSchema,
  createPelayananRoleSchema,
  updatePelayananRoleSchema,
  assignJemaatPelayananSchema,
  updateJemaatPelayananSchema,
  linkIbadahPelayananSchema,
  assignPetugasSchema,
  updatePetugasSchema,
  createReservasiSchema,
  updateReservasiStatusSchema,
  bulkReserveSchema,
  checkinByKodeSchema,
  createKontenSchema,
  updateKontenSchema,
  createHomecellAreaSchema,
  updateHomecellAreaSchema,
  createHomecellSchema,
  updateHomecellSchema,
  addHomecellMemberSchema,
  updateHomecellMemberSchema,
  requestOtpSchema,
  verifyOtpSchema,
  faceLoginSchema,
  faceEnrollmentSchema,
  refreshTokenSchema,
  registerJemaatSchema,
  selfEditJemaatSchema,
  paginationQuerySchema,
  errorEnvelopeSchema,
  // Mobile app phase 1
  linkFamilyByKodeSchema,
  linkFamilyByPhoneSchema,
  registerFamilyNewSchema,
  updateFamilyRelationSchema,
  createBranchChangeRequestSchema,
  reviewBranchChangeRequestSchema,
  batchRegisterEventParticipationSchema,
  createEventDonationSchema,
  updateEventDonationSchema,
  // Tambahan untuk fitur baru
  createEventSchema,
  updateEventSchema,
  registerEventParticipationSchema,
  updateEventParticipationSchema,
  linkEventPelayananSchema,
  assignEventVolunteerSchema,
  updateEventVolunteerSchema,
  eventCheckinSchema,
  cancelOccurrenceSchema,
  ibadahCheckinSchema,
  createCabangRekeningSchema,
  updateCabangRekeningSchema,
  createApiKeySchema,
  updateApiKeySchema,
  setMenuAccessSchema,
  updateCanAccessPortalSchema,
  // Liveness gate
  requestLivenessNonceSchema,
  // Movement — Visit
  createVisitSchema,
  updateVisitMetaSchema,
  updateVisitNoteSchema,
  // Movement — Local Business
  createLocalBusinessSchema,
  updateLocalBusinessSchema,
  // Self-deactivation
  deleteMyAccountSchema,
  // Legal docs
  upsertLegalDocumentSchema,
  // App version
  upsertAppVersionSchema,
} from '@ecc/shared-types';

const registry = new OpenAPIRegistry();

// ---------- Security schemes ----------
const bearer = registry.registerComponent('securitySchemes', 'BearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});
const apiKey = registry.registerComponent('securitySchemes', 'ApiKeyAuth', {
  type: 'apiKey',
  in: 'header',
  name: 'X-API-Key',
});

// ---------- Common envelope ----------
registry.register('ErrorEnvelope', errorEnvelopeSchema);

// ---------- Helpers ----------
const json = (schema: z.ZodTypeAny) => ({ content: { 'application/json': { schema } } });
const successOf = (data: z.ZodTypeAny) =>
  z.object({ success: z.literal(true), data });
const paginatedOf = (data: z.ZodTypeAny) =>
  z.object({
    success: z.literal(true),
    data: z.array(data),
    meta: z.object({
      page: z.number(),
      limit: z.number(),
      total: z.number(),
      totalPages: z.number(),
    }),
  });

const idParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: z.string().uuid(),
};

// ---------- Auth ----------
registry.registerPath({
  method: 'post',
  path: '/auth/otp/request',
  tags: ['Auth'],
  summary: 'Request OTP via WhatsApp',
  request: { body: json(requestOtpSchema) },
  responses: {
    200: { description: 'OTP sent', ...json(successOf(z.object({ message: z.string() }))) },
    404: { description: 'Nomor tidak terdaftar', ...json(errorEnvelopeSchema) },
    400: { description: 'Cooldown', ...json(errorEnvelopeSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/otp/verify',
  tags: ['Auth'],
  summary: 'Verify OTP, returns JWT',
  request: { body: json(verifyOtpSchema) },
  responses: {
    200: { description: 'Auth response', ...json(successOf(z.any())) },
    401: { description: 'OTP salah / kadaluarsa', ...json(errorEnvelopeSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/face/login',
  tags: ['Auth · Face Recognition'],
  summary: 'Login shortcut via face descriptor',
  description:
    'Body: noHp + descriptor 128-dim + optional modelVersion. Response include `confidence` (0..1, higher = better match). Error codes: FACE_NOT_ENROLLED (401), FACE_NO_MATCH (401), FACE_MODEL_MISMATCH (409), FACE_INVALID_DESCRIPTOR (422).',
  request: { body: json(faceLoginSchema) },
  responses: {
    200: {
      description: 'Auth response + confidence',
      ...json(
        successOf(
          z.object({
            accessToken: z.string(),
            refreshToken: z.string(),
            user: z.any(),
            confidence: z.number(),
          }),
        ),
      ),
    },
    401: { description: 'FACE_NOT_ENROLLED atau FACE_NO_MATCH', ...json(errorEnvelopeSchema) },
    409: { description: 'FACE_MODEL_MISMATCH', ...json(errorEnvelopeSchema) },
    422: { description: 'FACE_INVALID_DESCRIPTOR', ...json(errorEnvelopeSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/face/enroll',
  tags: ['Auth · Face Recognition'],
  summary: 'Enroll face descriptor (first-time only — re-enroll pakai PUT)',
  description:
    'Body: descriptor + optional modelVersion + metadata (platform, deviceModel, appVersion, consentVersion). Tolak kalau sudah enrolled (409 FACE_ALREADY_ENROLLED) — pakai PUT /auth/me/face-profile untuk re-enroll.',
  security: [{ [bearer.name]: [] }],
  request: { body: json(faceEnrollmentSchema) },
  responses: {
    201: {
      description: 'Enrolled',
      ...json(
        successOf(
          z.object({
            faceEnrolledAt: z.string().datetime(),
            modelVersion: z.string(),
            hasFaceEnrolled: z.boolean(),
          }),
        ),
      ),
    },
    409: { description: 'FACE_ALREADY_ENROLLED — pakai PUT untuk re-enroll', ...json(errorEnvelopeSchema) },
    422: { description: 'FACE_INVALID_DESCRIPTOR', ...json(errorEnvelopeSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/face/reset',
  tags: ['Auth · Face Recognition'],
  summary: 'Hapus face descriptor (self-service, legacy — pakai DELETE /me/face-profile)',
  security: [{ [bearer.name]: [] }],
  responses: {
    200: { description: 'Reset', ...json(successOf(z.object({ hasFaceEnrolled: z.boolean() }))) },
  },
});

// ---------- RESTful face profile endpoints (mobile preferred) ----------
registry.registerPath({
  method: 'get',
  path: '/auth/me/face-profile',
  tags: ['Auth · Face Recognition'],
  summary: 'Status enrollment face untuk user current',
  security: [{ [bearer.name]: [] }],
  responses: {
    200: {
      description: 'Profile status',
      ...json(
        successOf(
          z.object({
            enrolled: z.boolean(),
            enrolledAt: z.string().datetime().nullable(),
            modelVersion: z.string().nullable(),
          }),
        ),
      ),
    },
  },
});

registry.registerPath({
  method: 'put',
  path: '/auth/me/face-profile',
  tags: ['Auth · Face Recognition'],
  summary: 'Re-enroll face descriptor (replace existing)',
  description:
    'Berbeda dengan POST /auth/face/enroll yang tolak existing, endpoint ini EKSPLISIT replace descriptor lama. Body sama dengan POST enroll.',
  security: [{ [bearer.name]: [] }],
  request: { body: json(faceEnrollmentSchema) },
  responses: {
    200: {
      description: 'Re-enrolled',
      ...json(
        successOf(
          z.object({
            faceEnrolledAt: z.string().datetime(),
            modelVersion: z.string(),
            hasFaceEnrolled: z.boolean(),
          }),
        ),
      ),
    },
    422: { description: 'FACE_INVALID_DESCRIPTOR', ...json(errorEnvelopeSchema) },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/auth/me/face-profile',
  tags: ['Auth · Face Recognition'],
  summary: 'Hapus face profile (self-service, PDP Law compliance)',
  security: [{ [bearer.name]: [] }],
  responses: {
    200: { description: 'Deleted', ...json(successOf(z.object({ hasFaceEnrolled: z.boolean() }))) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/refresh',
  tags: ['Auth'],
  summary: 'Rotate access + refresh token',
  description:
    'Token rotation: refresh token lama di-revoke, yang baru di-issue. Reuse detection: jika token yang sudah revoked dipakai, semua sesi user di-revoke (kemungkinan token bocor).',
  request: { body: json(refreshTokenSchema) },
  responses: {
    200: {
      description: 'New token pair',
      ...json(
        successOf(
          z.object({
            accessToken: z.string(),
            refreshToken: z.string(),
            expiresIn: z.number(),
          }),
        ),
      ),
    },
    401: { description: 'Refresh token invalid/expired/reused', ...json(errorEnvelopeSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/logout',
  tags: ['Auth'],
  summary: 'Revoke refresh token (?all=true untuk revoke semua sesi)',
  request: {
    body: json(z.object({ refreshToken: z.string().optional() })),
    query: z.object({ all: z.enum(['true', 'false']).optional() }),
  },
  responses: {
    200: { description: 'Logout sukses', ...json(successOf(z.object({ message: z.string() }))) },
  },
});

// ---------- Helper untuk register CRUD endpoints generic ----------
function registerCrud(opts: {
  basePath: string;
  tag: string;
  resourceName: string;
  createSchema: z.ZodTypeAny;
  updateSchema: z.ZodTypeAny;
  itemSchema?: z.ZodTypeAny;
}) {
  const { basePath, tag, resourceName, createSchema, updateSchema } = opts;
  const itemSchema = opts.itemSchema ?? z.any();

  registry.registerPath({
    method: 'get',
    path: basePath,
    tags: [tag],
    summary: `List ${resourceName}`,
    security: [{ [bearer.name]: [] }],
    request: { query: paginationQuerySchema },
    responses: { 200: { description: 'Paginated list', ...json(paginatedOf(itemSchema)) } },
  });

  registry.registerPath({
    method: 'post',
    path: basePath,
    tags: [tag],
    summary: `Create ${resourceName}`,
    security: [{ [bearer.name]: [] }],
    request: { body: json(createSchema) },
    responses: { 201: { description: 'Created', ...json(successOf(itemSchema)) } },
  });

  registry.registerPath({
    method: 'get',
    path: `${basePath}/{id}`,
    tags: [tag],
    summary: `Get ${resourceName} detail`,
    security: [{ [bearer.name]: [] }],
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: { description: 'Detail', ...json(successOf(itemSchema)) },
      404: { description: 'Not found', ...json(errorEnvelopeSchema) },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: `${basePath}/{id}`,
    tags: [tag],
    summary: `Update ${resourceName}`,
    security: [{ [bearer.name]: [] }],
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: json(updateSchema),
    },
    responses: { 200: { description: 'Updated', ...json(successOf(itemSchema)) } },
  });

  registry.registerPath({
    method: 'delete',
    path: `${basePath}/{id}`,
    tags: [tag],
    summary: `Delete ${resourceName}`,
    security: [{ [bearer.name]: [] }],
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 204: { description: 'Deleted' } },
  });
}

registerCrud({
  basePath: '/admin/sinode',
  tag: 'Admin · Sinode',
  resourceName: 'sinode',
  createSchema: createSinodeSchema,
  updateSchema: updateSinodeSchema,
});
registerCrud({
  basePath: '/admin/cabang',
  tag: 'Admin · Cabang',
  resourceName: 'cabang gereja',
  createSchema: createCabangSchema,
  updateSchema: updateCabangSchema,
});
registerCrud({
  basePath: '/admin/jemaat',
  tag: 'Admin · Jemaat',
  resourceName: 'jemaat',
  createSchema: createJemaatSchema,
  updateSchema: updateJemaatSchema,
});
registerCrud({
  basePath: '/admin/ibadah',
  tag: 'Admin · Ibadah',
  resourceName: 'ibadah',
  createSchema: createIbadahSchema,
  updateSchema: updateIbadahSchema,
});
registry.registerPath({
  method: 'get',
  path: '/admin/ibadah/calendar',
  tags: ['Admin · Ibadah'],
  summary: 'Generate occurrences ibadah di rentang tanggal (untuk calendar view)',
  security: [{ [bearer.name]: [] }],
  request: {
    query: z.object({
      from: z.string().date(),
      to: z.string().date(),
      cabangId: z.string().uuid().optional(),
      kategoriIbadahId: z.string().uuid().optional(),
    }),
  },
  responses: { 200: { description: 'List occurrences', ...json(successOf(z.array(z.any()))) } },
});
registerCrud({
  basePath: '/admin/ibadah/kategori',
  tag: 'Admin · Ibadah',
  resourceName: 'kategori ibadah',
  createSchema: createKategoriIbadahSchema,
  updateSchema: updateKategoriIbadahSchema,
});
registerCrud({
  basePath: '/admin/keluarga/tipe',
  tag: 'Admin · Keluarga',
  resourceName: 'tipe relasi keluarga',
  createSchema: createTipeRelasiSchema,
  updateSchema: updateTipeRelasiSchema,
});
registerCrud({
  basePath: '/admin/pelayanan',
  tag: 'Admin · Pelayanan',
  resourceName: 'pelayanan',
  createSchema: createPelayananSchema,
  updateSchema: updatePelayananSchema,
});

// ---------- Pelayanan: role per-pelayanan + assignment + ibadah link ----------
registry.registerPath({
  method: 'get',
  path: '/admin/pelayanan/role',
  tags: ['Admin · Pelayanan'],
  summary: 'Flat list semua role lintas pelayanan (untuk page Role Pelayanan)',
  security: [{ [bearer.name]: [] }],
  request: {
    query: paginationQuerySchema.extend({ pelayananId: z.string().uuid().optional() }),
  },
  responses: { 200: { description: 'Paginated', ...json(paginatedOf(z.any())) } },
});
registry.registerPath({
  method: 'get',
  path: '/admin/pelayanan/assign/jemaat/{jemaatId}',
  tags: ['Admin · Pelayanan'],
  summary: 'List penugasan pelayanan untuk 1 jemaat (active + history)',
  security: [{ [bearer.name]: [] }],
  request: { params: z.object({ jemaatId: z.string().uuid() }) },
  responses: { 200: { description: 'List', ...json(successOf(z.array(z.any()))) } },
});
registry.registerPath({
  method: 'get',
  path: '/admin/pelayanan/ibadah-link/ibadah/{ibadahId}',
  tags: ['Admin · Pelayanan'],
  summary: 'List pelayanan yang melayani di 1 ibadah',
  security: [{ [bearer.name]: [] }],
  request: { params: z.object({ ibadahId: z.string().uuid() }) },
  responses: { 200: { description: 'List', ...json(successOf(z.array(z.any()))) } },
});
registry.registerPath({
  method: 'post',
  path: '/admin/pelayanan/role',
  tags: ['Admin · Pelayanan'],
  summary: 'Tambah role di pelayanan tertentu',
  security: [{ [bearer.name]: [] }],
  request: { body: json(createPelayananRoleSchema) },
  responses: { 201: { description: 'Created', ...json(successOf(z.any())) } },
});
registry.registerPath({
  method: 'patch',
  path: '/admin/pelayanan/role/{id}',
  tags: ['Admin · Pelayanan'],
  summary: 'Update pelayanan role',
  security: [{ [bearer.name]: [] }],
  request: { params: z.object({ id: z.string().uuid() }), body: json(updatePelayananRoleSchema) },
  responses: { 200: { description: 'Updated', ...json(successOf(z.any())) } },
});
registry.registerPath({
  method: 'delete',
  path: '/admin/pelayanan/role/{id}',
  tags: ['Admin · Pelayanan'],
  summary: 'Hapus pelayanan role',
  security: [{ [bearer.name]: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 204: { description: 'Deleted' } },
});
registry.registerPath({
  method: 'post',
  path: '/admin/pelayanan/assign',
  tags: ['Admin · Pelayanan'],
  summary: 'Assign jemaat ke pelayanan + role',
  security: [{ [bearer.name]: [] }],
  request: { body: json(assignJemaatPelayananSchema) },
  responses: {
    201: { description: 'Assigned', ...json(successOf(z.any())) },
    400: { description: 'Role tidak terkait pelayanan', ...json(errorEnvelopeSchema) },
  },
});
registry.registerPath({
  method: 'patch',
  path: '/admin/pelayanan/assign/{id}',
  tags: ['Admin · Pelayanan'],
  summary: 'Update penugasan jemaat di pelayanan',
  security: [{ [bearer.name]: [] }],
  request: { params: z.object({ id: z.string().uuid() }), body: json(updateJemaatPelayananSchema) },
  responses: { 200: { description: 'Updated', ...json(successOf(z.any())) } },
});
registry.registerPath({
  method: 'delete',
  path: '/admin/pelayanan/assign/{id}',
  tags: ['Admin · Pelayanan'],
  summary: 'Hapus penugasan jemaat dari pelayanan',
  security: [{ [bearer.name]: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 204: { description: 'Deleted' } },
});
registry.registerPath({
  method: 'post',
  path: '/admin/pelayanan/ibadah-link',
  tags: ['Admin · Pelayanan'],
  summary: 'Link pelayanan ke ibadah (M:N)',
  security: [{ [bearer.name]: [] }],
  request: { body: json(linkIbadahPelayananSchema) },
  responses: { 201: { description: 'Linked', ...json(successOf(z.any())) } },
});
registry.registerPath({
  method: 'delete',
  path: '/admin/pelayanan/ibadah-link/{id}',
  tags: ['Admin · Pelayanan'],
  summary: 'Unlink pelayanan dari ibadah (CASCADE hapus semua petugas)',
  security: [{ [bearer.name]: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 204: { description: 'Unlinked' } },
});

// ---------- Petugas (3-way junction: ibadah × pelayanan × jemaat) ----------
registry.registerPath({
  method: 'get',
  path: '/admin/pelayanan/ibadah-link/{id}/petugas',
  tags: ['Admin · Pelayanan'],
  summary: 'List petugas untuk 1 ibadah-pelayanan link',
  security: [{ [bearer.name]: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: { description: 'List', ...json(successOf(z.array(z.any()))) } },
});
registry.registerPath({
  method: 'post',
  path: '/admin/pelayanan/petugas',
  tags: ['Admin · Pelayanan'],
  summary: 'Assign jemaat sebagai petugas di ibadah-pelayanan tertentu',
  security: [{ [bearer.name]: [] }],
  request: { body: json(assignPetugasSchema) },
  responses: {
    201: { description: 'Assigned', ...json(successOf(z.any())) },
    400: { description: 'Role bukan milik pelayanan tsb', ...json(errorEnvelopeSchema) },
  },
});
registry.registerPath({
  method: 'patch',
  path: '/admin/pelayanan/petugas/{id}',
  tags: ['Admin · Pelayanan'],
  summary: 'Update petugas (mis. ganti role)',
  security: [{ [bearer.name]: [] }],
  request: { params: z.object({ id: z.string().uuid() }), body: json(updatePetugasSchema) },
  responses: { 200: { description: 'Updated', ...json(successOf(z.any())) } },
});
registry.registerPath({
  method: 'delete',
  path: '/admin/pelayanan/petugas/{id}',
  tags: ['Admin · Pelayanan'],
  summary: 'Hapus petugas',
  security: [{ [bearer.name]: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 204: { description: 'Deleted' } },
});

// ---------- CSV bulk import jemaat ----------
registry.registerPath({
  method: 'get',
  path: '/admin/jemaat/import/template',
  tags: ['Admin · Jemaat'],
  summary: 'Download template CSV import jemaat',
  security: [{ [bearer.name]: [] }],
  responses: { 200: { description: 'CSV file', content: { 'text/csv': { schema: { type: 'string' } } } } },
});

registry.registerPath({
  method: 'post',
  path: '/admin/jemaat/import/preview',
  tags: ['Admin · Jemaat'],
  summary: 'Parse & validate CSV — return per-row report (tidak insert)',
  security: [{ [bearer.name]: [] }],
  request: {
    body: { content: { 'multipart/form-data': { schema: z.object({ file: z.string() }) } } },
  },
  responses: { 200: { description: 'Preview report', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'post',
  path: '/admin/jemaat/import/commit',
  tags: ['Admin · Jemaat'],
  summary: 'Commit CSV import (transactional)',
  security: [{ [bearer.name]: [] }],
  request: {
    body: {
      content: {
        'multipart/form-data': { schema: z.object({ file: z.string(), skipErrors: z.string().optional() }) },
      },
    },
  },
  responses: {
    200: { description: 'Inserted', ...json(successOf(z.any())) },
    400: { description: 'Validation errors', ...json(errorEnvelopeSchema) },
  },
});

// ---------- Reservasi / Kehadiran ----------
registry.registerPath({
  method: 'get',
  path: '/admin/reservasi',
  tags: ['Admin · Kehadiran'],
  summary: 'List reservasi dengan filter',
  security: [{ [bearer.name]: [] }],
  request: {
    query: paginationQuerySchema.extend({
      status: z.enum(['RESERVE', 'JOIN', 'CANCEL']).optional(),
      ibadahId: z.string().uuid().optional(),
      jemaatId: z.string().uuid().optional(),
      tanggal: z.string().date().optional(),
    }),
  },
  responses: { 200: { description: 'Paginated', ...json(paginatedOf(z.any())) } },
});
registry.registerPath({
  method: 'get',
  path: '/admin/reservasi/by-kode/{kode}',
  tags: ['Admin · Kehadiran'],
  summary: 'Get reservasi by kode (lookup)',
  security: [{ [bearer.name]: [] }],
  request: { params: z.object({ kode: z.string() }) },
  responses: { 200: { description: 'Found', ...json(successOf(z.any())) } },
});
registry.registerPath({
  method: 'post',
  path: '/admin/reservasi',
  tags: ['Admin · Kehadiran'],
  summary: 'Buat reservasi baru (kode auto-generate)',
  security: [{ [bearer.name]: [] }],
  request: { body: json(createReservasiSchema) },
  responses: {
    201: { description: 'Created', ...json(successOf(z.any())) },
    400: { description: 'Duplikat (jemaat+ibadah+tanggal sudah ada)', ...json(errorEnvelopeSchema) },
  },
});
registry.registerPath({
  method: 'post',
  path: '/admin/reservasi/bulk',
  tags: ['Admin · Kehadiran'],
  summary: 'Bulk reservasi (banyak jemaat sekaligus)',
  security: [{ [bearer.name]: [] }],
  request: { body: json(bulkReserveSchema) },
  responses: { 201: { description: 'Result', ...json(successOf(z.any())) } },
});
registry.registerPath({
  method: 'patch',
  path: '/admin/reservasi/{id}/status',
  tags: ['Admin · Kehadiran'],
  summary: 'Ganti status reservasi (Reserve/Join/Cancel)',
  security: [{ [bearer.name]: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: json(updateReservasiStatusSchema),
  },
  responses: { 200: { description: 'Updated', ...json(successOf(z.any())) } },
});
registry.registerPath({
  method: 'post',
  path: '/admin/reservasi/checkin',
  tags: ['Admin · Kehadiran'],
  summary: 'Check-in by kode (admin scanner)',
  security: [{ [bearer.name]: [] }],
  request: { body: json(checkinByKodeSchema) },
  responses: { 200: { description: 'Checked in', ...json(successOf(z.any())) } },
});
registry.registerPath({
  method: 'delete',
  path: '/admin/reservasi/{id}',
  tags: ['Admin · Kehadiran'],
  summary: 'Hapus reservasi',
  security: [{ [bearer.name]: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 204: { description: 'Deleted' } },
});

// ---------- Public mobile (kehadiran) ----------
registry.registerPath({
  method: 'get',
  path: '/api/v1/reservasi/by-kode/{kode}',
  tags: ['Public · Kehadiran'],
  summary: 'Lookup reservasi by kode (untuk mobile scanner preview)',
  security: [{ [apiKey.name]: [] }],
  request: { params: z.object({ kode: z.string() }) },
  responses: { 200: { description: 'Detail', ...json(successOf(z.any())) } },
});
registry.registerPath({
  method: 'post',
  path: '/api/v1/reservasi/checkin',
  tags: ['Public · Kehadiran'],
  summary: 'Check-in via kode (mobile)',
  security: [{ [apiKey.name]: [] }],
  request: { body: json(checkinByKodeSchema) },
  responses: { 200: { description: 'Joined', ...json(successOf(z.any())) } },
});
registry.registerPath({
  method: 'post',
  path: '/api/v1/reservasi/cancel',
  tags: ['Public · Kehadiran'],
  summary: 'Cancel reservasi via kode (mobile)',
  security: [{ [apiKey.name]: [] }],
  request: { body: json(checkinByKodeSchema) },
  responses: { 200: { description: 'Cancelled', ...json(successOf(z.any())) } },
});

// ---------- Konten (News & Renungan) ----------
function registerKontenRoutes(basePath: string, label: string) {
  const tag = `Admin · Broadcast (${label})`;
  registry.registerPath({
    method: 'get',
    path: basePath,
    tags: [tag],
    summary: `List ${label.toLowerCase()}`,
    security: [{ [bearer.name]: [] }],
    request: {
      query: paginationQuerySchema.extend({
        sinodeId: z.string().uuid().optional(),
        cabangId: z.string().uuid().optional(),
        isPublished: z.enum(['true', 'false']).optional(),
      }),
    },
    responses: { 200: { description: 'Paginated', ...json(paginatedOf(z.any())) } },
  });
  registry.registerPath({
    method: 'get',
    path: `${basePath}/{idOrSlug}`,
    tags: [tag],
    summary: 'Detail by id atau slug',
    security: [{ [bearer.name]: [] }],
    request: { params: z.object({ idOrSlug: z.string() }) },
    responses: { 200: { description: 'Detail', ...json(successOf(z.any())) } },
  });
  registry.registerPath({
    method: 'post',
    path: basePath,
    tags: [tag],
    summary: `Buat ${label.toLowerCase()}`,
    security: [{ [bearer.name]: [] }],
    request: { body: json(createKontenSchema) },
    responses: { 201: { description: 'Created', ...json(successOf(z.any())) } },
  });
  registry.registerPath({
    method: 'patch',
    path: `${basePath}/{id}`,
    tags: [tag],
    summary: `Update ${label.toLowerCase()}`,
    security: [{ [bearer.name]: [] }],
    request: { params: z.object({ id: z.string().uuid() }), body: json(updateKontenSchema) },
    responses: { 200: { description: 'Updated', ...json(successOf(z.any())) } },
  });
  registry.registerPath({
    method: 'delete',
    path: `${basePath}/{id}`,
    tags: [tag],
    summary: `Hapus ${label.toLowerCase()}`,
    security: [{ [bearer.name]: [] }],
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: { 204: { description: 'Deleted' } },
  });
  registry.registerPath({
    method: 'post',
    path: `${basePath}/{id}/hero`,
    tags: [tag],
    summary: 'Upload hero image (multipart, field name: foto)',
    security: [{ [bearer.name]: [] }],
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'multipart/form-data': { schema: z.object({ foto: z.string() }) } } },
    },
    responses: { 200: { description: 'Uploaded', ...json(successOf(z.any())) } },
  });
}
registerKontenRoutes('/admin/news', 'News');
registerKontenRoutes('/admin/renungan', 'Renungan');

// ---------- Public Konten (mobile) ----------
function registerPublicKontenRoutes(basePath: string, label: string) {
  const tag = `Public · Broadcast (${label})`;
  registry.registerPath({
    method: 'get',
    path: basePath,
    tags: [tag],
    summary: `List published ${label.toLowerCase()} (scoped sinode)`,
    security: [{ [apiKey.name]: [] }],
    request: {
      query: z.object({
        page: z.coerce.number().optional(),
        limit: z.coerce.number().optional(),
        cabangId: z.string().uuid().optional(),
      }),
    },
    responses: { 200: { description: 'Paginated', ...json(successOf(z.array(z.any()))) } },
  });
  registry.registerPath({
    method: 'get',
    path: `${basePath}/{slug}`,
    tags: [tag],
    summary: `Detail ${label.toLowerCase()} by slug + increment view`,
    security: [{ [apiKey.name]: [] }],
    request: { params: z.object({ slug: z.string() }) },
    responses: { 200: { description: 'Detail', ...json(successOf(z.any())) } },
  });
}
registerPublicKontenRoutes('/api/v1/news', 'News');
registerPublicKontenRoutes('/api/v1/renungan', 'Renungan');

// ---------- Community (Homecell) ----------
const homecellTag = 'Admin · Community';

registry.registerPath({
  method: 'get',
  path: '/admin/homecell-area',
  tags: [homecellTag],
  summary: 'List homecell area (zone)',
  security: [{ [bearer.name]: [] }],
  request: {
    query: paginationQuerySchema.extend({
      cabangId: z.string().uuid().optional(),
      sinodeId: z.string().uuid().optional(),
    }),
  },
  responses: { 200: { description: 'Paginated', ...json(paginatedOf(z.any())) } },
});
registry.registerPath({
  method: 'get',
  path: '/admin/homecell-area/{id}',
  tags: [homecellTag],
  summary: 'Detail homecell area + list homecell di dalamnya',
  security: [{ [bearer.name]: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: { description: 'Detail', ...json(successOf(z.any())) } },
});
registry.registerPath({
  method: 'post',
  path: '/admin/homecell-area',
  tags: [homecellTag],
  summary: 'Buat homecell area (PIC harus Pelayanan Penggembalaan + Zone Leader)',
  security: [{ [bearer.name]: [] }],
  request: { body: json(createHomecellAreaSchema) },
  responses: { 201: { description: 'Created', ...json(successOf(z.any())) } },
});
registry.registerPath({
  method: 'patch',
  path: '/admin/homecell-area/{id}',
  tags: [homecellTag],
  summary: 'Update homecell area',
  security: [{ [bearer.name]: [] }],
  request: { params: z.object({ id: z.string().uuid() }), body: json(updateHomecellAreaSchema) },
  responses: { 200: { description: 'Updated', ...json(successOf(z.any())) } },
});
registry.registerPath({
  method: 'delete',
  path: '/admin/homecell-area/{id}',
  tags: [homecellTag],
  summary: 'Hapus homecell area (hanya jika tidak punya homecell)',
  security: [{ [bearer.name]: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 204: { description: 'Deleted' } },
});

registry.registerPath({
  method: 'get',
  path: '/admin/homecell',
  tags: [homecellTag],
  summary: 'List homecell (cellgroup)',
  security: [{ [bearer.name]: [] }],
  request: {
    query: paginationQuerySchema.extend({
      areaId: z.string().uuid().optional(),
      cabangId: z.string().uuid().optional(),
      sinodeId: z.string().uuid().optional(),
    }),
  },
  responses: { 200: { description: 'Paginated', ...json(paginatedOf(z.any())) } },
});
registry.registerPath({
  method: 'get',
  path: '/admin/homecell/{id}',
  tags: [homecellTag],
  summary: 'Detail homecell + members',
  security: [{ [bearer.name]: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: { description: 'Detail', ...json(successOf(z.any())) } },
});
registry.registerPath({
  method: 'post',
  path: '/admin/homecell',
  tags: [homecellTag],
  summary: 'Buat homecell (PIC harus Pelayanan Penggembalaan + Homecell Leader)',
  security: [{ [bearer.name]: [] }],
  request: { body: json(createHomecellSchema) },
  responses: { 201: { description: 'Created', ...json(successOf(z.any())) } },
});
registry.registerPath({
  method: 'patch',
  path: '/admin/homecell/{id}',
  tags: [homecellTag],
  summary: 'Update homecell',
  security: [{ [bearer.name]: [] }],
  request: { params: z.object({ id: z.string().uuid() }), body: json(updateHomecellSchema) },
  responses: { 200: { description: 'Updated', ...json(successOf(z.any())) } },
});
registry.registerPath({
  method: 'delete',
  path: '/admin/homecell/{id}',
  tags: [homecellTag],
  summary: 'Hapus homecell (CASCADE ke members)',
  security: [{ [bearer.name]: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 204: { description: 'Deleted' } },
});

registry.registerPath({
  method: 'post',
  path: '/admin/homecell/{id}/members',
  tags: [homecellTag],
  summary: 'Tambah member ke homecell',
  security: [{ [bearer.name]: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: json(addHomecellMemberSchema),
  },
  responses: { 201: { description: 'Added', ...json(successOf(z.any())) } },
});
registry.registerPath({
  method: 'patch',
  path: '/admin/homecell/{id}/members/{memberId}',
  tags: [homecellTag],
  summary: 'Update member homecell (status, tanggal keluar, catatan)',
  security: [{ [bearer.name]: [] }],
  request: {
    params: z.object({ id: z.string().uuid(), memberId: z.string().uuid() }),
    body: json(updateHomecellMemberSchema),
  },
  responses: { 200: { description: 'Updated', ...json(successOf(z.any())) } },
});
registry.registerPath({
  method: 'delete',
  path: '/admin/homecell/{id}/members/{memberId}',
  tags: [homecellTag],
  summary: 'Hapus member homecell (hard delete)',
  security: [{ [bearer.name]: [] }],
  request: {
    params: z.object({ id: z.string().uuid(), memberId: z.string().uuid() }),
  },
  responses: { 204: { description: 'Deleted' } },
});

registry.registerPath({
  method: 'get',
  path: '/admin/jemaat/by-pelayanan',
  tags: ['Admin · Jemaat'],
  summary: 'Filter jemaat by pelayanan+role aktif (untuk dropdown PIC homecell)',
  security: [{ [bearer.name]: [] }],
  request: {
    query: z.object({
      pelayanan: z.string().openapi({ example: 'Penggembalaan' }),
      role: z.string().optional().openapi({ example: 'Zone Leader' }),
      cabangId: z.string().uuid().optional(),
    }),
  },
  responses: { 200: { description: 'Eligible jemaat', ...json(successOf(z.array(z.any()))) } },
});

// ---------- Audit log (read-only) ----------
registry.registerPath({
  method: 'get',
  path: '/admin/audit-log',
  tags: ['Admin · Audit'],
  summary: 'List audit log dengan filter',
  security: [{ [bearer.name]: [] }],
  request: {
    query: paginationQuerySchema.extend({
      action: z.enum(['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'ENROLL_FACE', 'RESET_FACE', 'UPLOAD_PHOTO']).optional(),
      resource: z.string().optional(),
      userId: z.string().uuid().optional(),
      from: z.string().date().optional(),
      to: z.string().date().optional(),
    }),
  },
  responses: { 200: { description: 'Paginated list', ...json(paginatedOf(z.any())) } },
});

registry.registerPath({
  method: 'get',
  path: '/admin/audit-log/{id}',
  tags: ['Admin · Audit'],
  summary: 'Detail audit log entry',
  security: [{ [bearer.name]: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: { description: 'Detail', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'get',
  path: '/admin/audit-log/resource/{resource}/{resourceId}',
  tags: ['Admin · Audit'],
  summary: 'Timeline log untuk resource tertentu',
  security: [{ [bearer.name]: [] }],
  request: { params: z.object({ resource: z.string(), resourceId: z.string().uuid() }) },
  responses: { 200: { description: 'Timeline', ...json(successOf(z.array(z.any()))) } },
});

registry.registerPath({
  method: 'get',
  path: '/admin/audit-log/stats/summary',
  tags: ['Admin · Audit'],
  summary: 'Quick stats (groupBy action + resource, 30 hari terakhir)',
  security: [{ [bearer.name]: [] }],
  responses: { 200: { description: 'Stats', ...json(successOf(z.any())) } },
});

// ---------- Public/consumer ----------
registry.registerPath({
  method: 'get',
  path: '/api/v1/cabang',
  tags: ['Public'],
  summary: 'List cabang aktif (scoped sinode)',
  security: [{ [apiKey.name]: [] }],
  responses: { 200: { description: 'List', ...json(successOf(z.array(z.any()))) } },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/ibadah',
  tags: ['Public'],
  summary: 'List ibadah aktif (scoped sinode)',
  security: [{ [apiKey.name]: [] }],
  responses: { 200: { description: 'List', ...json(successOf(z.array(z.any()))) } },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/jemaat/{id}',
  tags: ['Public'],
  summary: 'Get jemaat detail (scoped sinode)',
  security: [{ [apiKey.name]: [] }],
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: { description: 'Detail', ...json(successOf(z.any())) },
    404: { description: 'Not found', ...json(errorEnvelopeSchema) },
  },
});

// ============================================================
//  Fitur baru (2026-05-18+ session):
//  Event/Movement, Ibadah cancel+checkin, Cabang stats+rekening,
//  RBAC menu-access, API Keys admin, Auth /me/access.
// ============================================================

const adminAuth = [{ [bearer.name]: [] }];

// ---------- Auth: /me/access ----------
registry.registerPath({
  method: 'get',
  path: '/auth/me/access',
  tags: ['Auth'],
  summary: 'Resolved RBAC access untuk user current',
  description:
    'Re-fetch canAccessPortal + menuAccess. Berguna setelah admin ubah RBAC ' +
    'agar sidebar/UI auto-update tanpa re-login.',
  security: adminAuth,
  responses: {
    200: {
      description: 'Resolved access',
      ...json(
        successOf(
          z.object({
            canAccessPortal: z.boolean(),
            menuAccess: z.record(
              z.object({
                canRead: z.boolean(),
                canWrite: z.boolean(),
                canDelete: z.boolean(),
              }),
            ),
          }),
        ),
      ),
    },
  },
});

// ---------- Jemaat: by-kode ----------
registry.registerPath({
  method: 'get',
  path: '/admin/jemaat/by-kode/{kode}',
  tags: ['Jemaat'],
  summary: 'Lookup jemaat by QR kode (untuk scan check-in)',
  security: adminAuth,
  request: {
    params: z.object({ kode: z.string() }),
  },
  responses: {
    200: { description: 'Jemaat info ringkas', ...json(successOf(z.any())) },
    404: { description: 'Kode tidak ditemukan', ...json(errorEnvelopeSchema) },
  },
});

// ---------- Ibadah: occurrence cancel ----------
registry.registerPath({
  method: 'get',
  path: '/admin/ibadah/{id}/occurrence/cancelled',
  tags: ['Ibadah'],
  summary: 'List occurrence yang ditiadakan',
  security: adminAuth,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: { description: 'OK', ...json(successOf(z.array(z.any()))) } },
});

registry.registerPath({
  method: 'post',
  path: '/admin/ibadah/{id}/occurrence/{tanggal}/cancel',
  tags: ['Ibadah'],
  summary: 'Tiadakan occurrence ibadah pada tanggal tertentu',
  description:
    'Side effect: semua reservasi RESERVE/JOIN pada tanggal itu auto-cancel ' +
    '(catatan diisi alasan). Idempotent.',
  security: adminAuth,
  request: {
    params: z.object({ id: z.string().uuid(), tanggal: z.string() }),
    body: json(cancelOccurrenceSchema),
  },
  responses: {
    200: { description: 'OK', ...json(successOf(z.any())) },
    400: { description: 'Tanggal bukan jadwal ibadah', ...json(errorEnvelopeSchema) },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/admin/ibadah/{id}/occurrence/{tanggal}/cancel',
  tags: ['Ibadah'],
  summary: 'Buka kembali occurrence yang ditiadakan',
  security: adminAuth,
  request: { params: z.object({ id: z.string().uuid(), tanggal: z.string() }) },
  responses: { 204: { description: 'Restored' } },
});

// ---------- Ibadah: check-in via kode jemaat ----------
registry.registerPath({
  method: 'post',
  path: '/admin/ibadah/{id}/checkin',
  tags: ['Ibadah'],
  summary: 'Check-in kehadiran ibadah via QR kode jemaat',
  description:
    'Authorization: user.jemaatId harus terdaftar di IbadahPelayananPetugas ' +
    'ibadah ini dengan canScanAttendance=true. Walk-in: kalau jemaat belum ' +
    'reservasi, auto-create reservasi status JOIN.',
  security: adminAuth,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: json(ibadahCheckinSchema),
  },
  responses: {
    200: { description: 'Checked in', ...json(successOf(z.any())) },
    403: { description: 'Tidak berwenang scan', ...json(errorEnvelopeSchema) },
    404: { description: 'Kode tidak ditemukan', ...json(errorEnvelopeSchema) },
    409: { description: 'Occurrence ditiadakan / partisipasi BATAL', ...json(errorEnvelopeSchema) },
  },
});

// ---------- Event: CRUD ----------
registry.registerPath({
  method: 'get',
  path: '/admin/event',
  tags: ['Event'],
  summary: 'List event',
  security: adminAuth,
  request: {
    query: paginationQuerySchema.extend({
      cabangId: z.string().uuid().optional(),
      sinodeId: z.string().uuid().optional(),
      tipeBayar: z.enum(['GRATIS', 'NOMINAL_TETAP', 'NOMINAL_BEBAS']).optional(),
      isPublished: z.enum(['true', 'false']).optional(),
    }),
  },
  responses: { 200: { description: 'Paginated', ...json(paginatedOf(z.any())) } },
});

registry.registerPath({
  method: 'get',
  path: '/admin/event/{idOrSlug}',
  tags: ['Event'],
  summary: 'Detail event',
  security: adminAuth,
  request: { params: z.object({ idOrSlug: z.string() }) },
  responses: { 200: { description: 'Detail', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'post',
  path: '/admin/event',
  tags: ['Event'],
  summary: 'Create event',
  security: adminAuth,
  request: { body: json(createEventSchema) },
  responses: { 201: { description: 'Created', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'patch',
  path: '/admin/event/{id}',
  tags: ['Event'],
  summary: 'Update event',
  security: adminAuth,
  request: { params: z.object({ id: z.string().uuid() }), body: json(updateEventSchema) },
  responses: { 200: { description: 'Updated', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'delete',
  path: '/admin/event/{id}',
  tags: ['Event'],
  summary: 'Hapus event (cascade peserta, file hero+QRIS)',
  security: adminAuth,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 204: { description: 'Deleted' } },
});

// ---------- Event: hero & QRIS upload ----------
registry.registerPath({
  method: 'post',
  path: '/admin/event/{id}/hero',
  tags: ['Event'],
  summary: 'Upload hero image (multipart "foto")',
  security: adminAuth,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: { description: 'Uploaded', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'delete',
  path: '/admin/event/{id}/hero',
  tags: ['Event'],
  summary: 'Hapus hero image',
  security: adminAuth,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 204: { description: 'Deleted' } },
});

registry.registerPath({
  method: 'post',
  path: '/admin/event/{id}/qris',
  tags: ['Event'],
  summary: 'Upload QRIS event (multipart "foto")',
  security: adminAuth,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: { description: 'Uploaded', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'delete',
  path: '/admin/event/{id}/qris',
  tags: ['Event'],
  request: { params: z.object({ id: z.string().uuid() }) },
  security: adminAuth,
  summary: 'Hapus QRIS event',
  responses: { 204: { description: 'Deleted' } },
});

// ---------- Event: peserta ----------
registry.registerPath({
  method: 'get',
  path: '/admin/event/{id}/peserta',
  tags: ['Event'],
  summary: 'List peserta event',
  security: adminAuth,
  request: {
    params: z.object({ id: z.string().uuid() }),
    query: z.object({
      status: z.enum(['DAFTAR', 'MENUNGGU_VERIFIKASI', 'BAYAR', 'HADIR', 'BATAL']).optional(),
    }),
  },
  responses: { 200: { description: 'OK', ...json(successOf(z.array(z.any()))) } },
});

registry.registerPath({
  method: 'post',
  path: '/admin/event/{id}/peserta',
  tags: ['Event'],
  summary: 'Daftarkan jemaat sebagai peserta',
  security: adminAuth,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: json(registerEventParticipationSchema),
  },
  responses: {
    201: { description: 'Registered', ...json(successOf(z.any())) },
    409: { description: 'Quota penuh / duplikat', ...json(errorEnvelopeSchema) },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/admin/event/{id}/peserta/{participationId}',
  tags: ['Event'],
  summary: 'Update partisipasi (status / nominal / catatan)',
  security: adminAuth,
  request: {
    params: z.object({ id: z.string().uuid(), participationId: z.string().uuid() }),
    body: json(updateEventParticipationSchema),
  },
  responses: { 200: { description: 'Updated', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'delete',
  path: '/admin/event/{id}/peserta/{participationId}',
  tags: ['Event'],
  summary: 'Hapus partisipasi',
  security: adminAuth,
  request: {
    params: z.object({ id: z.string().uuid(), participationId: z.string().uuid() }),
  },
  responses: { 204: { description: 'Deleted' } },
});

registry.registerPath({
  method: 'post',
  path: '/admin/event/{id}/peserta/{participationId}/bukti',
  tags: ['Event'],
  summary: 'Upload bukti transfer (multipart "foto"); auto-set MENUNGGU_VERIFIKASI',
  security: adminAuth,
  request: {
    params: z.object({ id: z.string().uuid(), participationId: z.string().uuid() }),
  },
  responses: { 200: { description: 'Uploaded', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'post',
  path: '/admin/event/{id}/peserta/{participationId}/approve',
  tags: ['Event'],
  summary: 'Approve bukti transfer → set status BAYAR',
  security: adminAuth,
  request: {
    params: z.object({ id: z.string().uuid(), participationId: z.string().uuid() }),
  },
  responses: { 200: { description: 'Approved', ...json(successOf(z.any())) } },
});

// ---------- Event: check-in ----------
registry.registerPath({
  method: 'post',
  path: '/admin/event/{id}/checkin',
  tags: ['Event'],
  summary: 'Check-in event via QR kode jemaat',
  description:
    'Authorization: user.jemaatId harus terdaftar di EventPelayananPetugas ' +
    'event ini dgn canScanAttendance=true. Untuk event berbayar, status ' +
    'harus BAYAR (kecuali force=true).',
  security: adminAuth,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: json(eventCheckinSchema),
  },
  responses: {
    200: { description: 'Checked in', ...json(successOf(z.any())) },
    400: { description: 'Event tidak butuh kehadiran', ...json(errorEnvelopeSchema) },
    403: { description: 'Tidak berwenang scan', ...json(errorEnvelopeSchema) },
    409: { description: 'Belum bayar (paid event)', ...json(errorEnvelopeSchema) },
  },
});

// ---------- Event: ministry & volunteer ----------
registry.registerPath({
  method: 'get',
  path: '/admin/event/{id}/pelayanan',
  tags: ['Event'],
  summary: 'List pelayanan + volunteer event',
  security: adminAuth,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: { description: 'OK', ...json(successOf(z.array(z.any()))) } },
});

registry.registerPath({
  method: 'post',
  path: '/admin/event/{id}/pelayanan',
  tags: ['Event'],
  summary: 'Link pelayanan ke event',
  security: adminAuth,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: json(linkEventPelayananSchema),
  },
  responses: { 201: { description: 'Linked', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'delete',
  path: '/admin/event/{id}/pelayanan/{linkId}',
  tags: ['Event'],
  summary: 'Unlink pelayanan (cascade volunteer)',
  security: adminAuth,
  request: { params: z.object({ id: z.string().uuid(), linkId: z.string().uuid() }) },
  responses: { 204: { description: 'Deleted' } },
});

registry.registerPath({
  method: 'post',
  path: '/admin/event/{id}/pelayanan/{linkId}/petugas',
  tags: ['Event'],
  summary: 'Assign volunteer ke pelayanan event',
  security: adminAuth,
  request: {
    params: z.object({ id: z.string().uuid(), linkId: z.string().uuid() }),
    body: json(assignEventVolunteerSchema),
  },
  responses: { 201: { description: 'Created', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'patch',
  path: '/admin/event/{id}/pelayanan/{linkId}/petugas/{petugasId}',
  tags: ['Event'],
  summary: 'Update volunteer (role / canScanAttendance / catatan)',
  security: adminAuth,
  request: {
    params: z.object({
      id: z.string().uuid(),
      linkId: z.string().uuid(),
      petugasId: z.string().uuid(),
    }),
    body: json(updateEventVolunteerSchema),
  },
  responses: { 200: { description: 'Updated', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'delete',
  path: '/admin/event/{id}/pelayanan/{linkId}/petugas/{petugasId}',
  tags: ['Event'],
  summary: 'Hapus volunteer',
  security: adminAuth,
  request: {
    params: z.object({
      id: z.string().uuid(),
      linkId: z.string().uuid(),
      petugasId: z.string().uuid(),
    }),
  },
  responses: { 204: { description: 'Deleted' } },
});

// ---------- Cabang: stats + locations ----------
registry.registerPath({
  method: 'get',
  path: '/admin/cabang/locations',
  tags: ['Cabang'],
  summary: 'List cabang dengan koordinat (untuk Globe dashboard)',
  security: adminAuth,
  responses: { 200: { description: 'OK', ...json(successOf(z.array(z.any()))) } },
});

registry.registerPath({
  method: 'get',
  path: '/admin/cabang/{id}/stats',
  tags: ['Cabang'],
  summary: 'Statistik kehadiran cabang (ibadah/event/homecell)',
  description:
    'KPI + top ibadah/event by kehadiran + time-series harian + homecell summary ' +
    '+ donut status reservasi. Default periode 30 hari terakhir.',
  security: adminAuth,
  request: {
    params: z.object({ id: z.string().uuid() }),
    query: z.object({
      from: z.string().optional(),
      to: z.string().optional(),
    }),
  },
  responses: { 200: { description: 'Stats payload', ...json(successOf(z.any())) } },
});

// ---------- Cabang Rekening ----------
registry.registerPath({
  method: 'get',
  path: '/admin/cabang/{id}/rekening',
  tags: ['Cabang'],
  summary: 'List rekening cabang',
  security: adminAuth,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: { description: 'OK', ...json(successOf(z.array(z.any()))) } },
});

registry.registerPath({
  method: 'post',
  path: '/admin/cabang/{id}/rekening',
  tags: ['Cabang'],
  summary: 'Tambah rekening cabang',
  security: adminAuth,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: json(createCabangRekeningSchema),
  },
  responses: { 201: { description: 'Created', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'patch',
  path: '/admin/cabang/{id}/rekening/{rekeningId}',
  tags: ['Cabang'],
  summary: 'Update rekening cabang',
  security: adminAuth,
  request: {
    params: z.object({ id: z.string().uuid(), rekeningId: z.string().uuid() }),
    body: json(updateCabangRekeningSchema),
  },
  responses: { 200: { description: 'Updated', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'delete',
  path: '/admin/cabang/{id}/rekening/{rekeningId}',
  tags: ['Cabang'],
  summary: 'Hapus rekening',
  security: adminAuth,
  request: {
    params: z.object({ id: z.string().uuid(), rekeningId: z.string().uuid() }),
  },
  responses: { 204: { description: 'Deleted' } },
});

registry.registerPath({
  method: 'post',
  path: '/admin/cabang/{id}/rekening/{rekeningId}/qris',
  tags: ['Cabang'],
  summary: 'Upload QRIS rekening (multipart "foto")',
  security: adminAuth,
  request: {
    params: z.object({ id: z.string().uuid(), rekeningId: z.string().uuid() }),
  },
  responses: { 200: { description: 'Uploaded', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'delete',
  path: '/admin/cabang/{id}/rekening/{rekeningId}/qris',
  tags: ['Cabang'],
  summary: 'Hapus QRIS rekening',
  security: adminAuth,
  request: {
    params: z.object({ id: z.string().uuid(), rekeningId: z.string().uuid() }),
  },
  responses: { 204: { description: 'Deleted' } },
});

// ---------- RBAC: menu access ----------
registry.registerPath({
  method: 'get',
  path: '/admin/role/access/matrix',
  tags: ['RBAC'],
  summary: 'Matrix Role × Menu untuk halaman manage Role Access',
  security: adminAuth,
  responses: { 200: { description: 'OK', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'patch',
  path: '/admin/role/{id}/access/portal',
  tags: ['RBAC'],
  summary: 'Set Role.canAccessPortal',
  security: adminAuth,
  request: { params: z.object({ id: z.string().uuid() }), body: json(updateCanAccessPortalSchema) },
  responses: { 200: { description: 'Updated', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'patch',
  path: '/admin/role/sub/{id}/access/portal',
  tags: ['RBAC'],
  summary: 'Set SubRole.canAccessPortal (null=inherit)',
  security: adminAuth,
  request: { params: z.object({ id: z.string().uuid() }), body: json(updateCanAccessPortalSchema) },
  responses: { 200: { description: 'Updated', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'put',
  path: '/admin/role/{id}/access/menu',
  tags: ['RBAC'],
  summary: 'Upsert RoleMenuAccess (canRead/Write/Delete per menu)',
  security: adminAuth,
  request: { params: z.object({ id: z.string().uuid() }), body: json(setMenuAccessSchema) },
  responses: { 200: { description: 'Upserted', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'put',
  path: '/admin/role/sub/{id}/access/menu',
  tags: ['RBAC'],
  summary: 'Upsert SubRoleMenuAccess (override Role-level)',
  security: adminAuth,
  request: { params: z.object({ id: z.string().uuid() }), body: json(setMenuAccessSchema) },
  responses: { 200: { description: 'Upserted', ...json(successOf(z.any())) } },
});

// ---------- API Keys ----------
registry.registerPath({
  method: 'get',
  path: '/admin/sinode-api-key',
  tags: ['API Keys'],
  summary: 'List API keys',
  security: adminAuth,
  request: {
    query: paginationQuerySchema.extend({
      sinodeId: z.string().uuid().optional(),
    }),
  },
  responses: { 200: { description: 'Paginated', ...json(paginatedOf(z.any())) } },
});

registry.registerPath({
  method: 'post',
  path: '/admin/sinode-api-key',
  tags: ['API Keys'],
  summary: 'Buat API key (return plaintext SEKALI saja)',
  description:
    'Response data.key adalah plaintext token — hanya di-return di response ' +
    'ini. Setelah modal close di FE, token tidak bisa direveal lagi.',
  security: adminAuth,
  request: { body: json(createApiKeySchema) },
  responses: { 201: { description: 'Created + key', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'patch',
  path: '/admin/sinode-api-key/{id}',
  tags: ['API Keys'],
  summary: 'Update API key (nama/scopes/expire/isActive)',
  security: adminAuth,
  request: { params: z.object({ id: z.string().uuid() }), body: json(updateApiKeySchema) },
  responses: { 200: { description: 'Updated', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'delete',
  path: '/admin/sinode-api-key/{id}',
  tags: ['API Keys'],
  summary: 'Revoke API key',
  security: adminAuth,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 204: { description: 'Revoked' } },
});

// ============================================================
// Mobile App Phase 1 (2026-05-21)
// ============================================================

// ---------- Public catalog (untuk signup picker) ----------
registry.registerPath({
  method: 'get',
  path: '/auth/cabang',
  tags: ['Auth'],
  summary: 'Public list cabang untuk signup picker (no auth)',
  description:
    'Rate-limited 30/menit/IP. Field di-whitelist (tidak expose kontak admin). ' +
    'Default `?isActive=true`. Pakai `?isActive=all` untuk dapat semua termasuk nonaktif.',
  request: {
    query: z.object({
      isActive: z.enum(['true', 'false', 'all']).optional(),
    }),
  },
  responses: {
    200: {
      description: 'List cabang',
      ...json(
        successOf(
          z.array(
            z.object({
              id: z.string().uuid(),
              nama: z.string(),
              kode: z.string(),
              alamat: z.string().nullable(),
              latitude: z.number().nullable(),
              longitude: z.number().nullable(),
              isActive: z.boolean(),
            }),
          ),
        ),
      ),
    },
    429: { description: 'Rate limit exceeded', ...json(errorEnvelopeSchema) },
  },
});

// ---------- Self-Registration ----------
registry.registerPath({
  method: 'post',
  path: '/auth/register',
  tags: ['Auth'],
  summary: 'Self-register jemaat baru (post-OTP enrollment)',
  description:
    'Pre-requisite: OTP purpose=ENROLLMENT sudah diverify. Submit data diri → akun langsung aktif + login. Anti-abuse: rate limit 3/jam/IP. Auto-assign role default "Jemaat:Jemaat Tetap" kalau seed role tersedia.',
  request: { body: json(registerJemaatSchema) },
  responses: {
    201: { description: 'Auth response + jemaat created', ...json(successOf(z.any())) },
    401: { description: 'OTP belum diverify', ...json(errorEnvelopeSchema) },
    409: { description: 'Nomor sudah terdaftar', ...json(errorEnvelopeSchema) },
  },
});

// ---------- /admin/me — self-service ----------
const meAuth = [{ [bearer.name]: [] }];

registry.registerPath({
  method: 'get',
  path: '/admin/me',
  tags: ['Me'],
  summary: 'Profile diri (Jemaat + User + cabang + roles + homecells)',
  security: meAuth,
  responses: { 200: { description: 'Profile', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'patch',
  path: '/admin/me',
  tags: ['Me'],
  summary: 'Self-edit profile (subset field — noHp & cabangId tidak boleh)',
  security: meAuth,
  request: { body: json(selfEditJemaatSchema) },
  responses: { 200: { description: 'Updated', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'post',
  path: '/admin/me/foto',
  tags: ['Me'],
  summary: 'Upload foto profile (multipart, field=foto, max 5MB)',
  security: meAuth,
  request: {
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({ foto: z.any().describe('Binary image (jpeg/png/webp)') }),
        },
      },
    },
  },
  responses: { 200: { description: 'Updated', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'get',
  path: '/admin/me/stats',
  tags: ['Me'],
  summary: 'Streak hadir + summary (attendedThisYear, eventsJoined, homecellsActive)',
  security: meAuth,
  responses: { 200: { description: 'Stats', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'get',
  path: '/admin/me/scanner-events',
  tags: ['Me'],
  summary: 'List event yang user-nya canScanAttendance volunteer',
  security: meAuth,
  responses: { 200: { description: 'List', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'get',
  path: '/admin/me/scanner-ibadah',
  tags: ['Me'],
  summary: 'List ibadah yang user-nya canScanAttendance petugas',
  security: meAuth,
  responses: { 200: { description: 'List', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'get',
  path: '/admin/me/homecell-managed',
  tags: ['Me'],
  summary: 'List homecell yang user-nya PIC',
  security: meAuth,
  responses: { 200: { description: 'List', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'get',
  path: '/admin/me/homecell-area-managed',
  tags: ['Me'],
  summary: 'List homecell area yang user-nya PIC',
  security: meAuth,
  responses: { 200: { description: 'List', ...json(successOf(z.any())) } },
});

// ---------- Family management ----------
registry.registerPath({
  method: 'get',
  path: '/admin/me/family',
  tags: ['Family'],
  summary: 'List family member user',
  security: meAuth,
  responses: { 200: { description: 'List', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'post',
  path: '/admin/me/family/link-by-kode',
  tags: ['Family'],
  summary: 'Link existing jemaat ke family via kode (scan QR). Auto-verified.',
  security: meAuth,
  request: { body: json(linkFamilyByKodeSchema) },
  responses: { 201: { description: 'Linked', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'post',
  path: '/admin/me/family/link-by-phone',
  tags: ['Family'],
  summary: 'Link existing jemaat ke family via no HP. Auto-verified.',
  security: meAuth,
  request: { body: json(linkFamilyByPhoneSchema) },
  responses: { 201: { description: 'Linked', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'post',
  path: '/admin/me/family/register-new',
  tags: ['Family'],
  summary: 'Register jemaat baru + auto-link family (utk anak balita/dependent)',
  description:
    'Kalau noHp tidak diisi, jemaat baru di-set sebagai dependent dengan primaryGuardianId=user current.',
  security: meAuth,
  request: { body: json(registerFamilyNewSchema) },
  responses: { 201: { description: 'Created + linked', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'patch',
  path: '/admin/me/family/{jemaatId}',
  tags: ['Family'],
  summary: 'Update role relasi family',
  security: meAuth,
  request: {
    params: z.object({ jemaatId: z.string().uuid() }),
    body: json(updateFamilyRelationSchema),
  },
  responses: { 200: { description: 'Updated', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'delete',
  path: '/admin/me/family/{jemaatId}',
  tags: ['Family'],
  summary: 'Unlink family member (hapus 2 arah)',
  security: meAuth,
  request: { params: z.object({ jemaatId: z.string().uuid() }) },
  responses: { 204: { description: 'Unlinked' } },
});

// ---------- Branch change request (self) ----------
registry.registerPath({
  method: 'get',
  path: '/admin/me/branch-change-requests',
  tags: ['Me'],
  summary: 'Riwayat permohonan pindah cabang user',
  security: meAuth,
  responses: { 200: { description: 'List', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'post',
  path: '/admin/me/branch-change-request',
  tags: ['Me'],
  summary: 'Submit permohonan pindah cabang',
  description: 'Maksimal 1 permohonan PENDING per jemaat. Admin approve di /admin/branch-change-request/{id}/review.',
  security: meAuth,
  request: { body: json(createBranchChangeRequestSchema) },
  responses: {
    201: { description: 'Submitted', ...json(successOf(z.any())) },
    409: { description: 'Sudah ada PENDING request', ...json(errorEnvelopeSchema) },
  },
});

// ---------- Branch change request (admin queue) ----------
registry.registerPath({
  method: 'get',
  path: '/admin/branch-change-request',
  tags: ['Admin · Branch Change'],
  summary: 'List branch change requests (admin queue)',
  security: adminAuth,
  request: {
    query: paginationQuerySchema.extend({
      status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
      cabangId: z.string().uuid().optional(),
    }),
  },
  responses: { 200: { description: 'Paginated', ...json(paginatedOf(z.any())) } },
});

registry.registerPath({
  method: 'get',
  path: '/admin/branch-change-request/{id}',
  tags: ['Admin · Branch Change'],
  summary: 'Detail branch change request',
  security: adminAuth,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: { description: 'Detail', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'post',
  path: '/admin/branch-change-request/{id}/review',
  tags: ['Admin · Branch Change'],
  summary: 'Approve / reject permohonan',
  description: 'Saat APPROVED, Jemaat.cabangId di-update ke targetCabangId.',
  security: adminAuth,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: json(reviewBranchChangeRequestSchema),
  },
  responses: { 200: { description: 'Reviewed', ...json(successOf(z.any())) } },
});

// ---------- Get own event participation status ----------
registry.registerPath({
  method: 'get',
  path: '/admin/event/{idOrSlug}/peserta/me',
  tags: ['Movement · Event'],
  summary: 'Get participation status user di event ini (atau 404 kalau belum daftar)',
  description:
    'Resolve current user dari JWT, return row partisipasi mereka di event tsb. ' +
    'Pure read endpoint, idempotent. Accept id atau slug. ' +
    'Mobile pakai sebagai source of truth untuk render CTA event detail — ' +
    'lebih reliable daripada rely on local storage yang fragile di edge case.',
  security: adminAuth,
  request: { params: z.object({ idOrSlug: z.string() }) },
  responses: {
    200: { description: 'Participation row', ...json(successOf(z.any())) },
    404: { description: 'Belum terdaftar di event ini', ...json(errorEnvelopeSchema) },
  },
});

// ---------- Self-cancel event participation ----------
registry.registerPath({
  method: 'delete',
  path: '/admin/event/{id}/peserta/me',
  tags: ['Movement · Event'],
  summary: 'Batalkan partisipasi sendiri (self-cancel)',
  description:
    'User batalkan registrasi event-nya sendiri. Soft cancel: status → BATAL, ' +
    'row tetap untuk audit. Slot kuota otomatis available kembali. ' +
    'Status HADIR tidak bisa di-cancel (400). Idempotent untuk BATAL (200 dengan ' +
    '`meta.alreadyCancelled=true`).',
  security: adminAuth,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: { description: 'Cancelled', ...json(successOf(z.any())) },
    400: { description: 'Status HADIR — tidak bisa cancel', ...json(errorEnvelopeSchema) },
    404: { description: 'Belum terdaftar di event ini', ...json(errorEnvelopeSchema) },
  },
});

// ---------- Event Donations (multi-payment per participation) ----------
registry.registerPath({
  method: 'get',
  path: '/admin/event/{id}/donations',
  tags: ['Movement · Event'],
  summary: 'Admin: list semua donation di event (paginated)',
  description:
    'Untuk fundraising progress. Response include `meta.totalAmountConfirmed` (sum nominalBayar status BAYAR). Filter status via `?status=BAYAR|MENUNGGU_VERIFIKASI|BATAL`.',
  security: adminAuth,
  request: {
    params: z.object({ id: z.string().uuid() }),
    query: paginationQuerySchema.extend({
      status: z.enum(['MENUNGGU_VERIFIKASI', 'BAYAR', 'BATAL']).optional(),
    }),
  },
  responses: { 200: { description: 'Donations', ...json(paginatedOf(z.any())) } },
});

registry.registerPath({
  method: 'get',
  path: '/admin/event/{id}/donations/me',
  tags: ['Movement · Event'],
  summary: 'List donations user current di event ini (mobile)',
  description:
    'Resolve current user dari JWT. Return semua donation row + `meta.totalConfirmed` (sum BAYAR).',
  security: adminAuth,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: { description: 'Own donations', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'post',
  path: '/admin/event/{id}/donations',
  tags: ['Movement · Event'],
  summary: 'Create donation untuk event (mobile / admin)',
  description:
    'Auto-resolve/create participation dari current user. Nominal divalidasi sesuai event.tipeBayar (NOMINAL_TETAP exact, NOMINAL_BEBAS >= minimum, GRATIS rejected).',
  security: adminAuth,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: json(createEventDonationSchema),
  },
  responses: { 201: { description: 'Created', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'get',
  path: '/admin/event/{id}/donations/{donationId}',
  tags: ['Movement · Event'],
  summary: 'Detail donation',
  security: adminAuth,
  request: {
    params: z.object({ id: z.string().uuid(), donationId: z.string().uuid() }),
  },
  responses: { 200: { description: 'Donation row', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'patch',
  path: '/admin/event/{id}/donations/{donationId}',
  tags: ['Movement · Event'],
  summary: 'Admin update donation (status / nominal / catatan)',
  security: adminAuth,
  request: {
    params: z.object({ id: z.string().uuid(), donationId: z.string().uuid() }),
    body: json(updateEventDonationSchema),
  },
  responses: { 200: { description: 'Updated', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'post',
  path: '/admin/event/{id}/donations/{donationId}/bukti',
  tags: ['Movement · Event'],
  summary: 'Upload bukti transfer per donation (multipart)',
  description: 'Field name fleksibel (foto/bukti/file/image), max 5MB.',
  security: adminAuth,
  request: {
    params: z.object({ id: z.string().uuid(), donationId: z.string().uuid() }),
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({ foto: z.any().describe('Binary image') }),
        },
      },
    },
  },
  responses: { 200: { description: 'Bukti saved', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'post',
  path: '/admin/event/{id}/donations/{donationId}/approve',
  tags: ['Movement · Event'],
  summary: 'Admin approve donation — set status BAYAR',
  security: adminAuth,
  request: {
    params: z.object({ id: z.string().uuid(), donationId: z.string().uuid() }),
  },
  responses: { 200: { description: 'Approved', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'delete',
  path: '/admin/event/{id}/donations/{donationId}',
  tags: ['Movement · Event'],
  summary: 'Cancel donation (owner / admin)',
  description: 'Soft cancel — status → BATAL. Idempotent (BATAL → meta.alreadyCancelled).',
  security: adminAuth,
  request: {
    params: z.object({ id: z.string().uuid(), donationId: z.string().uuid() }),
  },
  responses: { 200: { description: 'Cancelled', ...json(successOf(z.any())) } },
});

// ---------- Batch event registration ----------
registry.registerPath({
  method: 'post',
  path: '/admin/event/{id}/peserta/batch',
  tags: ['Movement · Event'],
  summary: 'Daftar multiple jemaat sekaligus (mobile family flow)',
  description:
    'Partial success: response { successful: Participation[], failed: { jemaatId, error }[] }. Max 20 jemaat per request.',
  security: adminAuth,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: json(batchRegisterEventParticipationSchema),
  },
  responses: { 201: { description: 'Batch result', ...json(successOf(z.any())) } },
});

// ---------- Scanner stats ----------
registry.registerPath({
  method: 'get',
  path: '/admin/event/{id}/checkin/stats',
  tags: ['Movement · Event'],
  summary: 'Stats kehadiran event (polling-friendly)',
  security: adminAuth,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: { description: 'Stats', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'get',
  path: '/admin/ibadah/{id}/checkin/stats',
  tags: ['Ibadah'],
  summary: 'Stats kehadiran ibadah per tanggal',
  security: adminAuth,
  request: {
    params: z.object({ id: z.string().uuid() }),
    query: z.object({ tanggalIbadah: z.string().date().optional() }),
  },
  responses: { 200: { description: 'Stats', ...json(successOf(z.any())) } },
});

// ---------- Homecell member by kode ----------
registry.registerPath({
  method: 'post',
  path: '/admin/homecell/{id}/members/by-kode',
  tags: ['Community · Homecell'],
  summary: 'Tambah member homecell via scan QR kode jemaat',
  security: adminAuth,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: json(z.object({ kode: z.string().min(4).max(20) })),
  },
  responses: { 201: { description: 'Added', ...json(successOf(z.any())) } },
});

// ---------- Homecell soft-remove member by jemaatId (mobile PIC flow) ----------
registry.registerPath({
  method: 'delete',
  path: '/admin/homecell/{id}/members/by-jemaat/{jemaatId}',
  tags: ['Community · Homecell'],
  summary: 'Soft-remove member dari homecell (set isActive=false)',
  description:
    'Untuk mobile PIC homecell flow. Berbeda dengan DELETE /:memberId (hard delete oleh admin portal), ini lookup by jemaatId dan SOFT delete (isActive=false + tanggalKeluar). Idempotent untuk yang sudah dikeluarkan.',
  security: adminAuth,
  request: {
    params: z.object({
      id: z.string().uuid(),
      jemaatId: z.string().uuid(),
    }),
  },
  responses: {
    200: { description: 'Removed (or alreadyRemoved)', ...json(successOf(z.any())) },
    404: { description: 'Member tidak ditemukan di homecell', ...json(errorEnvelopeSchema) },
  },
});

// ---------- Homecell list per area ----------
registry.registerPath({
  method: 'get',
  path: '/admin/homecell-area/{id}/homecells',
  tags: ['Community · Homecell'],
  summary: 'List semua homecell di area (mobile PIC area flow)',
  description:
    'Mobile PIC area buka detail area → list semua homecell di area itu (termasuk yang user-nya bukan PIC homecell-nya). Shape ringkas: id, nama, alamat, hari, jam, picJemaat, memberCount.',
  security: adminAuth,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: { description: 'Homecells in area', ...json(successOf(z.any())) },
    404: { description: 'Area tidak ditemukan', ...json(errorEnvelopeSchema) },
  },
});

// ================================================================
// Liveness Nonce — server-side gate untuk face enroll/login
// ================================================================
registry.registerPath({
  method: 'post',
  path: '/auth/face/liveness-nonce',
  tags: ['Auth · Face Recognition'],
  summary: 'Issue HMAC signed liveness nonce (3 menit TTL, one-shot)',
  description:
    'Mobile call sebelum show liveness UI. Submit nonce di body /face/login atau /face/enroll bersama descriptor. Error codes saat consume: LIVENESS_NONCE_INVALID, LIVENESS_NONCE_EXPIRED, LIVENESS_NONCE_PURPOSE_MISMATCH, LIVENESS_NONCE_BIND_MISMATCH, LIVENESS_NONCE_REUSED. V1: optional di /face/login + /face/enroll (V2 akan required).',
  request: { body: json(requestLivenessNonceSchema) },
  responses: {
    200: {
      description: 'Nonce issued',
      ...json(
        successOf(
          z.object({
            nonce: z.string().openapi({ description: 'Opaque token, kirim apa adanya di body request /face/* berikutnya.' }),
            expiresAt: z.string().openapi({ format: 'date-time' }),
            ttlSeconds: z.number(),
          }),
        ),
      ),
    },
  },
});

// ================================================================
// Movement · Visit (scan QR antar jemaat)
// ================================================================
registry.registerPath({
  method: 'get',
  path: '/admin/me/visits',
  tags: ['Movement · Visit (Mobile self)'],
  summary: 'List visit yang melibatkan saya',
  description: 'Filter role=all|initiator|target, range from/to, search judul/lokasi.',
  security: adminAuth,
  responses: { 200: { description: 'OK', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'post',
  path: '/admin/me/visits',
  tags: ['Movement · Visit (Mobile self)'],
  summary: 'Create visit via scan QR',
  description:
    'Caller = initiator. Body: targetKode (QR kode jemaat) + judul + lokasi (opsional).',
  security: adminAuth,
  request: { body: json(createVisitSchema) },
  responses: {
    201: { description: 'Created', ...json(successOf(z.any())) },
    400: { description: 'Target inactive / scan diri sendiri', ...json(errorEnvelopeSchema) },
    404: { description: 'Kode tidak ditemukan', ...json(errorEnvelopeSchema) },
  },
});

registry.registerPath({
  method: 'get',
  path: '/admin/me/visits/{id}',
  tags: ['Movement · Visit (Mobile self)'],
  summary: 'Detail visit (peserta only)',
  security: adminAuth,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: { description: 'OK', ...json(successOf(z.any())) },
    403: { description: 'Bukan peserta', ...json(errorEnvelopeSchema) },
    404: { description: 'Visit tidak ditemukan', ...json(errorEnvelopeSchema) },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/admin/me/visits/{id}',
  tags: ['Movement · Visit (Mobile self)'],
  summary: 'Edit judul / lokasi (initiator-only)',
  security: adminAuth,
  request: { params: z.object({ id: z.string().uuid() }), body: json(updateVisitMetaSchema) },
  responses: {
    200: { description: 'Updated', ...json(successOf(z.any())) },
    403: { description: 'Bukan initiator', ...json(errorEnvelopeSchema) },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/admin/me/visits/{id}/note',
  tags: ['Movement · Visit (Mobile self)'],
  summary: 'Edit own note (auto-route ke side caller)',
  description:
    'Body: { note }. Caller initiator → update noteDariInitiator. Caller target → update noteDariTarget. String kosong = hapus.',
  security: adminAuth,
  request: { params: z.object({ id: z.string().uuid() }), body: json(updateVisitNoteSchema) },
  responses: { 200: { description: 'Updated', ...json(successOf(z.any())) } },
});

registry.registerPath({
  method: 'delete',
  path: '/admin/me/visits/{id}',
  tags: ['Movement · Visit (Mobile self)'],
  summary: 'Cancel visit (initiator-only, dalam 1 jam)',
  security: adminAuth,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    204: { description: 'Cancelled' },
    409: { description: 'Window 1 jam lewat', ...json(errorEnvelopeSchema) },
  },
});

// --- Admin portal visit (read + delete moderation)
registry.registerPath({
  method: 'get',
  path: '/admin/visit',
  tags: ['Movement · Visit (Admin)'],
  summary: 'List visits dengan filter cabang/jemaat/range tanggal/search',
  security: adminAuth,
  responses: { 200: { description: 'OK', ...json(paginatedOf(z.any())) } },
});
registry.registerPath({
  method: 'get',
  path: '/admin/visit/{id}',
  tags: ['Movement · Visit (Admin)'],
  summary: 'Detail visit (admin)',
  security: adminAuth,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: { description: 'OK', ...json(successOf(z.any())) } },
});
registry.registerPath({
  method: 'delete',
  path: '/admin/visit/{id}',
  tags: ['Movement · Visit (Admin)'],
  summary: 'Hapus visit (moderasi, audit logged)',
  security: adminAuth,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 204: { description: 'Deleted' } },
});

// ================================================================
// Movement · Local Business (UMKM directory)
// ================================================================
registry.registerPath({
  method: 'get',
  path: '/admin/me/businesses',
  tags: ['Movement · Local Business (Mobile owner)'],
  summary: 'List bisnis saya (semua, termasuk nonaktif)',
  security: adminAuth,
  responses: { 200: { description: 'OK', ...json(successOf(z.any())) } },
});
registry.registerPath({
  method: 'post',
  path: '/admin/me/businesses',
  tags: ['Movement · Local Business (Mobile owner)'],
  summary: 'Create bisnis baru',
  security: adminAuth,
  request: { body: json(createLocalBusinessSchema) },
  responses: { 201: { description: 'Created', ...json(successOf(z.any())) } },
});
registry.registerPath({
  method: 'get',
  path: '/admin/me/businesses/{id}',
  tags: ['Movement · Local Business (Mobile owner)'],
  summary: 'Detail bisnis (owner only)',
  security: adminAuth,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: { description: 'OK', ...json(successOf(z.any())) },
    403: { description: 'Bukan owner', ...json(errorEnvelopeSchema) },
  },
});
registry.registerPath({
  method: 'patch',
  path: '/admin/me/businesses/{id}',
  tags: ['Movement · Local Business (Mobile owner)'],
  summary: 'Update bisnis (owner only)',
  description:
    'socialLinks kalau dikirim REPLACE entire array. isActive toggle hide/show di browse.',
  security: adminAuth,
  request: { params: z.object({ id: z.string().uuid() }), body: json(updateLocalBusinessSchema) },
  responses: { 200: { description: 'Updated', ...json(successOf(z.any())) } },
});
registry.registerPath({
  method: 'delete',
  path: '/admin/me/businesses/{id}',
  tags: ['Movement · Local Business (Mobile owner)'],
  summary: 'Hapus bisnis (owner only, cleanup files)',
  security: adminAuth,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 204: { description: 'Deleted' } },
});
registry.registerPath({
  method: 'post',
  path: '/admin/me/businesses/{id}/hero',
  tags: ['Movement · Local Business (Mobile owner)'],
  summary: 'Upload hero banner (image, multipart, max 5 MB)',
  security: adminAuth,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: {
        'multipart/form-data': { schema: z.object({ foto: z.any() }) },
      },
    },
  },
  responses: { 200: { description: 'Uploaded', ...json(successOf(z.any())) } },
});
registry.registerPath({
  method: 'delete',
  path: '/admin/me/businesses/{id}/hero',
  tags: ['Movement · Local Business (Mobile owner)'],
  summary: 'Clear hero banner',
  security: adminAuth,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 204: { description: 'Cleared' } },
});
registry.registerPath({
  method: 'post',
  path: '/admin/me/businesses/{id}/logo',
  tags: ['Movement · Local Business (Mobile owner)'],
  summary: 'Upload logo (auto-crop square 512x512, max 5 MB)',
  security: adminAuth,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: {
        'multipart/form-data': { schema: z.object({ foto: z.any() }) },
      },
    },
  },
  responses: { 200: { description: 'Uploaded', ...json(successOf(z.any())) } },
});
registry.registerPath({
  method: 'delete',
  path: '/admin/me/businesses/{id}/logo',
  tags: ['Movement · Local Business (Mobile owner)'],
  summary: 'Clear logo',
  security: adminAuth,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 204: { description: 'Cleared' } },
});
registry.registerPath({
  method: 'post',
  path: '/admin/me/businesses/{id}/profile-pdf',
  tags: ['Movement · Local Business (Mobile owner)'],
  summary: 'Upload company profile PDF (max 5 MB, passthrough)',
  security: adminAuth,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: {
        'multipart/form-data': { schema: z.object({ file: z.any() }) },
      },
    },
  },
  responses: { 200: { description: 'Uploaded', ...json(successOf(z.any())) } },
});
registry.registerPath({
  method: 'delete',
  path: '/admin/me/businesses/{id}/profile-pdf',
  tags: ['Movement · Local Business (Mobile owner)'],
  summary: 'Clear company profile PDF',
  security: adminAuth,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 204: { description: 'Cleared' } },
});

// --- Browse Local Market (mobile public list)
registry.registerPath({
  method: 'get',
  path: '/admin/me/local-market',
  tags: ['Movement · Local Market (Mobile browse)'],
  summary: 'Browse bisnis jemaat (filter cabang/industri/tipe/online/search)',
  description: 'Hanya tampilkan bisnis isActive=true + owner.isActive=true.',
  security: adminAuth,
  responses: { 200: { description: 'OK', ...json(paginatedOf(z.any())) } },
});
registry.registerPath({
  method: 'get',
  path: '/admin/me/local-market/{id}',
  tags: ['Movement · Local Market (Mobile browse)'],
  summary: 'Detail bisnis public',
  description: 'Hidden kalau isActive=false atau owner inactive (kecuali caller = owner).',
  security: adminAuth,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: {
    200: { description: 'OK', ...json(successOf(z.any())) },
    404: { description: 'Tidak ditemukan / hidden', ...json(errorEnvelopeSchema) },
  },
});

// --- Admin portal local-business (read + delete moderation)
registry.registerPath({
  method: 'get',
  path: '/admin/local-business',
  tags: ['Movement · Local Business (Admin)'],
  summary: 'List bisnis dengan filter cabang/owner/industri/tipe/aktif/search',
  security: adminAuth,
  responses: { 200: { description: 'OK', ...json(paginatedOf(z.any())) } },
});
registry.registerPath({
  method: 'get',
  path: '/admin/local-business/{id}',
  tags: ['Movement · Local Business (Admin)'],
  summary: 'Detail bisnis (admin)',
  security: adminAuth,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: { description: 'OK', ...json(successOf(z.any())) } },
});
registry.registerPath({
  method: 'delete',
  path: '/admin/local-business/{id}',
  tags: ['Movement · Local Business (Admin)'],
  summary: 'Hapus bisnis (moderasi + cleanup files)',
  security: adminAuth,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 204: { description: 'Deleted' } },
});

// ================================================================
// Self-deactivate (delete account) — store compliance
// ================================================================
registry.registerPath({
  method: 'delete',
  path: '/admin/me',
  tags: ['Mobile · Self Service'],
  summary: 'Self-deactivate (soft delete + revoke all sessions)',
  description:
    'Body harus confirmText="HAPUS AKUN SAYA" (literal). Set Jemaat.isActive=false + deactivatedAt + revoke semua RefreshToken. Reactivation hanya via admin portal.',
  security: adminAuth,
  request: { body: json(deleteMyAccountSchema) },
  responses: {
    200: { description: 'Deactivated', ...json(successOf(z.any())) },
    400: { description: 'confirmText tidak match', ...json(errorEnvelopeSchema) },
    409: { description: 'Akun sudah dinonaktifkan sebelumnya', ...json(errorEnvelopeSchema) },
  },
});

// ================================================================
// Legal Documents (admin CRUD + public read)
// ================================================================
registry.registerPath({
  method: 'get',
  path: '/public/legal/{key}',
  tags: ['Public (no auth) · Legal'],
  summary: 'Get legal doc (Terms / Privacy) untuk mobile pre-login screen',
  description:
    'No auth. Lang fallback ke `id` kalau lang yang di-minta tidak ada. :key = TERMS | PRIVACY.',
  request: {
    params: z.object({ key: z.enum(['TERMS', 'PRIVACY']) }),
    query: z.object({ lang: z.enum(['id', 'en']).optional() }),
  },
  responses: {
    200: { description: 'OK', ...json(successOf(z.any())) },
    404: { description: 'Dokumen tidak ada', ...json(errorEnvelopeSchema) },
  },
});
registry.registerPath({
  method: 'get',
  path: '/admin/legal',
  tags: ['App Settings · Legal'],
  summary: 'List semua legal docs (semua key × lang)',
  security: adminAuth,
  responses: { 200: { description: 'OK', ...json(successOf(z.any())) } },
});
registry.registerPath({
  method: 'get',
  path: '/admin/legal/{key}/{lang}',
  tags: ['App Settings · Legal'],
  summary: 'Detail legal doc',
  security: adminAuth,
  request: {
    params: z.object({
      key: z.enum(['TERMS', 'PRIVACY']),
      lang: z.enum(['id', 'en']),
    }),
  },
  responses: { 200: { description: 'OK', ...json(successOf(z.any())) } },
});
registry.registerPath({
  method: 'put',
  path: '/admin/legal/{key}/{lang}',
  tags: ['App Settings · Legal'],
  summary: 'Upsert legal doc (title + content + version + isPublished)',
  security: adminAuth,
  request: {
    params: z.object({
      key: z.enum(['TERMS', 'PRIVACY']),
      lang: z.enum(['id', 'en']),
    }),
    body: json(upsertLegalDocumentSchema),
  },
  responses: { 200: { description: 'Saved', ...json(successOf(z.any())) } },
});
registry.registerPath({
  method: 'delete',
  path: '/admin/legal/{key}/{lang}',
  tags: ['App Settings · Legal'],
  summary: 'Delete translasi (id tidak boleh dihapus, fallback default)',
  security: adminAuth,
  request: {
    params: z.object({
      key: z.enum(['TERMS', 'PRIVACY']),
      lang: z.enum(['id', 'en']),
    }),
  },
  responses: {
    204: { description: 'Deleted' },
    400: { description: 'Tidak boleh hapus id', ...json(errorEnvelopeSchema) },
  },
});

// ================================================================
// App Version (admin CRUD + public check)
// ================================================================
registry.registerPath({
  method: 'get',
  path: '/public/app-version',
  tags: ['Public (no auth) · App Version'],
  summary: 'Check update aplikasi (pre-login splash + manual)',
  description:
    'Query: platform=ios|android (required) + currentVersion=1.0.0 (optional, semver). Server compute updateAvailable + forceUpdate via semver compare. Kalau belum ada published row, return null fields.',
  request: {
    query: z.object({
      platform: z.enum(['ios', 'android']),
      currentVersion: z.string().optional(),
    }),
  },
  responses: { 200: { description: 'OK', ...json(successOf(z.any())) } },
});
registry.registerPath({
  method: 'get',
  path: '/admin/app-version',
  tags: ['App Settings · App Version'],
  summary: 'List semua versi (semua platform, history + published)',
  security: adminAuth,
  responses: { 200: { description: 'OK', ...json(successOf(z.any())) } },
});
registry.registerPath({
  method: 'get',
  path: '/admin/app-version/{id}',
  tags: ['App Settings · App Version'],
  summary: 'Detail version row',
  security: adminAuth,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: { description: 'OK', ...json(successOf(z.any())) } },
});
registry.registerPath({
  method: 'post',
  path: '/admin/app-version',
  tags: ['App Settings · App Version'],
  summary: 'Create version baru (auto-unpublish row lama kalau isPublished=true)',
  security: adminAuth,
  request: { body: json(upsertAppVersionSchema) },
  responses: { 201: { description: 'Created', ...json(successOf(z.any())) } },
});
registry.registerPath({
  method: 'patch',
  path: '/admin/app-version/{id}',
  tags: ['App Settings · App Version'],
  summary: 'Update version row (partial)',
  security: adminAuth,
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: json(upsertAppVersionSchema.partial()),
  },
  responses: { 200: { description: 'Updated', ...json(successOf(z.any())) } },
});
registry.registerPath({
  method: 'delete',
  path: '/admin/app-version/{id}',
  tags: ['App Settings · App Version'],
  summary: 'Hapus version row (hard delete)',
  security: adminAuth,
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 204: { description: 'Deleted' } },
});

// ================================================================
// Maintenance (manual trigger jobs)
// ================================================================
registry.registerPath({
  method: 'get',
  path: '/admin/maintenance/refresh-token-stats',
  tags: ['Maintenance'],
  summary: 'Diagnostic count refresh tokens (total/expired/revoked/active)',
  security: adminAuth,
  responses: { 200: { description: 'OK', ...json(successOf(z.any())) } },
});
registry.registerPath({
  method: 'post',
  path: '/admin/maintenance/refresh-token-cleanup',
  tags: ['Maintenance'],
  summary: 'Manual trigger cleanup expired refresh tokens',
  description:
    'Otomatis juga jalan via scheduled-jobs (interval 6 jam). Endpoint ini untuk manual trigger oleh admin.',
  security: adminAuth,
  responses: { 200: { description: 'Cleanup result', ...json(successOf(z.any())) } },
});

// ---------- Health ----------
registry.registerPath({
  method: 'get',
  path: '/health',
  tags: ['Meta'],
  summary: 'Health check',
  responses: {
    200: {
      description: 'OK',
      ...json(z.object({ status: z.string(), service: z.string(), timestamp: z.string() })),
    },
  },
});

// ---------- Generate document ----------
const generator = new OpenApiGeneratorV3(registry.definitions);
export const openApiSpec = generator.generateDocument({
  openapi: '3.0.3',
  info: {
    title: 'ECC Core API',
    version: '0.2.0',
    description:
      'Core API untuk ECC Master Data Platform. Dua tier endpoint: /admin (untuk portal, butuh JWT Fulltimer) dan /api/v1 (konsumer eksternal, butuh API key). Spec ini di-generate otomatis dari Zod schemas.',
  },
  servers: [
    { url: 'http://localhost:4000', description: 'Local' },
    { url: 'https://core-api.eccchurch.global', description: 'Production' },
  ],
});
