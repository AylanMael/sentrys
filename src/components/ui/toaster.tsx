"use client"
import { useEffect } from "react"
import { ShieldAlert, ArrowUpRight } from "lucide-react"
import { subscribeSuspensionFeedback } from "@/lib/api/suspension-feedback"

import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

export function Toaster() {
  const { toasts, toast } = useToast()
  useEffect(() => subscribeSuspensionFeedback(({ mode, message }) => {
    toast({
      variant: "suspension",
      title: mode === "commercial" ? "Agence en consultation seule" : "Accès suspendu pour sécurité",
      description: message,
      duration: 9000,
    })
  }), [toast])

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            {props.variant === "suspension" && (
              <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
                <ShieldAlert className="h-5 w-5" />
              </span>
            )}
            <div className="grid min-w-0 gap-1.5">
              {props.variant === "suspension" && <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Sentrys · Protection des accès</span>}
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription className={props.variant === "suspension" ? "text-sm leading-6 text-muted-foreground opacity-100" : undefined}>{description}</ToastDescription>
              )}
              {props.variant === "suspension" && <a href="/contact?reason=support" className="mt-1 inline-flex min-h-9 w-fit items-center gap-1 rounded-md text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Contacter le support <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" /></a>}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
