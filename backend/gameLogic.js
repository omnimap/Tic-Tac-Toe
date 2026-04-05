function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
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

function createRoom(hostPlayer) {
  const code = generateRoomCode();
  const room = {
    code,
    players: [{ ...hostPlayer }],
    currentTurn: 'X',
    board: Array(9).fill(null),
    gameOver: false,
  };
  return room;
}

function makeMove(room, index, symbol) {
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
    return {
      success: true,
      gameOver: true,
      winner: result.winner === 'draw' ? null : result.winner,
      winningLine: result.line,
      board: room.board
    };
  } else {
    room.currentTurn = symbol === 'X' ? 'O' : 'X';
    return {
      success: true,
      gameOver: false,
      index,
      symbol,
      nextPlayer: room.currentTurn,
      board: room.board
    };
  }
}

function resetGame(room) {
  room.board = Array(9).fill(null);
  room.currentTurn = 'X';
  room.gameOver = false;
}

module.exports = {
  generateRoomCode,
  calculateWinner,
  createRoom,
  makeMove,
  resetGame
};
