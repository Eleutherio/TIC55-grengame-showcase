import { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import './NovaSenha.css';
import { API_URL } from "../../config/api";

export default function NovaSenha() {
  const location = useLocation();
  const navigate = useNavigate();
  const email = location.state?.email || '';

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!email) {
      navigate('/recuperar-senha');
    }
  }, [email, navigate]);

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pastedData.length > 0) {
      const newOtp = [...otp];
      for (let i = 0; i < pastedData.length && i < 6; i++) {
        newOtp[i] = pastedData[i];
      }
      setOtp(newOtp);
      const nextIndex = Math.min(pastedData.length, 5);
      inputRefs.current[nextIndex]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleSubmit = async () => {
    const code = otp.join('');
    if (code.length !== 6) {
      setError('Digite o código completo.');
      return;
    }
    if (newPassword.length < 8) {
      setError('A senha deve ter no mínimo 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const verifyResponse = await fetch(`${API_URL}/auth/password-reset/verify/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, code })
      });

      const verifyData = await verifyResponse.json();

      if (!verifyResponse.ok) {
        setError(verifyData.error || 'Código inválido.');
        return;
      }

      const confirmResponse = await fetch(`${API_URL}/auth/password-reset/confirm/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          session_token: verifyData.session_token,
          new_password: newPassword,
          confirm_password: confirmPassword
        })
      });

      const confirmData = await confirmResponse.json();

      if (!confirmResponse.ok) {
        setError(confirmData.error || 'Erro ao redefinir senha.');
        return;
      }

      setSuccess('Senha alterada com sucesso!');
      setTimeout(() => navigate('/login'), 2000);
    } catch {
      setError('Erro de conexão.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/auth/password-reset/request/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      if (response.ok) {
        setSuccess('Código reenviado!');
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch {
      setError('Erro ao reenviar.');
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
          Informe o código de 6 dígitos enviado para seu e-mail e crie uma nova senha
        </p>

        <label className="inputLabel">Código de Verificação</label>
        <div className="otpContainer">
          {otp.map((digit, index) => (
            <input
              key={index}
              ref={(el) => { inputRefs.current[index] = el; }}
              className="otpBox"
              type="text"
              maxLength={1}
              value={digit}
              onChange={(e) => handleOtpChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={handlePaste}
            />
          ))}
        </div>
        <div className="resendContainer">
          Não recebeu o código?{' '}
          <button className="resendLink" onClick={handleResend} disabled={loading}>
            Reenviar
          </button>
        </div>

        <label className="inputLabel">Nova Senha</label>
        <input
          type="password"
          className="passwordInput"
          placeholder="........"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <span className="helperText">Mínimo de 8 caracteres</span>

        <label className="inputLabel">Confirmar Nova Senha</label>
        <input
          type="password"
          className="passwordInput"
          placeholder="........"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />

        {error && <p className="errorMessage">{error}</p>}
        {success && <p className="successMessage">{success}</p>}

        <button
          className="btnReset"
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? 'Aguarde...' : 'Redefinir Senha'}
        </button>

        <Link to="/recuperar-senha" className="backLink">
          &larr; Voltar
        </Link>

      </div>
    </div>
  );
}