import axios from 'axios';
import Constants from 'expo-constants';

// Get backend URL from environment with proper fallback
const getBackendUrl = (): string => {
  // Try Expo Constants first
  const expoConfig = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL;
  if (expoConfig) return expoConfig;
  
  // Then try process.env
  const envUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (envUrl) return envUrl;
  
  // Fallback for development
  return '';
};

const BACKEND_URL = getBackendUrl();

const api = axios.create({
  baseURL: BACKEND_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export default api;
