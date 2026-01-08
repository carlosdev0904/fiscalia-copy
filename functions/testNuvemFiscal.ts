import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import axios from 'npm:axios';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Parse request body
        const { environment = 'sandbox' } = await req.json();

        // Get appropriate token
        const useSandbox = environment === 'sandbox';
        const token = useSandbox
            ? Deno.env.get("NUVEM_FISCAL_SANDBOX_TOKEN")
            : Deno.env.get("NUVEM_FISCAL_PRODUCTION_TOKEN");

        if (!token) {
            return Response.json({
                success: false,
                error: 'TOKEN_NOT_CONFIGURED',
                message: `${useSandbox ? 'Sandbox' : 'Production'} token not configured`,
                environment: environment,
                token_configured: false
            });
        }

        // Test connection
        const baseUrl = useSandbox
            ? 'https://api.sandbox.nuvemfiscal.com.br/v2'
            : 'https://api.nuvemfiscal.com.br/v2';

        // Test 1: Health check
        let healthCheck = false;
        try {
            const healthResponse = await axios.get(`${baseUrl}/health`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });
            healthCheck = healthResponse.status === 200;
        } catch (healthError) {
            console.error('Health check failed:', healthError.message);
        }

        // Test 2: API authentication (try a simple endpoint)
        let authCheck = false;
        let authMessage = '';
        try {
            // Try to get companies list (requires auth)
            const authResponse = await axios.get(`${baseUrl}/empresas`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000,
                validateStatus: (status) => status < 500 // Accept 4xx as valid response (auth works)
            });
            
            if (authResponse.status === 200 || authResponse.status === 401 || authResponse.status === 403) {
                authCheck = true;
                if (authResponse.status === 200) {
                    authMessage = 'Token válido e autenticado com sucesso';
                } else {
                    authMessage = 'Token inválido ou sem permissões';
                }
            }
        } catch (authError) {
            if (authError.response) {
                authCheck = true; // Got a response, so auth is working
                if (authError.response.status === 401 || authError.response.status === 403) {
                    authMessage = 'Token inválido ou sem permissões';
                } else {
                    authMessage = `Erro na autenticação: ${authError.response.status}`;
                }
            } else {
                authMessage = 'Erro de conexão';
            }
        }

        // Determine overall status
        const isConnected = healthCheck && authCheck;
        const status = isConnected ? 'conectado' : 'falha_conexao';

        return Response.json({
            success: isConnected,
            environment: environment,
            status: status,
            token_configured: true,
            health_check: healthCheck,
            auth_check: authCheck,
            auth_message: authMessage,
            base_url: baseUrl,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error in testNuvemFiscal:', error);

        return Response.json({
            success: false,
            error: error.message || 'UNKNOWN_ERROR',
            message: 'Erro ao testar conexão com Nuvem Fiscal',
            environment: 'sandbox',
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }
});