import React, { useState } from 'react';
import styles from './Login.module.css';
import { useNavigate } from 'react-router-dom';
import { saveTokens } from '../utils/auth';
import { Link } from 'react-router-dom';
import { API_URL } from '../config/api';

const Login = () => {
    // --- ESTADO (State) ---
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(''); // Estado para a mensagem de erro

    const navigate = useNavigate();

    // --- MANIPULADOR DE ENVIO DO FORMULÁRIO ---  

    const handleSubmit = async (event: React.FormEvent) => {
        // 1. Impede o recarregamento da página
        event.preventDefault();
        
        // 2. Limpa erros anteriores
        setError('');

        // --- VALIDAÇÃO DE FRONT-END ---
        
        // Validação 1: Campos em branco
        if (email.trim() === '' || password.trim() === '') {
            setError('Por favor, preencha todos os campos.');
            return; // Para a execução
        }

        // Validação 2: Formato do e-mail
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            setError('Por favor, insira um e-mail válido.');
            return; // Para a execução
        }

        // Validação 3: Senha curta
        if (password.length < 6) {
            setError('A senha deve ter pelo menos 6 caracteres.');
            return;
        }
        
        // --- FIM DA VALIDAÇÃO DE FRONT-END ---


        // --- INÍCIO DA INTEGRAÇÃO COM BACK-END ---
        
        try {
            // 1. Envia os dados para o seu back-end Django
            // --- MUDANÇA 1: URL CORRIGIDA ---
            // O backend espera /auth/ (definido em grengame/urls.py)
            // e /login/ (definido em core/urls.py)
            const response = await fetch(`${API_URL}/auth/login/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password }),
            });

    
            const data = await response.json();

            // 3. Verifica se o back-end retornou um erro
            if (!response.ok) {
                // --- MUDANÇA 2: DETECÇÃO DE ERRO MELHORADA ---
                // Pega 'detail' (padrão do DRF) ou 'error' (da sua view customizada)
                // DRF pode retornar erros de validação como objeto {campo: [erros]}
                let errorMessage = 'Ocorreu um erro no login.';
                
                if (typeof data === 'string') {
                    errorMessage = data;
                } else if (data.detail) {
                    errorMessage = data.detail;
                } else if (data.error) {
                    errorMessage = data.error;
                } else if (data.email || data.password) {
                    // Erros de validação de campo
                    const emailError = Array.isArray(data.email) && data.email.length > 0 ? data.email[0] : null;
                    const passwordError = Array.isArray(data.password) && data.password.length > 0 ? data.password[0] : null;
                    errorMessage = emailError || passwordError || errorMessage;
                } else if (data.non_field_errors && Array .isArray(data.non_field_errors) && data.non_field_errors.length > 0) {
                    errorMessage = data.non_field_errors[0];
                }
                
                setError(errorMessage);
            } else {
                
                // --- MUDANÇA 3: SALVAR OS TOKENS ---
                // O login SÓ FUNCIONA se salvarmos o token
                if (data.access) {
                    saveTokens(data.access, data.refresh || '');
                    navigate('/');
                } else {
                    // Caso o backend retorne 200 OK mas não envie os tokens
                    setError('Resposta inválida do servidor. Token não encontrado.');
                }
            }

        } catch {
            // 5. Erro de rede (back-end desligado, etc.)
            setError('Não foi possível conectar ao servidor. Tente novamente.');
        }
        // --- FIM DA INTEGRAÇÃO COM BACK-END ---
    };

    return (
        <div className={styles.loginPage}>
            <div className={styles.loginContainer}>
                
                {/* O logo "GrenGame" */}
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
                            value={email} // O valor do input é controlado pelo 'state'
                            onChange={e => setEmail(e.target.value)} // Atualiza o 'state' ao digitar
                        />
                    </div>
                    
                    <div className={styles.inputGroup}>
                        <label htmlFor="password">Senha</label>
                        <input 
                            type="password" 
                            id="password" 
                            placeholder="********"
                            value={password} // O valor do input é controlado pelo 'state'
                            onChange={e => setPassword(e.target.value)} // Atualiza o 'state' ao digitar
                        />
                    </div>

                    {/* Área para exibir mensagens de erro */}
                    {/* Este 'div' só aparece se 'error' não estiver vazio */}
                    <div className={styles.errorMessage}>
                        {error && <p>{error}</p>}
                    </div>
                    
                    <div className={styles.buttonGroup}>
                        <button type="submit" className={styles.btnPrimary}>
                            Entrar
                        </button>
                    </div>
                    
                    <div className={styles.loginAuxLinks}>
                        <Link
                            to="/recuperar-senha"
                            className={styles.forgotPassword}
                        >
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




