/**
 * OpenAPI 3.1 specification (hand-authored, dependency-free).
 *
 * Served at:
 *   GET /api/openapi.json   — machine-readable spec (for SDKs, AI agents)
 *   GET /api/docs           — Swagger UI (loads from CDN, no npm dep added)
 *
 * Covers the stable public surface. Purely descriptive — adds no behaviour.
 */

const SERVER_URL = process.env.PUBLIC_API_URL ?? 'https://olomipay-production.up.railway.app';

export const openapiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'OlomiPay API',
    version: '3.0.0',
    description:
      'Mobile Money ↔ Stellar payment gateway. Bearer-JWT authenticated. ' +
      'All money endpoints require a 6-digit PIN and pass a fraud pre-screen. ' +
      'Building Trust Through Blockchain.',
    contact: { name: 'OlomiPay', url: 'https://olomipay.vercel.app' },
  },
  servers: [{ url: SERVER_URL, description: 'Production' }],
  tags: [
    { name: 'Auth',    description: 'Registration, login, token refresh' },
    { name: 'Wallet',  description: 'Balances, receive QR, account info' },
    { name: 'Send',    description: 'Peer-to-peer transfers (USDC / XLM)' },
    { name: 'Deposit', description: 'Mobile money on-ramp + fee preview' },
    { name: 'System',  description: 'Health, readiness, metrics' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: { success: { type: 'boolean', example: false }, error: { type: 'string' } },
      },
      Balance: {
        type: 'object',
        properties: {
          balance: {
            type: 'object',
            properties: { usdc: { type: 'string', example: '12.50' }, xlm: { type: 'string', example: '4.9999' } },
          },
          publicKey: { type: 'string', example: 'GBNWP6CZ...' },
        },
      },
      FeeBreakdown: {
        type: 'object',
        properties: {
          localAmount:     { type: 'number', example: 26000 },
          localCurrency:   { type: 'string', example: 'TZS' },
          midRate:         { type: 'number' },
          ycBuyRate:       { type: 'number' },
          ycSpreadUsdc:    { type: 'number' },
          platformFeeUsdc: { type: 'number' },
          stellarFeeXlm:   { type: 'number' },
          netUsdc:         { type: 'number', example: 9.82 },
          provider:        { type: 'string', example: 'yellowcard_sandbox' },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/health': {
      get: { tags: ['System'], summary: 'Liveness probe', security: [],
        responses: { '200': { description: 'Service is up' } } },
    },
    '/ready': {
      get: { tags: ['System'], summary: 'Readiness probe (checks DB)', security: [],
        responses: { '200': { description: 'Ready' }, '503': { description: 'Not ready' } } },
    },
    '/metrics': {
      get: { tags: ['System'], summary: 'Latency + error metrics (p50/p95/p99)', security: [],
        responses: { '200': { description: 'Metrics snapshot' } } },
    },
    '/api/auth/register': {
      post: { tags: ['Auth'], summary: 'Register a new user', security: [],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['phone', 'pin'],
          properties: { phone: { type: 'string', example: '+255712345678' },
            pin: { type: 'string', example: '123456' }, name: { type: 'string' } } } } } },
        responses: { '201': { description: 'Created — returns tokens + wallet' },
          '409': { description: 'Phone already registered',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } } } },
    },
    '/api/auth/login': {
      post: { tags: ['Auth'], summary: 'Login with phone + PIN', security: [],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['phone', 'pin'],
          properties: { phone: { type: 'string' }, pin: { type: 'string' } } } } } },
        responses: { '200': { description: 'Tokens issued' }, '401': { description: 'Invalid credentials' } } },
    },
    '/api/auth/me': {
      get: { tags: ['Auth'], summary: 'Current user profile (incl. wallet tag)',
        responses: { '200': { description: 'User object' }, '401': { description: 'Unauthorized' } } },
    },
    '/api/wallet/balance': {
      get: { tags: ['Wallet'], summary: 'On-chain USDC + XLM balance',
        responses: { '200': { description: 'Balance',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Balance' } } } } } },
    },
    '/api/wallet/receive': {
      get: { tags: ['Wallet'], summary: 'Receive address + SEP-0007 QR URIs',
        responses: { '200': { description: 'Address + xlmQrUri + usdcQrUri + explorerUrl' } } },
    },
    '/api/mpesa/rate': {
      get: { tags: ['Deposit'], summary: 'Live rate + full fee schedule', security: [],
        parameters: [{ name: 'currency', in: 'query', schema: { type: 'string', example: 'TZS' } }],
        responses: { '200': { description: 'Rate + example fees' } } },
    },
    '/api/mpesa/fee-preview': {
      get: { tags: ['Deposit'], summary: 'Transparent fee breakdown before depositing',
        parameters: [
          { name: 'amount', in: 'query', required: true, schema: { type: 'number' } },
          { name: 'currency', in: 'query', schema: { type: 'string' } },
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['deposit', 'withdraw'] } },
        ],
        responses: { '200': { description: 'Fee breakdown',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/FeeBreakdown' } } } } } },
    },
    '/api/mpesa/deposit': {
      post: { tags: ['Deposit'], summary: 'Initiate mobile-money deposit (STK Push)',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['amountTzs'],
          properties: { amountTzs: { type: 'integer', example: 26000 },
            currency: { type: 'string', example: 'TZS' } } } } } },
        responses: { '200': { description: 'Prompt sent' }, '400': { description: 'Validation error' } } },
    },
    '/api/send/stellar': {
      post: { tags: ['Send'], summary: 'Send USDC to a Stellar address (1% fee, atomic)',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['toAddress', 'amount', 'pin'],
          properties: {
            toAddress: { type: 'string', example: 'G...' },
            amount:    { type: 'number', example: 10 },
            asset:     { type: 'string', enum: ['USDC', 'XLM'], default: 'USDC' },
            memo:      { type: 'string' },
            pin:       { type: 'string', example: '123456' },
          } } } } },
        responses: {
          '200': { description: 'Transfer complete (returns hash, netUsdc, feeUsdc)' },
          '403': { description: 'Incorrect PIN or blocked by fraud gate (code: RISK_BLOCK)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } } } },
    },
    '/api/send/phone': {
      post: { tags: ['Send'], summary: 'Send USDC by phone number',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['toPhone', 'amount', 'pin'],
          properties: { toPhone: { type: 'string' }, amount: { type: 'number' }, pin: { type: 'string' } } } } } },
        responses: { '200': { description: 'Sent' }, '404': { description: 'Recipient not on OlomiPay' } } },
    },
  },
} as const;

/** Minimal Swagger UI page (loads viewer from CDN — no npm dependency). */
export function swaggerHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>OlomiPay API — Reference</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css"/>
  <style>body{margin:0}.topbar{display:none}</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: '/api/openapi.json',
      dom_id: '#swagger-ui',
      presets: [SwaggerUIBundle.presets.apis],
      layout: 'BaseLayout',
      docExpansion: 'list',
    });
  </script>
</body>
</html>`;
}
