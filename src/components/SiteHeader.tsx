import { Link } from "@tanstack/react-router";
import { ShoppingBag, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { CartDrawer } from "@/components/CartDrawer";
import { WishlistDrawer } from "@/components/WishlistDrawer";
import { ShoppingAssistant } from "./ShoppingAssistant";
import { UserMenu } from "@/components/UserMenu";
import { useAuth } from "@/hooks/use-auth";
import { trackSearch } from "@/lib/session-analytics";

export function SiteHeader({ initialSearch = "" }: { initialSearch?: string }) {
  const navigate = useNavigate();
  const [q, setQ] = useState(initialSearch);
  const { user } = useAuth();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    trackSearch(q, { userId: user?.id, metadata: { source: "header" } });
    navigate({
      to: "/",
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        search: q || undefined,
        page: 1,
      }),
    });
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3 md:px-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[image:var(--gradient-hero)] text-primary-foreground shadow-[var(--shadow-card)]">
            <ShoppingBag className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold tracking-tight text-foreground">
            EchoCart
          </span>
        </Link>
        <form onSubmit={onSubmit} className="relative ml-auto w-full max-w-xl">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products, brands, categories…"
            className="h-10 pl-9"
          />
        </form>
        <div className="flex items-center gap-2">
          <ShoppingAssistant />
          <WishlistDrawer />
          <CartDrawer />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
