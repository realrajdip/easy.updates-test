const getApiUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  if (typeof window !== 'undefined' && window.location) {
    return `http://${window.location.hostname}:5000`;
  }
  return 'http://localhost:5000';
};

export const API_URL = getApiUrl();
export const SOCKET_URL = API_URL;
