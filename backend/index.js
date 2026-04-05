const WebSocket = require('ws');

const PORT = process.env.PORT || 3001;
const wss = new WebSocket.Server({ port: PORT });

const rooms = new Map();
const players = new Map();
const pendingRequests = new Map();

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function generatePlayerId() {
  return Math.random().toString(36).substring(2, 10);
}

function broadcastPlayers() {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.playerId) {
      const onlinePlayers = Array.from(players.values())
        .filter(p => p.id !== client.playerId)
        .map(p => ({
          id: p.id,
          name: p.name,
          status: p.status,
          roomCode: p.roomCode || null
        }));
      
      const message = JSON.stringify({ 
        event: 'players-list', 
        players: onlinePlayers,
        myId: client.playerId
      });
      client.send(message);
    }
  });
}

function createRoom(hostPlayer) {
  const code = generateRoomCode();
  const room = {
    code,
    players: [{ ...hostPlayer }],
    currentTurn: 'X',
    board: Array(9).fill(null),
    gameOver: false,
  };
  rooms.set(code, room);
  hostPlayer.roomCode = code;
  return room;
}

function calculateWinner(board) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line: [a, b, c] };
    }
  }

  if (board.every(cell => cell !== null)) {
    return { winner: 'draw', line: null };
  }

  return null;
}

function broadcast(room, event, data, excludeWs = null) {
  const message = JSON.stringify({ event, ...data });
  room.players.forEach(player => {
    if (player.ws && player.ws !== excludeWs && player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(message);
    }
  });
}

function handleMakeMove(room, index, symbol) {
  if (room.gameOver) {
    return { success: false, error: 'Game is over' };
  }
  if (room.currentTurn !== symbol) {
    return { success: false, error: 'Not your turn' };
  }
  if (index < 0 || index > 8) {
    return { success: false, error: 'Invalid index' };
  }
  if (room.board[index] !== null) {
    return { success: false, error: 'Cell already taken' };
  }

  room.board[index] = symbol;
  const result = calculateWinner(room.board);

  if (result) {
    room.gameOver = true;
    broadcast(room, 'game-over', {
      winner: result.winner === 'draw' ? null : result.winner,
      winningLine: result.line,
      board: room.board
    });
  } else {
    room.currentTurn = symbol === 'X' ? 'O' : 'X';
    broadcast(room, 'move-made', {
      index,
      symbol,
      nextPlayer: room.currentTurn,
      board: room.board
    });
  }

  return { success: true };
}

function handlePlayAgain(room) {
  room.board = Array(9).fill(null);
  room.currentTurn = 'X';
  room.gameOver = false;
  broadcast(room, 'game-restart', { currentPlayer: 'X', board: room.board });
}

function handleLeaveRoom(room, ws) {
  room.players = room.players.filter(p => p.ws !== ws);
  
  if (room.players.length === 0) {
    rooms.delete(room.code);
  } else {
    broadcast(room, 'opponent-left', {});
  }
  
  ws.roomCode = null;
  ws.status = 'online';
  broadcastPlayers();
}

function cleanupRoom(roomCode) {
  const room = rooms.get(roomCode);
  if (room) {
    room.players.forEach(p => {
      p.roomCode = null;
      p.status = 'online';
    });
    rooms.delete(roomCode);
  }
}

wss.on('connection', (ws) => {
  const playerId = generatePlayerId();
  ws.playerId = playerId;
  ws.status = 'online';
  ws.roomCode = null;
  ws.playerName = `Player ${playerId.substring(0, 4)}`;
  
  players.set(playerId, {
    id: playerId,
    ws,
    name: ws.playerName,
    status: 'online',
    roomCode: null
  });

  broadcastPlayers();

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      const { event } = message;

      switch (event) {
        case 'set-name': {
          const { name } = message;
          ws.playerName = name || ws.playerName;
          const player = players.get(playerId);
          if (player) {
            player.name = ws.playerName;
          }
          broadcastPlayers();
          break;
        }

        case 'request-game': {
          const { targetPlayerId } = message;
          const targetPlayer = players.get(targetPlayerId);
          
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
          break;
        }

        case 'accept-game': {
          const { fromPlayerId } = message;
          const request = pendingRequests.get(playerId);
          
          if (!request || request.from !== fromPlayerId) {
            ws.send(JSON.stringify({ event: 'error', message: 'No pending request' }));
            return;
          }

          pendingRequests.delete(playerId);

          const hostPlayer = players.get(fromPlayerId);
          const guestPlayer = players.get(playerId);

          if (!hostPlayer || !guestPlayer) {
            ws.send(JSON.stringify({ event: 'error', message: 'Player not found' }));
            return;
          }

          if (hostPlayer.status !== 'online' || guestPlayer.status !== 'online') {
            ws.send(JSON.stringify({ event: 'error', message: 'Player not available' }));
            return;
          }

          hostPlayer.status = 'in-game';
          guestPlayer.status = 'in-game';

          const room = createRoom(hostPlayer);
          room.players.push({ ...guestPlayer });

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

          broadcastPlayers();
          break;
        }

        case 'reject-game': {
          const { fromPlayerId } = message;
          const hostPlayer = players.get(fromPlayerId);
          if (hostPlayer) {
            hostPlayer.ws.send(JSON.stringify({
              event: 'request-rejected',
              fromPlayerId: playerId,
              fromPlayerName: ws.playerName
            }));
          }
          pendingRequests.delete(playerId);
          break;
        }

        case 'cancel-request': {
          const { targetPlayerId } = message;
          const targetPlayer = players.get(targetPlayerId);
          if (targetPlayer) {
            targetPlayer.ws.send(JSON.stringify({
              event: 'request-cancelled',
              fromPlayerId: playerId
            }));
          }
          pendingRequests.delete(targetPlayerId);
          break;
        }

        case 'make-move': {
          const { index, symbol, roomCode } = message;
          const room = rooms.get(roomCode);
          
          if (!room) {
            ws.send(JSON.stringify({ event: 'error', message: 'Room not found' }));
            return;
          }
          
          const result = handleMakeMove(room, index, symbol);
          if (!result.success) {
            ws.send(JSON.stringify({ event: 'error', message: result.error }));
          }
          break;
        }

        case 'play-again': {
          const { roomCode } = message;
          const room = rooms.get(roomCode);
          if (room) {
            handlePlayAgain(room);
          }
          break;
        }

        case 'leave-game': {
          const { roomCode } = message;
          const room = rooms.get(roomCode);
          
          if (room) {
            room.players.forEach(p => {
              p.status = 'online';
              p.roomCode = null;
              if (p.ws && p.ws.readyState === WebSocket.OPEN) {
                p.ws.send(JSON.stringify({ event: 'game-ended', reason: 'opponent-left' }));
              }
            });
            rooms.delete(roomCode);
            broadcastPlayers();
          }
          ws.roomCode = null;
          ws.status = 'online';
          broadcastPlayers();
          break;
        }
      }
    } catch (err) {
      console.error('Error processing message:', err);
    }
  });

  ws.on('close', () => {
    const player = players.get(playerId);
    if (player) {
      if (player.roomCode) {
        cleanupRoom(player.roomCode);
      }
      pendingRequests.delete(playerId);
      players.delete(playerId);
    }
    broadcastPlayers();
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});

console.log(`Tic-Tac-Toe server running on port ${PORT}`);
