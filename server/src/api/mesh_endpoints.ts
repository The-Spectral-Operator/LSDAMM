/**
 * LSDAMM - Mesh API Endpoints
 */

import { Router, Request, Response } from 'express';
import { listClients, registerClient } from '../mesh/session_manager.js';
import { logger } from '../util/logging.js';

const router = Router();

/**
 * GET /api/mesh/clients
 * List all registered clients
 */
router.get('/clients', async (_req: Request, res: Response) => {
  try {
    const clients = listClients();
    res.json({ clients });
  } catch (error) {
    logger.error('Failed to list clients', { error });
    res.status(500).json({ error: 'Failed to list clients' });
  }
});

/**
 * POST /api/mesh/clients
 * Register a new mesh client
 */
router.post('/clients', async (req: Request, res: Response) => {
  try {
    const { clientId, clientName, clientType, capabilities } = req.body;

    if (!clientId || !clientName || !clientType) {
      res.status(400).json({ error: 'clientId, clientName, and clientType are required' });
      return;
    }

    const result = await registerClient(clientId, clientName, clientType, capabilities);

    res.status(201).json({
      clientId: result.clientId,
      authToken: result.authToken,
      warning: 'Store this token securely. It will not be shown again.',
    });
  } catch (error) {
    logger.error('Failed to register client', { error });
    res.status(500).json({ error: 'Failed to register client' });
  }
});

/**
 * GET /api/mesh/status
 * Get mesh status
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    // Get WebSocket server stats if available
    const wsServer = (req.app.get('wsServer') as { getClientCount: () => number; getAuthenticatedClientCount: () => number } | undefined);
    
    res.json({
      status: 'online',
      connectedClients: wsServer?.getClientCount() ?? 0,
      authenticatedClients: wsServer?.getAuthenticatedClientCount() ?? 0,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
    });
  } catch (error) {
    logger.error('Failed to get mesh status', { error });
    res.status(500).json({ error: 'Failed to get mesh status' });
  }
});

/**
 * POST /api/mesh/broadcast
 * Broadcast a message to all connected clients
 */
router.post('/broadcast', async (req: Request, res: Response) => {
  try {
    const { message, channel } = req.body;

    if (!message) {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    const wsServer = (req.app.get('wsServer') as { broadcastToGroup: (group: string, message: unknown) => void; broadcastToAll: (message: unknown) => void } | undefined);
    
    if (!wsServer) {
      res.status(503).json({ error: 'WebSocket server not available' });
      return;
    }

    const envelope = {
      messageId: require('uuid').v4(),
      version: '1.0',
      type: 'BROADCAST',
      source: { clientId: 'api', sessionId: 'api' },
      timestamp: Date.now(),
      priority: 5,
      payload: { message, channel },
    };

    if (channel) {
      wsServer.broadcastToGroup(channel, envelope);
    } else {
      wsServer.broadcastToAll(envelope);
    }

    res.json({ message: 'Broadcast sent', channel });
  } catch (error) {
    logger.error('Failed to broadcast message', { error });
    res.status(500).json({ error: 'Failed to broadcast message' });
  }
});

export default router;
