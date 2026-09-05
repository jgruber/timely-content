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
  about: () => request('/api/site/about'),

  me: () => request('/api/auth/me'),
  login: (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  changePassword: (currentPassword, newPassword) =>
    request('/api/auth/password', { method: 'POST', body: { currentPassword, newPassword } }),
  changeEmail: (password, email) =>
    request('/api/auth/email', { method: 'POST', body: { password, email } }),
  saveProfile: (displayName) => request('/api/auth/profile', { method: 'PUT', body: { displayName } }),
  savePrefs: (prefs) => request('/api/auth/prefs', { method: 'PUT', body: prefs }),

  forgotPassword: (email) => request('/api/auth/forgot', { method: 'POST', body: { email } }),
  checkResetToken: (token) => request(`/api/auth/reset/${encodeURIComponent(token)}`),
  resetPassword: (token, password) =>
    request('/api/auth/reset', { method: 'POST', body: { token, password } }),
  checkVerifyToken: (token) => request(`/api/auth/verify/${encodeURIComponent(token)}`),
  confirmEmail: (token) => request('/api/auth/verify', { method: 'POST', body: { token } }),
  resendVerification: (email) =>
    request('/api/auth/resend-verification', { method: 'POST', body: { email } }),

  listContent: () => request('/api/content'),
  getContent: (id) => request(`/api/content/${id}`),
  createMarkdown: (payload) => request('/api/content', { method: 'POST', body: payload }),
  uploadFiles: (form, onProgress) => upload('/api/content/upload', form, onProgress),
  updateContent: (id, payload) => request(`/api/content/${id}`, { method: 'PUT', body: payload }),
  rotateToken: (id, payload) => request(`/api/content/${id}/rotate`, { method: 'POST', body: payload }),
  deleteContent: (id) => request(`/api/content/${id}`, { method: 'DELETE' }),

  claim: (token) => request(`/api/public/${encodeURIComponent(token)}`),

  listUsers: () => request('/api/admin/users'),
  createUser: (payload) => request('/api/admin/users', { method: 'POST', body: payload }),
  setUserPassword: (id, password) =>
    request(`/api/admin/users/${encodeURIComponent(id)}/password`, { method: 'POST', body: { password } }),
  setUserEmail: (id, email) =>
    request(`/api/admin/users/${encodeURIComponent(id)}/email`, { method: 'POST', body: { email } }),
  patchUser: (id, payload) =>
    request(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: payload }),
  deleteUser: (id) => request(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  resendUserVerification: (id) =>
    request(`/api/admin/users/${encodeURIComponent(id)}/resend-verification`, { method: 'POST' }),
  markUserVerified: (id) =>
    request(`/api/admin/users/${encodeURIComponent(id)}/verify`, { method: 'POST' }),

  listAllContent: () => request('/api/admin/content'),
  getAnyContent: (id) => request(`/api/admin/content/${encodeURIComponent(id)}`),
  deleteAnyContent: (id) =>
    request(`/api/admin/content/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  getSettings: () => request('/api/admin/settings'),
  saveSettings: (payload) => request('/api/admin/settings', { method: 'PUT', body: payload }),
  sendTestEmail: (to) => request('/api/admin/settings/test-email', { method: 'POST', body: { to } }),
};

/**
 * Uploads go through XHR rather than fetch: a package of photos can be
 * hundreds of megabytes on a phone connection, and only XHR reports how much
 * of the body has actually gone out.
 */
function upload(path, form, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', path);
    xhr.withCredentials = true;

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    });

    xhr.addEventListener('load', () => {
      let payload = null;
      try { payload = JSON.parse(xhr.responseText); } catch { /* not json */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(payload);
      else reject(new ApiError(payload?.error || `Upload failed (${xhr.status}).`, xhr.status, payload));
    });
    xhr.addEventListener('error', () => reject(new ApiError('The upload could not be completed.', 0)));
    xhr.addEventListener('abort', () => reject(new ApiError('Upload cancelled.', 0)));

    xhr.send(form);
  });
}

export const qrImageUrl = (id, size = 512) => `/api/content/${id}/qr.png?size=${size}`;
export const ownerZipUrl = (id) => `/api/content/${id}/zip`;
export const ownerFileUrl = (id, fileId) => `/api/content/${id}/files/${fileId}`;
export const ownerThumbUrl = (id, fileId) => `/api/content/${id}/files/${fileId}/thumb`;
export const publicFileUrl = (ticket, fileId) => `/api/public/dl/${encodeURIComponent(ticket)}/${fileId}`;
export const publicThumbUrl = (ticket, fileId) => `/api/public/dl/${encodeURIComponent(ticket)}/${fileId}/thumb`;
export const ownerDownloadUrl = (id) => `/api/content/${id}/download`;
/** Admin download of someone else's file. Does not spend a QR access. */
export const adminDownloadUrl = (id) => `/api/admin/content/${id}/download`;
export const publicDownloadUrl = (ticket) => `/api/public/dl/${encodeURIComponent(ticket)}`;
