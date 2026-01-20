import Link from 'next/link';
import { Button } from '@/components/ui/button';
import Logo from '@/components/logo';
import Image from 'next/image';
import { PlaceHolderImages } from '@/lib/placeholder-images';

const heroImage = PlaceHolderImages.find(p => p.id === 'hero-landing');

export default function Home() {
  return (
    <div className="flex flex-col min-h-dvh bg-background">
      <header className="px-4 lg:px-6 h-14 flex items-center shadow-sm">
        <Link href="/" className="flex items-center justify-center" prefetch={false}>
          <Logo />
        </Link>
        <nav className="ml-auto flex items-center gap-4 sm:gap-6">
          <Button variant="ghost" asChild>
            <Link href="/login" prefetch={false}>
              Login
            </Link>
          </Button>
          <Button asChild>
            <Link href="/signup" prefetch={false}>
              Get Started
            </Link>
          </Button>
        </nav>
      </header>
      <main className="flex-1">
        <section className="w-full py-12 md:py-24 lg:py-32">
          <div className="container px-4 md:px-6">
            <div className="grid gap-6 lg:grid-cols-2 lg:gap-12 xl:grid-cols-[1fr_550px]">
              <div className="flex flex-col justify-center space-y-4">
                <div className="space-y-4">
                  <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl xl:text-6xl/none font-headline text-primary">
                    Modern Security Operations, Simplified
                  </h1>
                  <p className="max-w-[600px] text-muted-foreground md:text-xl">
                    SENTRYS provides an all-in-one platform for private security companies to manage agents, schedule missions, and report incidents with efficiency and precision.
                  </p>
                </div>
                <div className="flex flex-col gap-2 min-[400px]:flex-row">
                  <Button asChild size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90">
                    <Link href="/signup" prefetch={false}>
                      Request a Demo
                    </Link>
                  </Button>
                </div>
              </div>
              {heroImage && (
                 <Image
                  src={heroImage.imageUrl}
                  width="550"
                  height="550"
                  alt="Hero"
                  data-ai-hint={heroImage.imageHint}
                  className="mx-auto aspect-video overflow-hidden rounded-xl object-cover sm:w-full lg:order-last lg:aspect-square"
                />
              )}
            </div>
          </div>
        </section>
      </main>
      <footer className="flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t">
        <p className="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} SENTRYS. All rights reserved.
        </p>
        <nav className="sm:ml-auto flex gap-4 sm:gap-6">
          <Link href="#" className="text-xs hover:underline underline-offset-4" prefetch={false}>
            Terms of Service
          </Link>
          <Link href="#" className="text-xs hover:underline underline-offset-4" prefetch={false}>
            Privacy
          </Link>
        </nav>
      </footer>
    </div>
  );
}
