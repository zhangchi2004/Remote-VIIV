from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional, Dict, Tuple
import asyncio
import json
from app.game_logic.game import Game, GamePhase
from app.game_logic.card import Suit, Card

app = FastAPI()

# Simple in-memory storage for games
games: Dict[str, Game] = {}

class ConnectionManager:
    def __init__(self):
        # game_id -> List[WebSocket]
        self.active_connections: Dict[str, List[WebSocket]] = {}
        # (game_id, player_id) -> WebSocket
        self.player_connections: Dict[Tuple[str, str], WebSocket] = {}

    async def connect(self, websocket: WebSocket, game_id: str, player_id: str):
        await websocket.accept()
        if game_id not in self.active_connections:
            self.active_connections[game_id] = []
        self.active_connections[game_id].append(websocket)
        self.player_connections[(game_id, player_id)] = websocket

    def disconnect(self, websocket: WebSocket, game_id: str, player_id: str):
        if game_id in self.active_connections:
            if websocket in self.active_connections[game_id]:
                self.active_connections[game_id].remove(websocket)
        key = (game_id, player_id)
        if key in self.player_connections:
            del self.player_connections[key]

    async def send_personal_message(self, message: dict, game_id: str, player_id: str):
        ws = self.player_connections.get((game_id, player_id))
        if ws:
            try:
                await ws.send_json(message)
            except RuntimeError:
                pass # Connection closed

    async def broadcast(self, message: dict, game_id: str):
        if game_id in self.active_connections:
            for connection in self.active_connections[game_id]:
                try:
                    await connection.send_json(message)
                except RuntimeError:
                    pass

manager = ConnectionManager()

async def dealing_phase_task(game_id: str):
    game = games.get(game_id)
    if not game:
        return

    # Total cards to deal = 210 (start) - 6 (bottom) = 210
    # Wait, simple math explanation: 216 total. 6 bottom. 210 for players.
    # 6 players * 35 cards = 210.
    
    # We want 1 card per second for EACH player? Or total?
    # Usually "1 card per second" speed means 1 card arrives at a player every second.
    # So 6 cards distributed every second.
    # Delay = 1/6 second.
    delay = 1.0 / 6.0 

    try:
        cards_dealt = 0
        while True:
            result = game.draw_next_card()
            if not result:
                break
                
            player_idx, card = result
            player = game.players[player_idx]
            
            # Send card to the specific player
            await manager.send_personal_message({
                "type": "NEW_CARD",
                "card": {"suit": card.suit, "rank": card.rank, "id": card.id}
            }, game_id, player.id)
            
            cards_dealt += 1
            await asyncio.sleep(delay)
            
        # Finish Drawing Phase
        final_info = game.finalize_drawing_phase()
        
        await manager.broadcast({
            "type": "DRAWING_COMPLETE",
            "main_suit": final_info["main_suit"],
            "dealer_idx": final_info["dealer_idx"]
        }, game_id)
        
        # Notify Dealer about Bottom Cards
        dealer_p = game.players[final_info["dealer_idx"]]
        
        # Serialize bottom cards
        bottom_cards_formatted = [{"suit": c.suit, "rank": c.rank, "id": c.id} for c in final_info["bottom_cards"]]
        
        await manager.send_personal_message({
            "type": "EXCHANGE_START",
            "message": "Please discard 6 cards.",
            "bottom_cards": bottom_cards_formatted
        }, game_id, dealer_p.id)
        
    except Exception as e:
        print(f"Error in dealing task: {e}")

class GameCreate(BaseModel):
    room_name: str

class PlayerJoin(BaseModel):
    name: str

@app.post("/games/")
def create_game(game_data: GameCreate):
    game_id = game_data.room_name # Simplify ID
    games[game_id] = Game()
    return {"game_id": game_id, "message": "Game created"}

@app.post("/games/{game_id}/join")
def join_game(game_id: str, player: PlayerJoin):
    if game_id not in games:
        raise HTTPException(status_code=404, detail="Game not found")
    
    game = games[game_id]
    try:
        pid = f"player_{len(game.players)}" # Simple ID
        game.add_player(pid, player.name)
        return {"player_id": pid, "team": game.players[-1].team_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/games/{game_id}/start")
async def start_game(game_id: str, background_tasks: BackgroundTasks):
    if game_id not in games:
        raise HTTPException(status_code=404, detail="Game not found")
    game = games[game_id]
    try:
        game.start_game()
        background_tasks.add_task(dealing_phase_task, game_id)
        return {"message": "Game started", "phase": game.phase}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.websocket("/ws/{game_id}/{player_id}")
async def websocket_endpoint(websocket: WebSocket, game_id: str, player_id: str):
    if game_id not in games:
        await websocket.close(code=4000)
        return
        
    game = games[game_id]
    # Verify player exists
    player_obj = next((p for p in game.players if p.id == player_id), None)
    if not player_obj:
        await websocket.close(code=4001)
        return
        
    player_idx = game.players.index(player_obj)
    await manager.connect(websocket, game_id, player_id)
    
    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action")
            
            if action == "DECLARE_MAIN":
                # { action: "DECLARE_MAIN", card_ids: ["..."], suit: "..." }
                card_ids = data.get("card_ids", [])
                suit_val = data.get("suit")
                try:
                    game.declare_main_suit(player_idx, card_ids, suit_val)
                    # Broadcast Success
                    await manager.broadcast({
                        "type": "MAIN_DECLARED",
                        "player_idx": player_idx,
                        "suit": game.main_suit,
                        "strength": game.declaration.strength,
                        "card_count": len(card_ids)
                    }, game_id)
                except ValueError as e:
                    await manager.send_personal_message({
                        "type": "ERROR",
                        "message": str(e)
                    }, game_id, player_id)
            
            elif action == "EXCHANGE_CARDS":
                # { action: "EXCHANGE_CARDS", card_ids: ["..."] }
                card_ids = data.get("card_ids", [])
                try:
                    game.exchange_cards(player_idx, card_ids)
                    await manager.send_personal_message({
                        "type": "EXCHANGE_SUCCESS"
                    }, game_id, player_id)
                    await manager.broadcast({
                        "type": "GAME_START_PLAY",
                        "current_turn": game.current_turn_index
                    }, game_id)
                except ValueError as e:
                    await manager.send_personal_message({
                        "type": "ERROR",
                        "message": str(e)
                    }, game_id, player_id)

            elif action == "PLAY_CARDS":
                # { action: "PLAY_CARDS", card_ids: ["..."] }
                card_ids = data.get("card_ids", [])
                try:
                    # Execute Play
                    trick_result = game.play_cards(player_idx, card_ids)
                    
                    # Broadcast Move
                    played_cards_data = []
                    # We need to reconstruct card objects or just send IDs?
                    # Since we removed them from hand, we can't easily look them up if we only have IDs,
                    # unless we kept the card data in the `trick`.
                    # `game.current_trick` (or result) has the card objects (or dicts).
                    # `play_cards` returns `trick_result` ONLY if trick is finished.
                    # But we need to broadcast the move immediately.
                    
                    # Wait, `play_cards` logic:
                    # It updates `self.current_trick`.
                    # Let's broadcast "PLAYER_PLAYED" first.
                    
                    # Need to retrieve Card details to show other players?
                    # Game uses `Card` objects.
                    # Let's fetch the last move from `game.current_trick` if trick_result is None,
                    # OR from `result` if it is finished.
                    
                    played_cards_objs = []
                    if trick_result:
                        # It was the last move. 
                        # trick_result["trick_cards"] has the full history. 
                        # We just want the last one.
                        last_move = trick_result["trick_cards"][-1]
                        # This structure in `trick_result` is formatted strings.
                        # Ideally, we broadcast the RAW card details so UI can render.
                        # But `game.py` return value for trick_result used strings.
                        cards_display = last_move[1]
                    else:
                        # Game state handling
                        last_move = game.current_trick[-1]
                        cards_display = [str(c) for c in last_move[1]]
                    
                    await manager.broadcast({
                        "type": "PLAYER_PLAYED",
                        "player_idx": player_idx,
                        "cards": cards_display, # Or better objects
                        "next_turn": game.current_turn_index
                    }, game_id)
                    
                    # If Trick Finished
                    if trick_result:
                        await manager.broadcast({
                            "type": "TRICK_FINISHED",
                            "winner_idx": trick_result["winner_idx"],
                            "points": trick_result["points"],
                            "scores": game.scores,
                            "next_turn": game.current_turn_index
                        }, game_id)
                        
                        if trick_result.get("game_over"):
                             await manager.broadcast({
                                "type": "GAME_OVER",
                                "scores": game.scores
                            }, game_id)
                            
                except ValueError as e:
                    await manager.send_personal_message({
                        "type": "ERROR",
                        "message": str(e)
                    }, game_id, player_id)

    except WebSocketDisconnect:
        manager.disconnect(websocket, game_id, player_id)
    except Exception as e:
        print(f"WS Error: {e}")
        manager.disconnect(websocket, game_id, player_id)

@app.get("/games/{game_id}/state/{player_id}")
def get_state(game_id: str, player_id: str):
    if game_id not in games:
        raise HTTPException(status_code=404, detail="Game not found")
    game = games[game_id]
    
    # Find player
    p = next((p for p in game.players if p.id == player_id), None)
    if not p:
        raise HTTPException(status_code=404, detail="Player not found")
        
    return {
        "phase": game.phase,
        "hand_count": len(p.hand),
        "hand": [str(c) for c in p.hand], # Simplified representation
        "current_main_suit": game.main_suit,
        "current_level": game.current_level,
        "scores": game.scores
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
