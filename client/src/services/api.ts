const API_BASE_URL = '/api';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('token');
  
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(response.status, data.error || 'An error occurred');
  }

  return data;
}

export const authApi = {
  login: (email: string, password: string) =>
    request<{ message: string; token: string; user: any }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  
  logout: () =>
    request<{ message: string }>('/api/auth/logout', {
      method: 'POST',
    }),
  
  getCurrentUser: () =>
    request<{ user: any }>('/api/auth/me'),
};

export const api = {
  // Health check
  health: () => request<{ status: string; timestamp: string }>('/api/health'),
  
  // Auth
  auth: authApi,
};

export { ApiError };
export default api;