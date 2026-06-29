"use client";

import * as React from "react";

import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/client-fetch";
import { cn } from "@/lib/utils";

type FeedbackOptions = {
  title?: string;
  description?: React.ReactNode;
};

type ErrorFeedbackOptions = {
  title?: string;
  fallback?: string;
};

type FeedbackToastInput = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: "default" | "destructive";
};

const toneClassNames = {
  success:
    "border-emerald-500/25 bg-emerald-50 text-emerald-950 shadow-emerald-950/5 dark:bg-emerald-950 dark:text-emerald-50",
  info:
    "border-sky-500/25 bg-sky-50 text-sky-950 shadow-sky-950/5 dark:bg-sky-950 dark:text-sky-50",
  warning:
    "border-amber-500/30 bg-amber-50 text-amber-950 shadow-amber-950/5 dark:bg-amber-950 dark:text-amber-50",
};

export function useAppFeedback() {
  const { toast, dismiss } = useToast();

  const success = React.useCallback((title: string, description?: React.ReactNode) => {
    return toast({
      title,
      description,
      className: toneClassNames.success,
    });
  }, [toast]);

  const info = React.useCallback((title: string, description?: React.ReactNode) => {
    return toast({
      title,
      description,
      className: toneClassNames.info,
    });
  }, [toast]);

  const warning = React.useCallback((title: string, description?: React.ReactNode) => {
    return toast({
      title,
      description,
      className: toneClassNames.warning,
    });
  }, [toast]);

  const error = React.useCallback((error: unknown, options: ErrorFeedbackOptions = {}) => {
    return toast({
      title: options.title ?? "Action impossible",
      description: getApiErrorMessage(error, options.fallback),
      variant: "destructive",
    });
  }, [toast]);

  const custom = React.useCallback((options: FeedbackOptions & { tone?: keyof typeof toneClassNames }) => {
    return toast({
      title: options.title,
      description: options.description,
      className: options.tone ? cn(toneClassNames[options.tone]) : undefined,
    });
  }, [toast]);

  return React.useMemo(
    () => ({
      success,
      info,
      warning,
      error,
      custom,
      dismiss,
    }),
    [custom, error, info, success, warning]
  );
}

function nodeToText(value: React.ReactNode) {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  return "";
}

function inferTone(title: string, description: string) {
  const value = `${title} ${description}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (
    value.includes("aucune") ||
    value.includes("ignore") ||
    value.includes("abandon") ||
    value.includes("attention")
  ) {
    return "warning" as const;
  }

  if (
    value.includes("cree") ||
    value.includes("ajoute") ||
    value.includes("termine") ||
    value.includes("effectue") ||
    value.includes("duplique") ||
    value.includes("publie") ||
    value.includes("supprime") ||
    value.includes("sauvegarde") ||
    value.includes("enregistre") ||
    value.includes("reconduit") ||
    value.includes("reproduit") ||
    value.includes("mis a jour")
  ) {
    return "success" as const;
  }

  return "info" as const;
}

export function useFeedbackToast() {
  const feedback = useAppFeedback();

  return React.useCallback(
    (options: FeedbackToastInput) => {
      const title = nodeToText(options.title) || "Information";
      const descriptionText = nodeToText(options.description);

      if (options.variant === "destructive") {
        return feedback.error(descriptionText || title, {
          title,
        });
      }

      const tone = inferTone(title, descriptionText);
      if (tone === "success") return feedback.success(title, options.description);
      if (tone === "warning") return feedback.warning(title, options.description);
      return feedback.info(title, options.description);
    },
    [feedback]
  );
}
