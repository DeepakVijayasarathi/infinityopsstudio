export type ErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PAYMENT_REQUIRED"
  | "TWO_FACTOR_REQUIRED"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PAYMENT_REQUIRED: 402,
  TWO_FACTOR_REQUIRED: 401,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    this.status = STATUS[code];
  }
}

export const badRequest = (msg: string, details?: unknown) => new AppError("BAD_REQUEST", msg, details);
export const unauthenticated = (msg = "Authentication required") => new AppError("UNAUTHENTICATED", msg);
export const forbidden = (msg = "You do not have permission to perform this action") => new AppError("FORBIDDEN", msg);
export const notFound = (entity = "Resource") => new AppError("NOT_FOUND", `${entity} not found`);
export const conflict = (msg: string) => new AppError("CONFLICT", msg);
export const paymentRequired = (msg: string) => new AppError("PAYMENT_REQUIRED", msg);
