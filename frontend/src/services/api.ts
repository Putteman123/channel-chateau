import axios from 'axios';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Get backend URL from environment with proper fallback
const getBackendUrl = (): string => {
  // For web platform in development, the /api/* routes are proxied
  // by the Kubernetes ingress controller when accessed via the preview URL.
  // For local development on localhost:3000, we need to use port 8001 directly.
  if (Platform.OS === 'web') {
    // Check if we're on localhost (development)
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      return 'http://localhost:8001';
    }
    // On preview URL, use relative path (proxy handles it)
    return '';
  }
  
  // For native apps, try to get the URL from environment
  const expoConfig = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL;
  if (expoConfig) return expoConfig;
  
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
