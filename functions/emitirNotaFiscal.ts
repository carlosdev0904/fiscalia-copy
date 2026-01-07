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
        const {
            companyId,
            cliente_nome,
            cliente_documento,
            descricao_servico,
            valor,
            aliquota_iss,
            municipio,
            data_prestacao,
            codigo_servico
        } = await req.json();

        // Validate required fields
        const requiredFields = {
            companyId: 'ID da empresa',
            cliente_nome: 'Nome do cliente',
            cliente_documento: 'Documento do cliente',
            descricao_servico: 'Descrição do serviço',
            valor: 'Valor do serviço',
            aliquota_iss: 'Alíquota de ISS',
            municipio: 'Município',
            data_prestacao: 'Data da prestação'
        };

        for (const [field, label] of Object.entries(requiredFields)) {
            if (!eval(field)) {
                return Response.json({
                    success: false,
                    error: 'MISSING_FIELD',
                    message: `Campo obrigatório ausente: ${label}`,
                    nota_fiscal: null
                }, { status: 400 });
            }
        }

        // Get company data from Base44 database
        const companies = await base44.entities.Company.filter({ id: companyId });
        const company = companies[0];

        if (!company) {
            return Response.json({
                success: false,
                error: 'COMPANY_NOT_FOUND',
                message: 'Empresa não encontrada',
                nota_fiscal: null
            }, { status: 404 });
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
                nota_fiscal: null
            }, { status: 500 });
        }

        // Calculate ISS value
        const valorISS = (valor * aliquota_iss) / 100;
        const valorLiquido = valor - valorISS;

        // Prepare NFS-e data according to Nuvem Fiscal API
        const nfseData = {
            prestador: {
                cpf_cnpj: company.cnpj.replace(/\D/g, ''),
                inscricao_municipal: company.inscricao_municipal || ''
            },
            tomador: {
                cpf_cnpj: cliente_documento.replace(/\D/g, ''),
                nome_razao_social: cliente_nome
            },
            servico: {
                descricao: descricao_servico,
                codigo_servico: codigo_servico || '1401',
                valor_servicos: valor,
                aliquota_iss: aliquota_iss,
                valor_iss: valorISS,
                valor_liquido: valorLiquido
            },
            data_prestacao: data_prestacao,
            municipio_prestacao: municipio
        };

        // Call Nuvem Fiscal API to issue invoice
        const nuvemFiscalUrl = useSandbox
            ? 'https://api.sandbox.nuvemfiscal.com.br/v2/nfse'
            : 'https://api.nuvemfiscal.com.br/v2/nfse';

        const response = await axios.post(
            nuvemFiscalUrl,
            nfseData,
            {
                headers: {
                    'Authorization': `Bearer ${nuvemFiscalToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        // Handle Nuvem Fiscal response
        if (response.data && response.data.numero) {
            const notaFiscal = {
                numero: response.data.numero,
                codigo_verificacao: response.data.codigo_verificacao,
                status: response.data.status === 'autorizada' ? 'autorizada' : 
                        response.data.status === 'rejeitada' ? 'rejeitada' : 'pendente',
                pdf_url: response.data.pdf_url || null,
                xml_url: response.data.xml_url || null,
                data_emissao: response.data.data_emissao || new Date().toISOString()
            };

            // Save invoice to Base44 database
            const invoice = await base44.entities.Invoice.create({
                numero: notaFiscal.numero,
                codigo_verificacao: notaFiscal.codigo_verificacao,
                cliente_nome: cliente_nome,
                cliente_documento: cliente_documento,
                descricao_servico: descricao_servico,
                valor: valor,
                aliquota_iss: aliquota_iss,
                valor_iss: valorISS,
                status: notaFiscal.status,
                data_emissao: notaFiscal.data_emissao.split('T')[0],
                pdf_url: notaFiscal.pdf_url,
                xml_url: notaFiscal.xml_url,
                municipio: municipio
            });

            return Response.json({
                success: true,
                nota_fiscal: notaFiscal,
                invoice_id: invoice.id,
                error: null
            });
        } else {
            throw new Error('Invalid response from Nuvem Fiscal API');
        }

    } catch (error) {
        console.error('Error in emitirNotaFiscal:', error);

        // Map technical errors to user-friendly messages
        let userMessage = 'Erro ao emitir nota fiscal';
        let statusCode = 500;

        if (error.response) {
            const status = error.response.status;
            const data = error.response.data;

            statusCode = status;

            if (status === 401 || status === 403) {
                userMessage = 'Erro de autenticação com a prefeitura. Verifique as credenciais.';
            } else if (status === 400) {
                userMessage = data?.mensagem || 'Dados inválidos para emissão da nota fiscal.';
            } else if (status === 429) {
                userMessage = 'Muitas requisições. Tente novamente em alguns instantes.';
            } else if (status >= 500) {
                userMessage = 'Erro no servidor da prefeitura. Tente novamente mais tarde.';
            }
        } else if (error.code === 'ECONNABORTED') {
            userMessage = 'Tempo de espera esgotado. Tente novamente.';
        } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            userMessage = 'Erro de conexão com a prefeitura. Verifique sua internet.';
        }

        return Response.json({
            success: false,
            error: error.message || 'UNKNOWN_ERROR',
            message: userMessage,
            nota_fiscal: null
        }, { status: statusCode });
    }
});