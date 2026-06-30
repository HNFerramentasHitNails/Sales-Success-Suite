import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  Dna,
  Users,
  ShoppingCart,
  KanbanSquare,
  Wallet,
  Plug,
  BarChart3,
  ShieldCheck,
  Building2,
  ArrowRight,
  Check,
  Sparkles,
  LineChart,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type PublicPlan = {
  key: string;
  name: string;
  description: string | null;
  price_monthly: number | null;
  currency: string | null;
};

const FALLBACK_PLANS: PublicPlan[] = [
  { key: "trial", name: "Trial", description: "Experimente sem compromisso durante 14 dias", price_monthly: 0, currency: "EUR" },
  { key: "starter", name: "Starter", description: "Para equipas pequenas a começar", price_monthly: 29, currency: "EUR" },
  { key: "business", name: "Business", description: "Para PMEs em crescimento", price_monthly: 99, currency: "EUR" },
  { key: "enterprise", name: "Enterprise", description: "Para organizações com requisitos avançados", price_monthly: null, currency: "EUR" },
];

const PLAN_FEATURES: Record<string, string[]> = {
  trial: [
    "Acesso a todas as funcionalidades",
    "Até 3 utilizadores",
    "14 dias grátis, sem cartão",
  ],
  starter: [
    "Clientes, encomendas e pipeline",
    "Até 5 utilizadores",
    "Integrações essenciais",
    "Suporte por email",
  ],
  business: [
    "Tudo do Starter",
    "Comissões automáticas",
    "Utilizadores ilimitados",
    "Conectores avançados e API",
    "Suporte prioritário",
  ],
  enterprise: [
    "Tudo do Business",
    "Onboarding dedicado",
    "SLA e segurança avançada",
    "Personalizações e SSO",
  ],
};

const FEATURES = [
  { icon: Users, title: "CRM de Clientes", desc: "Ficha completa, segmentação por tags e histórico unificado." },
  { icon: ShoppingCart, title: "Encomendas", desc: "Wizard de criação, catálogo de produtos e faturação integrada." },
  { icon: KanbanSquare, title: "Pipeline de Vendas", desc: "Kanban de prospecção com etapas, notas e atividades." },
  { icon: Wallet, title: "Comissões automáticas", desc: "Regras flexíveis por comercial, produto ou cliente." },
  { icon: Plug, title: "Integrações", desc: "Conecte loja online, faturação e pagamentos com a sua conta." },
  { icon: BarChart3, title: "Relatórios e métricas", desc: "KPIs, análise ABC/Pareto e dashboards em tempo real." },
  { icon: ShieldCheck, title: "Papéis e permissões", desc: "Controlo fino por equipa, com RBAC e segregação de dados." },
  { icon: Building2, title: "Multi-empresa / white-label", desc: "Várias organizações com marca, moeda e fiscalidade próprias." },
];

const STEPS = [
  { n: 1, title: "Registe-se", desc: "Crie a sua conta em segundos e ative o trial de 14 dias." },
  { n: 2, title: "Configure a equipa", desc: "Convide comerciais, defina papéis e ligue as suas integrações." },
  { n: 3, title: "Venda e acompanhe", desc: "Acompanhe o pipeline, encomendas e comissões em tempo real." },
];

const FAQS = [
  { q: "É preciso cartão para o trial?", a: "Não. O trial de 14 dias é totalmente gratuito e não pede dados de pagamento." },
  { q: "Posso mudar de plano quando quiser?", a: "Sim. Pode fazer upgrade ou downgrade a qualquer momento dentro da aplicação." },
  { q: "É seguro e multi-empresa?", a: "Sim. A arquitetura é multi-tenant com isolamento por organização, RLS e papéis granulares." },
  { q: "Que integrações suporta?", a: "Suportamos conectores para loja online, faturação e pagamentos — cada organização liga as suas próprias contas." },
  { q: "Como funcionam as comissões?", a: "Cria regras configuráveis por comercial, produto ou cliente; o cálculo mensal é automático." },
  { q: "Posso cancelar a qualquer momento?", a: "Sim. Não há permanência — cancela quando quiser, diretamente na área de plano." },
];

function formatPrice(plan: PublicPlan) {
  if (plan.key === "enterprise") return "Sob consulta";
  if (!plan.price_monthly || plan.price_monthly === 0) return "Grátis";
  return `${Number(plan.price_monthly).toLocaleString("pt-PT", { maximumFractionDigits: 0 })}€`;
}

function planCta(planKey: string) {
  if (planKey === "enterprise") return { label: "Falar com vendas", href: "mailto:vendas@salesdna.app?subject=Plano%20Enterprise" };
  if (planKey === "trial") return { label: "Começar grátis", href: "/auth?mode=signup" };
  return { label: "Começar agora", href: "/auth?mode=signup" };
}

export default function Landing() {
  const { user, loading } = useAuth();
  const [plans, setPlans] = useState<PublicPlan[]>(FALLBACK_PLANS);

  useEffect(() => {
    let mounted = true;
    supabase
      .from("plans")
      .select("key,name,description,price_monthly,currency,sort_order,is_public,is_active")
      .eq("is_public", true)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        if (mounted && data && data.length > 0) {
          setPlans(
            data.map((p: any) => ({
              key: p.key,
              name: p.name,
              description: p.description,
              price_monthly: p.price_monthly,
              currency: p.currency,
            })),
          );
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) return null;

  const primaryCta = user
    ? { label: "Ir para a aplicação", href: "/app" }
    : { label: "Começar grátis", href: "/auth?mode=signup" };
  const secondaryCta = user
    ? { label: "Abrir dashboard", href: "/app/dashboard" }
    : { label: "Entrar", href: "/auth" };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-background/80 border-b border-border">
        <div className="container-app h-16 flex items-center justify-between">
          <a href="#top" className="flex items-center gap-2 font-display font-bold text-lg">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Dna className="h-5 w-5" />
            </span>
            <span>Sales Success Suite</span>
          </a>
          <nav className="hidden md:flex items-center gap-7 text-sm text-muted-foreground">
            <a href="#funcionalidades" className="hover:text-foreground transition-colors">Funcionalidades</a>
            <a href="#precos" className="hover:text-foreground transition-colors">Preços</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <Button asChild>
                <Link to="/app">Ir para a aplicação</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" className="hidden sm:inline-flex">
                  <Link to="/auth">Entrar</Link>
                </Button>
                <Button asChild>
                  <Link to="/auth?mode=signup">Começar grátis</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section id="top" className="relative overflow-hidden">
        <div
          className="absolute inset-0 -z-10 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, hsl(var(--primary)) 0, transparent 40%), radial-gradient(circle at 80% 0%, hsl(var(--accent)) 0, transparent 35%)",
          }}
        />
        <div className="container-app pt-20 pb-16 lg:pt-28 lg:pb-24 grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-7 animate-reveal-up">
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              Novo: comissões automáticas + integrações
            </Badge>
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-extrabold leading-[1.05] tracking-tight">
              O CRM completo para a sua PME{" "}
              <span className="text-gradient-accent">vender mais e melhor</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl">
              Clientes, encomendas, pipeline, comissões e integrações — num só sítio. Pensado para
              equipas comerciais portuguesas que querem crescer com método.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="text-base">
                <Link to={primaryCta.href}>
                  {primaryCta.label}
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="text-base">
                <a href="#precos">Ver preços</a>
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {user ? "Sessão ativa — bem-vindo de volta." : "Trial de 14 dias · sem cartão · cancela quando quiser"}
            </p>
          </div>

          {/* Product mockup */}
          <div className="relative animate-reveal-up">
            <div className="absolute -inset-6 bg-gradient-to-tr from-primary/10 via-accent/10 to-transparent rounded-3xl blur-2xl" />
            <Card className="relative overflow-hidden border-border/60 shadow-[var(--shadow-elegant)]">
              <div className="h-9 flex items-center gap-1.5 px-4 border-b bg-muted/40">
                <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-warning/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-success/80" />
                <span className="ml-3 text-xs text-muted-foreground">app.salesdna.pt / dashboard</span>
              </div>
              <div className="p-5 space-y-4 bg-gradient-to-b from-surface-alt to-background">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground">Visão geral</div>
                    <div className="font-display font-semibold">Dashboard de Vendas</div>
                  </div>
                  <Badge className="bg-success/15 text-success border-success/20 hover:bg-success/15">
                    <TrendingUp className="h-3 w-3 mr-1" /> +18,4%
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { l: "Faturado", v: "€84.2k" },
                    { l: "Pipeline", v: "€132k" },
                    { l: "Encomendas", v: "317" },
                  ].map((k) => (
                    <div key={k.l} className="rounded-lg border bg-card p-3">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{k.l}</div>
                      <div className="font-display text-xl font-bold mt-1">{k.v}</div>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border bg-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-medium">Vendas últimos 30 dias</div>
                    <LineChart className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex items-end gap-1.5 h-24">
                    {[40, 55, 35, 70, 60, 80, 65, 90, 75, 95, 85, 100].map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-t bg-gradient-to-t from-primary to-primary-glow"
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border bg-card p-3">
                    <div className="text-xs text-muted-foreground mb-2">Top comerciais</div>
                    {["Ana M.", "Rui P.", "Sofia L."].map((n, i) => (
                      <div key={n} className="flex items-center justify-between text-sm py-1">
                        <span>{n}</span>
                        <span className="font-medium">€{[18, 14, 11][i]}k</span>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-lg border bg-card p-3">
                    <div className="text-xs text-muted-foreground mb-2">Pipeline</div>
                    {[
                      { l: "Qualificação", w: 80 },
                      { l: "Proposta", w: 55 },
                      { l: "Negociação", w: 35 },
                    ].map((s) => (
                      <div key={s.l} className="py-1">
                        <div className="flex justify-between text-xs"><span>{s.l}</span><span className="text-muted-foreground">{s.w}%</span></div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1">
                          <div className="h-full bg-accent" style={{ width: `${s.w}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <section className="border-y bg-surface-alt">
        <div className="container-app py-6 text-center text-sm md:text-base text-muted-foreground">
          Tudo o que precisa para gerir vendas, num só lugar — desde o primeiro contacto à fatura paga.
        </div>
      </section>

      {/* Features */}
      <section id="funcionalidades" className="container-app py-20 lg:py-28">
        <div className="max-w-2xl mb-14">
          <Badge variant="outline" className="mb-4">Funcionalidades</Badge>
          <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
            Um CRM pensado para equipas que querem resultados
          </h2>
          <p className="mt-3 text-muted-foreground">
            Cobertura completa do ciclo comercial — sem precisar de juntar cinco ferramentas diferentes.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {FEATURES.map((f) => (
            <Card key={f.title} className="p-6 hover:shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5">
              <div className="h-11 w-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-display font-semibold text-lg mb-1">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-surface-alt border-y">
        <div className="container-app py-20 lg:py-24">
          <div className="max-w-2xl mb-12">
            <Badge variant="outline" className="mb-4">Como funciona</Badge>
            <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
              Da inscrição aos resultados em três passos
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {STEPS.map((s) => (
              <Card key={s.n} className="p-7 relative">
                <div className="absolute -top-4 left-7 h-9 w-9 rounded-full bg-accent text-accent-foreground font-display font-bold flex items-center justify-center shadow-md">
                  {s.n}
                </div>
                <h3 className="font-display font-semibold text-xl mt-2 mb-2">{s.title}</h3>
                <p className="text-muted-foreground">{s.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="precos" className="container-app py-20 lg:py-28">
        <div className="max-w-2xl mx-auto text-center mb-14">
          <Badge variant="outline" className="mb-4">Preços</Badge>
          <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
            Planos simples, sem surpresas
          </h2>
          <p className="mt-3 text-muted-foreground">
            Comece com o trial gratuito de 14 dias. Mude de plano quando quiser.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 items-stretch">
          {plans.map((p) => {
            const popular = p.key === "business";
            const cta = planCta(p.key);
            return (
              <Card
                key={p.key}
                className={`p-6 flex flex-col relative ${popular ? "border-accent shadow-[var(--shadow-elegant)] lg:scale-[1.03]" : ""}`}
              >
                {popular && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground hover:bg-accent">
                    Mais popular
                  </Badge>
                )}
                <div className="mb-4">
                  <div className="font-display font-semibold text-lg">{p.name}</div>
                  <p className="text-sm text-muted-foreground mt-1 min-h-[40px]">
                    {p.description ?? ""}
                  </p>
                </div>
                <div className="mb-5">
                  <span className="font-display text-4xl font-extrabold">{formatPrice(p)}</span>
                  {p.key !== "enterprise" && p.price_monthly && p.price_monthly > 0 && (
                    <span className="text-muted-foreground"> /mês</span>
                  )}
                </div>
                <ul className="space-y-2 mb-6 flex-1">
                  {(PLAN_FEATURES[p.key] ?? []).map((feat) => (
                    <li key={feat} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-success mt-0.5 shrink-0" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
                <Button asChild variant={popular ? "default" : "outline"} className="w-full">
                  {cta.href.startsWith("mailto:") ? (
                    <a href={cta.href}>{cta.label}</a>
                  ) : (
                    <Link to={cta.href}>{cta.label}</Link>
                  )}
                </Button>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Security */}
      <section className="bg-surface-alt border-y">
        <div className="container-app py-20 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <Badge variant="outline" className="mb-4">Segurança e confiança</Badge>
            <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
              Os seus dados, isolados e protegidos
            </h2>
            <p className="mt-3 text-muted-foreground">
              Arquitetura multi-tenant com isolamento por organização ao nível da base de dados,
              papéis granulares e auditoria. A sua empresa nunca partilha dados com ninguém.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { icon: ShieldCheck, t: "RLS por organização", d: "Cada empresa só vê os seus dados, garantido na base de dados." },
              { icon: Users, t: "Papéis e permissões", d: "Owner, admin, diretor, comercial, leitura. Tudo configurável." },
              { icon: Building2, t: "Multi-empresa", d: "Várias organizações por utilizador, com troca rápida." },
              { icon: Plug, t: "Integrações por org", d: "Cada empresa liga as suas próprias contas externas." },
            ].map((b) => (
              <Card key={b.t} className="p-5">
                <b.icon className="h-5 w-5 text-primary mb-2" />
                <div className="font-display font-semibold">{b.t}</div>
                <p className="text-sm text-muted-foreground mt-1">{b.d}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="container-app py-20 lg:py-24">
        <div className="max-w-2xl mx-auto text-center mb-10">
          <Badge variant="outline" className="mb-4">FAQ</Badge>
          <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
            Perguntas frequentes
          </h2>
        </div>
        <div className="max-w-3xl mx-auto">
          <Accordion type="single" collapsible className="w-full">
            {FAQS.map((f, i) => (
              <AccordionItem key={i} value={`item-${i}`}>
                <AccordionTrigger className="text-left font-medium">{f.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Final CTA */}
      <section className="container-app pb-20">
        <Card className="relative overflow-hidden p-10 md:p-14 text-center bg-gradient-to-br from-primary to-primary-glow border-0 text-primary-foreground">
          <div className="absolute inset-0 opacity-30 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 80% 20%, hsl(var(--accent)) 0, transparent 40%)" }} />
          <div className="relative">
            <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
              Pronto para começar?
            </h2>
            <p className="mt-3 opacity-90 max-w-xl mx-auto">
              Crie a sua conta em segundos e experimente o Sales Success Suite grátis durante 14 dias.
            </p>
            <div className="mt-7 flex flex-wrap gap-3 justify-center">
              <Button asChild size="lg" variant="secondary">
                <Link to={primaryCta.href}>{primaryCta.label}<ArrowRight className="h-4 w-4 ml-1" /></Link>
              </Button>
              {!user && (
                <Button asChild size="lg" variant="outline" className="bg-transparent text-primary-foreground border-primary-foreground/40 hover:bg-primary-foreground/10 hover:text-primary-foreground">
                  <Link to={secondaryCta.href}>{secondaryCta.label}</Link>
                </Button>
              )}
            </div>
          </div>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t mt-auto">
        <div className="container-app py-10 space-y-8">
          <div className="flex flex-col md:flex-row gap-6 items-center justify-between">
            <div className="flex items-center gap-2 font-display font-semibold">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Dna className="h-4 w-4" />
              </span>
              <span>Sales Success Suite</span>
            </div>
            <nav className="flex gap-6 text-sm text-muted-foreground">
              <a href="#funcionalidades" className="hover:text-foreground">Funcionalidades</a>
              <a href="#precos" className="hover:text-foreground">Preços</a>
              <Link to="/auth" className="hover:text-foreground">Entrar</Link>
            </nav>
          </div>
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between border-t pt-6">
            <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <Link to="/privacidade" className="hover:text-foreground">Privacidade</Link>
              <Link to="/termos" className="hover:text-foreground">Termos</Link>
              <Link to="/cookies" className="hover:text-foreground">Cookies</Link>
              <Link to="/aviso-legal" className="hover:text-foreground">Aviso Legal</Link>
              <Link to="/subprocessadores" className="hover:text-foreground">Subprocessadores</Link>
              <Link to="/dpa" className="hover:text-foreground">DPA</Link>
              <Link to="/colaboradores" className="hover:text-foreground">Colaboradores</Link>
              <Link to="/acessibilidade" className="hover:text-foreground">Acessibilidade</Link>
              <button
                type="button"
                className="hover:text-foreground"
                onClick={() => window.dispatchEvent(new Event("app:open-cookie-settings"))}
              >
                Definições de cookies
              </button>
            </nav>
            <div className="text-sm text-muted-foreground">© 2026 Sales Success Suite</div>
          </div>
        </div>
      </footer>
    </div>
  );
}