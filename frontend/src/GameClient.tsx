import React, { useEffect, useState, useRef } from 'react';
import { Card, GamePhase, Suit, Rank } from './types';
import { CardView } from './components/CardView';
import { getGameInfo } from './api';
// import { GameLogic } from './gameLogic'; // Logic moved to backend

interface Props {
    gameId: string;
    playerId: string;
    isActive: boolean; 
}

interface PlayerInfo {
    seat_index: number;
    name: string;
    team: number;
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
    
    // Derived from props
    const myIdx = parseInt(playerId.split('_')[1] || "-1", 10);
    
    const [trickCards, setTrickCards] = useState<{player: number, cards: any[]}[]>([]); 
    const [lastTrickCards, setLastTrickCards] = useState<{player: number, cards: any[]}[]>([]); 

    // State Refs for Callback Access
    const trickCardsRef = useRef(trickCards);
    useEffect(() => { trickCardsRef.current = trickCards; }, [trickCards]);

    const [scores, setScores] = useState<{[key:number]: number}>({0:0, 1:0, 2:0});
    const [dealerIdx, setDealerIdx] = useState<number>(-1);
    const [players, setPlayers] = useState<{[key:number]: PlayerInfo}>({});

    const [bottomCards, setBottomCards] = useState<Card[]>([]);
    const [showBottomOverlay, setShowBottomOverlay] = useState(false);
    const [bottomOverlayTimer, setBottomOverlayTimer] = useState<number>(10);
    
    // Debugging / Automation
    const [isAutoPlay, setIsAutoPlay] = useState(false);
    
    const ws = useRef<WebSocket | null>(null);

    // Initial Setup
    useEffect(() => {
        // Fetch Player Names
        const updateInfo = async () => {
            const info = await getGameInfo(gameId);
            if (info && info.seats) {
                const map: any = {};
                info.seats.forEach((s: any) => map[s.seat_index] = s);
                setPlayers(map);
            }
        };
        
        updateInfo();
        // Poll for player names occasionally (e.g. someone joins late)
        // Or better, rely on backend broadcasting "PLAYER_JOINED" event?
        // Current backend relies on WS for game actions.
        // Let's just poll for simplicity as requested "see him when he sits down".
        const timer = setInterval(updateInfo, 3000); 

        // Connect WS
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const host = window.location.host; 
        const socket = new WebSocket(`${protocol}://${host}/ws/${gameId}/${playerId}`);
             clearInterval(timer);
        ws.current = socket;

        socket.onopen = () => addLog("Connected");
        socket.onmessage = (event) => handleMessage(JSON.parse(event.data));
        socket.onclose = () => addLog("Disconnected");

        return () => {
             if (ws.current) ws.current.close();
        };
    },  [gameId, playerId]);

    // HAND SORTING
    const sortedHand = [...hand].sort((a, b) => {
        const getScore = (c: Card) => {
            if (c.rank === Rank.BIG_JOKER) return 10000;
            if (c.rank === Rank.SMALL_JOKER) return 9000;
            if (c.rank === currentLevel) return (c.suit === mainSuit) ? 8500 : 8000;
            if (c.rank === Rank.TWO) return (c.suit === mainSuit) ? 7500 : 7000;
            if (mainSuit && c.suit === mainSuit) return 6000 + c.rank;
            
            let suitScore = 0;
            if (c.suit === Suit.SPADES) suitScore = 4000;
            else if (c.suit === Suit.HEARTS) suitScore = 3000;
            else if (c.suit === Suit.CLUBS) suitScore = 2000;
            else if (c.suit === Suit.DIAMONDS) suitScore = 1000;
            return suitScore + c.rank;
        };
        return getScore(b) - getScore(a);
    });

    const handleMessage = (msg: any) => {
        switch (msg.type) {
            case "NEW_CARD":
                setHand(prev => {
                    // Avoid duplicates if re-connecting or state restored
                    if (prev.some(c => c.id === msg.card.id)) return prev;
                    return [...prev, msg.card];
                });
                setPhase(GamePhase.DRAWING);
                break;
            case "RESTORE_STATE":
                setPhase(msg.phase);
                setHand(msg.hand);
                if (msg.main_suit) setMainSuit(msg.main_suit);
                if (msg.dealer_idx !== undefined) setDealerIdx(msg.dealer_idx);
                if (msg.current_turn !== undefined) setCurrentTurn(msg.current_turn);
                if (msg.bottom_cards) {
                    // If we are restoring during exchange, and we are the dealer, we might need to show bottom cards
                    // or if reveal phase was active. 
                    // For simplicity, just store them if provided.
                    setBottomCards(msg.bottom_cards);
                }
                addLog("Game state restored from server");
                break;
            case "DRAWING_COMPLETE":
                if (msg.main_suit) setMainSuit(msg.main_suit);
                setDealerIdx(msg.dealer_idx);
                addLog(`Drawing Complete. Dealer: Seat ${msg.dealer_idx}`);
                break;
            case "BOTTOM_CARDS_REVEAL":
                setBottomCards(msg.bottom_cards);
                setShowBottomOverlay(true);
                setBottomOverlayTimer(10);
                const timer = setInterval(() => {
                    setBottomOverlayTimer(prev => {
                        if (prev <= 1) {
                            clearInterval(timer);
                            setShowBottomOverlay(false);
                            return 0;
                        }
                        return prev - 1;
                    });
                }, 1000);
                addLog("Bottom cards revealed (10s)");
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
                addLog(`Main Declared: ${msg.suit}`);
                break;
            case "GAME_START_PLAY":
                setPhase(GamePhase.PLAYING);
                setCurrentTurn(msg.current_turn);
                setTrickCards([]);
                break;
            case "PLAYER_PLAYED":
                 setTrickCards(prev => [...prev, { player: msg.player_idx, cards: msg.cards }]);
                 setCurrentTurn(msg.next_turn);
                 // If I played, remove cards from hand now (Backend Authority)
                 if (msg.player_idx === myIdx) {
                    const playedIds = msg.cards.map((c: any) => c.id);
                    setHand(prev => prev.filter(c => !playedIds.includes(c.id)));
                    setSelectedCardIds(new Set());
                 }
                 break;
            case "TRICK_FINISHED":
                 setScores(msg.scores);
                 setCurrentTurn(msg.next_turn);
                 
                 // Move current trick to 'last trick' display buffer
                 if (trickCardsRef.current) {
                     setLastTrickCards(trickCardsRef.current);
                 }
                 setTrickCards([]); // Clear logical state immediately for new trick
                 
                 // Clear visual buffer after delay
                 setTimeout(() => setLastTrickCards([]), 2000); 
                 break;
            case "GAME_OVER":
                 setPhase(GamePhase.FINISHED);
                 alert("Game Over!");
                 break;
            case "ERROR":
                 alert(msg.message);
                 break;
        }
    };

    const addLog = (txt: string) => setLogs(prev => [txt, ...prev].slice(0, 10));

    const toggleSelect = (id: string) => {
        const newSet = new Set(selectedCardIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedCardIds(newSet);
    };

    // --- Helper for Auto Play ---
    const getEffectiveSuit = (c: Card): string => {
        if (c.rank === Rank.BIG_JOKER || c.rank === Rank.SMALL_JOKER) return "MAIN";
        if (c.rank === currentLevel) return "MAIN";
        if (c.rank === Rank.TWO) return "MAIN";
        if (mainSuit && c.suit === mainSuit) return "MAIN";
        return c.suit;
    };

    // Auto Play Logic
    useEffect(() => {
        if (!isAutoPlay) return;
        if (!ws.current) return;

        let timer: any;

        const doAutoAction = () => {
             // 1. Exchange Phase
             if (phase === GamePhase.EXCHANGING && myIdx === dealerIdx) {
                 // Discard last 6 cards (weakest)
                 const last6 = sortedHand.slice(-6);
                 if (last6.length === 6) {
                     ws.current?.send(JSON.stringify({
                         action: "EXCHANGE_CARDS",
                         card_ids: last6.map(c => c.id)
                     }));
                     // Optimistic update
                     const ids = last6.map(c => c.id);
                     setHand(prev => prev.filter(c => !ids.includes(c.id)));
                     // addLog("Auto Exchanged (Weakest 6)");
                 }
             }

             // 2. Play Phase
             if (phase === GamePhase.PLAYING && currentTurn === myIdx) {
                 // Determine strategy
                 let cardsToPlay: Card[] = [];
                 
                 // If leading (trickCards empty OR full from previous trick pending clear) -> Play 1st card
                 const isLeading = trickCards.length === 0 || trickCards.length === 6;
                 
                 if (isLeading) {
                     if (sortedHand.length > 0) cardsToPlay = [sortedHand[sortedHand.length - 1]]; // Play weakest (last in sorted)
                 } else {
                     // Following
                     const leadCard = trickCards[0].cards[0];
                     const leadSuit = getEffectiveSuit(leadCard); 
                     
                     // Find cards matching suit
                     const matches = sortedHand.filter(c => getEffectiveSuit(c) === leadSuit);
                     
                     if (matches.length > 0) {
                         cardsToPlay = [matches[matches.length - 1]]; // Follow with weakest valid
                     } else {
                         // No match, discard weakest
                         if (sortedHand.length > 0) cardsToPlay = [sortedHand[sortedHand.length - 1]];
                     }
                 }

                 if (cardsToPlay.length > 0) {
                     ws.current?.send(JSON.stringify({
                         action: "PLAY_CARDS",
                         card_ids: cardsToPlay.map(c => c.id)
                     }));
                     // addLog(`Auto Playing ${cardsToPlay.length} cards`);
                 }
             }
        };

        // Check constantly or when dependencies change?
        // Dependencies: phase, currentTurn, hand, trickCards
        // We add a small delay
        if ((phase === GamePhase.PLAYING && currentTurn === myIdx) || (phase === GamePhase.EXCHANGING && myIdx === dealerIdx)) {
            timer = setTimeout(doAutoAction, 1000);
        }

        return () => clearTimeout(timer);
    }, [isAutoPlay, phase, currentTurn, trickCards, hand]); // Dependencies


    const declareMain = () => {
        if (selectedCardIds.size === 0) return;
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
         // Only dealer can exchange
         if (myIdx !== dealerIdx) {
             alert("Only the dealer handles the bottom cards.");
             return;
         }
         
         if (selectedCardIds.size !== 6) {
             alert("Must select 6 cards");
             return;
         }
         ws.current?.send(JSON.stringify({
             action: "EXCHANGE_CARDS",
             card_ids: Array.from(selectedCardIds)
         }));
         const ids = Array.from(selectedCardIds);
         setHand(prev => prev.filter(c => !ids.includes(c.id)));
         setSelectedCardIds(new Set());
    };
    
    const playCards = () => {
        if (selectedCardIds.size === 0) return;
        
        ws.current?.send(JSON.stringify({
             action: "PLAY_CARDS",
             card_ids: Array.from(selectedCardIds)
        }));
        // Note: We do NOT remove cards or clear selection here. 
        // We wait for specific WebSocket events:
        // - PLAYER_PLAYED: Success -> Hand updated, selection cleared.
        // - ERROR: Fail -> Alert shown, selection remains for retry.
    };

    // --- Layout Rendering ---
    
    const getRelativeIdx = (absIdx: number) => (absIdx - myIdx + 6) % 6;
    
    // Positions helper
    // 0: Me (Bottom) - Handled separately? No, let's put it in the grid.
    // 1: Right Bot
    // 2: Right Top
    // 3: Top
    // 4: Left Top
    // 5: Left Bot
    
    // We want 2 rows of 3 columns.
    // Top Row: 4 (Left) - 3 (Center) - 2 (Right)
    // Bot Row: 5 (Left) - 0 (Center) - 1 (Right)

    const renderPlayerSlot = (absIdx: number) => {
        const playerInfo = players[absIdx];
        const name = (playerInfo && playerInfo.name) ? playerInfo.name : `Seat ${absIdx}`;
        const isTurn = absIdx === currentTurn;
        
        // Find cards played by this player in current trick OR last trick (fading)
        const currentMove = trickCards.find(m => m.player === absIdx);
        const lastMove = lastTrickCards.find(m => m.player === absIdx);
        
        const displayCards = currentMove ? currentMove.cards : (lastMove ? lastMove.cards : null);
        const isFaded = !currentMove && lastMove;
        
        return (
            <div key={absIdx} className={`relative flex flex-col items-center justify-start w-1/3 h-full border border-white/5 p-2
                ${isTurn ? "bg-yellow-900/20" : ""}
            `}>
                 {/* Avatar / Name Box */}
                <div className={`
                    flex items-center gap-2 px-3 py-1 rounded bg-gray-800 text-white font-bold text-sm mb-2 shadow
                    ${isTurn ? "ring-2 ring-yellow-400 animate-pulse" : "ring-1 ring-gray-600"}
                `}>
                    <span>{name}</span>
                    <span className="text-xs text-gray-400 opacity-70">#{absIdx}</span>
                    {dealerIdx === absIdx && <span className="text-yellow-500">★</span>}
                </div>
                 
                 {/* Played Cards Area */}
                 <div className="flex-1 w-full flex items-center justify-center"> 
                      {displayCards ? (
                          <div className={`flex flex-row gap-1 ${isFaded ? "opacity-50 grayscale transition-opacity duration-1000" : ""}`}>
                              {displayCards.map((c: any, i: number) => (
                                  <div key={i} className="transform hover:scale-150 transition-transform origin-bottom">
                                      <CardView card={c} small />
                                  </div>
                              ))}
                          </div>
                      ) : (
                          isTurn && phase === GamePhase.PLAYING ? (
                              <div className="text-yellow-200/50 text-xs italic">Thinking...</div>
                          ) : null
                      )}
                 </div>
            </div>
        );
    };

    return (
        <div className="w-full h-full bg-green-900 relative overflow-hidden flex flex-col">
            
            {/* Top Info Bar */}
            <div className="h-8 bg-black/40 flex justify-between px-4 items-center text-white text-xs z-20">
                <div>Room: {gameId} | Phase: {phase} | Level: {currentLevel} | Main: {mainSuit || "?"}</div>
                <div className="flex gap-4 font-mono">
                     <div className="text-red-300">Team 0: {scores[0]}</div>
                     <div className="text-blue-300">Team 1: {scores[1]}</div>
                     <div className="text-yellow-300">Team 2: {scores[2]}</div>
                </div>
            </div>

            {/* Main Table Area (Opponents + Played Cards) */}
            <div className="flex-1 flex flex-col w-full max-w-5xl mx-auto py-2">
                {/* Top Row: 4, 3, 2 */}
                <div className="flex-1 flex w-full"> 
                    {renderPlayerSlot((myIdx + 4) % 6)}
                    {renderPlayerSlot((myIdx + 3) % 6)}
                    {renderPlayerSlot((myIdx + 2) % 6)}
                </div>
                
                {/* Bottom Row: 5, 0, 1 */}
                <div className="flex-1 flex w-full"> 
                    {renderPlayerSlot((myIdx + 5) % 6)}
                    {renderPlayerSlot(myIdx)}
                    {renderPlayerSlot((myIdx + 1) % 6)}
                </div>
            </div>

            {/* Logs Overlay (Minimizable) */}
            <div className="absolute top-10 left-2 w-48 max-h-32 overflow-y-auto bg-black/40 text-xxs text-green-300 pointer-events-none rounded p-1">
                 {logs.map((L, i) => <div key={i}>{L}</div>)}
            </div>

            {/* My Hand Area (Docked Bottom) */}
            <div className="h-40 bg-gray-900/90 border-t border-yellow-600 relative z-30 flex flex-col items-center">
                 {/* Controls */}
                 <div className="h-8 flex items-center gap-2 mt-1">
                      {/* Auto Play Toggle */}
                      <button 
                        onClick={() => setIsAutoPlay(!isAutoPlay)}
                        className={`px-2 py-0.5 text-xs rounded border ${isAutoPlay ? "bg-green-600 border-green-400 text-white" : "bg-gray-800 border-gray-600 text-gray-400"}`}
                      >
                          Auto: {isAutoPlay ? "ON" : "OFF"}
                      </button>

                      {phase === GamePhase.DRAWING && (
                           <button onClick={declareMain} className="bg-blue-700 px-3 py-0.5 rounded text-white text-xs hover:bg-blue-600">Declare</button>
                      )}
                      
                      {phase === GamePhase.EXCHANGING && (
                           myIdx === dealerIdx ? (
                               <button onClick={exchangeCards} className="bg-purple-700 px-3 py-0.5 rounded text-white text-xs hover:bg-purple-600">Exchange</button>
                           ) : (
                               <div className="text-yellow-400 text-xs italic animate-pulse">Dealer is exchanging cards...</div>
                           )
                      )}
                      
                      {phase === GamePhase.PLAYING && currentTurn === myIdx && (
                           <button onClick={playCards} className="bg-green-700 px-6 py-0.5 rounded text-white text-sm font-bold hover:bg-green-600">PLAY</button>
                      )}
                      
                      <div className="text-gray-400 text-xs ml-4">Sel: {selectedCardIds.size}</div>
                 </div>
                 
                 {/* Cards Scroll */}
                 <div className="flex-1 w-full overflow-x-auto flex items-end justify-center pb-2 px-4"> 
                    <div className="flex flex-row" style={{ marginLeft: 50, marginRight: 50 }}>
                        {sortedHand.map((c, i) => (
                            <div 
                                key={c.id} 
                                onClick={() => toggleSelect(c.id)}
                                className={`
                                    transition-transform hover:-translate-y-4 cursor-pointer relative
                                    ${selectedCardIds.has(c.id) ? "-translate-y-6 z-10" : ""}
                                `}
                                style={{ marginLeft: i === 0 ? 0 : '-1.8rem' }} 
                            >
                                <CardView card={c} selected={selectedCardIds.has(c.id)} />
                                {selectedCardIds.has(c.id) && <div className="absolute inset-0 border-2 border-yellow-400 rounded-lg pointer-events-none"></div>}
                            </div>
                        ))}
                    </div>
                 </div>
            </div>

            {/* Bottom Cards Overlay */}
            {showBottomOverlay && (
                <div className="absolute inset-0 z-50 bg-black/90 flex flex-col items-center justify-center">
                    <h2 className="text-3xl text-yellow-400 font-bold mb-4 animate-bounce">Bottom Cards</h2>
                    <div className="flex gap-4 mb-4">
                        {bottomCards.map((c, i) => (
                            <div key={i} className="transform scale-125">
                                <CardView card={c} />
                            </div>
                        ))}
                    </div>
                    <div className="text-white font-mono text-xl">Closing in {bottomOverlayTimer}s...</div>
                </div>
            )}
        </div>
    );
};
