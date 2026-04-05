const players = new Map();

function generatePlayerId() {
  return Math.random().toString(36).substring(2, 10);
}

function createPlayer(ws) {
  const playerId = generatePlayerId();
  const player = {
    id: playerId,
    ws,
    name: `Player ${playerId.substring(0, 4)}`,
    status: 'online',
    roomCode: null
  };
  return player;
}

function getPlayer(id) {
  return players.get(id);
}

function addPlayer(player) {
  players.set(player.id, player);
}

function removePlayer(id) {
  players.delete(id);
}

function getAllPlayers() {
  return players;
}

function getOnlinePlayers(excludeId = null) {
  return Array.from(players.values())
    .filter(p => p.id !== excludeId)
    .map(p => ({
      id: p.id,
      name: p.name,
      status: p.status,
      roomCode: p.roomCode || null
    }));
}

function updatePlayerStatus(id, status) {
  const player = players.get(id);
  if (player) {
    player.status = status;
  }
}

function updatePlayerRoom(id, roomCode) {
  const player = players.get(id);
  if (player) {
    player.roomCode = roomCode;
  }
}

function updatePlayerName(id, name) {
  const player = players.get(id);
  if (player) {
    player.name = name;
  }
}

function updatePlayerWs(id, ws) {
  const player = players.get(id);
  if (player) {
    player.ws = ws;
  }
}

module.exports = {
  generatePlayerId,
  createPlayer,
  getPlayer,
  addPlayer,
  removePlayer,
  getAllPlayers,
  getOnlinePlayers,
  updatePlayerStatus,
  updatePlayerRoom,
  updatePlayerName,
  updatePlayerWs
};
