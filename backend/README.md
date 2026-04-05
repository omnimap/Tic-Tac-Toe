# Tic-Tac-Toe Network Server

WebSocket server for Tic-Tac-Toe network multiplayer with player discovery.

## Setup

```bash
npm install
```

## Running

```bash
npm start
```

Server runs on port 3001 by default. Set `PORT` environment variable to change.

## How to Play

1. Start the server: `npm start`
2. In the frontend, set `REACT_APP_WS_URL` to the server URL (e.g., `ws://localhost:3001`)
3. Select "Online" mode in the game
4. View online players and click "Play" to send a game request
5. Your friend accepts the request
6. Play!

## Features

- Real-time player list with status (online/in-game)
- Game request system (send/accept/reject)
- Automatic room creation
- Turn validation on server
- Play again functionality

## API

### WebSocket Events

**Client → Server:**
```json
{ "event": "set-name", "name": "Player Name" }

{ "event": "request-game", "targetPlayerId": "abc123" }

{ "event": "accept-game", "fromPlayerId": "xyz789" }

{ "event": "reject-game", "fromPlayerId": "xyz789" }

{ "event": "make-move", "index": 4, "symbol": "X", "roomCode": "ABC123" }

{ "event": "play-again", "roomCode": "ABC123" }

{ "event": "leave-game", "roomCode": "ABC123" }
```

**Server → Client:**
```json
{ "event": "players-list", "players": [{ "id": "...", "name": "...", "status": "online" }] }

{ "event": "game-request", "fromPlayerId": "...", "fromPlayerName": "..." }

{ "event": "game-start", "roomCode": "...", "symbol": "X", "isHost": true, "opponentName": "...", "board": [...] }

{ "event": "move-made", "index": 4, "symbol": "X", "nextPlayer": "O", "board": [...] }

{ "event": "game-over", "winner": "X", "winningLine": [0, 1, 2], "board": [...] }
```
