import { Link } from "react-router-dom";
import LegalLayout from "./LegalLayout";
import { LEGAL } from "@/config/legal";

export default function PoliticaPrivacidade() {
  return (
    <LegalLayout title="Política de Privacidade">
      <p>
        A <strong>{LEGAL.entidadeLegal}</strong> (NIF {LEGAL.nif}), com sede em {LEGAL.morada}
        {" "}("nós", "{LEGAL.marcaComercial}"), respeita a sua privacidade e trata os dados pessoais
        em conformidade com o Regulamento (UE) 2016/679 (RGPD) e a Lei n.º 58/2019.
      </p>

      <h2>1. Responsável pelo tratamento</h2>
      <p>
        Para os dados das contas e utilizadores da plataforma, o responsável é a {LEGAL.entidadeLegal}.
        Quanto aos dados que os clientes (organizações) carregam sobre os seus próprios clientes e leads,
        a {LEGAL.entidadeLegal} atua como <strong>subcontratante</strong>, sendo o cliente o responsável
        pelo tratamento (ver <Link to="/dpa">Acordo de Tratamento de Dados</Link>).
      </p>

      <h2>2. Dados que tratamos</h2>
      <p>
        Dados de registo e conta (nome, email, palavra-passe cifrada); dados de utilização e faturação
        (via Stripe); e os dados que o utilizador introduz na plataforma (clientes, encomendas, leads,
        comunicações, perfis comerciais).
      </p>

      <h2>3. Finalidades e bases legais</h2>
      <p>
        Prestação do serviço e execução do contrato (art. 6.º/1/b); cumprimento de obrigações legais,
        incl. fiscais (art. 6.º/1/c); interesse legítimo na segurança e melhoria do serviço (art. 6.º/1/f);
        consentimento para comunicações de marketing e cookies não essenciais (art. 6.º/1/a).
      </p>

      <h2>4. Subcontratantes e transferências internacionais</h2>
      <p>
        Recorremos a prestadores que tratam dados em nosso nome — ver a lista atualizada em{" "}
        <Link to="/subprocessadores">/subprocessadores</Link>. Quando um prestador trata dados fora do EEE,
        asseguramos garantias adequadas (decisão de adequação ou Cláusulas Contratuais-Tipo). Os fornecedores
        de IA podem processar conteúdos submetidos; o fornecedor utilizado é indicado na lista de
        subprocessadores. Quando o fornecedor de IA selecionado trata dados fora da UE sem decisão de
        adequação, esse tratamento só ocorre após ativação e declaração explícita do cliente nas Definições.
      </p>

      <h2>5. Prazos de conservação</h2>
      <p>
        Conservamos os dados durante a vigência da conta e pelos prazos legais aplicáveis (designadamente
        fiscais). Após esse período, os dados são eliminados ou anonimizados.
      </p>

      <h2>6. Os seus direitos</h2>
      <p>
        Acesso, retificação, apagamento, limitação, portabilidade e oposição (arts. 15.º a 22.º RGPD),
        exercíveis em {LEGAL.emailPrivacidade} ou diretamente na aplicação (Definições → Privacidade e dados).
        Responderemos no prazo máximo de 30 dias. Pode reclamar junto da <strong>CNPD</strong>{" "}
        (<a href={LEGAL.cnpd} target="_blank" rel="noopener noreferrer">www.cnpd.pt</a>).
      </p>

      <h2>7. Segurança</h2>
      <p>
        Adotamos medidas técnicas e organizativas adequadas (isolamento por organização, controlo de acessos
        por papel, cifragem de segredos, alojamento na UE).
      </p>

      <h2>8. Cookies</h2>
      <p>
        Ver a <Link to="/cookies">Política de Cookies</Link>.
      </p>

      <h2>9. Contactos</h2>
      <p>{LEGAL.emailPrivacidade} · {LEGAL.morada}.</p>
    </LegalLayout>
  );
}
