import { useState, useEffect, useCallback } from 'react';
import networkManager from './NetworkManager';

function calculateWinner(squares) {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6]
  ];

  for (let i = 0; i < lines.length; i += 1) {
    const [a, b, c] = lines[i];
    if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
      return { player: squares[a], line: [a, b, c] };
    }
  }
  return null;
}

function Square({ value, onClick, isWinning }) {
  return (
    <button className={`square ${isWinning ? 'winning' : ''}`} onClick={onClick}>
      {value === 'X' && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <line x1="4" y1="4" x2="20" y2="20" />
          <line x1="20" y1="4" x2="4" y2="20" />
        </svg>
      )}
      {value === 'O' && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <circle cx="12" cy="12" r="8" />
        </svg>
      )}
    </button>
  );
}

function Board({ squares, onSquareClick, winningLine }) {
  const renderSquare = (index) => (
    <Square
      value={squares[index]}
      onClick={() => onSquareClick(index)}
      isWinning={winningLine && winningLine.includes(index)}
    />
  );

  return (
    <div className="board">
      <div className="board-row">
        {renderSquare(0)}
        {renderSquare(1)}
        {renderSquare(2)}
      </div>
      <div className="board-row">
        {renderSquare(3)}
        {renderSquare(4)}
        {renderSquare(5)}
      </div>
      <div className="board-row">
        {renderSquare(6)}
        {renderSquare(7)}
        {renderSquare(8)}
      </div>
    </div>
  );
}

export default function Game({ darkMode, setDarkMode }) {
  const [squares, setSquares] = useState(Array(9).fill(null));
  const [xIsNext, setXIsNext] = useState(true);
  const [gameMode, setGameMode] = useState(null);
  const [playerSymbol, setPlayerSymbol] = useState('X');
  const [showSetupDialog, setShowSetupDialog] = useState(true);
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('ttt-player-name') || '');
  const [showNameDialog, setShowNameDialog] = useState(false);
  const [tempName, setTempName] = useState('');

  const [networkState, setNetworkState] = useState({
    connected: false,
    myPlayerId: null,
    players: [],
    roomCode: null,
    isHost: false,
    mySymbol: 'X',
    opponentName: null,
    incomingRequest: null,
    outgoingRequest: null,
    error: null,
  });

  const winner = calculateWinner(squares);
  const isDraw = !winner && squares.every(Boolean);
  const gameOver = winner || isDraw;
  const currentPlayer = gameMode === '1P' ? playerSymbol : (xIsNext ? 'X' : 'O');
  const status = winner
    ? `Winner: ${winner.player}`
    : isDraw
    ? 'Draw'
    : `Next player: ${currentPlayer}`;
  const dialogMessage = winner ? `Winner: ${winner.player}` : 'Draw';

  useEffect(() => {
    networkManager.on('connected', () => {
      setNetworkState(prev => ({ ...prev, connected: true, error: null }));
    });

    networkManager.on('disconnected', () => {
      setNetworkState(prev => ({ ...prev, connected: false, players: [], myPlayerId: null }));
    });

    networkManager.on('players-list', (players, myPlayerId) => {
      const currentMyId = myPlayerId || networkState.myPlayerId;
      const filteredPlayers = players.filter(p => {
        const notSelfById = p.id !== currentMyId;
        const notSelfByName = p.name !== playerName;
        return notSelfById && notSelfByName;
      });
      
      setNetworkState(prev => ({ 
        ...prev, 
        players: filteredPlayers,
        myPlayerId: currentMyId
      }));
    });

    networkManager.on('request-sent', (data) => {
      setNetworkState(prev => ({ 
        ...prev, 
        outgoingRequest: data.toPlayerId 
      }));
    });

    networkManager.on('game-request', (data) => {
      setNetworkState(prev => ({ 
        ...prev, 
        incomingRequest: {
          fromPlayerId: data.fromPlayerId,
          fromPlayerName: data.fromPlayerName
        }
      }));
    });

    networkManager.on('request-rejected', () => {
      setNetworkState(prev => ({ 
        ...prev, 
        outgoingRequest: null,
        error: 'Request rejected'
      }));
    });

    networkManager.on('request-cancelled', () => {
      setNetworkState(prev => ({ 
        ...prev, 
        outgoingRequest: null 
      }));
    });

    networkManager.on('game-start', (data) => {
      setSquares(data.board || Array(9).fill(null));
      setXIsNext(data.currentPlayer === 'X');
      setNetworkState(prev => ({
        ...prev,
        roomCode: data.roomCode,
        isHost: data.isHost,
        mySymbol: data.symbol || (data.isHost ? 'X' : 'O'),
        opponentName: data.opponentName,
        incomingRequest: null,
        outgoingRequest: null,
      }));
    });

    networkManager.on('move-made', (data) => {
      setSquares(data.board);
      setXIsNext(data.nextPlayer === 'X');
    });

    networkManager.on('game-over', (data) => {
      setSquares(data.board);
    });

    networkManager.on('game-restart', (data) => {
      setSquares(data.board);
      setXIsNext(data.currentPlayer === 'X');
    });

    networkManager.on('opponent-left', () => {
      setNetworkState(prev => ({
        ...prev,
        roomCode: null,
      }));
    });

    networkManager.on('game-ended', (data) => {
      if (data.reason === 'opponent-left') {
        setNetworkState(prev => ({
          ...prev,
          roomCode: null,
          opponentName: null,
        }));
      }
    });

    networkManager.on('error', (data) => {
      setNetworkState(prev => ({ ...prev, error: data.message }));
    });

    return () => {
      networkManager.disconnect();
    };
  }, []);

  const handleSquareClick = useCallback((index) => {
    if (winner || squares[index]) {
      return;
    }

    if (gameMode === 'NET' && networkState.roomCode) {
      const mySymbol = networkState.mySymbol || (networkState.isHost ? 'X' : 'O');
      if (currentPlayer !== mySymbol) {
        return;
      }
      networkManager.makeMove(index, mySymbol, networkState.roomCode);
      return;
    }

    const humanSymbol = gameMode === '1P' ? playerSymbol : (xIsNext ? 'X' : 'O');
    const aiSymbol = humanSymbol === 'X' ? 'O' : 'X';

    if (gameMode === '1P' && !xIsNext) {
      return;
    }

    const nextSquares = squares.slice();
    nextSquares[index] = humanSymbol;
    setSquares(nextSquares);

    if (gameMode === '1P' && !calculateWinner(nextSquares) && nextSquares.some(Boolean)) {
      setXIsNext(false);
      setTimeout(() => {
        const emptySpots = nextSquares.map((val, idx) => (val === null ? idx : null)).filter((i) => i !== null);
        const randomSpot = emptySpots[Math.floor(Math.random() * emptySpots.length)];
        const aiSquares = nextSquares.slice();
        aiSquares[randomSpot] = aiSymbol;
        setSquares(aiSquares);
        if (!calculateWinner(aiSquares) && aiSquares.some(Boolean)) {
          setXIsNext(true);
        }
      }, 500);
    } else {
      setXIsNext(!xIsNext);
    }
  }, [gameMode, squares, winner, xIsNext, playerSymbol, currentPlayer, networkState]);

  const handleRestart = () => {
    if (gameMode === 'NET' && networkState.roomCode) {
      networkManager.playAgain(networkState.roomCode);
      return;
    }
    setSquares(Array(9).fill(null));
    setXIsNext(true);
    setShowSetupDialog(true);
  };

  const handleStartGame = () => {
    setShowSetupDialog(false);
    setSquares(Array(9).fill(null));
    const startsFirst = playerSymbol === 'X';
    setXIsNext(startsFirst);

    if (gameMode === '1P' && !startsFirst) {
      setTimeout(() => {
        const emptySpots = Array(9).fill(null).map((_, idx) => idx);
        const randomSpot = emptySpots[Math.floor(Math.random() * emptySpots.length)];
        const newSquares = Array(9).fill(null);
        newSquares[randomSpot] = 'X';
        setSquares(newSquares);
        setXIsNext(true);
      }, 500);
    }
  };

  const handleNetworkMode = async () => {
    setGameMode('NET');
    setShowSetupDialog(false);
    
    if (!playerName) {
      setShowNameDialog(true);
      return;
    }
    
    try {
      await networkManager.connect();
      networkManager.setName(playerName);
    } catch (err) {
      setNetworkState(prev => ({ ...prev, error: 'Failed to connect to server' }));
    }
  };

  const handleSaveName = () => {
    if (tempName.trim()) {
      setPlayerName(tempName.trim());
      localStorage.setItem('ttt-player-name', tempName.trim());
      setShowNameDialog(false);
      setTempName('');
      
      networkManager.connect().then(() => {
        networkManager.setName(tempName.trim());
      }).catch(() => {
        setNetworkState(prev => ({ ...prev, error: 'Failed to connect to server' }));
      });
    }
  };

  const handleRequestGame = (targetPlayerId) => {
    networkManager.requestGame(targetPlayerId);
  };

  const handleAcceptGame = () => {
    if (networkState.incomingRequest) {
      networkManager.acceptGame(networkState.incomingRequest.fromPlayerId);
    }
  };

  const handleRejectGame = () => {
    if (networkState.incomingRequest) {
      networkManager.rejectGame(networkState.incomingRequest.fromPlayerId);
      setNetworkState(prev => ({ ...prev, incomingRequest: null }));
    }
  };

  const handleLeaveNetwork = () => {
    networkManager.disconnect();
    setGameMode(null);
    setNetworkState({
      connected: false,
      myPlayerId: null,
      players: [],
      roomCode: null,
      isHost: false,
      mySymbol: 'X',
      opponentName: null,
      incomingRequest: null,
      outgoingRequest: null,
      error: null,
    });
    setShowSetupDialog(true);
  };

  const humanSymbol = playerSymbol;
  const aiSymbol = humanSymbol === 'X' ? 'O' : 'X';
  const opponentSymbol = humanSymbol === 'X' ? 'O' : 'X';
  const mySymbol = gameMode === 'NET' ? (networkState.mySymbol || (networkState.isHost ? 'X' : 'O')) : humanSymbol;
  const netOpponentSymbol = mySymbol === 'X' ? 'O' : 'X';

  const isMyTurn = gameMode === 'NET' && currentPlayer === mySymbol;

  if (showNameDialog) {
    return (
      <div className="game-dialog-backdrop">
        <div className="game-dialog name-dialog">
          <div className="dialog-title">Enter Your Name</div>
          <div className="name-input-section">
            <input
              type="text"
              className="name-input"
              placeholder="Your name"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              maxLength={20}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSaveName();
                }
              }}
            />
          </div>
          <div className="name-buttons">
            <button className="dialog-button start-button" onClick={handleSaveName}>
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (gameMode === 'NET' && !networkState.roomCode) {
    return (
      <div className="game-shell">
        <div className="status-panel">
          {networkState.connected 
            ? `Playing as ${playerName}` 
            : 'Connecting...'}
        </div>
        
        {networkState.incomingRequest && (
          <div className="request-dialog">
            <div className="request-message">
              <strong>{networkState.incomingRequest.fromPlayerName}</strong> wants to play!
            </div>
            <div className="request-buttons">
              <button className="dialog-button accept-btn" onClick={handleAcceptGame}>
                Accept
              </button>
              <button className="dialog-button reject-btn" onClick={handleRejectGame}>
                Reject
              </button>
            </div>
          </div>
        )}

        <div className="players-list">
          <div className="players-header">Players Online</div>
          {networkState.players.length === 0 ? (
            <div className="no-players">No players online</div>
          ) : (
            networkState.players.map(player => (
              <div key={player.id} className="player-item">
                <span className="player-name">{player.name}</span>
                <span className={`player-status ${player.status}`}>
                  {player.status === 'in-game' ? 'In Game' : 'Online'}
                </span>
                {player.status === 'online' && (
                  <button
                    className="play-btn"
                    onClick={() => handleRequestGame(player.id)}
                    disabled={networkState.outgoingRequest !== null}
                  >
                    {networkState.outgoingRequest === player.id ? 'Sent' : 'Play'}
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {networkState.outgoingRequest && (
          <div className="waiting-message">
            Waiting for response...
          </div>
        )}

        <button className="dialog-button" onClick={handleLeaveNetwork}>
          Back
        </button>

        {networkState.error && (
          <div className="error-message">{networkState.error}</div>
        )}

        <div className="icon-buttons">
          <button className="theme-button" onClick={() => setDarkMode(!darkMode)}>
            {darkMode ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    );
  }

  if (gameMode === 'NET' && networkState.roomCode) {
    return (
      <div className="game-shell">
        <div className="status-panel">{status}</div>
        <div className="player-info">
          <span>You ({mySymbol})</span>
          <span>vs {networkState.opponentName} ({netOpponentSymbol})</span>
        </div>
        <Board
          squares={squares}
          onSquareClick={handleSquareClick}
          winningLine={winner?.line}
        />
        {gameOver && (
          <div className="game-dialog-backdrop" onClick={handleRestart}>
            <div className="game-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="dialog-title">Game over</div>
              <div className="dialog-body">{dialogMessage}</div>
              <button className="dialog-button" onClick={handleRestart}>
                Play Again
              </button>
              <button className="dialog-button leave-btn" onClick={handleLeaveNetwork}>
                Leave Game
              </button>
            </div>
          </div>
        )}
        <div className="icon-buttons">
          <button className="theme-button" onClick={() => setDarkMode(!darkMode)}>
            {darkMode ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="game-shell">
      {showSetupDialog && (
        <div className="game-dialog-backdrop">
          <div className="game-dialog setup-dialog">
            <div className="dialog-title">Game Setup</div>
            <div className="setup-section">
              <span className="setup-label">Game Mode:</span>
              <div className="mode-buttons">
                <button
                  className={`mode-button ${gameMode === '2P' ? 'active' : ''}`}
                  onClick={() => setGameMode('2P')}
                >
                  2 Player
                </button>
                <button
                  className={`mode-button ${gameMode === '1P' ? 'active' : ''}`}
                  onClick={() => setGameMode('1P')}
                >
                  vs AI
                </button>
                <button
                  className={`mode-button ${gameMode === 'NET' ? 'active' : ''}`}
                  onClick={handleNetworkMode}
                >
                  Online
                </button>
              </div>
            </div>
            {(gameMode === '2P' || gameMode === '1P') && (
              <>
                <div className="setup-section">
                  <span className="setup-label">Choose your symbol:</span>
                  <div className="symbol-buttons">
                    <button
                      className={`symbol-button ${playerSymbol === 'X' ? 'active' : ''}`}
                      onClick={() => setPlayerSymbol('X')}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                        <line x1="4" y1="4" x2="20" y2="20" />
                        <line x1="20" y1="4" x2="4" y2="20" />
                      </svg>
                    </button>
                    <button
                      className={`symbol-button ${playerSymbol === 'O' ? 'active' : ''}`}
                      onClick={() => setPlayerSymbol('O')}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <circle cx="12" cy="12" r="8" />
                      </svg>
                    </button>
                  </div>
                </div>
                <button
                  className="dialog-button start-button"
                  onClick={handleStartGame}
                  disabled={!gameMode}
                >
                  Start Game
                </button>
              </>
            )}
            {networkState.error && (
              <div className="error-message">{networkState.error}</div>
            )}
          </div>
        </div>
      )}
      <div className="status-panel">{status}</div>
      {gameMode && (
        <div className="player-info">
          {gameMode === 'NET' ? (
            <>
              <span>Player 1: {mySymbol}</span>
              <span>Player 2: {netOpponentSymbol}</span>
            </>
          ) : (
            <>
              <span>Player 1: {playerSymbol}</span>
              {gameMode === '1P' ? (
                <span>AI: {aiSymbol}</span>
              ) : (
                <span>Player 2: {opponentSymbol}</span>
              )}
            </>
          )}
        </div>
      )}
      <Board
        squares={squares}
        onSquareClick={handleSquareClick}
        winningLine={winner?.line}
      />
      {gameOver && (
        <div className="game-dialog-backdrop" onClick={handleRestart}>
          <div className="game-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">Game over</div>
            <div className="dialog-body">{dialogMessage}</div>
            <button className="dialog-button" onClick={handleRestart}>
              Restart
            </button>
          </div>
        </div>
      )}
      <div className="icon-buttons">
        <button className="theme-button" onClick={() => setDarkMode(!darkMode)}>
          {darkMode ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
        <button className="restart-button" onClick={handleRestart}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
