/**
 * Briefcase Storefront Server
 *
 * Serves the static storefront with Stripe Checkout integration.
 * Fully self-contained — single directory, no build step required.
 *
 * Environment variables:
 *   PORT              — Server port (default: 3000)
 *   BASE_URL          — Public-facing URL (default: http://localhost:3000)
 *   STRIPE_SECRET_KEY — Optional. Enables Stripe Checkout Session creation.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || null;

const PUBLIC_DIR = __dirname;

// Lazy-load Stripe SDK only when key is available
let stripe = null;
if (STRIPE_SECRET_KEY) {
  try {
    stripe = require('stripe')(STRIPE_SECRET_KEY);
    console.log('✓ Stripe SDK loaded — Checkout Sessions enabled');
  } catch (err) {
    console.warn('⚠ Stripe SDK not available. Install with: npm install stripe');
    console.warn('  Falling back to direct Payment Link redirects.');
  }
}

// MIME types for static files
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.zip': 'application/zip',
  '.pdf': 'application/pdf',
  '.md': 'text/markdown; charset=utf-8',
};

// ─── Helpers ──────────────────────────────────────────────

function serveStatic(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      }
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function resolvePath(requestPath) {
  let filePath = path.join(PUBLIC_DIR, requestPath);

  // Security: prevent directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return null;
  }

  try {
    if (fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
  } catch {
    // stat failed, try the path as-is
  }

  return filePath;
}

function jsonResponse(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

function loadProducts() {
  const productsPath = path.join(PUBLIC_DIR, 'products.json');
  return JSON.parse(fs.readFileSync(productsPath, 'utf-8')).products;
}

// ─── API: Create Checkout Session ─────────────────────────

/**
 * Creates a Stripe Checkout Session with a success_url that includes
 * the product ID and session ID, so the success page can show the
 * right download link.
 */
async function handleCreateCheckout(req, res) {
  let body = '';

  req.on('data', chunk => { body += chunk.toString(); });

  req.on('end', async () => {
    try {
      const { productId } = JSON.parse(body);
      const products = loadProducts();
      const product = products.find(p => p.id === productId);

      if (!product) {
        jsonResponse(res, 404, { error: 'Product not found' });
        return;
      }

      // Prefer creating a real Stripe Checkout Session
      if (stripe && STRIPE_SECRET_KEY) {
        try {
          const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            line_items: [
              {
                price_data: {
                  currency: (product.currency || 'USD').toLowerCase(),
                  product_data: {
                    name: product.name,
                    description: product.tagline,
                  },
                  unit_amount: product.price * 100, // cents
                },
                quantity: 1,
              },
            ],
            success_url: `${BASE_URL}/success.html?product=${encodeURIComponent(productId)}&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${BASE_URL}/`,
            metadata: {
              product_id: productId,
            },
          });

          jsonResponse(res, 200, { url: session.url });
          return;
        } catch (stripeErr) {
          console.error('Stripe Checkout Session error:', stripeErr.message);
          // Fall through to Payment Link fallback
        }
      }

      // Fallback: redirect to the pre-configured Stripe Payment Link
      if (product.stripe_payment_link) {
        jsonResponse(res, 200, { url: product.stripe_payment_link });
        return;
      }

      // Last resort: demo mode — redirect to success page directly
      jsonResponse(res, 200, {
        url: `/success.html?product=${encodeURIComponent(productId)}&demo=true`,
        message: 'Demo mode — no Stripe configured',
      });

    } catch (err) {
      console.error('Checkout API error:', err);
      jsonResponse(res, 400, { error: 'Invalid request' });
    }
  });
}

// ─── API: Update Stripe Payment Link return URLs ──────────

/**
 * For Stripe Payment Links, we can programmatically update their
 * after_completion.redirect.url to point to our success page with
 * the product ID embedded. This is a one-time setup endpoint.
 */
async function handleSetupReturnUrls(req, res) {
  if (!stripe || !STRIPE_SECRET_KEY) {
    jsonResponse(res, 503, { error: 'Stripe not configured — set STRIPE_SECRET_KEY' });
    return;
  }

  try {
    const products = loadProducts();
    const results = [];

    for (const product of products) {
      if (!product.stripe_payment_link) continue;

      // Extract the Payment Link ID from the URL
      // URL format: https://buy.stripe.com/xxx_xxxx or https://buy.stripe.com/xxx
      const linkId = product.stripe_payment_link.split('/').pop().split('?')[0];

      // Update the Payment Link's return_url
      const updatedLink = await stripe.paymentLinks.update(linkId, {
        after_completion: {
          type: 'redirect',
          redirect: {
            url: `${BASE_URL}/success.html?product=${encodeURIComponent(product.id)}&session_id={CHECKOUT_SESSION_ID}`,
          },
        },
      });

      results.push({
        product: product.id,
        status: 'updated',
        return_url: `${BASE_URL}/success.html?product=${product.id}&session_id={CHECKOUT_SESSION_ID}`,
      });
    }

    jsonResponse(res, 200, { results });
  } catch (err) {
    console.error('Setup return URLs error:', err);
    jsonResponse(res, 500, { error: err.message });
  }
}

// ─── Request Router ───────────────────────────────────────

function handleRequest(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  console.log(`${new Date().toISOString()} ${req.method} ${pathname}`);

  // ── API routes ──

  if (pathname === '/api/create-checkout' && req.method === 'POST') {
    return handleCreateCheckout(req, res);
  }

  if (pathname === '/api/setup-return-urls' && req.method === 'POST') {
    return handleSetupReturnUrls(req, res);
  }

  if (pathname === '/api/health') {
    return jsonResponse(res, 200, {
      status: 'ok',
      stripe: stripe ? 'connected' : 'not-configured',
      port: PORT,
      baseUrl: BASE_URL,
    });
  }

  // ── Static files ──

  const filePath = resolvePath(pathname);
  if (filePath) {
    return serveStatic(res, filePath);
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
}

// ─── Start Server ────────────────────────────────────────

const server = http.createServer(handleRequest);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════════════╗
║          💼  Briefcase Storefront            ║
║──────────────────────────────────────────────║
║  Server running on:                          ║
║  → http://0.0.0.0:${PORT}                      ║
║  → Base URL: ${BASE_URL}                      ║
║  → Stripe:   ${stripe ? '✓ Connected' : '○ Not configured (set STRIPE_SECRET_KEY)'} ║
║                                              ║
║  Ready to serve templates!                   ║
║                                              ║
║  API endpoints:                              ║
║  POST /api/create-checkout  — Create checkout ║
║  POST /api/setup-return-urls — Update links   ║
║  GET  /api/health           — Health check    ║
╚══════════════════════════════════════════════╝
  `);
});