import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Upload, User as UserIcon, Loader2, Download, ShieldAlert, Trash2 } from "lucide-react";

const LEGAL_LINKS = [
  { to: "/privacidade", label: "Privacidade" },
  { to: "/termos", label: "Termos" },
  { to: "/cookies", label: "Cookies" },
  { to: "/aviso-legal", label: "Aviso Legal" },
  { to: "/subprocessadores", label: "Subprocessadores" },
  { to: "/dpa", label: "DPA" },
  { to: "/colaboradores", label: "Colaboradores" },
];

function initials(name: string | null | undefined, email: string | null | undefined) {
  const src = (name || email || "").trim();
  if (!src) return "";
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

async function resolveAvatarUrl(value: string | null): Promise<string | null> {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const { data } = await supabase.storage.from("avatars").createSignedUrl(value, 3600);
  return data?.signedUrl ?? null;
}

export default function Profile() {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPass, setSavingPass] = useState(false);

  const [fullName, setFullName] = useState("");
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");

  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletionPending, setDeletionPending] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("account_deletion_requests")
      .select("id")
      .in("status", ["pending", "processing"])
      .maybeSingle()
      .then(({ data }) => setDeletionPending(!!data));
  }, [user]);

  async function exportData() {
    setExporting(true);
    const { data, error } = await supabase.rpc("export_my_data");
    setExporting(false);
    if (error) {
      toast.error("Não foi possível exportar os dados");
      return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `os-meus-dados-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Dados exportados");
  }

  async function requestDeletion() {
    if (!window.confirm("Pretende pedir a eliminação da sua conta? O pedido será processado no prazo máximo de 30 dias. Esta ação pode ser revertida contactando o suporte enquanto não for concluída.")) return;
    setDeleting(true);
    const { error } = await supabase.rpc("request_account_deletion", { _reason: null });
    setDeleting(false);
    if (error) {
      toast.error("Não foi possível registar o pedido");
      return;
    }
    setDeletionPending(true);
    toast.success("Pedido de eliminação registado. Responderemos em até 30 dias.");
  }

  useEffect(() => {
    let active = true;
    (async () => {
      if (!user) return;
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, avatar_url, email, created_at")
        .eq("id", user.id)
        .maybeSingle();
      if (!active) return;
      if (error) {
        toast.error("Não foi possível carregar o perfil");
      } else if (data) {
        setFullName(data.full_name ?? "");
        setAvatarPath(data.avatar_url ?? null);
        const url = await resolveAvatarUrl(data.avatar_url ?? null);
        if (active) setAvatarPreview(url);
        setCreatedAt(data.created_at ?? null);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Por favor escolhe um ficheiro de imagem");
      return;
    }
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const signed = await supabase.storage.from("avatars").createSignedUrl(path, 3600);
      setAvatarPath(path);
      setAvatarPreview(signed.data?.signedUrl ?? null);
      toast.success("Foto carregada. Clica em Guardar para confirmar.");
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao carregar a foto");
    } finally {
      setUploading(false);
    }
  }

  async function saveProfile() {
    if (!user) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim() || null,
        avatar_url: avatarPath || null,
      })
      .eq("id", user.id);
    setSavingProfile(false);
    if (error) {
      toast.error(error.message || "Erro ao atualizar perfil");
    } else {
      toast.success("Perfil atualizado");
    }
  }

  async function changeEmail() {
    const email = newEmail.trim();
    if (!email) {
      toast.error("Indica o novo email");
      return;
    }
    setSavingEmail(true);
    const { error } = await supabase.auth.updateUser({ email });
    setSavingEmail(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(
        "Enviámos um email de confirmação para o novo endereço. A alteração fica ativa após confirmares.",
      );
      setNewEmail("");
    }
  }

  async function changePassword() {
    if (newPass.length < 8) {
      toast.error("A palavra-passe tem de ter pelo menos 8 caracteres");
      return;
    }
    if (newPass !== confirmPass) {
      toast.error("As palavras-passe não coincidem");
      return;
    }
    setSavingPass(true);
    const { error } = await supabase.auth.updateUser({ password: newPass });
    setSavingPass(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Palavra-passe alterada");
      setNewPass("");
      setConfirmPass("");
    }
  }

  const createdLabel = createdAt
    ? new Date(createdAt).toLocaleDateString("pt-PT", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="O meu perfil"
        description="Gere os teus dados de conta."
        icon={<UserIcon className="h-6 w-6" />}
      />

      <Card>
        <CardHeader>
          <CardTitle>Perfil</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20">
              {avatarPreview ? <AvatarImage src={avatarPreview} alt={fullName || "Avatar"} /> : null}
              <AvatarFallback>
                {initials(fullName, user?.email) || <UserIcon className="h-6 w-6" />}
              </AvatarFallback>
            </Avatar>
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileRef.current?.click()}
                disabled={uploading || loading}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Carregar foto
              </Button>
              <p className="text-xs text-muted-foreground mt-1">JPG ou PNG.</p>
            </div>
          </div>

          <div className="space-y-2 max-w-md">
            <Label htmlFor="full_name">Nome completo</Label>
            <Input
              id="full_name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={loading}
              placeholder="O teu nome"
            />
          </div>

          <div>
            <Button onClick={saveProfile} disabled={savingProfile || loading}>
              {savingProfile ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Guardar
            </Button>
          </div>
        </CardContent>
        {createdLabel ? (
          <CardFooter>
            <p className="text-xs text-muted-foreground">Conta criada em {createdLabel}</p>
          </CardFooter>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 max-w-md">
          <div className="space-y-2">
            <Label>Email atual</Label>
            <Input value={user?.email ?? ""} readOnly disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new_email">Novo email</Label>
            <Input
              id="new_email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="novo@exemplo.com"
            />
          </div>
          <Button onClick={changeEmail} disabled={savingEmail || !newEmail.trim()}>
            {savingEmail ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Alterar email
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Palavra-passe</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 max-w-md">
          <div className="space-y-2">
            <Label htmlFor="new_pass">Nova palavra-passe</Label>
            <Input
              id="new_pass"
              type="password"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm_pass">Confirmar palavra-passe</Label>
            <Input
              id="confirm_pass"
              type="password"
              value={confirmPass}
              onChange={(e) => setConfirmPass(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <Button onClick={changePassword} disabled={savingPass || !newPass || !confirmPass}>
            {savingPass ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Alterar palavra-passe
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Privacidade e dados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Exportar os meus dados</Label>
            <p className="text-sm text-muted-foreground">
              Descarrega um ficheiro com os teus dados pessoais (perfil e pertenças a organizações), nos
              termos do RGPD (arts. 15.º e 20.º).
            </p>
            <Button variant="outline" onClick={exportData} disabled={exporting}>
              {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Exportar (JSON)
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Eliminação da conta</Label>
            <p className="text-sm text-muted-foreground">
              Podes pedir a eliminação da tua conta. O pedido é processado no prazo máximo de 30 dias.
            </p>
            {deletionPending ? (
              <p className="inline-flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                <ShieldAlert className="h-4 w-4" /> Já existe um pedido de eliminação em curso.
              </p>
            ) : (
              <Button variant="destructive" onClick={requestDeletion} disabled={deleting}>
                {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Pedir eliminação da conta
              </Button>
            )}
          </div>

          <div className="space-y-2 border-t pt-4">
            <Label>Documentos legais</Label>
            <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {LEGAL_LINKS.map((l) => (
                <Link key={l.to} to={l.to} target="_blank" className="hover:text-foreground underline">
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}