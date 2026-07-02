import { useState } from "react";
import { Store, Search, Loader2, Download, Star, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { toast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Result = {
  name: string; phone: string | null; email: string | null; site: string | null;
  city: string | null; country: string; rating: number | null; address: string | null; has_website: boolean;
};

const CATEGORIES = ["Restaurante", "Salão de Beleza", "Cabeleireiro", "Clínica", "Ginásio", "Hotel", "Imobiliária", "Advogados", "Contabilidade", "Marketing", "Consultoria", "Pizza", "Outra"];
const COUNTRIES = ["Portugal", "Brasil", "Estados Unidos", "Espanha", "Reino Unido", "México", "Colômbia", "Peru", "Chile", "Equador", "Venezuela", "Costa Rica", "República Dominicana", "El Salvador", "Guatemala", "Honduras", "Nicarágua"];

export default function Marketplace() {
  const { activeOrg, role } = useOrganization();
  const canWrite = role !== "read_only" && role !== null;

  const [category, setCategory] = useState("Restaurante");
  const [custom, setCustom] = useState("");
  const [country, setCountry] = useState("Portugal");
  const [city, setCity] = useState("");
  const [quantity, setQuantity] = useState("20");
  const [minRating, setMinRating] = useState("0");
  const [hasWebsite, setHasWebsite] = useState(false);

  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);

  const niche = category === "Outra" ? (custom.trim() || "Outra") : category;

  type MktResp = { results?: Result[]; count?: number; error?: string; message?: string; done?: boolean; pending?: boolean; results_location?: string };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // invoca a função; em caso de erro mostra toast e devolve null
  const invokeMkt = async (extra: Record<string, unknown>): Promise<MktResp | null> => {
    const { data, error } = await supabase.functions.invoke("outreach-marketplace", {
      body: {
        organization_id: activeOrg!.id,
        country, city: city.trim(), min_rating: Number(minRating), has_website: hasWebsite,
        ...extra,
      },
    });
    if (error) { toast({ title: "Falha na pesquisa", description: error.message, variant: "destructive" }); return null; }
    const res = data as MktResp;
    if (res?.error) {
      toast({ title: res.error === "not_configured" ? "Outscraper não configurado" : "Erro", description: res.message ?? res.error, variant: "destructive" });
      return null;
    }
    return res;
  };

  const finish = (res: MktResp) => {
    setResults(res.results ?? []);
    setSel(new Set((res.results ?? []).map((_, i) => i)));
    toast({ title: `${res.results?.length ?? 0} resultados` });
    setSearching(false);
  };

  const search = async () => {
    if (!activeOrg) return;
    if (category === "Outra" && !custom.trim()) { toast({ title: "Indica a categoria", variant: "destructive" }); return; }
    setSearching(true); setResults([]); setSel(new Set());

    // Fase 1 — arrancar a pesquisa
    const startRes = await invokeMkt({
      action: "start",
      category: category === "Outra" ? null : category,
      custom_category: category === "Outra" ? custom : null,
      quantity: Number(quantity),
    });
    if (!startRes) { setSearching(false); return; }
    if (startRes.done) { finish(startRes); return; }
    if (!startRes.results_location) { setSearching(false); toast({ title: "Sem resposta do fornecedor", variant: "destructive" }); return; }

    // Fase 2 — consultar o resultado a cada 5s (até ~3 min)
    const loc = startRes.results_location;
    for (let i = 0; i < 36; i++) {
      await sleep(5000);
      const p = await invokeMkt({ action: "poll", results_location: loc });
      if (!p) { setSearching(false); return; }
      if (p.done) { finish(p); return; }
      // pending -> continua
    }
    setSearching(false);
    toast({
      title: "Ainda a processar",
      description: "O fornecedor está a demorar. Repita dentro de momentos — a 2.ª vez costuma ser bem mais rápida (cache).",
      variant: "destructive",
    });
  };

  const toggle = (i: number) => {
    const n = new Set(sel); n.has(i) ? n.delete(i) : n.add(i); setSel(n);
  };
  const toggleAll = () => setSel(sel.size === results.length ? new Set() : new Set(results.map((_, i) => i)));

  const importSelected = async () => {
    if (!activeOrg || sel.size === 0) return;
    setImporting(true);
    const rows = [...sel].map((i) => results[i]).map((r) => ({
      organization_id: activeOrg.id,
      name: r.name || "(sem nome)",
      company: r.name || null,
      email: r.email || null,
      phone: r.phone || null,
      city: r.city || null,
      country: r.country || country,
      niche,
      source: "marketplace" as const,
    }));
    const { error } = await supabase.from("outreach_leads").insert(rows);
    setImporting(false);
    if (error) { toast({ title: "Erro a importar", description: error.message, variant: "destructive" }); return; }
    toast({ title: `${rows.length} leads importados`, description: "Disponíveis em Leads." });
    setResults([]); setSel(new Set());
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marketplace de Leads"
        description="Encontra leads em diretórios de negócio (via Outscraper / Google Maps)."
        icon={<Store className="h-6 w-6" />}
      />

      <Card data-tour="marketplace-search">
        <CardContent className="p-4 grid md:grid-cols-3 gap-3">
          <div className="grid gap-1.5">
            <Label>Categoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {category === "Outra" && (
            <div className="grid gap-1.5">
              <Label>Categoria personalizada</Label>
              <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Ex: Pet shops" />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label>País</Label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Cidade</Label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Lisboa" />
          </div>
          <div className="grid gap-1.5">
            <Label>Quantidade</Label>
            <Select value={quantity} onValueChange={setQuantity}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["10", "20", "50", "100"].map((q) => <SelectItem key={q} value={q}>{q}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Rating mínimo</Label>
            <Select value={minRating} onValueChange={setMinRating}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Qualquer</SelectItem>
                <SelectItem value="3">3+</SelectItem>
                <SelectItem value="4">4+</SelectItem>
                <SelectItem value="4.5">4.5+</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 mt-6">
            <Checkbox id="hw" checked={hasWebsite} onCheckedChange={(v) => setHasWebsite(!!v)} />
            <Label htmlFor="hw">Só com website</Label>
          </div>
          <div className="flex items-end">
            <Button onClick={search} disabled={searching || !canWrite}>
              {searching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
              Procurar leads
            </Button>
          </div>
        </CardContent>
      </Card>

      {!canWrite && <Alert><AlertDescription>Sem permissão para importar leads.</AlertDescription></Alert>}

      {results.length > 0 && (
        <Card data-tour="marketplace-results">
          <CardContent className="p-0">
            <div className="flex items-center justify-between p-3 border-b">
              <div className="text-sm text-muted-foreground">{sel.size} de {results.length} selecionados</div>
              <Button size="sm" onClick={importSelected} disabled={importing || sel.size === 0}>
                {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}Importar selecionados
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"><Checkbox checked={sel.size === results.length && results.length > 0} onCheckedChange={toggleAll} /></TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Local</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Web</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell><Checkbox checked={sel.has(i)} onCheckedChange={() => toggle(i)} /></TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-sm">
                      {r.email && <div>{r.email}</div>}
                      {r.phone && <div className="text-muted-foreground">{r.phone}</div>}
                    </TableCell>
                    <TableCell className="text-sm">{[r.city, r.country].filter(Boolean).join(", ") || "—"}</TableCell>
                    <TableCell>{r.rating ? <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />{r.rating}</span> : "—"}</TableCell>
                    <TableCell>{r.has_website ? <Globe className="h-4 w-4 text-muted-foreground" /> : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
