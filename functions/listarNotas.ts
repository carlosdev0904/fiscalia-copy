import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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
            limit = 50,
            offset = 0,
            status
        } = await req.json();

        // Validate input
        if (!companyId) {
            return Response.json({
                success: false,
                error: 'COMPANY_ID_REQUIRED',
                message: 'ID da empresa é obrigatório',
                notas: [],
                total: 0
            }, { status: 400 });
        }

        // Build query filter
        let query = {};
        
        if (status) {
            query.status = status;
        }

        // Get invoices from database
        // Note: Invoice entity doesn't have company_id field yet
        // For now, listing all user's invoices with optional status filter
        const allInvoices = await base44.entities.Invoice.filter(query);
        
        // Sort by creation date (most recent first)
        const sortedInvoices = allInvoices.sort((a, b) => {
            const dateA = new Date(a.created_date || a.data_emissao);
            const dateB = new Date(b.created_date || b.data_emissao);
            return dateB - dateA;
        });

        // Apply pagination
        const total = sortedInvoices.length;
        const paginatedInvoices = sortedInvoices.slice(offset, offset + limit);

        // Format response
        const notas = paginatedInvoices.map(invoice => ({
            id: invoice.id,
            numero: invoice.numero,
            cliente_nome: invoice.cliente_nome,
            cliente_documento: invoice.cliente_documento,
            descricao_servico: invoice.descricao_servico,
            valor: invoice.valor,
            valor_iss: invoice.valor_iss,
            aliquota_iss: invoice.aliquota_iss,
            status: invoice.status,
            data_emissao: invoice.data_emissao,
            pdf_url: invoice.pdf_url,
            xml_url: invoice.xml_url,
            codigo_verificacao: invoice.codigo_verificacao,
            municipio: invoice.municipio,
            created_date: invoice.created_date
        }));

        return Response.json({
            success: true,
            notas: notas,
            total: total,
            limit: limit,
            offset: offset
        });

    } catch (error) {
        console.error('Error in listarNotas:', error);

        return Response.json({
            success: false,
            error: error.message || 'UNKNOWN_ERROR',
            message: 'Erro ao listar notas fiscais',
            notas: [],
            total: 0
        }, { status: 500 });
    }
});