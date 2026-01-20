import { Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Shield className="h-6 w-6 text-primary" />
      <span className="text-xl font-bold tracking-tight text-foreground">
        SENTRYS
      </span>
    </div>
  );
}
