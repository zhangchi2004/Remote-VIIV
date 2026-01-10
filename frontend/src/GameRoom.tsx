import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom'; // Assuming I can add params parsing without lib?
// Actually simpler to just parse window.location or assume user enters ID.
// But sticking to a single "Lobby" flow is better.
// Let's assume App.tsx passes gameId and mainPlayerId.

import { joinGame, startGame } from './api';
import { GameClient } from './GameClient';

interface Props {
   gameId: string;
   mainPlayerId: string;
   mainPlayerName: string;
}

export const GameRoom: React.FC<Props> = ({ gameId, mainPlayerId, mainPlayerName }) => {
    // List of connected players we are managing
    const [clients, setClients] = useState<{id: string, name: string}[]>([
        { id: mainPlayerId, name: mainPlayerName }
    ]);
    const [activeTab, setActiveTab] = useState<string>(mainPlayerId);

    const spawnBots = async () => {
        // Create 5 bots
        const newClients = [];
        for (let i = 1; i <= 5; i++) {
            const name = `Bot_${i}`;
            try {
                const res = await joinGame(gameId, name);
                newClients.push({ id: res.player_id, name });
            } catch (e) {
                console.error("Failed to join bot", e);
            }
        }
        setClients(prev => [...prev, ...newClients]);
    };

    const handleStart = async () => {
        try {
            await startGame(gameId);
        } catch (e) {
            alert(e);
        }
    };

    return (
        <div className="flex flex-col h-screen">
            {/* Header / Tabs */}
            <div className="bg-gray-900 border-b border-gray-700 flex items-center p-2 gap-2 overflow-x-auto">
                <div className="font-bold mr-4 text-yellow-500">Room: {gameId}</div>
                
                {clients.map(c => (
                    <button
                        key={c.id}
                        onClick={() => setActiveTab(c.id)}
                        className={`px-3 py-1 rounded text-sm whitespace-nowrap ${
                            activeTab === c.id ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300"
                        }`}
                    >
                        {c.name}
                    </button>
                ))}

                <div className="ml-auto flex gap-2">
                    {clients.length < 6 && (
                        <button onClick={spawnBots} className="bg-green-700 px-3 py-1 rounded text-sm hover:bg-green-600 border border-green-500">
                            + 5 Bots (Debug)
                        </button>
                    )}
                    <button onClick={handleStart} className="bg-red-700 px-3 py-1 rounded text-sm hover:bg-red-600 border border-red-500">
                        Start Game
                    </button>
                </div>
            </div>

            {/* Client Views */}
            <div className="flex-1 relative">
                {clients.map(c => (
                    <div 
                        key={c.id} 
                        className="absolute inset-0 w-full h-full"
                        style={{ visibility: activeTab === c.id ? 'visible' : 'hidden' }}
                    >
                        <GameClient 
                            gameId={gameId} 
                            playerId={c.id} 
                            isActive={activeTab === c.id} // Not used for logic, just possibly for preventing renders logic if needed
                        />
                    </div>
                ))}
            </div>
        </div>
    );
};