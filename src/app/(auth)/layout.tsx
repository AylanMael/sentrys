// src/app/(auth)/layout.tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh w-full overflow-x-hidden bg-background text-foreground flex items-center justify-center p-4 md:p-12 lg:p-20">

      {/* Background Decor (Gradients Premium) */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(var(--primary-rgb),0.08),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_70%,rgba(var(--primary-rgb),0.04),transparent_50%)]" />
      </div>

      {/* CONTAINER DYNAMIQUE :
          - w-full : occupe toute la largeur sur mobile
          - max-w-[450px] : pour le login (par défaut)
          - lg:max-w-[850px] : s'élargit massivement sur grand écran pour l'inscription en 2 colonnes
          - transition-all : pour une sensation de fluidité si on change de page
      */}
      <main className="w-full max-w-[500px] lg:max-w-[1200px] transition-all duration-500 animate-in fade-in slide-in-from-bottom-4">
        <div className="w-full">
          {children}
        </div>
      </main>

      {/* Footer Branding */}
      <div className="absolute bottom-8 left-0 right-0 text-center pointer-events-none hidden lg:block">
        <p className="text-[10px] font-black uppercase tracking-[0.5em] text-muted-foreground/20">
          Sentrys Advanced Security Operations Center
        </p>
      </div>
    </div>
  );
}
