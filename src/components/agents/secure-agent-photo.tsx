"use client";

import { useEffect, useState, type ReactNode } from "react";

import { apiFetchBlob } from "@/lib/api/client-fetch";

export function SecureAgentPhoto({
  src,
  alt,
  className,
  fallback,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  fallback: ReactNode;
}) {
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    if (!src) {
      setResolvedSrc(null);
      return () => undefined;
    }

    if (!src.startsWith("/api/")) {
      setResolvedSrc(src);
      return () => undefined;
    }

    setResolvedSrc(null);
    apiFetchBlob(src)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setResolvedSrc(objectUrl);
      })
      .catch(() => {
        if (active) setResolvedSrc(null);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (!resolvedSrc) return <>{fallback}</>;

  // The source is either an approved external URL or a short-lived local blob URL.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={resolvedSrc} alt={alt} className={className} />;
}