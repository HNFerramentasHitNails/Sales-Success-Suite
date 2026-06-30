import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Search, HelpCircle } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import AppSidebar from "@/components/layout/AppSidebar";
import OrgSwitcher from "@/components/layout/OrgSwitcher";
import UserMenu from "@/components/layout/UserMenu";
import CommandMenu from "@/components/CommandMenu";
import ProductTour from "@/components/ProductTour";
import { getPageTour } from "@/config/tours";

export default function AppLayout() {
  const [cmdOpen, setCmdOpen] = useState(false);
  const { pathname } = useLocation();
  const hasPageTour = !!getPageTour(pathname);
  return (
    <SidebarProvider>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Saltar para o conteúdo
      </a>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-3 border-b px-3 bg-card">
            <span data-tour="sidebar-toggle"><SidebarTrigger /></span>
            <Button
              variant="outline"
              size="sm"
              data-tour="search"
              className="text-muted-foreground gap-2 px-2 md:px-3"
              onClick={() => setCmdOpen(true)}
            >
              <Search className="h-4 w-4" />
              <span className="hidden md:inline">Procurar…</span>
              <kbd className="hidden md:inline pointer-events-none ml-2 rounded border bg-muted px-1.5 text-[10px] font-medium">⌘K</kbd>
            </Button>
            <div className="flex-1" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Ajuda e tours">
                  <HelpCircle className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuItem onClick={() => window.dispatchEvent(new Event("app:start-guided"))}>
                  ✨ Visita guiada completa
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.dispatchEvent(new Event("app:start-tour"))}>
                  Tour da plataforma
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!hasPageTour} onClick={() => window.dispatchEvent(new Event("app:start-page-tour"))}>
                  Tour desta página
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Pré-visualizar tour como…</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuLabel className="text-xs text-muted-foreground">Ver o tour de cada papel</DropdownMenuLabel>
                    {[
                      { r: "admin", l: "Administrador" },
                      { r: "sales_director", l: "Diretor de Vendas" },
                      { r: "sales_rep", l: "Comercial" },
                      { r: "read_only", l: "Consulta" },
                    ].map((o) => (
                      <DropdownMenuItem key={o.r} onClick={() => window.dispatchEvent(new CustomEvent("app:start-tour", { detail: { previewRole: o.r } }))}>
                        {o.l}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
            <span data-tour="org-switcher"><OrgSwitcher /></span>
            <span data-tour="user-menu"><UserMenu /></span>
          </header>
          <main id="main-content" className="flex-1 overflow-auto p-6">
            <Outlet />
          </main>
        </div>
      </div>
      <CommandMenu open={cmdOpen} onOpenChange={setCmdOpen} />
      <ProductTour />
    </SidebarProvider>
  );
}
