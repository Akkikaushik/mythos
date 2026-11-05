export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (m: string) => new AppError(400, m);
export const unauthorized = (m = 'Not signed in') => new AppError(401, m);
export const forbidden = (m: string) => new AppError(403, m);
export const notFound = (m: string) => new AppError(404, m);
export const conflict = (m: string) => new AppError(409, m);
export const tooMany = (m = 'Too many requests, slow down') => new AppError(429, m);
