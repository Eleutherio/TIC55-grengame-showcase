import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import "./NovaSenha.css";
import { API_CONFIG_ERROR, API_URL } from "../../config/api";
import { fetchWithTimeout } from "../../utils/fetchWithTimeout";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export default function NovaSenha() {
  const location = useLocation();
  const navigate = useNavigate();

  const queryEmail = new URLSearchParams(location.search).get("email") || "";
  const stateEmail = typeof location.state?.email === "string" ? location.state.email : "";
  const [email, setEmail] = useState((stateEmail || queryEmail).trim().toLowerCase());
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!email && (stateEmail || queryEmail)) {
      setEmail((stateEmail || queryEmail).trim().toLowerCase());
    }
  }, [email, queryEmail, stateEmail]);

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (event: React.ClipboardEvent) => {
    event.preventDefault();
    const pastedData = event.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);

    if (pastedData.length > 0) {
      const newOtp = [...otp];
      for (let i = 0; i < pastedData.length && i < 6; i += 1) {
        newOtp[i] = pastedData[i];
      }
      setOtp(newOtp);
      const nextIndex = Math.min(pastedData.length, 5);
      inputRefs.current[nextIndex]?.focus();
    }
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent) => {
    if (event.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const validateEmail = () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !EMAIL_REGEX.test(trimmedEmail)) {
      setError("Informe um e-mail válido para continuar.");
      return null;
    }
    return trimmedEmail;
  };

  const handleSubmit = async () => {
    const normalizedEmail = validateEmail();
    if (!normalizedEmail) return;

    const code = otp.join("");
    if (code.length !== 6) {
      setError("Digite o código completo.");
      return;
    }
    if (newPassword.length < 8) {
      setError("A senha deve ter no mínimo 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      if (!API_URL) {
        setError(API_CONFIG_ERROR);
        return;
      }

      const verifyResponse = await fetchWithTimeout(
        `${API_URL}/auth/password-reset/verify/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email: normalizedEmail, code }),
        },
        15000,
      );

      const verifyData = await verifyResponse.json();
      if (!verifyResponse.ok) {
        setError(verifyData.error || "Código inválido.");
        return;
      }

      const confirmResponse = await fetchWithTimeout(
        `${API_URL}/auth/password-reset/confirm/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            session_token: verifyData.session_token,
            new_password: newPassword,
            confirm_password: confirmPassword,
          }),
        },
        15000,
      );

      const confirmData = await confirmResponse.json();
      if (!confirmResponse.ok) {
        setError(confirmData.error || "Erro ao redefinir senha.");
        return;
      }

      setSuccess("Senha alterada com sucesso!");
      setTimeout(() => navigate("/login"), 2000);
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") {
        setError("Servidor demorou para responder. Tente novamente em alguns segundos.");
      } else {
        setError("Erro de conexão.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    const normalizedEmail = validateEmail();
    if (!normalizedEmail) return;

    setLoading(true);
    setError("");
    try {
      if (!API_URL) {
        setError(API_CONFIG_ERROR);
        return;
      }

      const response = await fetchWithTimeout(
        `${API_URL}/auth/password-reset/request/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: normalizedEmail }),
        },
        15000,
      );

      if (response.ok) {
        setSuccess("Código reenviado!");
        setTimeout(() => setSuccess(""), 3000);
      }
    } catch {
      setError("Erro ao reenviar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="resetPage">
      <div className="resetContainer">
        <h1 className="logoTitle">
          <span className="gLetter1">G</span>ren
          <span className="gLetter2">G</span>ame
        </h1>

        <p className="description">
          Informe o e-mail cadastrado, o código de 6 dígitos recebido e crie uma nova senha.
        </p>

        <label className="inputLabel" htmlFor="reset-email">
          E-mail cadastrado
        </label>
        <input
          id="reset-email"
          type="email"
          className="passwordInput"
          placeholder="nome.sobrenome@gmail.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
        />

        <label className="inputLabel">Código de Verificação</label>
        <div className="otpContainer">
          {otp.map((digit, index) => (
            <input
              key={index}
              ref={(element) => {
                inputRefs.current[index] = element;
              }}
              className="otpBox"
              type="text"
              maxLength={1}
              value={digit}
              onChange={(event) => handleOtpChange(index, event.target.value)}
              onKeyDown={(event) => handleKeyDown(index, event)}
              onPaste={handlePaste}
            />
          ))}
        </div>
        <div className="resendContainer">
          Não recebeu o código?{" "}
          <button className="resendLink" onClick={handleResend} disabled={loading}>
            Reenviar
          </button>
        </div>

        <label className="inputLabel">Nova Senha</label>
        <div className="passwordInputWrapper">
          <input
            type={showNewPassword ? "text" : "password"}
            className="passwordInput"
            placeholder="........"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
          <button
            type="button"
            className="passwordToggleButton"
            onClick={() => setShowNewPassword((value) => !value)}
            aria-label={showNewPassword ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={showNewPassword}
          >
            <img
              src={showNewPassword ? "/eye-closed.png" : "/eye-open.png"}
              alt=""
              aria-hidden="true"
              className="passwordToggleIcon"
            />
          </button>
        </div>
        <span className="helperText">Mínimo de 8 caracteres</span>

        <label className="inputLabel">Confirmar Nova Senha</label>
        <div className="passwordInputWrapper">
          <input
            type={showConfirmPassword ? "text" : "password"}
            className="passwordInput"
            placeholder="........"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
          <button
            type="button"
            className="passwordToggleButton"
            onClick={() => setShowConfirmPassword((value) => !value)}
            aria-label={showConfirmPassword ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={showConfirmPassword}
          >
            <img
              src={showConfirmPassword ? "/eye-closed.png" : "/eye-open.png"}
              alt=""
              aria-hidden="true"
              className="passwordToggleIcon"
            />
          </button>
        </div>

        {error && <p className="errorMessage">{error}</p>}
        {success && <p className="successMessage">{success}</p>}

        <button className="btnReset" onClick={handleSubmit} disabled={loading}>
          {loading ? "Aguarde..." : "Redefinir Senha"}
        </button>

        <Link to="/recuperar-senha" className="backLink">
          &larr; Voltar
        </Link>
      </div>
    </div>
  );
}
