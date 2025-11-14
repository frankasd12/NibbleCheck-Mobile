import Constants from "expo-constants";

type ExpoConfig = {
  extra?: {
    apiBase?: string;
  };
};

// Update to use Render URL
const defaultApiBase = "https://nibblecheck-backend.onrender.com";
const expoConfig = (Constants.expoConfig || {}) as ExpoConfig;

export const API_BASE: string = expoConfig.extra?.apiBase ?? defaultApiBase;

// Log the API base URL for debugging
console.log('API Base URL:', API_BASE);
