const WebSocket = require('ws');
const playerManager = require('./playerManager');
const messageHandlers = require('./messageHandlers');

const PORT = process.env.PORT || 3001;
const wss = new WebSocket.Server({ port: PORT });

wss.on('connection', (ws) => {
  const player = playerManager.createPlayer(ws);
  playerManager.addPlayer(player);

  ws.playerId = player.id;
  ws.playerName = player.name;
  ws.roomCode = null;
  ws.status = 'online';

  messageHandlers.broadcastPlayers(wss);

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      const { event } = message;

      switch (event) {
        case 'set-name': {
          const { name } = message;
          ws.playerName = name || ws.playerName;
          playerManager.updatePlayerName(player.id, ws.playerName);
          messageHandlers.broadcastPlayers(wss);
          break;
        }

        case 'request-game': {
          const { targetPlayerId } = message;
          messageHandlers.handleRequestGame(ws, player.id, targetPlayerId);
          break;
        }

        case 'accept-game': {
          const { fromPlayerId } = message;
          messageHandlers.handleAcceptGame(ws, player.id, fromPlayerId, wss);
          break;
        }

        case 'reject-game': {
          const { fromPlayerId } = message;
          messageHandlers.handleRejectGame(ws, player.id, fromPlayerId);
          break;
        }

        case 'cancel-request': {
          const { targetPlayerId } = message;
          messageHandlers.handleCancelRequest(ws, targetPlayerId);
          break;
        }

        case 'make-move': {
          const { index, symbol, roomCode } = message;
          messageHandlers.handleMakeMove(ws, roomCode, index, symbol, wss);
          break;
        }

        case 'play-again': {
          const { roomCode } = message;
          messageHandlers.handlePlayAgain(ws, roomCode, wss);
          break;
        }

        case 'leave-game': {
          const { roomCode } = message;
          messageHandlers.handleLeaveGame(ws, player.id, roomCode, wss);
          break;
        }
      }
    } catch (err) {
      console.error('Error processing message:', err);
    }
  });

  ws.on('close', () => {
    messageHandlers.handleDisconnect(player.id);
    messageHandlers.broadcastPlayers(wss);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});

console.log(`Tic-Tac-Toe server running on port ${PORT}`);
