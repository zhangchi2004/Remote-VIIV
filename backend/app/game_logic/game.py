from typing import List, Dict, Optional, Tuple
from enum import Enum
from dataclasses import dataclass
from .player import Player
from .deck import Deck
from .rules import Rules
from .card import Card, Suit

class GamePhase(str, Enum):
    WAITING = "WAITING"
    DRAWING = "DRAWING" # Includes Liang Zhu (Calling Main)
    EXCHANGING = "EXCHANGING" # Dealer managing bottom cards
    PLAYING = "PLAYING"
    FINISHED = "FINISHED"

@dataclass
class Declaration:
    player_idx: int
    cards: List[str] # Ids of cards used
    suit: Suit
    strength: int

class Game:
    def __init__(self):
        self.players: List[Player] = []
        self.phase: GamePhase = GamePhase.WAITING
        self.deck = Deck()
        
        # Game State Config
        self.current_level = 3  # Starts at 3 (Rule 5.1)
        self.main_suit: Optional[Suit] = None
        self.dealer_index: int = -1
        self.current_turn_index: int = -1
        
        self.bottom_cards: List[Card] = []
        
        # Drawing State
        self.next_draw_index: int = 0
        self.declaration: Optional[Declaration] = None
        
        # Round State
        self.current_trick: List[tuple] = [] # (player_idx, cards)
        self.points_team_1 = 0 # Teams 0, 2, 4 vs 1, 3, 5? "Opposite pairs are groups".
        # 6 players. 
        # Team A: 0, 2, 4 ?? No, "Opposite pairs".
        # If seating is circular 0-1-2-3-4-5.
        # 0 & 3 are partners? 
        # 1 & 4 are partners.
        # 2 & 5 are partners.
        # "Three groups fighting each other".
        # Group 1: 0, 3
        # Group 2: 1, 4
        # Group 3: 2, 5
        
        self.scores = {0: 0, 1: 0, 2: 0} # Scores for team 0, 1, 2
        
    def add_player(self, player_id: str, name: str):
        if len(self.players) >= 6:
            raise ValueError("Room full")
        
        # Groups: 0,1,2,0,1,2 cycling
        team_id = len(self.players) % 3
        p = Player(id=player_id, name=name, team_id=team_id)
        self.players.append(p)

    def start_game(self):
        if len(self.players) != 6:
            raise ValueError("Need 6 players")
        
        # Reset Deck
        self.deck = Deck()
        self.deck.shuffle()
        
        # Reserve bottom cards (6 cards)
        self.bottom_cards = self.deck.draw(6)
        
        # Reset Player Hands
        for p in self.players:
            p.hand = []
            
        self.phase = GamePhase.DRAWING
        
        # Reset Round State
        self.declaration = None
        self.main_suit = None
        
        # Determine Draw Start
        if self.dealer_index == -1:
            # First game logic could be complex (Lift cards), but assuming p0 for simplicity or pre-determined
            self.dealer_index = 0
            
        self.next_draw_index = self.dealer_index
        
    def draw_next_card(self) -> Optional[Tuple[int, Card]]:
        if not self.deck.cards:
            return None
            
        # Draw 1 card
        card_list = self.deck.draw(1)
        if not card_list:
            return None
        card = card_list[0]
        
        player_idx = self.next_draw_index
        player = self.players[player_idx]
        player.receive_cards([card])
        
        self.next_draw_index = (self.next_draw_index + 1) % 6
        return player_idx, card

    def declare_main_suit(self, player_idx: int, card_ids: List[str], declared_suit_val: str):
        if self.phase != GamePhase.DRAWING:
            raise ValueError("Can only declare during drawing phase")
            
        p = self.players[player_idx]
        
        # Verify cards in hand
        if not p.has_cards(card_ids):
            raise ValueError("Player does not have these cards")
            
        cards = [c for c in p.hand if c.id in card_ids]
        
        # Calculate Strength
        strength = Rules.calculate_declaration_strength(cards, self.current_level)
        if strength == 0:
            raise ValueError("Invalid declaration cards")
            
        # Determine Suit
        # If Level Cards, suit is their suit.
        # If Jokers, user must specify.
        declared_suit = None
        is_joker = cards[0].suit == Suit.JOKER
        
        if is_joker:
            try:
                declared_suit = Suit(declared_suit_val)
            except ValueError:
                raise ValueError("Invalid suit value")
            # Cant call JOKER as main suit (usually means No Trump or specific color)
            # Rule 5.4: "Can call any color or No Trump".
            # If No Trump, maybe represent as specific enum or None? Assuming Suit only for now.
            if declared_suit == Suit.JOKER:
                 # Special handling for No Trump? 
                 # For now, let's assume they must pick SPADES/HEARTS/CLUBS/DIAMONDS
                 pass
        else:
            declared_suit = cards[0].suit
            if declared_suit_val and declared_suit_val != declared_suit.value:
                 raise ValueError("Declaration suit must match card suit (unless Jokers)")

        # Challenge Logic
        # Rule 5.4: 
        # Current declaration exists?
        if self.declaration:
            # Must be stronger
            if strength <= self.declaration.strength:
                raise ValueError(f"Declaration too weak. Current strength: {self.declaration.strength}")
            
            # Rule: "Reforcing own bid"? (Not implemented fully, just treating as new bid)
            
            # If successful challenge, update dealer?
            # Rule 5.1: "First round... shouter is dealer".
            # Rule 5.4: "If changing... Dealer doesn't change? No, 'First shouter is dealer'".
            # Actually Rule 5.1 says: "If change main, the changer is NOT dealer, the first shouter is".
            # Wait, 5.1 implies first round.
            # 5.4 implies general counter rules.
            # Let's keep dealer as the *first* person who declared, unless logic says otherwise.
            # BUT, the rule says: "Review 5.1: Note: Changer is not dealer, first caller is dealer."
            # So if self.dealer_index was set by the FIRST declaration, we don't change it.
            pass
        else:
            # First declaration
            self.declaration = Declaration(player_idx, card_ids, declared_suit, strength)
            self.dealer_index = player_idx # First caller becomes dealer (Rule 5.1)
            self.current_turn_index = player_idx
            self.main_suit = declared_suit
            return # Done

        # Update State (Challenge successful)
        self.declaration = Declaration(player_idx, card_ids, declared_suit, strength)
        self.main_suit = declared_suit
        # Do NOT update dealer_index (Rule 5.1/5.4 specific logic for First Round)
        # However, for subsequent rounds (Rule 5.3), dealer is fixed?
        # "From second round... Dealer is fixed (whoever won)".
        # So this logic mainly applies to the fight for control.

    def finalize_drawing_phase(self):
        """
        Called when all cards are dealt. 
        Transitions to EXCHANGING phase.
        Handles case where no main suit was declared (Flip bottom).
        """
        # 1. Check if Main Suit declared
        if not self.declaration:
            # Rule 5.2: Flip bottom cards to find Main
            # Logic: Find max rank card. If multiple, first one (simulated random).
            # If all Jokers, No Main.
            
            non_jokers = [c for c in self.bottom_cards if c.suit != Suit.JOKER]
            if not non_jokers:
                # All Kings -> No Main.
                # In this impl, we might set main_suit = None and handle logic accordingly.
                self.main_suit = None 
            else:
                # Find max rank
                best_card = max(non_jokers, key=lambda c: c.rank.value)
                self.main_suit = best_card.suit
                
            # If no dealer set (Logic loop), ensure dealer is set.
            if self.dealer_index == -1:
                self.dealer_index = 0

        # 2. Give Bottom Cards to Dealer
        cards_added = list(self.bottom_cards)
        dealer = self.players[self.dealer_index]
        dealer.receive_cards(self.bottom_cards)
        
        # Clear bottom cards temporary (they are in dealer hand now)
        self.bottom_cards = [] 
        
        self.phase = GamePhase.EXCHANGING
        self.current_turn_index = self.dealer_index
        return {
            "main_suit": self.main_suit,
            "dealer_idx": self.dealer_index,
            "bottom_cards": cards_added
        }

    def exchange_cards(self, player_idx: int, card_ids: List[str]):
        if self.phase != GamePhase.EXCHANGING:
            raise ValueError("Not in exchanging phase")
        if player_idx != self.dealer_index:
            raise ValueError("Only dealer can exchange")
        
        if len(card_ids) != 6:
            raise ValueError("Must exchange exactly 6 cards")
            
        p = self.players[player_idx]
        if not p.has_cards(card_ids):
             raise ValueError("Do not have these cards")
             
        dropped = p.remove_cards(card_ids)
        self.bottom_cards = dropped # These become the actual bottom cards
        
        self.phase = GamePhase.PLAYING
        self.current_turn_index = self.dealer_index # Dealer plays first
        
    def play_cards(self, player_idx: int, card_ids: List[str]):
        if self.phase != GamePhase.PLAYING:
            raise ValueError("Not playing phase")
        if player_idx != self.current_turn_index:
            raise ValueError("Not your turn")
            
        p = self.players[player_idx]
        cards_to_play = [c for c in p.hand if c.id in card_ids]
        
        # Validation
        if len(self.current_trick) == 0:
            # Lead turn
            if not Rules.validate_lead_turn(cards_to_play):
                raise ValueError("Invalid lead turn")
        else:
            # Follow turn
            leader = self.current_trick[0][1]
            valid, msg = Rules.validate_follow_turn(
                leader, cards_to_play, p.hand, self.main_suit, self.current_level
            )
            if not valid:
                raise ValueError(msg)
                
        # Execute Move
        p.remove_cards(card_ids)
        self.current_trick.append((player_idx, cards_to_play))
        
        # Next turn
        self.current_turn_index = (self.current_turn_index + 1) % 6
        
        # Check if Trick Complete
        trick_result = None
        if len(self.current_trick) == 6:
            trick_result = self._resolve_trick()
            
        return trick_result
            
    def _resolve_trick(self):
        # Calculate winner
        moves = [(idx, cards) for idx, cards in self.current_trick]
        winner_offset = Rules.compare_turn(moves, self.main_suit, self.current_level)
        winner_idx = moves[winner_offset][0]
        
        # Collect Points
        points = 0
        for idx, cards in moves:
            for c in cards:
                points += c.get_points()
                
        winner_p = self.players[winner_idx]
        winner_team = winner_p.team_id
        
        # Check for Last Trick logic (Kou Di)
        # Verify if hand is empty
        is_last_trick = (len(winner_p.hand) == 0)
        
        points_message = ""
        
        if is_last_trick and self.bottom_cards:
            bottom_points = sum(c.get_points() for c in self.bottom_cards)
            if bottom_points > 0:
                dealer_p = self.players[self.dealer_index]
                # If winner is NOT dealer's team -> Kou Di
                if winner_team != dealer_p.team_id:
                     # Rule 6.5: "Kou Di... multiply by 2"
                     # Usually multiply by 2^k based on structure. Here simple 2x.
                     added = bottom_points * 2
                     points += added
                     points_message = f"Kou Di! +{added} points from bottom."
        
        # Add points to team
        # NOTE: In Chinese Poker, usually only "Attacking Team" points matter.
        # But for this 6-player variant, there are 3 teams.
        # "Dealer Team" vs "The Two Other Teams".
        # Rule 1.4: "Catching points sides' goal is to catch points".
        # We accumulate points for everyone, but logic will check if Catching Sides < 130.
        self.scores[winner_team] += points
        
        result = {
            "winner_idx": winner_idx,
            "points": points,
            "points_message": points_message,
            "trick_cards": [(idx, [str(c) for c in cs]) for idx, cs in self.current_trick]
        }
        
        # Set next leader
        self.current_turn_index = winner_idx
        self.current_trick = []
        
        if is_last_trick:
            self.phase = GamePhase.FINISHED
            result["game_over"] = True
            
        return result
