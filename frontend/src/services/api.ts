import axios from 'axios';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Get backend URL from environment with proper fallback
const getBackendUrl = (): string => {
  // For web platform, use relative URL (empty string) to use same origin
  // This works with the proxy setup where /api/* routes to backend
  if (Platform.OS === 'web') {
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
