"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Globe2, Heart, Plane, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Explore", icon: Compass },
  { href: "/trips", label: "Trips", icon: Plane },
  { href: "/map", label: "World map", icon: Globe2 },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`) || (href === "/trips" && pathname.startsWith("/trip/"));
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight", className)}>
      <span className="grid size-8 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground shadow-glow">
        n
      </span>
      nami
    </Link>
  );
}

export function AppNav({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-transparent bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-5 sm:px-8">
          <Logo />
          <nav aria-label="Main" className="ml-6 hidden items-center gap-1 rounded-full bg-card p-1 shadow-soft md:flex">
            {LINKS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                  isActive(pathname, href) && "bg-primary text-primary-foreground hover:text-primary-foreground",
                )}
              >
                <Icon className="size-4" /> {label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">{children}</div>
        </div>
      </header>

      <nav
        aria-label="Main"
        className="fixed inset-x-3 bottom-3 z-30 flex items-center justify-around rounded-[28px] bg-card px-2 py-2 shadow-float md:hidden"
      >
        {[LINKS[0], LINKS[1]].map(({ href, label, icon: Icon }) => (
          <MobileLink key={href} href={href} label={label} active={isActive(pathname, href)} icon={<Icon className="size-5" />} />
        ))}
        <Link
          href="/#ask"
          aria-label="New trip"
          className="-mt-10 grid size-16 place-items-center rounded-full bg-card text-primary shadow-float"
        >
          <span className="grid size-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-glow">
            <Plus className="size-6" />
          </span>
        </Link>
        <MobileLink href="/map" label="Map" active={isActive(pathname, "/map")} icon={<Globe2 className="size-5" />} />
        <MobileLink href="/map#wishlist" label="Wishlist" active={false} icon={<Heart className="size-5" />} />
      </nav>
    </>
  );
}

function MobileLink({ href, label, active, icon }: { href: string; label: string; active: boolean; icon: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "grid size-11 place-items-center rounded-full text-muted-foreground transition-colors",
        active && "bg-primary text-primary-foreground shadow-glow",
      )}
    >
      {icon}
    </Link>
  );
}
