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
        const { companyId } = await req.json();

        // Validate input
        if (!companyId) {
            return Response.json({
                success: false,
                error: 'COMPANY_ID_REQUIRED',
                message: 'ID da empresa é obrigatório',
                status: 'falha',
                mensagem: 'ID da empresa não fornecido',
                ultima_verificacao: new Date().toISOString()
            }, { status: 400 });
        }

        // Get company data from Base44 database
        const companies = await base44.entities.Company.filter({ id: companyId });
        const company = companies[0];

        if (!company) {
            return Response.json({
                success: false,
                error: 'COMPANY_NOT_FOUND',
                message: 'Empresa não encontrada',
                status: 'falha',
                mensagem: 'Empresa não encontrada',
                ultima_verificacao: new Date().toISOString()
            }, { status: 404 });
        }

        // Get Nuvem Fiscal token from environment
        const useSandbox = Deno.env.get("NUVEM_FISCAL_USE_SANDBOX") !== 'false';
        const nuvemFiscalToken = useSandbox
            ? Deno.env.get("NUVEM_FISCAL_SANDBOX_TOKEN")
            : Deno.env.get("NUVEM_FISCAL_PRODUCTION_TOKEN");

        if (!nuvemFiscalToken) {
            const statusData = {
                company_id: companyId,
                status: 'falha',
                mensagem: 'Token da Nuvem Fiscal não configurado',
                ultima_verificacao: new Date().toISOString()
            };

            // Update or create status
            const existingStatus = await base44.entities.FiscalIntegrationStatus.filter({
                company_id: companyId
            });

            if (existingStatus.length > 0) {
                await base44.entities.FiscalIntegrationStatus.update(
                    existingStatus[0].id,
                    statusData
                );
            } else {
                await base44.entities.FiscalIntegrationStatus.create(statusData);
            }

            return Response.json({
                success: false,
                error: 'TOKEN_NOT_CONFIGURED',
                message: 'Token da Nuvem Fiscal não configurado',
                status: 'falha',
                mensagem: 'Token da Nuvem Fiscal não configurado',
                ultima_verificacao: new Date().toISOString()
            }, { status: 500 });
        }

        // Test connection to Nuvem Fiscal API
        const nuvemFiscalUrl = useSandbox
            ? 'https://api.sandbox.nuvemfiscal.com.br/v2/health'
            : 'https://api.nuvemfiscal.com.br/v2/health';

        try {
            const response = await axios.get(nuvemFiscalUrl, {
                headers: {
                    'Authorization': `Bearer ${nuvemFiscalToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000 // 10 seconds timeout
            });

            // Connection successful
            const status = response.status === 200 ? 'conectado' : 'falha';
            const mensagem = status === 'conectado'
                ? 'Conexão com a prefeitura estabelecida com sucesso'
                : 'Falha na conexão com a prefeitura';

            // Update FiscalIntegrationStatus in database
            const existingStatus = await base44.entities.FiscalIntegrationStatus.filter({
                company_id: companyId
            });

            const statusData = {
                company_id: companyId,
                status: status,
                mensagem: mensagem,
                ultima_verificacao: new Date().toISOString()
            };

            if (existingStatus.length > 0) {
                await base44.entities.FiscalIntegrationStatus.update(
                    existingStatus[0].id,
                    statusData
                );
            } else {
                await base44.entities.FiscalIntegrationStatus.create(statusData);
            }

            return Response.json({
                success: true,
                status: status,
                mensagem: mensagem,
                ultima_verificacao: new Date().toISOString()
            });

        } catch (apiError) {
            // Connection failed
            const mensagem = apiError.response?.status === 401 || apiError.response?.status === 403
                ? 'Erro de autenticação. Verifique as credenciais da Nuvem Fiscal.'
                : 'Falha na conexão com a prefeitura. Verifique sua conexão e credenciais.';

            // Update status in database
            const existingStatus = await base44.entities.FiscalIntegrationStatus.filter({
                company_id: companyId
            });

            const statusData = {
                company_id: companyId,
                status: 'falha',
                mensagem: mensagem,
                ultima_verificacao: new Date().toISOString()
            };

            if (existingStatus.length > 0) {
                await base44.entities.FiscalIntegrationStatus.update(
                    existingStatus[0].id,
                    statusData
                );
            } else {
                await base44.entities.FiscalIntegrationStatus.create(statusData);
            }

            return Response.json({
                success: false,
                status: 'falha',
                mensagem: mensagem,
                ultima_verificacao: new Date().toISOString(),
                error: apiError.message
            });
        }

    } catch (error) {
        console.error('Error in verificarConexaoFiscal:', error);

        return Response.json({
            success: false,
            error: error.message || 'UNKNOWN_ERROR',
            message: 'Erro ao verificar conexão fiscal',
            status: 'falha',
            mensagem: 'Erro ao verificar conexão com a prefeitura',
            ultima_verificacao: new Date().toISOString()
        }, { status: 500 });
    }
});