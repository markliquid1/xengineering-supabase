import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.0.0?target=deno';
Deno.serve(async (req)=>{
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return new Response(JSON.stringify({
      error: 'No signature'
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
    apiVersion: '2023-10-16'
  });
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  let event;
  let body;
  try {
    body = await req.text();
    event = await stripe.webhooks.constructEventAsync(body, signature, Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '');
  } catch (err) {
    return new Response(JSON.stringify({
      error: err.message
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  await supabase.from('stripe_webhook_events').insert({
    event_id: event.id,
    event_type: event.type,
    payload: event
  });
  try {
    if (event.type === 'checkout.session.completed') {
      const sessionData = event.data.object;
      const { data: existing } = await supabase.from('orders').select('id').eq('stripe_payment_intent_id', sessionData.payment_intent).single();
      if (existing) {
        await supabase.from('stripe_webhook_events').update({
          processed: true,
          error_message: 'Duplicate'
        }).eq('event_id', event.id);
        return new Response(JSON.stringify({
          received: true,
          duplicate: true
        }), {
          headers: {
            "Content-Type": "application/json"
          }
        });
      }
      const session = await stripe.checkout.sessions.retrieve(sessionData.id, {
        expand: [
          'line_items',
          'line_items.data.price.product'
        ]
      });
      const { data: order, error: orderError } = await supabase.from('orders').insert({
        stripe_payment_intent_id: session.payment_intent,
        stripe_customer_id: session.customer,
        stripe_customer_email: session.customer_details?.email || '',
        stripe_customer_name: session.customer_details?.name || '',
        amount_total: session.amount_total || 0,
        currency: session.currency || 'usd',
        shipping_address: session.shipping_details
      }).select('id').single();
      if (orderError) throw orderError;
      const lineItems = session.line_items?.data || [];
      for (const item of lineItems){
        const product = item.price?.product;
        for(let i = 0; i < (item.quantity || 1); i++){
          await supabase.from('order_items').insert({
            order_id: order.id,
            stripe_line_item_id: item.id,
            product_name: item.description || product?.name || 'Unknown',
            stripe_product_id: typeof product === 'string' ? product : product?.id
          });
        }
      }
      await supabase.from('stripe_webhook_events').update({
        processed: true
      }).eq('event_id', event.id);
    }
    if (event.type === 'charge.refunded') {
      const charge = event.data.object;
      await supabase.from('orders').update({
        refunded: true,
        refund_date: new Date().toISOString()
      }).eq('stripe_payment_intent_id', charge.payment_intent);
      await supabase.from('stripe_webhook_events').update({
        processed: true
      }).eq('event_id', event.id);
    }
    return new Response(JSON.stringify({
      received: true
    }), {
      headers: {
        "Content-Type": "application/json"
      },
      status: 200
    });
  } catch (error) {
    await supabase.from('stripe_webhook_events').update({
      processed: false,
      error_message: error.message
    }).eq('event_id', event.id);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
});
