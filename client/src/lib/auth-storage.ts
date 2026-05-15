const TOKEN_KEY = 'evaya-auth-token';

let memoryToken: string | null = null;

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function getAuthToken() {
  const storage = getStorage();
  if (!storage) {
    return memoryToken;
  }

  return storage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string) {
  const storage = getStorage();
  if (!storage) {
    memoryToken = token;
    return;
  }

  storage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken() {
  const storage = getStorage();
  if (!storage) {
    memoryToken = null;
    return;
  }

  storage.removeItem(TOKEN_KEY);
}
