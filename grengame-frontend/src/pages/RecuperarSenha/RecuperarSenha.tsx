import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './RecuperarSenha.css';
import { API_URL } from "../../config/api";

export default function RecuperarSenha() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMessage('');

    try {
      const response = await fetch(`${API_URL}/auth/password-reset/request/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Erro ao enviar código.');
        return;
      }

      setSuccessMessage(data.message || 'Código enviado com sucesso!');
      setTimeout(() => {
        navigate('/nova-senha', { state: { email } });
      }, 2000);
    } catch {
      setError('Erro de conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="recoverPage">
      <div className="recoverContainer">

        <h1 className="logoTitle">
          <span className="gLetter1">G</span>ren
          <span className="gLetter2">G</span>ame
        </h1>

        <p className="description">
          Informe o seu e-mail corporativo cadastrado.
          Um código de validação será enviado para você recuperar a sua senha.
          Caso não receba o e-mail verifique sua caixa de SPAM ou entre em contato com o seu administrador.
        </p>

        <form onSubmit={handleSubmit}>
          <label className="inputLabel">
            Digite seu e-mail corporativo:
          </label>

          <input
            type="email"
            className="inputField"
            placeholder="nome.sobrenome@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          {error && <p className="errorMessage">{error}</p>}
          {successMessage && <p className="successMessage">{successMessage}</p>}

          <button type="submit" className="btnSend" disabled={loading}>
            {loading ? 'Enviando...' : 'Enviar'}
          </button>
        </form>

        <Link to="/login" className="backLink">
          &larr; Voltar ao login
        </Link>

      </div>
    </div>
  );
}