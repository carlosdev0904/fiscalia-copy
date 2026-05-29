import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Base44 Backend Function: listInvoices
 * Lists invoices for a company
 * 
 * @param {Object} params - Function parameters
 * @param {string} params.companyId - Company ID (optional, if not provided returns all user's invoices)
 * @param {number} params.limit - Maximum number of results (optional, default: 50)
 * @param {number} params.offset - Offset for pagination (optional, default: 0)
 * @param {string} params.status - Status filter (optional)
 * @returns {status: "success" | "error", message: string, invoices?: array, total?: number}
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ status: "error", message: 'Não autorizado' }, { status: 401 });
    }

    // Parse request body
    const params = await req.json();

    // Build query filter
    const query = {};
    
    if (params.companyId) {
      query.company_id = params.companyId;
    }
    
    if (params.status) {
      query.status = params.status;
    }

    // Get invoices from database
    const limit = params.limit || 50;
    const offset = params.offset || 0;
    
    const invoices = await base44.asServiceRole.entities.Invoice.filter(
      query,
      '-created_date',
      limit
    );

    // Apply offset if needed (since filter doesn't support skip directly)
    const paginatedInvoices = offset > 0 ? invoices.slice(offset) : invoices;

    return Response.json({
      status: "success",
      message: `${paginatedInvoices.length} nota(s) encontrada(s)`,
      invoices: paginatedInvoices,
      total: invoices.length
    });

  } catch (error) {
    console.error('Error in listInvoices:', error);

    return Response.json({
      status: "error",
      message: "Erro ao listar notas fiscais"
    }, { status: 500 });
  }
});