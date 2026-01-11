import React, { useState, useEffect } from 'react';
import { createGame, joinGame, getGameInfo, registerUser, loginUser } from './api';
import { GameRoom } from './GameRoom';

type AppStep = 'login' | 'lobby' | 'seat-selection' | 'game';

function App() {
  const [step, setStep] = useState<AppStep>('login');
  
  // Auth State
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  
  // Game State
  const [data, setData] = useState({ gameId: "", playerId: "", playerName: "" });
  const [inputRoom, setInputRoom] = useState("test_room");
  const [seats, setSeats] = useState<any[]>([]);

  // 1. Initial Load: Check Session Storage
  useEffect(() => {
       const storedUser = sessionStorage.getItem("viiv_username");
       const storedGame = sessionStorage.getItem("viiv_game_id");
       const storedPlayerId = sessionStorage.getItem("viiv_player_id");
       
       if (storedUser) {
           setUsername(storedUser);
           // Restore game if available
           if (storedGame && storedPlayerId) {
               getGameInfo(storedGame).then(info => {
                  if (info) {
                      setData({ gameId: storedGame, playerId: storedPlayerId, playerName: storedUser });
                      setStep('game');
                  } else {
                      sessionStorage.removeItem("viiv_game_id"); // Clear invalid
                      setStep('lobby');
                  }
               });
           } else {
               setStep('lobby');
           }
       }
  }, []);

  const handleAuth = async () => {
      try {
          if (isRegister) {
             await registerUser(username, password);
             alert("Registered! Please login.");
             setIsRegister(false);
          } else {
             const res = await loginUser(username, password);
             // res = { username, active_game, active_player_id }
             sessionStorage.setItem("viiv_username", res.username);
             
             if (res.active_game && res.active_player_id) {
                 setData({ gameId: res.active_game, playerId: res.active_player_id, playerName: res.username });
                 // Also sync storage so refreshing works
                 sessionStorage.setItem("viiv_game_id", res.active_game);
                 sessionStorage.setItem("viiv_player_id", res.active_player_id);
                 setStep('game');
             } else {
                 setStep('lobby');
             }
          }
      } catch (e: any) {
          alert("Auth Error: " + e.message);
      }
  };

  const handleLogout = () => {
      sessionStorage.clear();
      setUsername("");
      setPassword("");
      setStep('login');
  };

  // Lobby & Seat Logic

  // Periodically refresh seats if in selection mode
  useEffect(() => {
      let interval: any;
      if (step === 'seat-selection') {
          fetchSeats();
          interval = setInterval(fetchSeats, 2000);
      }
      return () => clearInterval(interval);
  }, [step]);

  const fetchSeats = async () => {
      const info = await getGameInfo(inputRoom);
      if (info && info.seats) {
          setSeats(info.seats);
      }
  };

  const handleEnterRoom = async (create: boolean) => {
      try {
          if (create) {
             await createGame(inputRoom);
          }
          const info = await getGameInfo(inputRoom);
          if (!info) {
              alert("Room does not exist.");
              return;
          }
          setSeats(info.seats);
          setStep('seat-selection');
      } catch (e: any) {
          alert("Error: " + e.message);
      }
  };

  const handleSelectSeat = async (seatIdx: number) => {
      try {
          // Use logged in username
          const res = await joinGame(inputRoom, username, seatIdx);
          const newData = { gameId: inputRoom, playerId: res.player_id, playerName: username };
          setData(newData);
          
          // Save session to SessionStorage (Tab isolated)
          sessionStorage.setItem("viiv_game_id", newData.gameId);
          sessionStorage.setItem("viiv_player_id", newData.playerId);
          
          setStep('game');
      } catch (e: any) {
          alert("Could not join: " + (e.message || e));
      }
  };

  // RENDER

  if (step === 'login') {
      return (
          <div className="flex h-screen items-center justify-center bg-gray-900 text-white">
            <div className="bg-gray-800 p-8 rounded shadow-lg w-96 space-y-4">
                <h1 className="text-2xl font-bold text-center text-yellow-500">VIIV Poker Login</h1>
                <input 
                    className="w-full bg-gray-700 p-2 rounded" 
                    placeholder="Username"
                    value={username} onChange={e => setUsername(e.target.value)}
                />
                <input 
                    className="w-full bg-gray-700 p-2 rounded" 
                    type="password" placeholder="Password"
                    value={password} onChange={e => setPassword(e.target.value)}
                />
                <button 
                    onClick={handleAuth}
                    className="w-full bg-blue-600 hover:bg-blue-500 py-2 rounded font-bold"
                >
                    {isRegister ? "Register" : "Login"}
                </button>
                <div className="text-center text-sm text-gray-400 cursor-pointer" onClick={() => setIsRegister(!isRegister)}>
                    {isRegister ? "Back to Login" : "Create Account"}
                </div>
            </div>
          </div>
      );
  }

  if (step === 'game') {
      return (
          <div className="h-full">
            <button onClick={handleLogout} className="fixed top-2 right-2 z-50 text-xs text-gray-500 hover:text-white">Logout</button>
            <GameRoom 
                gameId={data.gameId} 
                mainPlayerId={data.playerId} 
                mainPlayerName={data.playerName} 
            />
          </div>
      );
  }

  if (step === 'seat-selection') {
      return (
          <div className="flex flex-col h-screen items-center justify-center bg-gray-900 text-white">
              <h1 className="text-3xl font-bold mb-4 text-yellow-500">Room: {inputRoom}</h1>
              <div className="flex gap-4 mb-8">
                  <button onClick={() => setStep('lobby')} className="text-gray-400 underline">Back</button>
                  <button onClick={handleLogout} className="text-red-400 underline">Logout {username}</button>
              </div>

              <div className="grid grid-cols-3 gap-4 w-full max-w-2xl px-4">
                  {[0,1,2,3,4,5].map(i => {
                      const seat = seats.find(s => s.seat_index === i);
                      const isTaken = seat && seat.name !== null;
                      const isMe = seat?.name === username;

                      return (
                          <div 
                            key={i}
                            onClick={() => {
                                if (!isTaken) handleSelectSeat(i);
                                else if (isMe) {
                                    // Reclaim logic
                                    const pId = `player_${i}`;
                                    const newData = { gameId: inputRoom, playerId: pId, playerName: username };
                                    setData(newData);
                                    sessionStorage.setItem("viiv_game_id", newData.gameId);
                                    sessionStorage.setItem("viiv_player_id", newData.playerId);
                                    setStep('game');
                                }
                            }}
                            className={`
                                h-32 border-2 rounded-lg flex flex-col items-center justify-center cursor-pointer transition
                                ${isTaken 
                                    ? (isMe ? "bg-blue-900/50 border-blue-500 hover:bg-blue-800" : "bg-red-900/50 border-red-500 cursor-not-allowed")
                                    : "bg-green-900/30 border-green-500 hover:bg-green-800"
                                }
                            `}
                          >
                                <div className="text-xl font-bold">Seat {i}</div>
                                {isTaken ? (
                                    <div className="mt-2 font-bold text-red-300">{seat.name} {isMe && "(You)"}</div>
                                ) : (
                                    <div className="mt-2 text-green-300">Available</div>
                                )}
                          </div>
                      );
                  })}
              </div>
          </div>
      )
  }

  // Lobby
  return (
    <div className="flex h-screen items-center justify-center bg-gray-900 text-white">
        <div className="bg-gray-800 p-8 rounded shadow-lg w-96 space-y-4">
            <h1 className="text-2xl font-bold text-center text-yellow-500">Game Lobby</h1>
            <div className="text-center text-sm text-gray-400">Logged in as: {username}</div>
            
            <input 
                className="w-full bg-gray-700 p-2 rounded text-white"
                value={inputRoom}
                onChange={e => setInputRoom(e.target.value)}
                placeholder="Room Name"
            />

            <div className="flex gap-4 pt-4">
                <button 
                    onClick={() => handleEnterRoom(true)}
                    className="flex-1 bg-green-700 hover:bg-green-600 py-2 rounded font-bold"
                >
                    Create Room
                </button>
                <button 
                    onClick={() => handleEnterRoom(false)}
                    className="flex-1 bg-gray-600 hover:bg-gray-500 py-2 rounded font-bold"
                >
                    Join Room
                </button>
            </div>
            
             <button onClick={handleLogout} className="w-full text-xs text-gray-500 mt-4 hover:text-white">Logout</button>
        </div>
    </div>
  );
}

export default App;
