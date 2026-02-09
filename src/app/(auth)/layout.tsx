// src/app/(auth)/layout.tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh w-full overflow-x-hidden bg-background text-foreground">
      {children}
    </div>
  );
}
