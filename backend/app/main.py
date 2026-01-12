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

# Simple in-memory storage for users
# username -> { "password": str, "active_game": str | None, "active_player_id": str | None }
users_db: Dict[str, Dict] = {}

class UserRegister(BaseModel):
    username: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

@app.post("/users/register")
def register(user: UserRegister):
    if user.username in users_db:
        raise HTTPException(status_code=400, detail="Username already exists")
    users_db[user.username] = {
        "password": user.password,
        "active_game": None,
        "active_player_id": None
    }
    return {"message": "Registered successfully"}

@app.post("/users/login")
def login(user: UserLogin):
    if user.username not in users_db:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    stored = users_db[user.username]
    if stored["password"] != user.password:
        raise HTTPException(status_code=401, detail="Invalid username or password")
        
    return {
        "username": user.username,
        "active_game": stored["active_game"],
        "active_player_id": stored["active_player_id"]
    }

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
    if game_id not in games:
        return
    game = games[game_id]
    
    try:
        # Pre-calculate hands (simulated draw)
        game.deal_cards() 
        
        # Broadcast "GAME_STARTED" to switch frontend scenes
        await manager.broadcast({
            "type": "GAME_STARTED",
            "phase": "DRAWING",
            "dealer_idx": game.dealer_index,
            "current_level": game.current_level,
            "team_levels": game.team_levels
        }, game_id)
        
        await asyncio.sleep(1) # Give frontend time to render board
        
        max_cards = max(len(p.hand) for p in game.players if p)
        
        for i in range(max_cards):
            # Send the i-th card to each player
            for p in game.players:
                if p and i < len(p.hand):
                    card = p.hand[i]
                    card_data = {"suit": card.suit, "rank": card.rank, "id": card.id}
                    await manager.send_personal_message({
                        "type": "NEW_CARD",
                        "card": card_data
                    }, game_id, p.id)
            
            await asyncio.sleep(0.8) # Drawing animation speed
            
        # End Drawing - Finalize Logic (Main Suit, Bottom Cards)
        final_info = game.finalize_drawing_phase()
        
        dealer_idx = final_info["dealer_idx"]
        main_suit_val = final_info["main_suit"]
        bottom_cards_list = final_info["bottom_cards"] # These are the cards given to dealer
        
        bottom_cards_formatted = [{"suit": c.suit, "rank": c.rank, "id": c.id} for c in bottom_cards_list]
        
        await manager.broadcast({
            "type": "DRAWING_COMPLETE",
            "main_suit": main_suit_val,
            "dealer_idx": dealer_idx
        }, game_id)
        
        # Reveal Bottom Cards
        await manager.broadcast({
            "type": "BOTTOM_CARDS_REVEAL",
            "bottom_cards": bottom_cards_formatted,
            "message": "Bottom cards revealed for 10 seconds."
        }, game_id)

        await asyncio.sleep(10)

        # Notify Dealer about Bottom Cards and Start Exchange
        dealer_p = game.players[dealer_idx]
        
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
    seat_index: int

@app.post("/games/")
def create_game(game_data: GameCreate):
    game_id = game_data.room_name # Simplify ID
    games[game_id] = Game()
    return {"game_id": game_id, "message": "Game created"}

@app.post("/games/{game_id}/join")
def join_game(game_id: str, player: PlayerJoin):
    if game_id not in games:
        raise HTTPException(status_code=404, detail="Game not found")
    
    # Check if user exists (Optional consistency check, but we trust the name passed if logic is handled in frontend)
    # Ideally frontend passes the logged-in username as 'player.name'
    
    game = games[game_id]
    try:
        pid = f"player_{player.seat_index}" # ID bound to seat for simplicity
        
        # If this user was already playing elsewhere, clear it?
        # Or better: Update user record
        if player.name in users_db:
             users_db[player.name]["active_game"] = game_id
             users_db[player.name]["active_player_id"] = pid
             
        game.add_player(pid, player.name, player.seat_index)
        
        # Safe access to player we just added
        p_obj = game.players[player.seat_index]
        return {"player_id": pid, "team": p_obj.team_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/games/{game_id}/state")
def get_game_state(game_id: str):
    if game_id not in games:
        raise HTTPException(status_code=404, detail="Game not found")
    game = games[game_id]
    # Return simple state about seats
    seats = []
    for i, p in enumerate(game.players):
        if p:
            seats.append({"seat_index": i, "name": p.name, "id": p.id, "team": p.team_id})
        else:
             seats.append({"seat_index": i, "name": None, "id": None, "team": None})
             
    return {
        "phase": game.phase,
        "seats": seats,
        "dealer_idx": game.dealer_index,
        "team_levels": game.team_levels
    }

@app.post("/games/{game_id}/start")
async def start_game(game_id: str, background_tasks: BackgroundTasks):
    if game_id not in games:
        raise HTTPException(status_code=404, detail="Game not found")
    game = games[game_id]
    
    if game.phase != GamePhase.WAITING:
        raise HTTPException(status_code=400, detail="Game already started")
        
    try:
        game.start_game()
        background_tasks.add_task(dealing_phase_task, game_id)
        return {"message": "Game started", "phase": game.phase}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/games/{game_id}/next")
async def next_game(game_id: str, background_tasks: BackgroundTasks):
    if game_id not in games:
        raise HTTPException(status_code=404, detail="Game not found")
    game = games[game_id]
    
    if game.phase != GamePhase.FINISHED:
        raise HTTPException(status_code=400, detail="Game not finished yet")

    try:
        # Determine Current Dealer Team
        current_dealer_idx = game.dealer_index
        dealer_team = game.players[current_dealer_idx].team_id
        
        # Determine Scores of Defenders
        # Teams are 0, 1, 2
        # Defender teams are the ones != dealer_team
        defender_teams = [t for t in [0, 1, 2] if t != dealer_team]
        
        max_defender_score = 0
        winning_defender_team = -1
        
        for t in defender_teams:
            score = game.scores.get(t, 0)
            if score > max_defender_score:
                max_defender_score = score
                winning_defender_team = t
            elif score == max_defender_score and score >= 130:
                # Tie-break logic if both > 130? 
                # Rule 9.7.3: "last scorer". We don't track usage.
                # Simplified: Stick with the first found or arbitrary.
                pass

        new_dealer_idx = -1
        
        # Rule 1: None of defender teams reach 130
        if max_defender_score < 130:
            # Dealer Team Defends Successfully
            # Next Dealer is partner (Same team, other player)
            # Find teammate
            for i in range(1, 6):
                idx = (current_dealer_idx + i) % 6
                if game.players[idx].team_id == dealer_team:
                    new_dealer_idx = idx
                    break
            
            # Level Up Dealer Team
            game.team_levels[dealer_team] += 1
            game.current_level = game.team_levels[dealer_team]
            
        else:
            # Rule 2: Defenders Win (At least one team >= 130)
            # Winning Defender Team is the one with max_defender_score (which is >= 130)
            # If both have same score >= 130, winning_defender_team is set to one of them above.
            
            # Next Dealer: "member that is behind the dealer" belonging to winning team
            # Search clockwise from dealer
            for i in range(1, 6):
                idx = (current_dealer_idx + i) % 6
                if game.players[idx].team_id == winning_defender_team:
                    new_dealer_idx = idx
                    break
            
            # Level Switch (Use winning team's level, no increment)
            game.current_level = game.team_levels[winning_defender_team]
            
        # Apply New Dealer
        game.dealer_index = new_dealer_idx
        
        # 3. Start Game
        game.phase = GamePhase.WAITING
        game.start_game()
        background_tasks.add_task(dealing_phase_task, game_id)
        
        return {
            "message": "Next game started", 
            "new_dealer": new_dealer_idx,
            "current_level": game.current_level,
            "team_levels": game.team_levels
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.websocket("/ws/{game_id}/{player_id}")
async def websocket_endpoint(websocket: WebSocket, game_id: str, player_id: str):
    if game_id not in games:
        await websocket.close(code=4000)
        return
        
    game = games[game_id]
    # Verify player exists
    player_obj = next((p for p in game.players if p and p.id == player_id), None)
    if not player_obj:
        await websocket.close(code=4001)
        return
        
    player_idx = game.players.index(player_obj)
    await manager.connect(websocket, game_id, player_id)

    # Restore State for Reconnecting Players
    if game.phase != GamePhase.WAITING:
        hand_formatted = [{"suit": c.suit, "rank": c.rank, "id": c.id} for c in player_obj.hand]
        bottom_cards_formatted = []
        if game.phase == "EXCHANGE" and player_idx == game.dealer_index:
             bottom_cards_formatted = [{"suit": c.suit, "rank": c.rank, "id": c.id} for c in game.bottom_cards]

        # Format Current Trick
        current_trick_formatted = []
        for p_idx, cards in game.current_trick:
             cards_data = [{"suit": c.suit, "rank": c.rank, "id": c.id} for c in cards]
             current_trick_formatted.append({"player": p_idx, "cards": cards_data})

        # Validate message type
        await manager.send_personal_message({
            "type": "RESTORE_STATE",
            "phase": game.phase,
            "hand": hand_formatted,
            "main_suit": game.main_suit,
            "dealer_idx": game.dealer_index,
            "bottom_cards": bottom_cards_formatted,
            "current_turn": game.current_turn_index,
            "current_level": game.current_level,
            "team_levels": game.team_levels,
            "trick_cards": current_trick_formatted
        }, game_id, player_id)
    
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
                    # Capture card objects for broadcast consistency
                    player = game.players[player_idx]
                    cards_objs = [c for c in player.hand if c.id in card_ids]
                    cards_serialized = [{"suit": c.suit, "rank": c.rank, "id": c.id} for c in cards_objs]
                    
                    # Execute Play
                    trick_result = game.play_cards(player_idx, card_ids)
                    
                    await manager.broadcast({
                        "type": "PLAYER_PLAYED",
                        "player_idx": player_idx,
                        "cards": cards_serialized,
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
    p = next((p for p in game.players if p and p.id == player_id), None)
    if not p:
        raise HTTPException(status_code=404, detail="Player not found")
        
    return {
        "phase": game.phase,
        "hand_count": len(p.hand),
        "hand": [str(c) for c in p.hand], # Simplified representation
        "current_main_suit": game.main_suit,
        "current_level": game.current_level,
        "scores": game.scores,
        "dealer_idx": game.dealer_index,
        "team_levels": game.team_levels
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
