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
        const { notaId, numero } = await req.json();

        // Validate input
        if (!notaId && !numero) {
            return Response.json({
                success: false,
                error: 'MISSING_IDENTIFIER',
                message: 'ID da nota ou número é obrigatório',
                status: null,
                detalhes: null,
                updated_at: null
            }, { status: 400 });
        }

        // Get invoice from Base44 database
        let invoice;
        if (notaId) {
            const invoices = await base44.entities.Invoice.filter({ id: notaId });
            invoice = invoices[0];
        } else {
            const invoices = await base44.entities.Invoice.filter({ numero: numero });
            invoice = invoices[0];
        }

        if (!invoice) {
            return Response.json({
                success: false,
                error: 'INVOICE_NOT_FOUND',
                message: 'Nota fiscal não encontrada',
                status: null,
                detalhes: null,
                updated_at: null
            }, { status: 404 });
        }

        // If invoice is already in final state, return it
        if (invoice.status === 'autorizada' || invoice.status === 'rejeitada' || invoice.status === 'cancelada') {
            return Response.json({
                success: true,
                status: invoice.status,
                detalhes: `Nota fiscal ${invoice.numero} está ${invoice.status}`,
                updated_at: invoice.updated_date || invoice.created_date
            });
        }

        // Query Nuvem Fiscal API for current status
        const useSandbox = Deno.env.get("NUVEM_FISCAL_USE_SANDBOX") !== 'false';
        const nuvemFiscalToken = useSandbox
            ? Deno.env.get("NUVEM_FISCAL_SANDBOX_TOKEN")
            : Deno.env.get("NUVEM_FISCAL_PRODUCTION_TOKEN");

        if (!nuvemFiscalToken) {
            return Response.json({
                success: false,
                error: 'API_NOT_CONFIGURED',
                message: 'Token da Nuvem Fiscal não configurado',
                status: null,
                detalhes: null,
                updated_at: null
            }, { status: 500 });
        }

        const nuvemFiscalUrl = useSandbox
            ? 'https://api.sandbox.nuvemfiscal.com.br/v2/nfse'
            : 'https://api.nuvemfiscal.com.br/v2/nfse';

        // Query by invoice number
        const response = await axios.get(
            `${nuvemFiscalUrl}/${invoice.numero}`,
            {
                headers: {
                    'Authorization': `Bearer ${nuvemFiscalToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        // Parse response
        const status = response.data.status;
        let mappedStatus = 'pendente';

        if (status === 'autorizada' || status === 'aprovada') {
            mappedStatus = 'autorizada';
        } else if (status === 'rejeitada' || status === 'rejeitado') {
            mappedStatus = 'rejeitada';
        } else if (status === 'cancelada') {
            mappedStatus = 'cancelada';
        }

        // Update invoice in database
        await base44.entities.Invoice.update(invoice.id, {
            status: mappedStatus
        });

        return Response.json({
            success: true,
            status: mappedStatus,
            detalhes: response.data.mensagem || `Status da nota fiscal: ${mappedStatus}`,
            updated_at: response.data.updated_at || new Date().toISOString()
        });

    } catch (error) {
        console.error('Error in consultarStatusNota:', error);

        let userMessage = 'Erro ao consultar status da nota fiscal';
        let statusCode = 500;

        if (error.response) {
            if (error.response.status === 404) {
                userMessage = 'Nota fiscal não encontrada na prefeitura.';
                statusCode = 404;
            } else if (error.response.status === 401 || error.response.status === 403) {
                userMessage = 'Erro de autenticação. Verifique as credenciais.';
                statusCode = 401;
            }
        }

        return Response.json({
            success: false,
            error: error.message || 'UNKNOWN_ERROR',
            message: userMessage,
            status: null,
            detalhes: null,
            updated_at: null
        }, { status: statusCode });
    }
});