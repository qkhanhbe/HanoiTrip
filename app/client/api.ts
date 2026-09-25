export class ApiError extends Error {
  constructor(
    message: string,
    public requestId?: string,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
      signal: options.signal ?? AbortSignal.timeout(15000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ApiError('Không kết nối được máy chủ. Kiểm tra mạng và thử lại.');
  }
  const body = await response.json();
  if (!response.ok)
    throw new ApiError(
      body.error?.message ?? 'Chưa thể xử lý. Hãy thử lại.',
      body.error?.requestId,
    );
  return body as T;
}
