import Constants from "expo-constants";

type ExpoConfig = {
  extra?: {
    apiBase?: string;
  };
};

// Use your actual local network IP address
const LOCAL_IP = "10.126.21.202"; // Update this with your computer's IP
const PORT = "8000";

const defaultApiBase = `http://${LOCAL_IP}:${PORT}`;
const expoConfig = (Constants.expoConfig || {}) as ExpoConfig;

export const API_BASE: string = expoConfig.extra?.apiBase ?? defaultApiBase;

// Log the API base URL for debugging
console.log('API Base URL:', API_BASE);
