import Stripe from "stripe";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Get the directory of this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from the server root directory
dotenv.config({ path: path.join(__dirname, "../.env") });

class StripeService {
  constructor() {
    console.log(
      `🔍 Stripe service constructor - SECRET_KEY: ${
        process.env.STRIPE_SECRET_KEY
          ? process.env.STRIPE_SECRET_KEY.substring(0, 12) + "..."
          : "NOT FOUND"
      }`
    );

    if (!process.env.STRIPE_SECRET_KEY) {
      console.warn(
        "⚠️  Stripe secret key not found. Stripe payments will not work."
      );
      this.stripe = null;
      return;
    }

    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    console.log("✅ Stripe service initialized");
  }

  async testConnection() {
    try {
      if (!this.stripe) {
        console.log("❌ Stripe not initialized - missing secret key");
        return false;
      }

      // Test the connection by retrieving account information
      const account = await this.stripe.accounts.retrieve();
      console.log(
        `✅ Stripe connection successful - Account ID: ${account.id}`
      );
      return true;
    } catch (error) {
      console.error("❌ Stripe connection failed:", error.message);
      return false;
    }
  }

  async createPaymentIntent(orderData) {
    try {
      const {
        amount,
        currency = "usd",
        orderId,
        description,
        customerEmail,
      } = orderData;

      if (!this.stripe) {
        throw new Error("Stripe not initialized");
      }

      // Create payment intent
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: currency.toLowerCase(),
        metadata: {
          orderId: orderId,
          description: description,
        },
        receipt_email: customerEmail,
        description: description,
      });

      return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: paymentIntent.status,
      };
    } catch (error) {
      console.error("Stripe payment intent creation error:", error);
      throw new Error(`Failed to create payment intent: ${error.message}`);
    }
  }

  async confirmPayment(paymentIntentId) {
    try {
      if (!this.stripe) {
        throw new Error("Stripe not initialized");
      }

      const paymentIntent = await this.stripe.paymentIntents.retrieve(
        paymentIntentId
      );

      return {
        id: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount / 100, // Convert back to dollars
        currency: paymentIntent.currency,
        paymentMethod: paymentIntent.payment_method,
        receiptUrl: paymentIntent.charges?.data?.[0]?.receipt_url,
        created: paymentIntent.created,
      };
    } catch (error) {
      console.error("Stripe payment confirmation error:", error);
      throw new Error(`Failed to confirm payment: ${error.message}`);
    }
  }

  async handleWebhook(payload, signature) {
    try {
      if (!this.stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
        throw new Error("Stripe webhook not configured");
      }

      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );

      return event;
    } catch (error) {
      console.error("Stripe webhook error:", error);
      throw new Error(
        `Webhook signature verification failed: ${error.message}`
      );
    }
  }

  async getPaymentIntent(paymentIntentId) {
    try {
      if (!this.stripe) {
        throw new Error("Stripe not initialized");
      }

      const paymentIntent = await this.stripe.paymentIntents.retrieve(
        paymentIntentId
      );

      return paymentIntent;
    } catch (error) {
      console.error("Stripe get payment intent error:", error);
      throw new Error(`Failed to retrieve payment intent: ${error.message}`);
    }
  }

  extractPaymentInfo(paymentIntent) {
    return {
      stripePaymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency,
      status: paymentIntent.status,
      paymentMethod: paymentIntent.payment_method,
      receiptUrl: paymentIntent.charges?.data?.[0]?.receipt_url,
      created: new Date(paymentIntent.created * 1000),
    };
  }
}

export const stripeService = new StripeService();
export default StripeService;
