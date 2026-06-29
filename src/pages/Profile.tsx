import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Upload, User as UserIcon, Loader2 } from "lucide-react";

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
    </div>
  );
}