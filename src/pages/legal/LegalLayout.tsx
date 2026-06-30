import { Link } from "react-router-dom";
import { Dna, ArrowLeft } from "lucide-react";
import { LEGAL } from "@/config/legal";

type Props = {
  title: string;
  updated?: string;
  children: React.ReactNode;
};

const LEGAL_LINKS = [
  { to: "/privacidade", label: "Privacidade" },
  { to: "/termos", label: "Termos" },
  { to: "/cookies", label: "Cookies" },
  { to: "/aviso-legal", label: "Aviso Legal" },
  { to: "/subprocessadores", label: "Subprocessadores" },
  { to: "/dpa", label: "DPA" },
  { to: "/colaboradores", label: "Colaboradores" },
];

export default function LegalLayout({ title, updated, children }: Props) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b">
        <div className="container-app py-4 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 font-display font-semibold">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Dna className="h-4 w-4" />
            </span>
            <span>{LEGAL.marcaComercial}</span>
          </Link>
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Voltar ao início
          </Link>
        </div>
      </header>

      <main className="container-app py-10 flex-1 w-full max-w-3xl mx-auto">
        <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Última atualização: {updated ?? LEGAL.dataAtualizacao}
        </p>
        <div className="prose prose-neutral dark:prose-invert mt-8 max-w-none prose-h2:font-display prose-h2:text-xl prose-h2:mt-8 prose-a:text-primary">
          {children}
        </div>
      </main>

      <footer className="border-t">
        <div className="container-app py-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          {LEGAL_LINKS.map((l) => (
            <Link key={l.to} to={l.to} className="hover:text-foreground">{l.label}</Link>
          ))}
          <span className="ml-auto">© 2026 {LEGAL.marcaComercial}</span>
        </div>
      </footer>
    </div>
  );
}
