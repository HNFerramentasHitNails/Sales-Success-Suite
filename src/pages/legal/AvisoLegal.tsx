import LegalLayout from "./LegalLayout";
import { LEGAL } from "@/config/legal";

export default function AvisoLegal() {
  return (
    <LegalLayout title="Aviso Legal">
      <p>
        Identificação do prestador de serviços da sociedade da informação, nos termos do Decreto-Lei
        n.º 7/2004, de 7 de janeiro.
      </p>

      <ul>
        <li><strong>Denominação:</strong> {LEGAL.entidadeLegal}</li>
        <li><strong>NIF:</strong> {LEGAL.nif}</li>
        <li><strong>Sede:</strong> {LEGAL.morada}</li>
        <li><strong>Contacto:</strong> {LEGAL.email}{LEGAL.telefone ? ` · ${LEGAL.telefone}` : ""}</li>
        <li><strong>Marca comercial:</strong> {LEGAL.marcaComercial}</li>
      </ul>

      <h2>Resolução de litígios de consumo</h2>
      <p>
        Em caso de litígio, o consumidor pode recorrer ao{" "}
        <a href={LEGAL.livroReclamacoes} target="_blank" rel="noopener noreferrer">
          Livro de Reclamações eletrónico
        </a>{" "}
        e à{" "}
        <a href={LEGAL.resolucaoLitigiosUE} target="_blank" rel="noopener noreferrer">
          Plataforma de Resolução de Litígios em Linha (ODR) da União Europeia
        </a>.
      </p>
    </LegalLayout>
  );
}
