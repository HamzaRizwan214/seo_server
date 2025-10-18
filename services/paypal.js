import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

class PayPalService {
  constructor() {
    this.clientId = process.env.PAYPAL_CLIENT_ID;
    this.clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    this.mode = process.env.PAYPAL_MODE || 'sandbox';
    this.baseURL = this.mode === 'live' 
      ? 'https://api-m.paypal.com' 
      : 'https://api-m.sandbox.paypal.com';
    
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  async getAccessToken() {
    try {
      // Check if we have a valid token
      if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
        return this.accessToken;
      }

      const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      
      const response = await axios.post(
        `${this.baseURL}/v1/oauth2/token`,
        'grant_type=client_credentials',
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      this.accessToken = response.data.access_token;
      // Set expiry to 90% of actual expiry time for safety
      this.tokenExpiry = Date.now() + (response.data.expires_in * 900);
      
      console.log('✅ PayPal access token obtained');
      return this.accessToken;
    } catch (error) {
      console.error('❌ PayPal access token error:', error.response?.data || error.message);
      throw new Error('Failed to get PayPal access token');
    }
  }

  async createOrder(orderData) {
    try {
      const accessToken = await this.getAccessToken();
      const { amount, currency = 'USD', orderId, description } = orderData;

      const requestBody = {
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: orderId,
          description: description,
          amount: {
            currency_code: currency,
            value: amount.toFixed(2)
          }
        }],
        application_context: {
          return_url: `${process.env.FRONTEND_URL}/order-success`,
          cancel_url: `${process.env.FRONTEND_URL}/checkout`,
          brand_name: 'SEO by Amanda',
          landing_page: 'BILLING',
          user_action: 'PAY_NOW'
        }
      };

      const response = await axios.post(
        `${this.baseURL}/v2/checkout/orders`,
        requestBody,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'PayPal-Request-Id': `${orderId}-${Date.now()}`
          }
        }
      );

      console.log('✅ PayPal order created:', response.data.id);
      return response.data;
    } catch (error) {
      console.error('❌ PayPal create order error:', error.response?.data || error.message);
      throw new Error('Failed to create PayPal order');
    }
  }

  async captureOrder(paypalOrderId) {
    try {
      const accessToken = await this.getAccessToken();

      const response = await axios.post(
        `${this.baseURL}/v2/checkout/orders/${paypalOrderId}/capture`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('✅ PayPal order captured:', paypalOrderId);
      return response.data;
    } catch (error) {
      console.error('❌ PayPal capture order error:', error.response?.data || error.message);
      throw new Error('Failed to capture PayPal order');
    }
  }

  async getOrderDetails(paypalOrderId) {
    try {
      const accessToken = await this.getAccessToken();

      const response = await axios.get(
        `${this.baseURL}/v2/checkout/orders/${paypalOrderId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('❌ PayPal get order details error:', error.response?.data || error.message);
      throw new Error('Failed to get PayPal order details');
    }
  }

  async refundPayment(captureId, amount, currency = 'USD') {
    try {
      const accessToken = await this.getAccessToken();

      const requestBody = {
        amount: {
          currency_code: currency,
          value: amount.toFixed(2)
        }
      };

      const response = await axios.post(
        `${this.baseURL}/v2/payments/captures/${captureId}/refund`,
        requestBody,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('✅ PayPal refund processed:', response.data.id);
      return response.data;
    } catch (error) {
      console.error('❌ PayPal refund error:', error.response?.data || error.message);
      throw new Error('Failed to process PayPal refund');
    }
  }

  async verifyWebhook(headers, body, webhookId) {
    try {
      const accessToken = await this.getAccessToken();

      const requestBody = {
        auth_algo: headers['paypal-auth-algo'],
        cert_id: headers['paypal-cert-id'],
        transmission_id: headers['paypal-transmission-id'],
        transmission_sig: headers['paypal-transmission-sig'],
        transmission_time: headers['paypal-transmission-time'],
        webhook_id: webhookId,
        webhook_event: body
      };

      const response = await axios.post(
        `${this.baseURL}/v1/notifications/verify-webhook-signature`,
        requestBody,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.verification_status === 'SUCCESS';
    } catch (error) {
      console.error('❌ PayPal webhook verification error:', error.response?.data || error.message);
      return false;
    }
  }

  extractPaymentInfo(paypalResponse) {
    try {
      const purchaseUnit = paypalResponse.purchase_units[0];
      const capture = purchaseUnit.payments?.captures?.[0];
      
      return {
        paypalOrderId: paypalResponse.id,
        captureId: capture?.id,
        payerId: paypalResponse.payer?.payer_id,
        payerEmail: paypalResponse.payer?.email_address,
        amount: parseFloat(capture?.amount?.value || purchaseUnit.amount.value),
        currency: capture?.amount?.currency_code || purchaseUnit.amount.currency_code,
        status: capture?.status || paypalResponse.status,
        referenceId: purchaseUnit.reference_id,
        transactionFee: capture?.seller_receivable_breakdown?.paypal_fee?.value || '0.00'
      };
    } catch (error) {
      console.error('❌ Error extracting PayPal payment info:', error);
      throw new Error('Failed to extract payment information');
    }
  }

  async testConnection() {
    try {
      await this.getAccessToken();
      console.log('✅ PayPal service connection verified');
      return true;
    } catch (error) {
      console.error('❌ PayPal service connection failed:', error);
      return false;
    }
  }
}

export const paypalService = new PayPalService();
export default PayPalService;