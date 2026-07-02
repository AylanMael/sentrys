import path from "path";
import type { NextConfig } from "next";

function parseFirebaseWebAppConfig() {
  const raw = process.env.FIREBASE_WEBAPP_CONFIG;
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Record<string, string | undefined>;
  } catch {
    return null;
  }
}

const firebaseWebConfig = parseFirebaseWebAppConfig();

const defaultFirebaseWebConfig: Record<string, string> = {
  apiKey: "AIzaSyABPFu91CWi0LkdBXD-1OXgHgheFYLwZFE",
  appId: "1:782055895046:web:474cf111d4b4b759cb9387",
  authDomain: "sentrys.firebaseapp.com",
  messagingSenderId: "782055895046",
  projectId: "sentrys",
  storageBucket: "sentrys.firebasestorage.app",
};

function nonEmpty(value: string | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function publicFirebaseEnv(key: string, firebaseConfigKey: string) {
  return (
    nonEmpty(process.env[key]) ??
    nonEmpty(firebaseWebConfig?.[firebaseConfigKey]) ??
    defaultFirebaseWebConfig[firebaseConfigKey] ??
    ""
  );
}

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  eslint: {
    ignoreDuringBuilds: true,
  },
  env: {
    NEXT_PUBLIC_FIREBASE_API_KEY: publicFirebaseEnv(
      "NEXT_PUBLIC_FIREBASE_API_KEY",
      "apiKey"
    ),
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: publicFirebaseEnv(
      "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
      "authDomain"
    ),
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: publicFirebaseEnv(
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
      "projectId"
    ),
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: publicFirebaseEnv(
      "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
      "storageBucket"
    ),
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: publicFirebaseEnv(
      "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
      "messagingSenderId"
    ),
    NEXT_PUBLIC_FIREBASE_APP_ID: publicFirebaseEnv(
      "NEXT_PUBLIC_FIREBASE_APP_ID",
      "appId"
    ),
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: publicFirebaseEnv(
      "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID",
      "measurementId"
    ),
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "placehold.co",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "picsum.photos",
        port: "",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
