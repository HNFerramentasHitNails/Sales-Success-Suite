import LegalLayout from "./LegalLayout";

export default function PoliticaCookies() {
  return (
    <LegalLayout title="Política de Cookies">
      <p>
        Usamos cookies e tecnologias semelhantes. Os <strong>cookies essenciais</strong> (autenticação,
        segurança, preferências básicas) são necessários ao funcionamento e não requerem consentimento.
        Os <strong>cookies analíticos e de marketing</strong> só são ativados com o seu consentimento, dado
        no banner de cookies, e podem ser revogados a qualquer momento em "Definições de cookies".
      </p>

      <h2>Categorias</h2>
      <ul>
        <li><strong>Essenciais</strong> — sempre ativos (sessão, autenticação, segurança, preferências básicas).</li>
        <li><strong>Analíticos</strong> — medição de utilização e desempenho. [listar ferramentas]</li>
        <li><strong>Marketing</strong> — personalização e medição de campanhas. [listar ferramentas]</li>
      </ul>

      <p>
        Pode rever a sua escolha a qualquer momento através do botão "Definições de cookies" no rodapé.
        Pode também gerir cookies diretamente no seu navegador.
      </p>
    </LegalLayout>
  );
}
