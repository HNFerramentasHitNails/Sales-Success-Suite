import { Link } from "react-router-dom";
import LegalLayout from "./LegalLayout";
import { LEGAL } from "@/config/legal";

export default function DPA() {
  return (
    <LegalLayout title="Acordo de Tratamento de Dados (DPA)">
      <p>
        Quando o cliente trata, na plataforma, dados pessoais de terceiros (por exemplo, dados dos seus
        próprios clientes e leads), a {LEGAL.entidadeLegal} atua como <strong>subcontratante</strong> nos
        termos do artigo 28.º do RGPD, sendo o cliente o responsável pelo tratamento.
      </p>

      <h2>Conteúdo do Acordo</h2>
      <p>O presente acordo cobre, no mínimo:</p>
      <ul>
        <li>Objeto e duração do tratamento;</li>
        <li>Natureza e finalidade do tratamento;</li>
        <li>Tipos de dados pessoais e categorias de titulares;</li>
        <li>
          Obrigações do subcontratante: atuar apenas mediante instruções documentadas do responsável;
          confidencialidade; medidas de segurança (art. 32.º); apoio ao responsável no exercício dos direitos
          dos titulares e na resposta a violações de dados; eliminação ou devolução dos dados no fim da
          prestação;
        </li>
        <li>
          Autorização de <strong>subprocessadores</strong> (lista em{" "}
          <Link to="/subprocessadores">/subprocessadores</Link>) com dever de notificação de alterações;
        </li>
        <li>Condições de <strong>transferências internacionais</strong> (Cláusulas Contratuais-Tipo, quando aplicável).</li>
      </ul>

      <h2>Aceitação</h2>
      <p>
        Este acordo é disponibilizado para aceitação eletrónica pelos clientes. Para obter uma cópia
        assinada ou esclarecer condições específicas, contacte {LEGAL.emailPrivacidade}.
      </p>

      <p className="text-sm text-muted-foreground">
        Este documento é um esqueleto de trabalho e deve ser revisto por advogado antes de produção.
      </p>
    </LegalLayout>
  );
}
