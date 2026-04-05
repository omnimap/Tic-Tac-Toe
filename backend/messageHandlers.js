const gameLogic = require('./gameLogic');
const roomManager = require('./roomManager');
const playerManager = require('./playerManager');
const WebSocket = require('ws');

const pendingRequests = new Map();

function broadcastPlayers(wss, excludeWs = null) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.playerId) {
      const onlinePlayers = playerManager.getOnlinePlayers(client.playerId);
      
      const message = JSON.stringify({ 
        event: 'players-list', 
        players: onlinePlayers,
        myId: client.playerId
      });
      client.send(message);
    }
  });
}

function broadcast(room, event, data, excludeWs = null) {
  const message = JSON.stringify({ event, ...data });
  room.players.forEach(player => {
    if (player.ws && player.ws !== excludeWs && player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(message);
    }
  });
}

function handleSetName(ws, playerId, name) {
  playerManager.updatePlayerName(playerId, name);
}

function handleRequestGame(ws, playerId, targetPlayerId) {
  const targetPlayer = playerManager.getPlayer(targetPlayerId);
  
  if (!targetPlayer || targetPlayer.status !== 'online') {
    ws.send(JSON.stringify({ event: 'error', message: 'Player not available' }));
    return;
  }

  pendingRequests.set(targetPlayerId, { 
    from: playerId, 
    fromName: ws.playerName,
    timestamp: Date.now()
  });

  targetPlayer.ws.send(JSON.stringify({
    event: 'game-request',
    fromPlayerId: playerId,
    fromPlayerName: ws.playerName
  }));

  ws.send(JSON.stringify({
    event: 'request-sent',
    toPlayerId: targetPlayerId
  }));
}

function handleAcceptGame(ws, playerId, fromPlayerId, wss) {
  const request = pendingRequests.get(playerId);
  
  if (!request || request.from !== fromPlayerId) {
    ws.send(JSON.stringify({ event: 'error', message: 'No pending request' }));
    return;
  }

  pendingRequests.delete(playerId);

  const hostPlayer = playerManager.getPlayer(fromPlayerId);
  const guestPlayer = playerManager.getPlayer(playerId);

  if (!hostPlayer || !guestPlayer) {
    ws.send(JSON.stringify({ event: 'error', message: 'Player not found' }));
    return;
  }

  if (hostPlayer.status !== 'online' || guestPlayer.status !== 'online') {
    ws.send(JSON.stringify({ event: 'error', message: 'Player not available' }));
    return;
  }

  playerManager.updatePlayerStatus(fromPlayerId, 'in-game');
  playerManager.updatePlayerStatus(playerId, 'in-game');

  const room = gameLogic.createRoom(hostPlayer);
  roomManager.addRoom(room);
  roomManager.addPlayerToRoom(room, guestPlayer);

  hostPlayer.ws.send(JSON.stringify({
    event: 'game-start',
    roomCode: room.code,
    symbol: 'X',
    currentPlayer: room.currentTurn,
    isHost: true,
    opponentName: guestPlayer.name,
    board: room.board
  }));

  guestPlayer.ws.send(JSON.stringify({
    event: 'game-start',
    roomCode: room.code,
    symbol: 'O',
    currentPlayer: room.currentTurn,
    isHost: false,
    opponentName: hostPlayer.name,
    board: room.board
  }));

  broadcastPlayers(wss);
}

function handleRejectGame(ws, playerId, fromPlayerId) {
  const hostPlayer = playerManager.getPlayer(fromPlayerId);
  if (hostPlayer) {
    hostPlayer.ws.send(JSON.stringify({
      event: 'request-rejected',
      fromPlayerId: playerId,
      fromPlayerName: ws.playerName
    }));
  }
  pendingRequests.delete(playerId);
}

function handleCancelRequest(ws, targetPlayerId) {
  const targetPlayer = playerManager.getPlayer(targetPlayerId);
  if (targetPlayer) {
    targetPlayer.ws.send(JSON.stringify({
      event: 'request-cancelled',
      fromPlayerId: ws.playerId
    }));
  }
  pendingRequests.delete(targetPlayerId);
}

function handleMakeMove(ws, roomCode, index, symbol, wss) {
  const room = roomManager.getRoom(roomCode);
  
  if (!room) {
    ws.send(JSON.stringify({ event: 'error', message: 'Room not found' }));
    return;
  }
  
  const result = gameLogic.makeMove(room, index, symbol);
  if (!result.success) {
    ws.send(JSON.stringify({ event: 'error', message: result.error }));
    return;
  }

  if (result.gameOver) {
    broadcast(room, 'game-over', {
      winner: result.winner,
      winningLine: result.winningLine,
      board: result.board
    });
  } else {
    broadcast(room, 'move-made', {
      index: result.index,
      symbol: result.symbol,
      nextPlayer: result.nextPlayer,
      board: result.board
    });
  }
}

function handlePlayAgain(ws, roomCode, wss) {
  const room = roomManager.getRoom(roomCode);
  if (room) {
    gameLogic.resetGame(room);
    broadcast(room, 'game-restart', { currentPlayer: 'X', board: room.board });
  }
}

function handleLeaveGame(ws, playerId, roomCode, wss) {
  const room = roomManager.getRoom(roomCode);
  
  if (room) {
    room.players.forEach(p => {
      playerManager.updatePlayerStatus(p.id, 'online');
      playerManager.updatePlayerRoom(p.id, null);
      if (p.ws && p.ws.readyState === WebSocket.OPEN) {
        p.ws.send(JSON.stringify({ event: 'game-ended', reason: 'opponent_left' }));
      }
    });
    roomManager.deleteRoom(roomCode);
    broadcastPlayers(wss);
  }
  playerManager.updatePlayerRoom(playerId, null);
  playerManager.updatePlayerStatus(playerId, 'online');
  broadcastPlayers(wss);
}

function handleDisconnect(playerId) {
  const player = playerManager.getPlayer(playerId);
  if (player) {
    if (player.roomCode) {
      const room = roomManager.getRoom(player.roomCode);
      if (room) {
        roomManager.removePlayerFromRoom(room, player.ws);
        if (roomManager.isRoomEmpty(room)) {
          roomManager.deleteRoom(room.code);
        } else {
          broadcast(room, 'opponent-left', {});
        }
      }
    }
    pendingRequests.delete(playerId);
    playerManager.removePlayer(playerId);
  }
}

function cleanupPendingRequest(playerId) {
  pendingRequests.delete(playerId);
}

module.exports = {
  handleSetName,
  handleRequestGame,
  handleAcceptGame,
  handleRejectGame,
  handleCancelRequest,
  handleMakeMove,
  handlePlayAgain,
  handleLeaveGame,
  handleDisconnect,
  cleanupPendingRequest,
  broadcastPlayers
};
