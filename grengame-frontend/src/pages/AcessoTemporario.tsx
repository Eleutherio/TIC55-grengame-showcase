import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { API_URL } from "../config/api";
import styles from "./AcessoTemporario.module.css";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export default function AcessoTemporario() {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [aceiteTemporario, setAceiteTemporario] = useState(false);
  const [aceiteFormal, setAceiteFormal] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isFormularioValido = useMemo(() => {
    return (
      nome.trim().length > 0 &&
      EMAIL_REGEX.test(email.trim()) &&
      aceiteTemporario &&
      aceiteFormal
    );
  }, [nome, email, aceiteTemporario, aceiteFormal]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErro("");
    setSucesso("");

    if (!nome.trim()) {
      setErro("Informe como gostaria de ser chamado(a). Atualize a página e tente novamente.");
      return;
    }

    if (!EMAIL_REGEX.test(email.trim())) {
      setErro("Informe um e-mail válido. Atualize a página e tente novamente.");
      return;
    }

    if (!aceiteTemporario || !aceiteFormal) {
      setErro("Para continuar, aceite os termos obrigatórios. Atualize a página e tente novamente.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/auth/temporary-access/request/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nome: nome.trim(),
          email: email.trim().toLowerCase(),
          aceite_temporario: aceiteTemporario,
          aceite_formal: aceiteFormal,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const backendError =
          typeof data?.error === "string" ? data.error : "Falha ao solicitar acesso temporário.";
        const backendErrorNormalized = backendError.toLowerCase();
        const shouldAppendRefresh =
          !backendErrorNormalized.includes("atualize a pagina") &&
          !backendErrorNormalized.includes("atualize a página");
        setErro(
          shouldAppendRefresh
            ? `${backendError} Atualize a página e tente novamente.`
            : backendError
        );
        return;
      }

      setSucesso(
        "Solicitação registrada. Verifique seu e-mail para receber login e senha temporários."
      );
      setNome("");
      setEmail("");
      setAceiteTemporario(false);
      setAceiteFormal(false);
    } catch {
      setErro("Erro de conexão. Atualize a página e tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.modalCard}>
        <h1 className={styles.title}>
          <span className={styles.gLetter1}>G</span>ren
          <span className={styles.gLetter2}>G</span>ame
        </h1>

        <h2 className={styles.subtitle}>Solicitação de Login Temporário</h2>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.inputGroup}>
            <label htmlFor="nome">Como gostaria de ser chamado(a)?</label>
            <input
              id="nome"
              type="text"
              value={nome}
              onChange={(event) => setNome(event.target.value)}
              placeholder="Ex.: Maria"
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nome.sobrenome@gmail.com"
            />
          </div>

          <div className={styles.noticeBlock}>
            <p>
              Após preencher seus dados, você receberá um e-mail informando login e
              senha para acessar seu perfil temporário na plataforma. Essas
              credenciais estarão disponíveis durante o prazo de 24h; após esse
              período, seu perfil e suas informações serão excluídos.
            </p>
          </div>

          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={aceiteTemporario}
              onChange={(event) => setAceiteTemporario(event.target.checked)}
            />
            <span>
              Aceito que o acesso fornecido é temporário e que, após o prazo
              determinado, meus dados serão excluídos da plataforma.
            </span>
          </label>

          <div className={styles.disclaimerBlock}>
            <p>
              Esta versão do Grengame destina-se exclusivamente a fins de
              portfólio e registro acadêmico no âmbito da Residência em TIC55 -
              Apoio à Recuperação do Rio Grande do Sul. Não contém informações ou
              dados reais do cliente, tampouco representa endosso oficial por
              parte da Grendene. A plataforma, o código e os conteúdos aqui
              dispostos não correspondem ao produto final entregue para a empresa
              e servem apenas como showcase.
            </p>
          </div>

          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={aceiteFormal}
              onChange={(event) => setAceiteFormal(event.target.checked)}
            />
            <span>
              Declaro ciência do aviso formal acima e aceito os termos para uso
              temporário da plataforma.
            </span>
          </label>

          <div className={styles.feedback} aria-live="polite">
            {erro ? <p className={styles.error}>{erro}</p> : null}
            {!erro && sucesso ? <p className={styles.success}>{sucesso}</p> : null}
          </div>

          <div className={styles.actions}>
            <button type="submit" disabled={!isFormularioValido || isSubmitting}>
              {isSubmitting ? "Enviando..." : "Solicitar login temporário"}
            </button>
          </div>

          <Link to="/login" className={styles.backLink}>
            Voltar ao login
          </Link>
        </form>
      </div>
    </div>
  );
}
