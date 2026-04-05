const WS_URL = process.env.REACT_APP_WS_URL || `ws://${window.location.hostname}:3001`;

class NetworkManager {
  constructor() {
    this.ws = null;
    this.playerId = null;
    this.playerName = 'Player';
    this.listeners = {};
    this.isConnected = false;
    this.players = [];
    this.pendingRequest = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.emit('connected');
        resolve();
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.emit('disconnected');
        this.cleanup();
      };

      this.ws.onerror = (error) => {
        this.emit('error', error);
        reject(error);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (err) {
          console.error('Error parsing message:', err);
        }
      };
    });
  }

  handleMessage(data) {
    const { event, ...payload } = data;

    switch (event) {
      case 'players-list':
        this.players = payload.players;
        this.emit('players-list', payload.players, payload.myId);
        break;
      case 'request-sent':
        this.pendingRequest = payload.toPlayerId;
        this.emit('request-sent', payload);
        break;
      case 'game-request':
        this.emit('game-request', payload);
        break;
      case 'request-rejected':
        this.pendingRequest = null;
        this.emit('request-rejected', payload);
        break;
      case 'request-cancelled':
        this.pendingRequest = null;
        this.emit('request-cancelled', payload);
        break;
      case 'game-start':
        this.emit('game-start', payload);
        break;
      case 'move-made':
        this.emit('move-made', payload);
        break;
      case 'game-over':
        this.emit('game-over', payload);
        break;
      case 'game-restart':
        this.emit('game-restart', payload);
        break;
      case 'opponent-left':
        this.emit('opponent-left', payload);
        break;
      case 'game-ended':
        this.emit('game-ended', payload);
        break;
      case 'error':
        this.emit('error', payload);
        break;
    }
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  off(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }

  emit(event, data) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(callback => callback(data));
  }

  setName(name) {
    this.playerName = name;
    this.send({ event: 'set-name', name });
  }

  requestGame(targetPlayerId) {
    this.send({ event: 'request-game', targetPlayerId });
  }

  acceptGame(fromPlayerId) {
    this.send({ event: 'accept-game', fromPlayerId });
  }

  rejectGame(fromPlayerId) {
    this.send({ event: 'reject-game', fromPlayerId });
  }

  cancelRequest(targetPlayerId) {
    this.send({ event: 'cancel-request', targetPlayerId });
    this.pendingRequest = null;
  }

  makeMove(index, symbol, roomCode) {
    this.send({ event: 'make-move', index, symbol, roomCode });
  }

  playAgain(roomCode) {
    this.send({ event: 'play-again', roomCode });
  }

  leaveGame(roomCode) {
    this.send({ event: 'leave-game', roomCode });
    this.cleanupGame();
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  cleanup() {
    this.playerId = null;
    this.players = [];
    this.pendingRequest = null;
  }

  cleanupGame() {
    this.emit('game-ended', {});
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
    this.cleanup();
  }
}

export const networkManager = new NetworkManager();
export default networkManager;
