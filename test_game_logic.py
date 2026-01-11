
import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from backend.app.game_logic.game import Game, GamePhase
from backend.app.game_logic.card import Card, Suit, Rank, CardType
from backend.app.game_logic.rules import Rules

# Mock objects if needed, but we can use real ones
game = Game()
# Force 6 players
for i in range(6):
    game.add_player(f"player_{i}", f"Name{i}", i)

game.start_game()
game.deal_cards()
game.phase = GamePhase.PLAYING
game.main_suit = Suit.SPADES
game.current_level = 3
game.current_turn_index = 0 

# Force hands for deterministic test
# P0 plays Spades Ace (Sub Suit)
# P1 plays Spades King
# ...
# P2 plays Hearts 2 (Sub Two -> 400)
# P3 plays Spades 5
# P4 plays Spades 6
# P5 plays Spades 7

# Setup cards
players = game.players
p0 = players[0]
p1 = players[1]
p2 = players[2]
p3 = players[3]
p4 = players[4]
p5 = players[5]

# Helper to inject cards
def give_card(p, suit, rank):
    c = Card(suit=suit, rank=rank, id=f"{p.id}_{suit}_{rank}")
    p.hand.append(c)
    return c

# Trick 1: Spades (Main) vs Spades (Main)
# Spades is Main Suit. Level is 3.
# P0 leads Spade Ace (Main Suit Card [14+200=214])
c0 = give_card(p0, Suit.SPADES, Rank.ACE)
# P1 follows Spade King (213)
c1 = give_card(p1, Suit.SPADES, Rank.KING)
# P2 follows Heart 2 (Sub Two [400]) -> Stronger than Main Suit?
#  - Wait, Sub Two type is 2. Main Suit type is 1.
#  - 400 > 214. P2 should win.
c2 = give_card(p2, Suit.HEARTS, Rank.TWO)
# P3 follows Spade 3 (203)
c3 = give_card(p3, Suit.SPADES, Rank.THREE)
# P4 follows Spade 4 (204)
c4 = give_card(p4, Suit.SPADES, Rank.FOUR)
# P5 follows Spade 5 (205)
c5 = give_card(p5, Suit.SPADES, Rank.FIVE)

# Execute Play
print("--- Round 1 ---")
print(f"P0 plays {c0}. Score: {Rules.get_card_power_score(c0, game.main_suit, game.current_level)}")
print(f"P1 plays {c1}. Score: {Rules.get_card_power_score(c1, game.main_suit, game.current_level)}")
print(f"P2 plays {c2}. Score: {Rules.get_card_power_score(c2, game.main_suit, game.current_level)}")
print(f"P3 plays {c3}. Score: {Rules.get_card_power_score(c3, game.main_suit, game.current_level)}")

print(f"P0 plays {c0}. Next turn should be 1.")
game.play_cards(0, [c0.id])
print(f"Current turn: {game.current_turn_index}")

print(f"P1 plays {c1}. Next turn should be 2.")
game.play_cards(1, [c1.id])
print(f"Current turn: {game.current_turn_index}")

print(f"P2 plays {c2}. Next turn should be 3.")
game.play_cards(2, [c2.id])
print(f"Current turn: {game.current_turn_index}")

print(f"P3 plays {c3}. Next turn should be 4.")
game.play_cards(3, [c3.id])

print(f"P4 plays {c4}. Next turn should be 5.")
game.play_cards(4, [c4.id])

print(f"P5 plays {c5}. Trick Ends. Winner should be P2 (Rank 2 > Rank Ace).")
res = game.play_cards(5, [c5.id])

print(f"Winner Index: {res['winner_idx']}")
print(f"New Turn Index: {game.current_turn_index}")

if res['winner_idx'] == 2 and game.current_turn_index == 2:
    print("SUCCESS: Winner is P2")
else:
    print("FAILURE")
