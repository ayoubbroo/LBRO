// API errors carry a stable machine code; the frontend translates the code
// (ar/fr/en). `message` is an English fallback for logs and API clients only.
export class AppError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message || code)
  }
}
export const badRequest = (code = 'bad_request') => new AppError(400, code)
export const unauthorized = (code = 'unauthorized') => new AppError(401, code)
export const forbidden = (code = 'forbidden') => new AppError(403, code)
export const notFound = (code = 'not_found') => new AppError(404, code)
export const conflict = (code = 'conflict') => new AppError(409, code)
