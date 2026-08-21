#!/usr/bin/env node
/**
 * hugging-xberg-mcp — HTTP-native MCP server for Xberg.
 *
 * Stateless streamable HTTP transport on port 3000.
 * Each request gets its own McpServer + transport pair (no cross-request state).
 */

import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { config } from './config.js';
import { logDebug, logInfo, maskApiKey } from './logger.js';
import { registerTools } from './tools.js';

/**
 * Create and configure the Express application.
 */
function createApp() {
  const app = express();
  // Override default 100kb limit — base64 PDFs/images can be large (default 50mb, env-configurable).
  app.use(express.json({ limit: process.env.MCP_BODY_LIMIT || '50mb' }));

  /**
   * POST /mcp — handle MCP requests (stateless, per-request McpServer).
   */
  app.post('/mcp', async (req, res) => {
    logDebug(`POST /mcp contentLength=${req.headers['content-length'] ?? 'unset'}`);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    const requestServer = new McpServer(
      { name: 'hugging-xberg-mcp', version: '2.0.0' },
      {
        instructions:
          'Wrapper MCP server for Xberg. ' +
          'Both tools accept base64-encoded file data or full data URLs (e.g. data:image/png;base64,...). ' +
          'extract_bytes decodes to bytes and POSTs to Xberg REST API as multipart form data. ' +
          'Xberg responses use the {results, errors, summary} envelope. ' +
          'extract_structured is config-driven and POSTs to /extract.',
      },
    );

    registerTools(requestServer);
    await requestServer.connect(transport);

    try {
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    } finally {
      await requestServer.close();
    }
  });

  /** GET /mcp — not needed for stateless mode. */
  app.get('/mcp', (req, res) => {
    res.status(405).send('GET not supported in stateless mode');
  });

  /** DELETE /mcp — not needed for stateless mode. */
  app.delete('/mcp', (req, res) => {
    res.status(405).send('DELETE not supported in stateless mode');
  });

  /** Express error handler. */
  app.use((err, req, res, _next) => {
    logInfo(`Express error handler ${err.message}`);
    if (!res.headersSent) {
      // Preserve body-parser's 413 status for payload-too-large errors
      const status = err.status || 500;
      res.status(status).json({
        jsonrpc: '2.0',
        error: {
          code: status === 413 ? -32600 : -32603,
          message: status === 413
            ? 'Payload too large — request body must be under 50MB'
            : 'Internal server error: ' + err.message,
        },
        id: null,
      });
    }
  });

  return app;
}

/**
 * Start the MCP server.
 */
async function main() {
  const app = createApp();

  const server = app.listen(config.mcpPort, '0.0.0.0', () => {
    logInfo(`hugging-xberg-mcp running on port ${config.mcpPort} xberg=${config.xbergUrl} structured_api_key=${maskApiKey(config.structuredApiKey)}`);
  });

  /** Catch unhandled rejections. */
  process.on('unhandledRejection', (reason) => {
    logInfo(`Unhandled rejection ${reason instanceof Error ? reason.message : String(reason)}`);
  });

  /** Graceful shutdown on SIGINT. */
  process.on('SIGINT', () => {
    logInfo('Shutting down server...');
    server.close(() => process.exit(0));
  });
}

main().catch((err) => {
  logInfo(`hugging-xberg-mcp fatal ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
