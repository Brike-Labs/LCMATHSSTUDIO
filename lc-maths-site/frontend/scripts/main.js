// Basic shared JS bootstrapping for LC Maths Studio frontend
async function apiFetch(path, options = {}) {
  const resp = await fetch(`/api${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!resp.ok) {
    let message = `Request failed (${resp.status})`;
    try {
      const data = await resp.json();
      if (data && data.error) message = data.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  if (resp.status === 204) return null;
  return resp.json();
}

// Expose helper globally for simple inline scripts
window.apiFetch = apiFetch;


