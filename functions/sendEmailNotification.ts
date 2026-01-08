import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Parse request body
        const { to, subject, message, type = 'info' } = await req.json();

        // Validate input
        if (!to || !subject || !message) {
            return Response.json({
                success: false,
                error: 'MISSING_FIELDS',
                message: 'Campos obrigatórios: to, subject, message',
                emailSent: false
            }, { status: 400 });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(to)) {
            return Response.json({
                success: false,
                error: 'INVALID_EMAIL',
                message: 'Email inválido',
                emailSent: false
            }, { status: 400 });
        }

        // Convert plain text to HTML
        const htmlBody = convertToHTML(message, type);

        // Send email using Base44 Core integration
        await base44.asServiceRole.integrations.Core.SendEmail({
            from_name: 'FiscalAI',
            to: to,
            subject: subject,
            body: htmlBody
        });

        return Response.json({
            success: true,
            emailSent: true,
            message: 'Email enviado com sucesso',
            to: to,
            subject: subject
        });

    } catch (error) {
        console.error('Error in sendEmailNotification:', error);

        return Response.json({
            success: false,
            error: error.message || 'UNKNOWN_ERROR',
            message: 'Erro ao enviar notificação por email',
            emailSent: false
        }, { status: 500 });
    }
});

/**
 * Convert plain text to HTML email
 */
function convertToHTML(text, type) {
    const colors = {
        success: '#10b981',
        error: '#ef4444',
        info: '#3b82f6',
        warning: '#f59e0b'
    };

    const color = colors[type] || colors.info;

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: ${color}; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
        .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>FiscalAI</h2>
        </div>
        <div class="content">
          ${text.replace(/\n/g, '<br>')}
        </div>
        <div class="footer">
          <p>Esta é uma mensagem automática do FiscalAI.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}