import React, { useState, useEffect } from 'react';
import { createGame, joinGame, getGameInfo } from './api';
import { GameRoom } from './GameRoom';

type AppStep = 'login' | 'seat-selection' | 'game';

function App() {
  const [step, setStep] = useState<AppStep>('login');
  const [data, setData] = useState({ gameId: "", playerId: "", playerName: "" });

  const [inputRoom, setInputRoom] = useState("test_room");
  const [inputName, setInputName] = useState("Player1");
  const [seats, setSeats] = useState<any[]>([]);

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
          // Check if exists
          const info = await getGameInfo(inputRoom);
          if (!info) {
              alert("Room does not exist. Create it first.");
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
          const res = await joinGame(inputRoom, inputName, seatIdx);
          setData({ gameId: inputRoom, playerId: res.player_id, playerName: inputName });
          setStep('game');
      } catch (e: any) {
          alert("Could not join seat: " + e.message);
      }
  };

  if (step === 'game') {
      return (
          <GameRoom 
            gameId={data.gameId} 
            mainPlayerId={data.playerId} 
            mainPlayerName={data.playerName} 
          />
      );
  }

  if (step === 'seat-selection') {
      return (
          <div className="flex flex-col h-screen items-center justify-center bg-gray-900 text-white">
              <h1 className="text-3xl font-bold mb-4 text-yellow-500">Pick a Seat @ {inputRoom}</h1>
              <button onClick={() => setStep('login')} className="mb-8 text-gray-400 underline">Back</button>

              <div className="grid grid-cols-3 gap-4 w-full max-w-2xl px-4">
                  {/* Seats: 0, 1 (Team A) | 2, 3 (Team B) | 4, 5 (Team C) -- No, teams are % 3 */}
                  {/* Seat % 3: 0->0, 1->1, 2->2, 3->0, 4->1, 5->2 */}
                  {/* Display them in a circle or 2 rows */}
                  {/* Row 1: 0, 1, 2 */}
                  {/* Row 2: 3, 4, 5 */}
                  {[0,1,2,3,4,5].map(i => {
                      const seat = seats.find(s => s.seat_index === i);
                      const isTaken = seat && seat.name !== null;
                      const userInThisSeat = isTaken && seat.name === inputName; // Simple check

                      return (
                          <div 
                            key={i}
                            onClick={() => !isTaken && handleSelectSeat(i)}
                            className={`
                                h-32 border-2 rounded-lg flex flex-col items-center justify-center cursor-pointer transition
                                ${isTaken 
                                    ? "bg-red-900/50 border-red-500 cursor-not-allowed" 
                                    : "bg-green-900/30 border-green-500 hover:bg-green-800"
                                }
                            `}
                          >
                                <div className="text-xl font-bold">Seat {i}</div>
                                <div className="text-sm text-gray-400">Team {i % 3}</div>
                                {isTaken ? (
                                    <div className="mt-2 font-bold text-red-300">{seat.name}</div>
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
                    onClick={() => handleEnterRoom(true)}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 py-2 rounded font-bold"
                >
                    Create
                </button>
                <button 
                    onClick={() => handleEnterRoom(false)}
                    className="flex-1 bg-gray-600 hover:bg-gray-500 py-2 rounded font-bold"
                >
                    Find
                </button>
            </div>
        </div>
    </div>
  );
}

export default App;