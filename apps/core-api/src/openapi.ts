/**
 * Minimal OpenAPI 3.0 spec — di-serve di /docs via Swagger UI.
 * Spec ini sebagai starting point; nanti bisa di-generate otomatis dari Zod
 * schemas pakai zod-to-openapi.
 */
export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'ECC Core API',
    version: '0.1.0',
    description:
      'Core API untuk ECC Church Master Data Platform. Dua tier endpoint: /admin (untuk portal, butuh JWT Fulltimer) dan /api/v1 (untuk konsumer eksternal, butuh API key).',
  },
  servers: [
    { url: 'http://localhost:4000', description: 'Local' },
    { url: 'https://core-api.eccchurch.global', description: 'Production' },
  ],
  components: {
    securitySchemes: {
      BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
    },
  },
  paths: {
    '/health': {
      get: {
        summary: 'Health check',
        responses: { '200': { description: 'OK' } },
      },
    },
    '/auth/otp/request': {
      post: {
        summary: 'Request OTP via WhatsApp',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['noHp'],
                properties: {
                  noHp: { type: 'string', example: '+628123456789' },
                  purpose: { type: 'string', enum: ['LOGIN', 'ENROLLMENT', 'RESET_FACE'] },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'OTP sent' } },
      },
    },
    '/auth/otp/verify': {
      post: {
        summary: 'Verify OTP, returns JWT',
        responses: { '200': { description: 'Auth response' } },
      },
    },
    '/auth/face/login': {
      post: {
        summary: 'Login shortcut via face descriptor',
        responses: { '200': { description: 'Auth response' } },
      },
    },
    '/admin/sinode': {
      get: { summary: 'List sinode', security: [{ BearerAuth: [] }], responses: { '200': { description: 'List' } } },
      post: { summary: 'Create sinode', security: [{ BearerAuth: [] }], responses: { '201': { description: 'Created' } } },
    },
    '/admin/cabang': {
      get: { summary: 'List cabang gereja', security: [{ BearerAuth: [] }], responses: { '200': { description: 'List' } } },
    },
    '/admin/jemaat': {
      get: { summary: 'List jemaat', security: [{ BearerAuth: [] }], responses: { '200': { description: 'List' } } },
    },
    '/admin/role': {
      get: { summary: 'List role hierarchy', security: [{ BearerAuth: [] }], responses: { '200': { description: 'Tree' } } },
    },
    '/admin/ibadah': {
      get: { summary: 'List ibadah', security: [{ BearerAuth: [] }], responses: { '200': { description: 'List' } } },
    },
    '/api/v1/cabang': {
      get: { summary: 'Public: list cabang per sinode', security: [{ ApiKeyAuth: [] }], responses: { '200': { description: 'List' } } },
    },
    '/api/v1/ibadah': {
      get: { summary: 'Public: list ibadah aktif', security: [{ ApiKeyAuth: [] }], responses: { '200': { description: 'List' } } },
    },
  },
};
