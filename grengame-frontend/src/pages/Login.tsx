import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import styles from "./Login.module.css";
import { saveTokens } from "../utils/auth";
import { API_CONFIG_ERROR, API_URL } from "../config/api";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

const WARMUP_TOTAL_MS = 60000;
const WARMUP_ATTEMPT_TIMEOUT_MS = 8000;
const WARMUP_RETRY_INTERVAL_MS = 3000;

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBackendReady, setIsBackendReady] = useState(false);
  const [isWarmingUp, setIsWarmingUp] = useState(false);
  const [warmupError, setWarmupError] = useState("");

  const navigate = useNavigate();

  const warmupBackend = useCallback(async () => {
    if (!API_URL) {
      setIsBackendReady(false);
      setIsWarmingUp(false);
      setWarmupError("");
      return;
    }

    setIsWarmingUp(true);
    setIsBackendReady(false);
    setWarmupError("");

    const deadline = Date.now() + WARMUP_TOTAL_MS;

    while (Date.now() < deadline) {
      try {
        const response = await fetchWithTimeout(
          `${API_URL}/health/`,
          {
            method: "GET",
          },
          WARMUP_ATTEMPT_TIMEOUT_MS,
        );

        if (response.ok) {
          setIsBackendReady(true);
          setIsWarmingUp(false);
          setWarmupError("");
          return;
        }
      } catch {
        // Tenta novamente ate o tempo maximo.
      }

      await new Promise((resolve) => setTimeout(resolve, WARMUP_RETRY_INTERVAL_MS));
    }

    setIsBackendReady(false);
    setIsWarmingUp(false);
    setWarmupError(
      "Servidor ainda inicializando. Aguarde alguns segundos e tente novamente.",
    );
  }, []);

  useEffect(() => {
    void warmupBackend();
  }, [warmupBackend]);

  const handleSubmit = async (event: React.FormEvent) => {
    if (isSubmitting) return;

    event.preventDefault();
    setError("");

    if (!isBackendReady) {
      setError("Servidor inicializando. Aguarde o status ficar pronto para entrar.");
      if (!isWarmingUp) {
        void warmupBackend();
      }
      return;
    }

    if (email.trim() === "" || password.trim() === "") {
      setError("Por favor, preencha todos os campos.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Por favor, insira um e-mail válido.");
      return;
    }

    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (!API_URL) {
      setError(API_CONFIG_ERROR);
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetchWithTimeout(
        `${API_URL}/auth/login/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password }),
        },
        15000,
      );

      const data = await response.json();

      if (!response.ok) {
        let errorMessage = "Ocorreu um erro no login.";

        if (typeof data === "string") {
          errorMessage = data;
        } else if (data.detail) {
          errorMessage = data.detail;
        } else if (data.error) {
          errorMessage = data.error;
        } else if (data.email || data.password) {
          const emailError =
            Array.isArray(data.email) && data.email.length > 0
              ? data.email[0]
              : null;
          const passwordError =
            Array.isArray(data.password) && data.password.length > 0
              ? data.password[0]
              : null;
          errorMessage = emailError || passwordError || errorMessage;
        } else if (
          data.non_field_errors &&
          Array.isArray(data.non_field_errors) &&
          data.non_field_errors.length > 0
        ) {
          errorMessage = data.non_field_errors[0];
        }

        setError(errorMessage);
      } else if (data.access) {
        saveTokens(data.access, data.refresh || "");
        navigate("/");
      } else {
        setError("Resposta inválida do servidor. Token não encontrado.");
      }
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") {
        setError("Servidor demorou para responder. Tente novamente em alguns segundos.");
        return;
      }
      setError("Não foi possível conectar ao servidor. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.loginPage}>
      <div className={styles.loginContainer}>
        <h1 className={styles.title}>
          <span className={styles.gLetter1}>G</span>
          ren
          <span className={styles.gLetter2}>G</span>
          ame
        </h1>

        <form onSubmit={handleSubmit}>
          <div className={styles.inputGroup}>
            <label htmlFor="email">E-mail</label>
            <input
              type="email"
              id="email"
              placeholder="nome.sobrenome@gmail.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="password">Senha</label>
            <div className={styles.passwordWrapper}>
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                placeholder="********"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className={styles.passwordToggle}
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                aria-pressed={showPassword}
              >
                <img
                  src={showPassword ? "/eye-closed.png" : "/eye-open.png"}
                  alt=""
                  aria-hidden="true"
                  className={styles.passwordToggleIcon}
                />
              </button>
            </div>
          </div>

          <div className={styles.errorMessage}>{error && <p>{error}</p>}</div>

          <div className={styles.warmupMessage}>
            {warmupError && <p>{warmupError}</p>}
            {!isBackendReady && !isWarmingUp && (
              <button
                type="button"
                className={styles.warmupRetry}
                onClick={() => void warmupBackend()}
              >
                Tentar conectar novamente
              </button>
            )}
          </div>

          <div className={styles.buttonGroup}>
            <button
              type="submit"
              className={`${styles.btnPrimary} ${isSubmitting ? styles.btnPrimaryLoading : ""}`}
              disabled={isSubmitting || !isBackendReady}
            >
              {isSubmitting
                ? "Entrando..."
                : isWarmingUp
                  ? "Inicializando servidor... (até 60s)"
                  : !isBackendReady
                    ? "Aguardando servidor"
                    : "Entrar"}
            </button>
          </div>

          <div className={styles.loginAuxLinks}>
            <Link to="/recuperar-senha" className={styles.forgotPassword}>
              Esqueci minha senha
            </Link>
            <p className={styles.tempAccessText}>
              Quer testar a plataforma?{" "}
              <Link to="/acesso-temporario" className={styles.tempAccessLink}>
                clique aqui
              </Link>{" "}
              e solicite seu login temporário.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
