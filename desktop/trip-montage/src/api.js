/** Trip API client for the desktop montage app (Bearer session JWT via Rust). */

import { invoke } from '@tauri-apps/api/core';

let apiBase = 'https://vlandivir.com';
let token = null;

export function setApiBase(base) {
  apiBase = String(base || '').replace(/\/$/, '') || 'https://vlandivir.com';
}

export function getApiBase() {
  return apiBase;
}

export function setToken(value) {
  token = value || null;
}

export function getToken() {
  return token;
}

async function api(path, options = {}) {
  if (!token) throw new Error('Not signed in');
  const method = (options.method || 'GET').toUpperCase();
  const body =
    options.body == null
      ? null
      : typeof options.body === 'string'
        ? options.body
        : JSON.stringify(options.body);

  /** @type {{ status: number, body: string }} */
  const result = await invoke('api_fetch', {
    method,
    path,
    body,
  });

  if (result.status === 401) {
    throw new Error('Session expired — sign in again');
  }
  if (result.status < 200 || result.status >= 300) {
    let message = `HTTP ${result.status}`;
    if (result.body) {
      try {
        const data = JSON.parse(result.body);
        message = data.message || data.error || message;
        if (Array.isArray(message)) message = message.join(', ');
      } catch {
        message = result.body.slice(0, 200) || message;
      }
    }
    throw new Error(message);
  }
  if (result.status === 204 || !result.body) return null;
  return JSON.parse(result.body);
}

export async function fetchMe() {
  return api('/auth/me');
}

export async function listAdminTrips() {
  return api('/trip-api/admin/trips');
}

export async function getTrip(secret) {
  return api(`/trip-api/trips/${encodeURIComponent(secret)}`);
}

export async function listMedia(secret) {
  return api(`/trip-api/trips/${encodeURIComponent(secret)}/media`);
}

export async function listProjects(secret) {
  return api(`/trip-api/trips/${encodeURIComponent(secret)}/projects`);
}

export async function createProject(secret, name) {
  return api(`/trip-api/trips/${encodeURIComponent(secret)}/projects`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function getProject(secret, projectId) {
  return api(
    `/trip-api/trips/${encodeURIComponent(secret)}/projects/${projectId}`,
  );
}

export async function renameProject(secret, projectId, name) {
  return api(
    `/trip-api/trips/${encodeURIComponent(secret)}/projects/${projectId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    },
  );
}

export async function deleteProject(secret, projectId) {
  return api(
    `/trip-api/trips/${encodeURIComponent(secret)}/projects/${projectId}`,
    { method: 'DELETE' },
  );
}

export async function addClip(secret, projectId, mediaId) {
  return api(
    `/trip-api/trips/${encodeURIComponent(secret)}/projects/${projectId}/clips`,
    {
      method: 'POST',
      body: JSON.stringify({ mediaId }),
    },
  );
}

export async function removeClip(secret, projectId, clipId) {
  return api(
    `/trip-api/trips/${encodeURIComponent(secret)}/projects/${projectId}/clips/${clipId}`,
    { method: 'DELETE' },
  );
}

export async function reorderClips(secret, projectId, clipIds) {
  return api(
    `/trip-api/trips/${encodeURIComponent(secret)}/projects/${projectId}/clips/order`,
    {
      method: 'PUT',
      body: JSON.stringify({ clipIds }),
    },
  );
}

export async function updateClipTrim(
  secret,
  projectId,
  clipId,
  trimStartSec,
  trimEndSec,
) {
  return api(
    `/trip-api/trips/${encodeURIComponent(secret)}/projects/${projectId}/clips/${clipId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ trimStartSec, trimEndSec }),
    },
  );
}
