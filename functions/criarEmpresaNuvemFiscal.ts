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
        const { companyId, dados_empresa } = await req.json();

        // Validate input
        if (!companyId) {
            return Response.json({
                success: false,
                error: 'COMPANY_ID_REQUIRED',
                message: 'ID da empresa é obrigatório',
                nuvem_fiscal_id: null,
                mensagem: 'ID da empresa não fornecido'
            }, { status: 400 });
        }

        if (!dados_empresa) {
            return Response.json({
                success: false,
                error: 'COMPANY_DATA_REQUIRED',
                message: 'Dados da empresa são obrigatórios',
                nuvem_fiscal_id: null,
                mensagem: 'Dados da empresa não fornecidos'
            }, { status: 400 });
        }

        const requiredFields = {
            razao_social: 'Razão social',
            cnpj: 'CNPJ',
            inscricao_municipal: 'Inscrição municipal',
            municipio: 'Município',
            uf: 'UF',
            email: 'Email',
            telefone: 'Telefone'
        };

        for (const [field, label] of Object.entries(requiredFields)) {
            if (!dados_empresa[field]) {
                return Response.json({
                    success: false,
                    error: 'MISSING_FIELD',
                    message: `Campo obrigatório ausente: ${label}`,
                    nuvem_fiscal_id: null,
                    mensagem: `Campo ${label} é obrigatório`
                }, { status: 400 });
            }
        }

        // Get Nuvem Fiscal token from environment
        const useSandbox = Deno.env.get("NUVEM_FISCAL_USE_SANDBOX") !== 'false';
        const nuvemFiscalToken = useSandbox
            ? Deno.env.get("NUVEM_FISCAL_SANDBOX_TOKEN")
            : Deno.env.get("NUVEM_FISCAL_PRODUCTION_TOKEN");

        if (!nuvemFiscalToken) {
            return Response.json({
                success: false,
                error: 'API_NOT_CONFIGURED',
                message: 'Token da Nuvem Fiscal não configurado',
                nuvem_fiscal_id: null,
                mensagem: 'Token da Nuvem Fiscal não configurado'
            }, { status: 500 });
        }

        // Prepare company registration data in Nuvem Fiscal format
        const registrationData = {
            cpf_cnpj: dados_empresa.cnpj.replace(/\D/g, ''), // Remove formatting
            nome_razao_social: dados_empresa.razao_social,
            nome_fantasia: dados_empresa.nome_fantasia || dados_empresa.razao_social,
            email: dados_empresa.email,
            fone: dados_empresa.telefone.replace(/\D/g, ''), // Remove formatting
            inscricao_estadual: "",
            inscricao_municipal: dados_empresa.inscricao_municipal || "",
            endereco: {
                logradouro: dados_empresa.logradouro || "",
                numero: dados_empresa.numero || "S/N",
                complemento: dados_empresa.complemento || "",
                bairro: dados_empresa.bairro || "Centro",
                cidade: dados_empresa.municipio,
                uf: dados_empresa.uf.toUpperCase(),
                codigo_municipio: dados_empresa.codigo_municipio || "",
                cep: dados_empresa.cep ? dados_empresa.cep.replace(/\D/g, '') : "",
                codigo_pais: "1058",
                pais: "Brasil"
            }
        };

        // Call Nuvem Fiscal API to register company (correct endpoint without /v2)
        const nuvemFiscalUrl = useSandbox
            ? 'https://api.sandbox.nuvemfiscal.com.br/empresas'
            : 'https://api.nuvemfiscal.com.br/empresas';

        const response = await axios.post(
            nuvemFiscalUrl,
            registrationData,
            {
                headers: {
                    'Authorization': `Bearer ${nuvemFiscalToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        // Handle response
        if (response.data && response.data.id) {
            const nuvemFiscalId = response.data.id;

            // Update company in Base44 database with Nuvem Fiscal ID
            await base44.entities.Company.update(companyId, {
                nuvem_fiscal_id: nuvemFiscalId,
                nuvem_fiscal_registered_at: new Date().toISOString()
            });

            return Response.json({
                success: true,
                nuvem_fiscal_id: nuvemFiscalId,
                mensagem: 'Empresa registrada com sucesso na Nuvem Fiscal'
            });
        } else {
            throw new Error('Invalid response from Nuvem Fiscal API');
        }

    } catch (error) {
        console.error('Error in criarEmpresaNuvemFiscal:', error);

        // Map technical errors to user-friendly messages
        let userMessage = 'Erro ao registrar empresa na Nuvem Fiscal';
        let statusCode = 500;

        if (error.response) {
            const status = error.response.status;
            const data = error.response.data;

            statusCode = status;

            if (status === 401 || status === 403) {
                userMessage = 'Erro de autenticação. Verifique as credenciais da Nuvem Fiscal.';
            } else if (status === 400) {
                userMessage = data?.mensagem || 'Dados inválidos. Verifique as informações da empresa.';
            } else if (status === 409) {
                userMessage = 'Empresa já está registrada na Nuvem Fiscal.';
            } else if (status >= 500) {
                userMessage = 'Erro no servidor da Nuvem Fiscal. Tente novamente mais tarde.';
            }
        } else if (error.code === 'ECONNABORTED') {
            userMessage = 'Tempo de espera esgotado. Tente novamente.';
        }

        return Response.json({
            success: false,
            error: error.message || 'UNKNOWN_ERROR',
            message: userMessage,
            nuvem_fiscal_id: null,
            mensagem: userMessage
        }, { status: statusCode });
    }
});