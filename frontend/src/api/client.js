const configuredBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
export const API_BASE_URL = configuredBase.replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiRequest(path, { method = 'GET', token, body, extraHeaders = {} } = {}) {
  const headers = { ...extraHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
  } catch (_error) {
    throw new ApiError('Could not reach the backend. Check that it is running on port 5000.');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && token) {
      window.dispatchEvent(new Event('researchmind:unauthorized'));
    }
    throw new ApiError(data.error || data.message || 'Request failed. Please try again.', response.status);
  }
  return data;
}
