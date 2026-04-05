const rooms = new Map();

function getRoom(code) {
  return rooms.get(code);
}

function addRoom(room) {
  rooms.set(room.code, room);
}

function deleteRoom(code) {
  rooms.delete(code);
}

function getAllRooms() {
  return rooms;
}

function addPlayerToRoom(room, player) {
  room.players.push(player);
}

function removePlayerFromRoom(room, ws) {
  room.players = room.players.filter(p => p.ws !== ws);
}

function isRoomEmpty(room) {
  return room.players.length === 0;
}

module.exports = {
  getRoom,
  addRoom,
  deleteRoom,
  getAllRooms,
  addPlayerToRoom,
  removePlayerFromRoom,
  isRoomEmpty
};
