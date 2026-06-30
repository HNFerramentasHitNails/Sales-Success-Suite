import { FormEvent, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { LEGAL_VERSIONS } from "@/config/legal";

export default function AuthPage() {
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const initialTab = params.get("mode") === "signup" ? "signup" : "login";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (user) return <Navigate to="/app/dashboard" replace />;

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast({ title: "Erro a entrar", description: error.message, variant: "destructive" });
  };

  const handleSignup = async (e: FormEvent) => {
    e.preventDefault();
    if (!acceptTerms) {
      toast({ title: "Aceitação obrigatória", description: "Tem de aceitar os Termos e a Política de Privacidade.", variant: "destructive" });
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/app/dashboard`,
        data: {
          full_name: fullName,
          terms_accepted: true,
          terms_version: LEGAL_VERSIONS.terms,
          privacy_version: LEGAL_VERSIONS.privacy,
          terms_accepted_at: new Date().toISOString(),
          marketing_opt_in: marketingOptIn,
        },
      },
    });
    setBusy(false);
    if (error) {
      toast({ title: "Erro a criar conta", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Conta criada", description: "Verifique o seu email se for necessário." });
    }
  };

  const handleMagic = async () => {
    if (!email) {
      toast({ title: "Indique o email", variant: "destructive" });
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/app/dashboard` },
    });
    setBusy(false);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else toast({ title: "Link enviado", description: "Verifique a sua caixa de email." });
  };

  const handleForgot = async () => {
    if (!email) {
      toast({ title: "Indique o email", variant: "destructive" });
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else toast({ title: "Email enviado", description: "Verifique a sua caixa de email." });
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="font-display text-2xl">Sales Success Suite</CardTitle>
          <CardDescription>Entrar na sua conta ou criar uma nova</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={initialTab}>
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-3">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  Entrar
                </Button>
                <div className="flex justify-between text-sm">
                  <button type="button" onClick={handleMagic} className="text-primary hover:underline">
                    Enviar link mágico
                  </button>
                  <button type="button" onClick={handleForgot} className="text-muted-foreground hover:underline">
                    Esqueci-me da password
                  </button>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-3">
                <div>
                  <Label htmlFor="fullName">Nome</Label>
                  <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="su-email">Email</Label>
                  <Input id="su-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="su-password">Password</Label>
                  <Input id="su-password" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <div className="flex items-start gap-2 pt-1">
                  <Checkbox id="accept-terms" checked={acceptTerms} onCheckedChange={(v) => setAcceptTerms(v === true)} className="mt-0.5" />
                  <Label htmlFor="accept-terms" className="text-sm font-normal leading-snug text-muted-foreground">
                    Li e aceito os{" "}
                    <Link to="/termos" target="_blank" className="text-primary hover:underline">Termos &amp; Condições</Link>{" "}
                    e a{" "}
                    <Link to="/privacidade" target="_blank" className="text-primary hover:underline">Política de Privacidade</Link>.
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox id="marketing-optin" checked={marketingOptIn} onCheckedChange={(v) => setMarketingOptIn(v === true)} className="mt-0.5" />
                  <Label htmlFor="marketing-optin" className="text-sm font-normal leading-snug text-muted-foreground">
                    Aceito receber comunicações de marketing (opcional).
                  </Label>
                </div>
                <Button type="submit" className="w-full" disabled={busy || !acceptTerms}>
                  Criar conta
                </Button>
              </form>
            </TabsContent>
          </Tabs>
          <p className="text-center text-sm text-muted-foreground mt-6">
            <Link to="/" className="hover:underline">← Voltar</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}