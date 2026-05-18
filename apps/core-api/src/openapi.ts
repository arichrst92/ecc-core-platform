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
  requestOtpSchema,
  verifyOtpSchema,
  faceLoginSchema,
  faceEnrollmentSchema,
  refreshTokenSchema,
  paginationQuerySchema,
  errorEnvelopeSchema,
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
  tags: ['Auth'],
  summary: 'Login shortcut via face descriptor',
  request: { body: json(faceLoginSchema) },
  responses: {
    200: { description: 'Auth response', ...json(successOf(z.any())) },
    401: { description: 'Wajah tidak cocok', ...json(errorEnvelopeSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/face/enroll',
  tags: ['Auth'],
  summary: 'Enroll face descriptor untuk user yang login',
  security: [{ [bearer.name]: [] }],
  request: { body: json(faceEnrollmentSchema) },
  responses: {
    200: {
      description: 'Enrolled',
      ...json(
        successOf(z.object({ faceEnrolledAt: z.string().datetime(), hasFaceEnrolled: z.boolean() })),
      ),
    },
    400: { description: 'Descriptor invalid', ...json(errorEnvelopeSchema) },
  },
});

registry.registerPath({
  method: 'post',
  path: '/auth/face/reset',
  tags: ['Auth'],
  summary: 'Hapus face descriptor (self-service)',
  security: [{ [bearer.name]: [] }],
  responses: {
    200: { description: 'Reset', ...json(successOf(z.object({ hasFaceEnrolled: z.boolean() }))) },
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
