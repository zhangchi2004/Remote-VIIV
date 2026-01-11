import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom'; // Assuming I can add params parsing without lib?
// Actually simpler to just parse window.location or assume user enters ID.
// But sticking to a single "Lobby" flow is better.
// Let's assume App.tsx passes gameId and mainPlayerId.

import { joinGame, startGame, getGameInfo } from './api';
import { GameClient } from './GameClient';
import { GamePhase } from './types';

interface Props {
   gameId: string;
   mainPlayerId: string;
   mainPlayerName: string;
}

export const GameRoom: React.FC<Props> = ({ gameId, mainPlayerId, mainPlayerName }) => {
    // List of connected players we are managing
    const [clients, setClients] = useState<{id: string, name: string}[]>(() => {
        // Try to load from session storage
        const key = `viiv_debug_clients_${gameId}`;
        const stored = sessionStorage.getItem(key);
        if (stored) {
            try {
                return JSON.parse(stored);
            } catch (e) { console.error("Failed to parse clients", e); }
        }
        return [{ id: mainPlayerId, name: mainPlayerName }];
    });

    // Make Auto-Play default for Bots?
    // Not easily propagated to GameClient props without changing interface
    // But user can toggle manually in tabs.
    
    // Save clients to SessionStorage whenever it changes
    useEffect(() => {
        sessionStorage.setItem(`viiv_debug_clients_${gameId}`, JSON.stringify(clients));
    }, [clients, gameId]);

    const [activeTab, setActiveTab] = useState<string>(mainPlayerId);
    const [phase, setPhase] = useState<GamePhase>(GamePhase.WAITING);

    useEffect(() => {
        const fetchInfo = async () => {
            const info = await getGameInfo(gameId);
            if (info) {
                if (info.phase) setPhase(info.phase);
                // Also update bots/clients list if needed?
                // Currently 'clients' is local manager mainly for self + spawned bots.
                // We don't query other human players into 'clients' tabs unless we want to multi-play.
                // But for the 'Lobby' visualization, GameClient handles rendering opponents.
                // The prompt asks: "when one player sits down, the other player should be able to see him".
                // Seat visibility is handled by GameClient > renderPlayerSlot > checks players list.
                // We just need to make sure GameClient re-fetches info periodically or on event.
                // But wait, GameClient only calls getGameInfo ONCE.
                // We should add polling there or here. 
            }
        };
        
        fetchInfo(); // Initial
        const timer = setInterval(fetchInfo, 2000); // Poll every 2s for phase change
        return () => clearInterval(timer);
    }, [gameId]);

    const spawnBots = async () => {
        try {
            const info = await getGameInfo(gameId);
            if (!info || !info.seats) return;

            const newClients = [];
            let botIdx = 1;

            for (const seat of info.seats) {
                if (seat.name === null) {
                    const name = `Bot_${botIdx}`;
                    try {
                        const res = await joinGame(gameId, name, seat.seat_index);
                        newClients.push({ id: res.player_id, name });
                        botIdx++;
                    } catch (e) {
                        console.error("Failed to join bot", e);
                    }
                }
            }
            setClients(prev => [...prev, ...newClients]);
        } catch (e) {
            console.error("Failed spawning bots", e);
        }
    };

    const handleStart = async () => {
        try {
            await startGame(gameId);
            setPhase(GamePhase.DRAWING); // Optimistic update
        } catch (e) {
            alert(e);
        }
    };

    const handleExit = () => {
        if (confirm("Are you sure you want to exit?")) {
            localStorage.removeItem("viiv_game_id");
            localStorage.removeItem("viiv_player_id");
            // Name kept for convenience
            window.location.href = "/";
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
                    
                    {phase === GamePhase.WAITING ? (
                        <button onClick={handleStart} className="bg-red-700 px-3 py-1 rounded text-sm hover:bg-red-600 border border-red-500 shrink-0">
                            Start Game
                        </button>
                    ) : (
                        <button onClick={handleExit} className="bg-gray-700 px-3 py-1 rounded text-sm hover:bg-gray-600 border border-gray-500 shrink-0">
                            Exit
                        </button>
                    )}
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