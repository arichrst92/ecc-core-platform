/** Custom error classes untuk konsistensi error response. */

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const BadRequest = (message: string, details?: unknown) =>
  new ApiError(400, 'BAD_REQUEST', message, details);

export const Unauthorized = (message = 'Tidak terautentikasi') =>
  new ApiError(401, 'UNAUTHORIZED', message);

export const Forbidden = (message = 'Tidak diizinkan') =>
  new ApiError(403, 'FORBIDDEN', message);

export const NotFound = (message = 'Resource tidak ditemukan') =>
  new ApiError(404, 'NOT_FOUND', message);

export const Conflict = (message: string, details?: unknown) =>
  new ApiError(409, 'CONFLICT', message, details);

export const TooManyRequests = (message = 'Terlalu banyak permintaan') =>
  new ApiError(429, 'TOO_MANY_REQUESTS', message);

export const InternalError = (message = 'Terjadi kesalahan internal') =>
  new ApiError(500, 'INTERNAL_ERROR', message);
