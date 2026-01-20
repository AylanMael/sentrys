import Logo from "@/components/logo";
import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh w-full items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Link href="/" aria-label="Back to homepage">
            <Logo />
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}
