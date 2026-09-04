/** Thin fetch wrapper. Cookies carry the session, so every call is same-origin. */
async function request(path, { method = 'GET', body, form } = {}) {
  const init = { method, credentials: 'same-origin', headers: {} };

  if (form) {
    init.body = form;
  } else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError('Could not reach the server. Check your connection.', 0);
  }

  if (res.status === 204) return null;

  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const payload = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    throw new ApiError(payload?.error || `Request failed (${res.status}).`, res.status, payload);
  }
  return payload;
}

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

export const api = {
  site: () => request('/api/site'),
  setup: (payload) => request('/api/site/setup', { method: 'POST', body: payload }),

  me: () => request('/api/auth/me'),
  login: (username, password) => request('/api/auth/login', { method: 'POST', body: { username, password } }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  changePassword: (currentPassword, newPassword) =>
    request('/api/auth/password', { method: 'POST', body: { currentPassword, newPassword } }),
  savePrefs: (prefs) => request('/api/auth/prefs', { method: 'PUT', body: prefs }),

  listContent: () => request('/api/content'),
  getContent: (id) => request(`/api/content/${id}`),
  createMarkdown: (payload) => request('/api/content', { method: 'POST', body: payload }),
  uploadFile: (form) => request('/api/content/upload', { method: 'POST', form }),
  updateContent: (id, payload) => request(`/api/content/${id}`, { method: 'PUT', body: payload }),
  rotateToken: (id, payload) => request(`/api/content/${id}/rotate`, { method: 'POST', body: payload }),
  deleteContent: (id) => request(`/api/content/${id}`, { method: 'DELETE' }),

  claim: (token) => request(`/api/public/${encodeURIComponent(token)}`),

  listUsers: () => request('/api/admin/users'),
  createUser: (payload) => request('/api/admin/users', { method: 'POST', body: payload }),
  setUserPassword: (username, password) =>
    request(`/api/admin/users/${encodeURIComponent(username)}/password`, { method: 'POST', body: { password } }),
  setUserRole: (username, isAdmin) =>
    request(`/api/admin/users/${encodeURIComponent(username)}`, { method: 'PATCH', body: { isAdmin } }),
  deleteUser: (username) =>
    request(`/api/admin/users/${encodeURIComponent(username)}`, { method: 'DELETE' }),

  getSettings: () => request('/api/admin/settings'),
  saveSettings: (payload) => request('/api/admin/settings', { method: 'PUT', body: payload }),
};

export const qrImageUrl = (id, size = 512) => `/api/content/${id}/qr.png?size=${size}`;
export const ownerDownloadUrl = (id) => `/api/content/${id}/download`;
export const publicDownloadUrl = (ticket) => `/api/public/dl/${encodeURIComponent(ticket)}`;
