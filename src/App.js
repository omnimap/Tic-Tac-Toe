import { useState, useEffect } from 'react';
import Game from './Game';

export default function App() {
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
  }, [darkMode]);

  return (
    <main className="app-shell">
      <h1>Tic-Tac-Toe</h1>
      <Game darkMode={darkMode} setDarkMode={setDarkMode} />
    </main>
  );
}
