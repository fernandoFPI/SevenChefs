const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

async function request(method, path, body) {
  const options = {
    method,
    credentials: 'include',
    headers: {},
  };

  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const res = await fetch(`${BASE_URL}/api${path}`, options);
  const data = await res.json();

  if (!res.ok) {
    const err = new Error(data.message || 'Request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

// Multipart form upload — does NOT set Content-Type so browser adds the boundary.
async function requestForm(method, path, formData) {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    method,
    credentials: 'include',
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.message || 'Request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  get:      (path)             => request('GET',    path),
  post:     (path, body)       => request('POST',   path, body),
  put:      (path, body)       => request('PUT',    path, body),
  delete:   (path, body)        => request('DELETE', path, body),
  postForm: (path, formData)   => requestForm('POST', path, formData),
};
