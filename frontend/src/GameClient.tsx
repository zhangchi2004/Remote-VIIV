import React, { useEffect, useState, useRef } from 'react';
import { Card, GamePhase, Suit, Rank } from './types';
import { CardView } from './components/CardView';
import { GameLogic } from './gameLogic';

// Helper to determine if we should enable "Bot Mode" for this client?
// User asked for "one user debug". Switching tabs manually is fine.
// But some automation for "Pass" or "Skip" is nice? 
// No, strict rules mean we have to play carefully. Manual is best.

interface Props {
    gameId: string;
    playerId: string;
    isActive: boolean; // Is this the currently viewable tab?
}

export const GameClient: React.FC<Props> = ({ gameId, playerId, isActive }) => {
    const [hand, setHand] = useState<Card[]>([]);
    const [phase, setPhase] = useState<GamePhase>(GamePhase.WAITING);
    const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
    const [logs, setLogs] = useState<string[]>([]);
    
    // Game State
    const [mainSuit, setMainSuit] = useState<Suit | null>(null);
    const [currentLevel, setCurrentLevel] = useState<number>(3);
    const [currentTurn, setCurrentTurn] = useState<number>(-1);
    const [myIdx, setMyIdx] = useState<number>(-1);
    const [trickCards, setTrickCards] = useState<{player: number, cards: string[]}[]>([]);
    const [scores, setScores] = useState<{[key:number]: number}>({0:0, 1:0, 2:0});
    const [dealerIdx, setDealerIdx] = useState<number>(-1);
    
    const ws = useRef<WebSocket | null>(null);

    // Initial State Fetch? No, rely on WS for updates or fetch once.
    // Ideally we fetch state on mount to sync up.
    
    useEffect(() => {
        // Parse My Index
        const idx = parseInt(playerId.split('_')[1]);
        if (!isNaN(idx)) setMyIdx(idx);

        // Connect WS
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const host = window.location.host; 
        // Vite proxy setup forces us to use relatives or explicit host.
        // If running dev server, it's usually localhost:5173 -> proxy localhost:8000
        // So ws://localhost:5173/ws/... should proxy.
        
        const socket = new WebSocket(`ws://${host}/ws/${gameId}/${playerId}`);
        ws.current = socket;

        socket.onopen = () => {
            addLog("Connected");
        };

        socket.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            handleMessage(msg);
        };

        socket.onclose = () => addLog("Disconnected");

        return () => {
            socket.close();
        };
    }, [gameId, playerId]);

    // Advanced Sorting Logic for UI
    // Group: Main Cards (Jokers, Level, 2s, MainSuit) > Sub Suits
    const sortedHand = [...hand].sort((a, b) => {
        const getScore = (c: Card) => {
            if (c.rank === Rank.BIG_JOKER) return 10000;
            if (c.rank === Rank.SMALL_JOKER) return 9000;
            
            // Level Cards
            if (c.rank === currentLevel) {
                 return (c.suit === mainSuit) ? 8500 : 8000;
            }
            
            // Twos
            if (c.rank === Rank.TWO) {
                 return (c.suit === mainSuit) ? 7500 : 7000;
            }
            
            // Main Suit
            if (mainSuit && c.suit === mainSuit) {
                 return 6000 + c.rank;
            }
            
            // Sub Suits
            // Group by suit constant order
            let suitScore = 0;
            if (c.suit === Suit.SPADES) suitScore = 4000;
            else if (c.suit === Suit.HEARTS) suitScore = 3000;
            else if (c.suit === Suit.CLUBS) suitScore = 2000;
            else if (c.suit === Suit.DIAMONDS) suitScore = 1000;
            
            return suitScore + c.rank;
        };
        
        return getScore(b) - getScore(a); // Descending
    });

    const handleMessage = (msg: any) => {
        switch (msg.type) {
            case "NEW_CARD":
                setHand(prev => [...prev, msg.card]);
                setPhase(GamePhase.DRAWING);
                break;
            case "DRAWING_COMPLETE":
                setPhase(GamePhase.DRAWING); // Actually it finishes, check payload
                if (msg.main_suit) setMainSuit(msg.main_suit);
                setDealerIdx(msg.dealer_idx);
                addLog(`Drawing Complete. Main Suit: ${msg.main_suit || "None"}. Dealer: ${msg.dealer_idx}`);
                break;
            case "EXCHANGE_START":
                setPhase(GamePhase.EXCHANGING);
                if (msg.bottom_cards) {
                    setHand(prev => [...prev, ...msg.bottom_cards]);
                }
                addLog(msg.message);
                break;
            case "MAIN_DECLARED":
                setMainSuit(msg.suit);
                addLog(`Player ${msg.player_idx} declared ${msg.suit} (Strength ${msg.strength})`);
                break;
            case "GAME_START_PLAY":
                setPhase(GamePhase.PLAYING);
                setCurrentTurn(msg.current_turn);
                setTrickCards([]);
                addLog("Game Started!");
                break;
            case "PLAYER_PLAYED":
                 // msg.cards is list of strings? No, backend sent list of strings in my simplified code.
                 // Need to parse if possible or display text.
                 setTrickCards(prev => [...prev, { player: msg.player_idx, cards: msg.cards }]);
                 setCurrentTurn(msg.next_turn);
                 break;
            case "TRICK_FINISHED":
                 addLog(`Trick Winner: ${msg.winner_idx}. Points: ${msg.points}`);
                 setScores(msg.scores);
                 setCurrentTurn(msg.next_turn);
                 setTimeout(() => setTrickCards([]), 2000); // Clear table after delay
                 break;
            case "ERROR":
                 alert("Error: " + msg.message);
                 break;
            case "GAME_OVER":
                 setPhase(GamePhase.FINISHED);
                 setScores(msg.scores);
                 addLog("Game Over!");
                 break;
            default:
                 console.log("Unknown msg", msg);
        }
    };

    const addLog = (txt: string) => setLogs(prev => [txt, ...prev].slice(0, 50));

    const toggleSelect = (id: string) => {
        const newSet = new Set(selectedCardIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedCardIds(newSet);
    };

    // Actions
    const declareMain = () => {
        if (selectedCardIds.size === 0) return;
        // Prompt for suit if Joker? Simplified: Assume non-joker or guess.
        // For UI simplicity, just send first card's suit.
        const firstId = Array.from(selectedCardIds)[0];
        const card = hand.find(c => c.id === firstId);
        if (!card) return;
        
        let suit = card.suit;
        if (suit === Suit.JOKER) {
             const s = prompt("Enter Suit (♠, ♥, ♣, ♦):");
             if (s) suit = s as Suit;
        }

        ws.current?.send(JSON.stringify({
             action: "DECLARE_MAIN",
             card_ids: Array.from(selectedCardIds),
             suit: suit
        }));
    };

    const exchangeCards = () => {
         if (selectedCardIds.size !== 6) {
             alert("Must select 6 cards");
             return;
         }
         ws.current?.send(JSON.stringify({
             action: "EXCHANGE_CARDS",
             card_ids: Array.from(selectedCardIds)
         }));
         // Optimistic removal
         const ids = Array.from(selectedCardIds);
         setHand(prev => prev.filter(c => !ids.includes(c.id)));
         setSelectedCardIds(new Set());
    };

    const playCards = () => {
        if (selectedCardIds.size === 0) return;
        
        const playingCards = hand.filter(c => selectedCardIds.has(c.id));
        
        // --- Frontend Validation ---
        // 1. Validate Lead or Follow
        // Check if I am Leader. 
        // Logic: active player is currentTurn. If check trickCards is empty?
        // Wait, trickCards updates via WS. If everyone else played, trickCards.length > 0.
        // If it's my turn and trickCards.length == 0 => I am Leader.
        // If trickCards.length > 0 => I am Follower.
        
        const isLeader = trickCards.length === 0;
        
        if (isLeader) {
            if (!GameLogic.validateLeadTurn(playingCards)) {
                 alert("Invalid Lead! Must be Single, Pair, Triple, or Quad of Identical cards.");
                 return;
            }
        } else {
            // Validate Follow
            const leaderMove = trickCards[0]; // { player, cards: ["♠A", ...] }
            // Must convert leader cards strings to Dummy Cards for validation
            const leaderCardsObj = leaderMove.cards.map(s => {
                const parsed = GameLogic.parseBackendCardString(s);
                // We need an ID for interface, but logic doesn't use it.
                return { id: "dummy", suit: parsed?.suit, rank: parsed?.rank } as Card;
            }).filter(c => c.suit && c.rank); // Filter nulls? Logic assumes valid
            
            if (leaderCardsObj.length !== leaderMove.cards.length) {
                console.error("Failed to parse leader cards", leaderMove.cards);
                alert("Internal Error parsing leader cards");
                return;
            }

            const result = GameLogic.validateFollowTurn(
                leaderCardsObj, 
                playingCards, 
                hand, 
                mainSuit, 
                currentLevel
            );

            if (!result.valid) {
                 alert("Invalid Follow: " + result.message);
                 return;
            }
        }
        
        ws.current?.send(JSON.stringify({
            action: "PLAY_CARDS",
            card_ids: Array.from(selectedCardIds)
        }));
        // Optimistic removal
         const ids = Array.from(selectedCardIds);
         setHand(prev => prev.filter(c => !ids.includes(c.id)));
         setSelectedCardIds(new Set());
    };

    const dealerTeam = dealerIdx !== -1 ? dealerIdx % 3 : -1;
    // Catching teams are the other two.
    // E.g. If dealer is 0 (Team 0). Catching are Team 1 and Team 2.
    // Display Scores
    const renderScores = () => {
        if (dealerTeam === -1) return null;
        return (
            <div className="flex gap-4 text-sm font-mono">
                {Object.entries(scores).map(([teamId, score]) => {
                    const tid = parseInt(teamId);
                    const isDealerTeam = tid === dealerTeam;
                    return (
                        <div key={tid} className={isDealerTeam ? "text-yellow-400" : "text-green-400"}>
                             Team {tid} {isDealerTeam ? "(Dealer)" : "(Catching)"}: {score}
                        </div>
                    );
                })}
            </div>
        );
    };

    // Render Trick Table Layout
    // Two rows of three. Self at bottom center.
    // Row 1 (Top): [Left Top, Top Center, Right Top]
    // Row 2 (Bottom): [Left Bottom, Self, Right Bottom]
    // Relative locations: 
    // Self = 0.
    // Order of play is usually 0 -> 1 -> 2 ...
    // If we map:
    // [4, 3, 2]
    // [5, 0, 1]
    
    // Relative Index logic: (pIdx - myIdx + 6) % 6
    // 0 -> Me -> Pos 0 (Bottom Center)
    // 1 -> Right -> Pos 1 (Bottom Right)
    // 2 -> Right Top -> Pos 2 (Top Right)
    // 3 -> Top -> Pos 3 (Top Center)
    // 4 -> Left Top -> Pos 4 (Top Left)
    // 5 -> Left -> Pos 5 (Bottom Left)
    
    // We render 6 slots.
    const renderTable = () => {
        // Create a map of relative_pos -> played cards
        const positionMap: {[key:number]: string[]} = {}; // key 0-5
        
        trickCards.forEach(move => {
            const rel = (move.player - myIdx + 6) % 6;
            positionMap[rel] = move.cards;
        });

        // Helper to render a card set
        const renderSlot = (relPos: number, label: string) => {
            const cards = positionMap[relPos];
            return (
                <div className="w-32 h-20 bg-white/10 border border-white/20 rounded flex flex-col items-center justify-center p-1 relative">
                    <span className="text-[10px] text-gray-400 absolute top-0 left-1">{label}</span>
                    {cards ? (
                         <div className="flex -space-x-4">
                            {cards.map((c, i) => (
                                <div key={i} className="w-8 h-12 bg-white text-black border shadow-sm flex items-center justify-center text-[10px] rounded">
                                    {c}
                                </div>
                            ))}
                         </div>
                    ) : (
                        <span className="text-white/10 text-xs">Waiting...</span>
                    )}
                </div>
            );
        };

        return (
            <div className="flex flex-col gap-4 items-center mt-8">
                 {/* Top Row: 4, 3, 2 (Left Top, Top, Right Top) */}
                 <div className="flex gap-16">
                     {renderSlot(4, "Left Top")}
                     {renderSlot(3, "Top")}
                     {renderSlot(2, "Right Top")}
                 </div>
                 
                 {/* Bottom Row: 5, 0, 1 (Left Bot, Me, Right Bot) */}
                 <div className="flex gap-16">
                     {renderSlot(5, "Left Bot")}
                     <div className="relative">
                         {renderSlot(0, "Me")}
                         {/* Highlight if my turn */}
                         {currentTurn === myIdx && (
                             <div className="absolute -bottom-2 w-full h-1 bg-yellow-400 animate-pulse" />
                         )}
                     </div>
                     {renderSlot(1, "Right Bot")}
                 </div>
            </div>
        );
    };

    if (!isActive) return null; // Or render hidden for state persistence? 
    // If we return null, component unmounts and WS closes. 
    // We must render but hide it with CSS OR lift state up.
    // But lifting state for 6 players is messy.
    // The parent should manage visibility style, not conditional rendering.
    
    return (
        <div className="flex flex-col h-full bg-gray-900 p-2 text-white overflow-hidden">
            {/* Top Info Bar */}
            <div className="flex justify-between bg-gray-800 p-2 rounded mb-2 items-center">
                <div className="text-xs">
                    <div>PID: {playerId}</div>
                    <div>{phase}</div>
                </div>
                
                <div className="flex-1 flex justify-center">
                   {renderScores()}
                </div>

                <div className="text-xs text-right">
                    <div>Main: {mainSuit || "?"}</div>
                    <div>Turn: {currentTurn}</div>
                </div>
            </div>

            {/* Table Area */}
            <div className="flex-1 bg-green-900 rounded relative p-4 mb-2 overflow-y-auto flex items-center justify-center">
                <div className="absolute top-2 left-2 text-green-200 opacity-20 text-4xl font-bold">TABLE</div>
                {renderTable()}
            </div>

            {/* Hand Area */}
            <div className="h-48 bg-gray-800 rounded p-2 overflow-x-auto flex items-end space-x-[-30px] pr-8">
                {sortedHand.map(card => (
                    <CardView 
                        key={card.id} 
                        card={card} 
                        selected={selectedCardIds.has(card.id)}
                        onClick={() => toggleSelect(card.id)}
                    />
                ))}
            </div>

            {/* Controls */}
            <div className="h-16 flex items-center gap-2 mt-2">
                {phase === GamePhase.DRAWING && (
                    <button onClick={declareMain} className="bg-yellow-600 px-4 py-2 rounded hover:bg-yellow-500">
                        Declare Main
                    </button>
                )}
                {phase === GamePhase.EXCHANGING && (
                    <button onClick={exchangeCards} className="bg-purple-600 px-4 py-2 rounded hover:bg-purple-500">
                        Confirm Exchange (6)
                    </button>
                )}
                {phase === GamePhase.PLAYING && currentTurn === parseInt(playerId.split('_')[1] || "999") && ( // Hacky ID check or use API provided index
                    <button onClick={playCards} className="bg-blue-600 px-4 py-2 rounded hover:bg-blue-500">
                        Play Selected
                    </button>
                )}
                <div className="text-xs text-gray-400 ml-auto w-64 h-full overflow-y-auto bg-black p-1 font-mono">
                    {logs.map((l, i) => <div key={i}>{l}</div>)}
                </div>
            </div>
        </div>
    );
};