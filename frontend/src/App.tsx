import React, { useState } from 'react';
import { createGame, joinGame } from './api';
import { GameRoom } from './GameRoom';

function App() {
  const [inGame, setInGame] = useState(false);
  const [data, setData] = useState({ gameId: "", playerId: "", playerName: "" });

  const [inputRoom, setInputRoom] = useState("test_room");
  const [inputName, setInputName] = useState("Player1");

  const handleCreate = async () => {
      try {
          await createGame(inputRoom);
          const res = await joinGame(inputRoom, inputName);
          setData({ gameId: inputRoom, playerId: res.player_id, playerName: inputName });
          setInGame(true);
      } catch (e: any) {
          alert("Error: " + e.message);
      }
  };

  const handleJoin = async () => {
      try {
          const res = await joinGame(inputRoom, inputName);
          setData({ gameId: inputRoom, playerId: res.player_id, playerName: inputName });
          setInGame(true);
      } catch (e: any) {
          alert("Error: " + e.message);
      }
  };

  if (inGame) {
      return (
          <GameRoom 
            gameId={data.gameId} 
            mainPlayerId={data.playerId} 
            mainPlayerName={data.playerName} 
          />
      );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-gray-900">
        <div className="bg-gray-800 p-8 rounded shadow-lg w-96 space-y-4">
            <h1 className="text-2xl font-bold text-center text-yellow-500">Shengji Poker (6p)</h1>
            
            <div>
                <label className="block text-sm text-gray-400">Room Name</label>
                <input 
                    className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white"
                    value={inputRoom}
                    onChange={e => setInputRoom(e.target.value)}
                />
            </div>

            <div>
                <label className="block text-sm text-gray-400">Your Name</label>
                <input 
                    className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white"
                    value={inputName}
                    onChange={e => setInputName(e.target.value)}
                />
            </div>

            <div className="flex gap-4 pt-4">
                <button 
                    onClick={handleCreate}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 py-2 rounded font-bold"
                >
                    Create & Join
                </button>
                <button 
                    onClick={handleJoin}
                    className="flex-1 bg-gray-600 hover:bg-gray-500 py-2 rounded font-bold"
                >
                    Join
                </button>
            </div>
        </div>
    </div>
  );
}

export default App;