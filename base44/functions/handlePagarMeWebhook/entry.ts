import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Get webhook secret from environment
        const webhookSecret = Deno.env.get("PAGARME_WEBHOOK_SECRET");
        if (!webhookSecret) {
            return Response.json({
                success: false,
                error: 'WEBHOOK_SECRET_NOT_CONFIGURED',
                message: 'PAGARME_WEBHOOK_SECRET not configured'
            }, { status: 500 });
        }

        // Parse request body
        const bodyText = await req.text();
        const body = JSON.parse(bodyText);

        // Get signature from headers
        const signature = req.headers.get('x-hub-signature') || 
                         req.headers.get('x-pagarme-signature') ||
                         req.headers.get('signature');

        if (!signature) {
            return Response.json({
                success: false,
                error: 'MISSING_SIGNATURE',
                message: 'Webhook signature not provided'
            }, { status: 400 });
        }

        // Verify signature using Web Crypto API
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            'raw',
            encoder.encode(webhookSecret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );

        const signatureBuffer = await crypto.subtle.sign(
            'HMAC',
            key,
            encoder.encode(bodyText)
        );

        const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

        // Compare signatures (handle both with and without 'sha256=' prefix)
        const cleanSignature = signature.replace('sha256=', '');
        if (cleanSignature !== expectedSignature) {
            return Response.json({
                success: false,
                error: 'INVALID_SIGNATURE',
                message: 'Webhook signature validation failed'
            }, { status: 401 });
        }

        // Extract event data
        const eventType = body.type || body.event;
        const eventData = body.data || body;

        // Process different event types
        let result;
        switch (eventType) {
            case 'payment.approved':
            case 'payment.paid':
                result = await handlePaymentApproved(base44, eventData);
                break;

            case 'payment.failed':
            case 'payment.refused':
                result = await handlePaymentFailed(base44, eventData);
                break;

            case 'subscription.canceled':
                result = await handleSubscriptionCanceled(base44, eventData);
                break;

            case 'subscription.created':
                result = await handleSubscriptionCreated(base44, eventData);
                break;

            case 'subscription.updated':
                result = await handleSubscriptionUpdated(base44, eventData);
                break;

            default:
                result = {
                    success: true,
                    message: `Event type ${eventType} not handled`,
                    processed: false
                };
        }

        return Response.json(result);

    } catch (error) {
        console.error('Error in handlePagarMeWebhook:', error);
        return Response.json({
            success: false,
            error: error.message || 'UNKNOWN_ERROR',
            message: 'Erro ao processar webhook do Pagar.me'
        }, { status: 500 });
    }
});

/**
 * Handle payment approved event
 */
async function handlePaymentApproved(base44, eventData) {
    const userId = eventData.customer?.id || eventData.user_id;
    const paymentId = eventData.id;
    const amount = eventData.amount / 100; // Convert from cents

    // Create notification for payment approval
    await base44.asServiceRole.entities.Notification.create({
        titulo: 'Pagamento aprovado',
        mensagem: `Seu pagamento de R$ ${amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} foi aprovado.`,
        tipo: 'sucesso'
    });

    return {
        success: true,
        message: 'Payment approved',
        userId: userId,
        paymentId: paymentId
    };
}

/**
 * Handle payment failed event
 */
async function handlePaymentFailed(base44, eventData) {
    const userId = eventData.customer?.id || eventData.user_id;
    const reason = eventData.refuse_reason || 'Pagamento recusado';

    // Create notification for payment failure
    await base44.asServiceRole.entities.Notification.create({
        titulo: 'Pagamento recusado',
        mensagem: `Seu pagamento foi recusado: ${reason}. Por favor, verifique seus dados e tente novamente.`,
        tipo: 'erro'
    });

    return {
        success: true,
        message: 'Payment failed notification created',
        userId: userId,
        reason: reason
    };
}

/**
 * Handle subscription canceled event
 */
async function handleSubscriptionCanceled(base44, eventData) {
    const userId = eventData.customer?.id || eventData.user_id;

    // Create notification for subscription cancellation
    await base44.asServiceRole.entities.Notification.create({
        titulo: 'Assinatura cancelada',
        mensagem: 'Sua assinatura foi cancelada. Você terá acesso até o final do período pago.',
        tipo: 'alerta'
    });

    return {
        success: true,
        message: 'Subscription canceled notification created',
        userId: userId
    };
}

/**
 * Handle subscription created event
 */
async function handleSubscriptionCreated(base44, eventData) {
    const userId = eventData.customer?.id || eventData.user_id;

    // Create notification for new subscription
    await base44.asServiceRole.entities.Notification.create({
        titulo: 'Assinatura ativada',
        mensagem: 'Sua assinatura foi ativada com sucesso. Bem-vindo!',
        tipo: 'sucesso'
    });

    return {
        success: true,
        message: 'Subscription created notification sent',
        userId: userId
    };
}

/**
 * Handle subscription updated event
 */
async function handleSubscriptionUpdated(base44, eventData) {
    const userId = eventData.customer?.id || eventData.user_id;
    const status = eventData.status;

    // Map Pagar.me status to internal status
    let internalStatus = 'active';
    let notificationMessage = 'Sua assinatura foi atualizada.';
    
    if (status === 'canceled') {
        internalStatus = 'canceled';
        notificationMessage = 'Sua assinatura foi cancelada.';
    } else if (status === 'unpaid') {
        internalStatus = 'delinquent';
        notificationMessage = 'Há pagamentos pendentes na sua assinatura. Por favor, regularize para continuar usando o serviço.';
    }

    // Create notification for subscription update
    await base44.asServiceRole.entities.Notification.create({
        titulo: 'Assinatura atualizada',
        mensagem: notificationMessage,
        tipo: status === 'canceled' || status === 'unpaid' ? 'alerta' : 'info'
    });

    return {
        success: true,
        message: 'Subscription updated',
        userId: userId,
        status: internalStatus
    };
}