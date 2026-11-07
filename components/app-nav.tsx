"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Globe2, Heart, Menu, Plane, Plus, X } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Explore", color: "#ffda36", font: "font-script text-[22px]" },
  { href: "/trips", label: "Trips", color: "#a5c93a", font: "[font-family:'Segoe_Script','Bradley_Hand','Brush_Script_MT',cursive] text-[20px]" },
  { href: "/map", label: "World map", color: "#bfe3d0", font: "text-[17px] font-medium tracking-[-0.04em]" },
  { href: "/map#wishlist", label: "Wishlist", color: "#f2a6c8", font: "text-[17px] font-medium tracking-[-0.04em]" },
  { href: "/#ask", label: "New trip", color: "#ff7a1a", font: "text-[15px] font-bold uppercase tracking-[0.02em]" },
] as const;

function isActive(pathname: string, href: string) {
  if (href.includes("#")) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || (href === "/trips" && pathname.startsWith("/trip/"));
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" aria-label="Nami, home" className={cn("on-sky font-script text-[34px] leading-none font-bold", className)}>
      nami
    </Link>
  );
}

export function AppNav({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-30 px-4 pt-4 sm:px-7 sm:pt-6">
      <div ref={root} className="relative mx-auto flex h-[50px] max-w-6xl items-center gap-2">
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="main-menu"
          onClick={() => setOpen((o) => !o)}
          className="glass grid size-[50px] shrink-0 place-items-center"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
        <nav
          id="main-menu"
          aria-label="Main"
          inert={!open}
          className={cn("menu absolute top-[62px] left-0 flex flex-col gap-2.5", open && "is-open")}
        >
          {LINKS.map(({ href, label, color, font }, i) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              aria-current={isActive(pathname, href) ? "page" : undefined}
              style={{ ["--i" as string]: i }}
              className="menu-item glass glass-menu flex h-14 w-[220px] items-center gap-3 px-5 aria-[current=page]:border-white"
            >
              <span className="size-2.5 shrink-0 rounded-full ring-1 ring-white/70" style={{ background: color }} />
              <span className={font}>{label}</span>
            </Link>
          ))}
        </nav>
        <Logo className="absolute left-1/2 -translate-x-1/2" />
        <div className="ml-auto flex items-center gap-2">
          {children}
          <ThemeToggle />
        </div>
      </div>
      <nav
        aria-label="Quick links"
        className="glass fixed inset-x-3 bottom-3 z-30 flex items-center justify-around rounded-[28px] px-2 py-2 md:hidden"
      >
        <MobileLink href="/" label="Explore" active={isActive(pathname, "/")} icon={<Compass className="size-5" />} />
        <MobileLink href="/trips" label="Trips" active={isActive(pathname, "/trips")} icon={<Plane className="size-5" />} />
        <Link href="/#ask" aria-label="New trip" className="grid size-12 place-items-center rounded-full bg-[#ff7a1a] text-[#1b1b1b] ring-1 ring-white/60">
          <Plus className="size-6" />
        </Link>
        <MobileLink href="/map" label="Map" active={isActive(pathname, "/map")} icon={<Globe2 className="size-5" />} />
        <MobileLink href="/map#wishlist" label="Wishlist" active={false} icon={<Heart className="size-5" />} />
      </nav>
    </header>
  );
}

function MobileLink({ href, label, active, icon }: { href: string; label: string; active: boolean; icon: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn("grid size-11 place-items-center rounded-full transition-colors", active && "bg-white/30 ring-1 ring-white/70")}
    >
      {icon}
    </Link>
  );
}
